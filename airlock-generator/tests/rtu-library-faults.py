#!/usr/bin/env python3
"""Real pymodbus 3.15 RTU frames over a memory serial adapter. No device is opened.
Run explicitly with the pinned test requirements; CI runs this on Linux and Windows.
"""
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch
import serial
from pymodbus.framer.rtu import FramerRTU
from pymodbus.pdu import DecodePDU

spec=importlib.util.spec_from_file_location("worker",Path(__file__).resolve().parents[1]/"gateway/modbus-rtu-worker.py")
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
mode="good"
adapters=[]
requests=[]
class MemorySerial:
    def __init__(self,*args,**kwargs):
        assert kwargs["exclusive"] is True
        self.data=b"";self.is_open=True;self.timeout=kwargs["timeout"];adapters.append(self)
    @property
    def in_waiting(self): return len(self.data)
    def close(self): self.is_open=False
    def reset_input_buffer(self): self.data=b""
    def read(self,size):
        result=self.data[:size];self.data=self.data[size:];return result
    def write(self,request):
        global mode
        unit,fc=request[:2];assert fc in (1,2,3,4)
        assert FramerRTU.check_CRC(request[:-2],int.from_bytes(request[-2:],"big"))
        requests.append(request)
        count=int.from_bytes(request[4:6],"big")
        if mode=="unplug": raise serial.SerialException("private COM metadata")
        if mode=="exception": payload=bytes([fc|128,2])
        elif fc<=2: payload=bytes([fc,1,1])
        else: payload=bytes([fc,count*2])+b"\x00\x01"*count
        if mode=="wrong-fc": payload=bytes([4])+payload[1:]
        self.data=FramerRTU(DecodePDU(False)).encode(payload,unit if mode!="wrong-unit" else unit+1,0)
        if mode=="crc": self.data=self.data[:-1]+bytes([self.data[-1]^1])
        if mode=="lost": self.data=self.data[:-1]
        if mode=="stall": self.data=b""
        return len(request)

params=dict(comPort="COM96",baudrate=9600,parity="N",stopbits=1,unitId=1,functionCode=3,address=0,count=1,timeoutMs=200)
session=worker.Session()
with patch("serial.serial_for_url",MemorySerial):
    try:
        for fc in (1,2,3,4):
            assert session.query(dict(params,functionCode=fc))["values"]==[1]
        assert len(adapters)==1
        for fault in ("crc","lost","stall","wrong-unit","wrong-fc","exception","unplug"):
            mode=fault
            response=worker.respond(session,json.dumps(params).encode())
            assert response["ok"] is False,(fault,response)
            assert session.client is None
            assert "private" not in json.dumps(response)
            assert not adapters[-1].is_open
            mode="good"
            assert session.query(params)["values"]==[1]
        assert len(requests)==18 # 4 FC reads + 7 failed requests + 7 fresh recovery reads, retries=0.
    finally: session.dispose()
print("AIRLOCK_REAL_PYMODBUS_MEMORY_SERIAL_PASS FC01-04, CRC, lost bytes, stall, wrong unit/FC, exception, unplug/replug; no hardware")
