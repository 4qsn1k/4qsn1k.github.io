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

class ReadFault(Exception):
    def __init__(self, code): self.code = code

class Session:
    """Owns one serial master, with a cross-process OS lock released on process death."""
    def __init__(self):
        self.client = None
        self.config = None
        self.lock = None

    def close(self):
        if self.client is not None:
            try: self.client.close()
            finally: self.client = None

    def acquire(self, port):
        if self.lock is not None: return
        import hashlib
        import os
        import tempfile
        key = port.upper() if port.upper().startswith("COM") else port
        filename = "airlock-rtu-" + hashlib.sha256(key.encode()).hexdigest() + ".lock"
        self.lock = open(os.path.join(tempfile.gettempdir(), filename), "a+b")
        try:
            if os.name == "nt":
                import msvcrt
                self.lock.seek(0)
                if not self.lock.read(1):
                    self.lock.write(b"0"); self.lock.flush()
                self.lock.seek(0)
                msvcrt.locking(self.lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.lock.close(); self.lock = None
            raise ReadFault("BUS_BUSY")

    def query(self, params):
        port,baud,parity,stopbits,uid,fc,addr,count,timeout = validate(params)
        config = (port,baud,parity,stopbits)
        if self.config is not None and self.config != config: raise ReadFault("RTU_PROTOCOL")
        self.config = config
        self.acquire(port)
        from pymodbus.client import ModbusSerialClient
        if self.client is None:
            self.client = ModbusSerialClient(port=port,baudrate=baud,bytesize=8,parity=parity,
                stopbits=stopbits,timeout=timeout/1000.0,retries=0)
        try:
            # Reconnect only when needed. Never replay failed reads or use old replies.
            if not self.client.connect(): raise ReadFault("RTU_UNAVAILABLE")
            # Requests on one bus may have different deadlines.
            if hasattr(self.client, "comm_params"):
                self.client.comm_params.timeout_connect = timeout/1000.0
            if hasattr(self.client, "transaction"):
                self.client.transaction.comm_params.timeout_connect = timeout/1000.0
            if getattr(self.client, "socket", None) is not None:
                self.client.socket.timeout = timeout/1000.0
                # Discard delayed/incomplete bytes left by an earlier transaction.
                self.client.socket.reset_input_buffer()
            func = {1:"read_coils",2:"read_discrete_inputs",3:"read_holding_registers",4:"read_input_registers"}[fc]
            result = getattr(self.client,func)(address=addr,count=count,device_id=uid)
            if result is None: raise ReadFault("RTU_PROTOCOL")
            if getattr(result, "dev_id", uid) != uid: raise ReadFault("RTU_PROTOCOL")
            if getattr(result, "function_code", fc) not in (fc, fc|128): raise ReadFault("RTU_PROTOCOL")
            if result.isError():
                code = getattr(result, "exception_code", None)
                raise ReadFault("MODBUS_EXCEPTION_" + str(code) if type(code) is int and 0<=code<=255 else "RTU_PROTOCOL")
            vals = result.bits if fc<=2 else result.registers
            if vals is None or len(vals)<count or (fc>2 and len(vals)!=count): raise ReadFault("RTU_PROTOCOL")
            if any(type(x) not in (int,bool) or x<0 or x>(1 if fc<=2 else 65535) for x in vals[:count]):
                raise ReadFault("RTU_PROTOCOL")
            return {"ok":True,"values":[int(x) for x in vals[:count]]}
        except Exception:
            self.close()  # A fresh client/serial buffer after CRC, unplug, exception or timeout.
            raise

    def dispose(self):
        self.close()
        if self.lock is not None: self.lock.close(); self.lock = None

def query(params):
    session = Session()
    try: return session.query(params)
    finally: session.dispose()

def respond(session, blob):
    request = {}
    try:
        if len(blob)>4096: raise ReadFault("RTU_PROTOCOL")
        request = json.loads(blob.decode("utf-8"))
        result = session.query(request)
    except Exception as error:
        # Raw exception text can contain local port/network/credential data.
        result = {"ok":False,"code":getattr(error,"code","RTU_UNAVAILABLE")}
    if isinstance(request, dict): result["id"] = request.get("id")
    return result

def main():
    persistent = sys.argv[1:] == ["--persistent"]
    session = Session()
    try:
        if persistent:
            while True:
                blob = sys.stdin.buffer.readline(4097)
                if not blob: break
                result = respond(session, blob)
                print(json.dumps(result,separators=(",",":")), flush=True)
                if len(blob)>4096: return 2
            return 0
        result = respond(session, sys.stdin.buffer.read(4097))
        print(json.dumps(result,separators=(",",":")), flush=True)
        return 0 if result["ok"] else 2
    finally: session.dispose()

if __name__=="__main__": sys.exit(main())
