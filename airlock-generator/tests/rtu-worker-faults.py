#!/usr/bin/env python3
"""Offline RTU library boundary faults and real helper-process ownership; opens no serial device."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types

worker = Path(__file__).resolve().parents[1] / "gateway/modbus-rtu-worker.py"
spec = importlib.util.spec_from_file_location("worker", worker)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
params = dict(comPort="COM97",baudrate=9600,parity="N",stopbits=1,unitId=1,functionCode=3,address=0,count=2,timeoutMs=200)

FAKE = '''
class Reply:
 def __init__(self, values=None, code=None): self.bits=values; self.registers=values; self.exception_code=code
 def isError(self): return self.exception_code is not None
class ModbusSerialClient:
 created=0
 closed=0
 mode="good"
 def __init__(self, **kw):
  type(self).created+=1
  assert kw["retries"]==0
 def connect(self): return self.mode!="unplug"
 def close(self): type(self).closed+=1
 def read_holding_registers(self,address,count,device_id):
  if self.mode=="crc": raise RuntimeError("library discarded CRC frame COM97 private-address")
  if self.mode=="lost": return Reply([1])
  if self.mode=="none": return None
  if self.mode=="exception": return Reply(code=2)
  if self.mode=="float": return Reply([0.5,1])
  if self.mode=="invalid": return Reply([70000,1])
  if self.mode=="extra": return Reply([1,1,1])
  return Reply([1]*count)
 read_input_registers=read_holding_registers
 read_coils=read_holding_registers
 read_discrete_inputs=read_holding_registers
'''
client = types.ModuleType("pymodbus.client")
exec(FAKE, client.__dict__)
sys.modules["pymodbus"] = types.ModuleType("pymodbus")
sys.modules["pymodbus.client"] = client
session = module.Session()
try:
    for fc in (1,2,3,4):
        assert session.query(dict(params,functionCode=fc))["values"] == [1,1]
    assert client.ModbusSerialClient.created == 1
    for mode,code in [("crc","RTU_UNAVAILABLE"),("lost","RTU_PROTOCOL"),("none","RTU_PROTOCOL"),
                      ("exception","MODBUS_EXCEPTION_2"),("float","RTU_PROTOCOL"),("invalid","RTU_PROTOCOL"),("extra","RTU_PROTOCOL"),("unplug","RTU_UNAVAILABLE")]:
        client.ModbusSerialClient.mode=mode
        result=module.respond(session,json.dumps(params).encode())
        assert not result["ok"] and result["code"]==code, result
        assert "private" not in json.dumps(result)
        assert session.client is None
        client.ModbusSerialClient.mode="good"
        assert session.query(params)["ok"]
    for fc in (5,6,15,16,23):
        assert not module.respond(session,json.dumps(dict(params,functionCode=fc)).encode())["ok"]
finally: session.dispose()
print("PASS WORKER FC01-04, lost bytes, library CRC rejection, exception, unplug/replug, strict values, no writes")

with tempfile.TemporaryDirectory(prefix="airlock-worker-test-") as temp:
    fake=Path(temp)/"pymodbus"
    fake.mkdir()
    (fake/"__init__.py").write_text("")
    (fake/"client.py").write_text(FAKE)
    env=dict(os.environ,PYTHONPATH=temp)
    first=subprocess.Popen([sys.executable,"-B",str(worker),"--persistent"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,text=True)
    try:
        first.stdin.write(json.dumps(dict(params,id=1))+"\n"); first.stdin.flush()
        assert json.loads(first.stdout.readline())["ok"]
        # Another process must fail before it can instantiate a second master.
        second=subprocess.run([sys.executable,"-B",str(worker)],input=json.dumps(params),capture_output=True,text=True,env=env,timeout=5)
        assert json.loads(second.stdout)["code"]=="BUS_BUSY", second.stdout
        for unit in (2,3,4):
            first.stdin.write(json.dumps(dict(params,unitId=unit,id=unit))+"\n");first.stdin.flush()
            result=json.loads(first.stdout.readline()); assert result["id"]==unit and result["ok"]
    finally:
        first.kill();first.communicate(timeout=5)
    after=subprocess.run([sys.executable,"-B",str(worker)],input=json.dumps(params),capture_output=True,text=True,env=env,timeout=5)
    assert json.loads(after.stdout)["ok"],after.stdout
print("PASS WORKER cross-process exclusion, persistent multiple units, lock released after hard process death")
print("AIRLOCK_RTU_WORKER_FAULTS_PASS")
