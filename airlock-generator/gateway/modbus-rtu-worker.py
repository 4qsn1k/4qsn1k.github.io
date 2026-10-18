#!/usr/bin/env python3
"""One-shot, strictly read-only Modbus RTU worker. StdIn JSON -> StdOut JSON.
Requires pymodbus 3.15+ and pyserial. No controller writes.
"""
import json
import re
import sys

def validate(p):
    if not isinstance(p, dict): raise ValueError("JSON object required")
    port = p.get("comPort")
    if not isinstance(port, str) or not re.fullmatch(r"COM[1-9][0-9]{0,2}|/dev/tty(?:USB|ACM|S)[0-9]{1,3}", port, re.I):
        raise ValueError("Invalid serial port")
    baud = p.get("baudrate")
    if type(baud) is not int or baud not in (1200,2400,4800,9600,19200,38400,57600,115200):
        raise ValueError("Invalid baudrate")
    if p.get("parity") not in ("N","E","O"): raise ValueError("Invalid parity")
    if type(p.get("stopbits")) is not int or p["stopbits"] not in (1,2): raise ValueError("Invalid stopbits")
    uid=p.get("unitId")
    fc=p.get("functionCode")
    addr=p.get("address")
    count=p.get("count")
    timeout=p.get("timeoutMs",1200)
    if type(uid) is not int or not 1<=uid<=247: raise ValueError("Invalid slave ID")
    if type(fc) is not int or fc not in (1,2,3,4): raise ValueError("Read-only FC01-04 required")
    if type(addr) is not int or not 0<=addr<=65535: raise ValueError("Invalid zero-based address")
    if type(count) is not int or not 1<=count<=(128 if fc<=2 else 32) or addr+count>65536:
        raise ValueError("Invalid count")
    if type(timeout) is not int or not 200<=timeout<=5000: raise ValueError("Invalid timeout")
    return port,baud,p["parity"],p["stopbits"],uid,fc,addr,count,timeout

def query(params):
    port,baud,parity,stopbits,uid,fc,addr,count,timeout=validate(params)
    from pymodbus.client import ModbusSerialClient
    client=ModbusSerialClient(port=port,baudrate=baud,bytesize=8,parity=parity,
                              stopbits=stopbits,timeout=timeout/1000.0,retries=0)
    try:
        if not client.connect(): raise RuntimeError("RS485 port unavailable or occupied")
        func={1:"read_coils",2:"read_discrete_inputs",3:"read_holding_registers",4:"read_input_registers"}[fc]
        result=getattr(client,func)(address=addr,count=count,device_id=uid)
        if result is None or result.isError(): raise RuntimeError("Modbus exception or no valid response")
        vals=result.bits if fc<=2 else result.registers
        if vals is None or len(vals)<count: raise RuntimeError("Incomplete RTU reply")
        values=[int(x) for x in vals[:count]]
        if any(x<0 or x>(1 if fc<=2 else 65535) for x in values): raise RuntimeError("Invalid RTU values")
        return {"ok":True,"values":values}
    finally:
        client.close()

def main():
    try:
        blob=sys.stdin.buffer.read(4097)
        if len(blob)>4096: raise ValueError("Request too large")
        result=query(json.loads(blob.decode("utf-8")))
    except Exception as e:
        result={"ok":False,"error":str(e)[:170]}
    print(json.dumps(result,ensure_ascii=False,separators=(",",":")))
    return 0 if result["ok"] else 2

if __name__=="__main__": sys.exit(main())
