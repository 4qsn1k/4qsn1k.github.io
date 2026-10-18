"""Offline tests for standalone Python PR100 probe. No actual COM port opened."""
import importlib.util
import tempfile
from pathlib import Path
from types import SimpleNamespace

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("airlock_pr100_probe",root/"gateway"/"pr100-readonly-probe.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class R:
    def __init__(self,bits): self.bits=bits
    def isError(self):return False
class FakeClient:
    writes=0
    def __init__(self,**kwargs):
        assert kwargs["port"]=="COM3"
        assert kwargs["baudrate"]==9600
        assert kwargs["parity"]=="N"
        assert kwargs["bytesize"]==8
        self.closed=False
    def connect(self):return True
    def close(self):self.closed=True
    def read_discrete_inputs(self,address,count,device_id):
        assert (address,count,device_id)==(4096,8,16)
        return R([True,False,True,False,True,False,True,False])
    def read_coils(self,address,count,device_id):
        assert (address,count,device_id)==(0,8,16)
        return R([False,True,False,True,False,True,False,True])
class Offline(FakeClient):
    def connect(self):return False
def config(**overrides):
    c={"com":"COM3","unit":16,"baud":9600,"parity":"N","stopbits":1,
       "cycles":1,"interval":1.5,"log":None}
    c.update(overrides)
    return SimpleNamespace(**c)
items=[]
assert module.run(config(),FakeClient,items.append)==1
assert any("DI1=1" in row and "Q2=1" in row for row in items)
print("PASS standalone PR100 PowerShell-compatible display DI/Q")
items.clear()
assert module.run(config(),Offline,items.append)==0
assert any("OFFLINE" in row for row in items)
print("PASS standalone PR100 offline/no-answer response")
for bad in (config(com="COM0"),config(unit=0),config(baud=12345)):
    try: module.validate(bad)
    except ValueError:pass
    else:raise AssertionError("unsafe parameters accepted")
print("PASS standalone PR100 rejects invalid serial settings")
with tempfile.TemporaryDirectory() as folder:
    filename=str(Path(folder)/"events.jsonl")
    assert module.run(config(log=filename),FakeClient,lambda s:None)==1
    import json
    data=json.loads(Path(filename).read_text(encoding="utf-8").splitlines()[0])
    assert data["di"]["DI1"]==1 and data["q"]["Q2"]==1
print("PASS standalone PR100 JSONL event log")
print("PR100_STANDALONE_OFFLINE_QA_PASS 4/4")
