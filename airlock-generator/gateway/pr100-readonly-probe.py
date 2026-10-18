#!/usr/bin/env python3
"""PR100 physical I/O diagnostic. READ-ONLY FC02/FC01; never programs a PLC.
Designed for the proven КПП 2 RS485 setup, but verify actual COM/ID before use.
"""
import argparse
import datetime
import json
import re
import sys
import time

def read_io(client, slave):
    di=client.read_discrete_inputs(address=4096,count=8,device_id=slave)
    q=client.read_coils(address=0,count=8,device_id=slave)
    if di is None or q is None or di.isError() or q.isError():
        raise RuntimeError("Modbus RTU error (DI or Q reply invalid)")
    if len(di.bits)<8 or len(q.bits)<8: raise RuntimeError("Incomplete DI/Q response")
    return ({f"DI{i+1}":int(di.bits[i]) for i in range(8)},
            {f"Q{i+1}":int(q.bits[i]) for i in range(8)})

def build_parser():
    p=argparse.ArgumentParser(description="ОВЕН ПР100: только чтение DI/Q (Modbus RTU)")
    p.add_argument("--com",default="COM3",help="Порт USB-RS485, например COM3")
    p.add_argument("--unit",type=int,default=16,help="Slave ID, подтверждённый в Owen Logic")
    p.add_argument("--baud",type=int,default=9600)
    p.add_argument("--parity",choices=("N","E","O"),default="N")
    p.add_argument("--stopbits",type=int,choices=(1,2),default=1)
    p.add_argument("--cycles",type=int,default=1,help="Количество проверок; 30 = около 45 секунд")
    p.add_argument("--interval",type=float,default=1.5,help="Интервал в секундах")
    p.add_argument("--log",help="Необязательный локальный JSONL-журнал")
    return p

def validate(p):
    if not re.fullmatch(r"COM[1-9][0-9]{0,2}|/dev/tty(?:USB|ACM|S)[0-9]{1,3}",p.com,re.I):
        raise ValueError("Неверный порт COM/tty")
    if p.baud not in (1200,2400,4800,9600,19200,38400,57600,115200):
        raise ValueError("Неверная скорость RS485")
    if not 1<=p.unit<=247 or not 1<=p.cycles<=3600 or not .5<=p.interval<=60:
        raise ValueError("Неверный Slave ID/число циклов/интервал")

def run(args,client_class=None,output=print):
    validate(args)
    if client_class is None:
        from pymodbus.client import ModbusSerialClient
        client_class=ModbusSerialClient
    previous=None
    last_online=False
    successful=0
    log=open(args.log,"a",encoding="utf-8") if args.log else None
    try:
        for index in range(args.cycles):
            client=None
            now=datetime.datetime.now(datetime.timezone.utc).isoformat()
            try:
                client=client_class(port=args.com,baudrate=args.baud,bytesize=8,
                                    parity=args.parity,stopbits=args.stopbits,timeout=1.2,retries=0)
                if not client.connect(): raise RuntimeError("COM порт занят или недоступен")
                di,q=read_io(client,args.unit)
                changes=[f"{k}: {prev} -> {v}" for group,old in ((di,previous["di"] if previous else {}),
                    (q,previous["q"] if previous else {})) for k,v in group.items()
                    if (prev:=old.get(k)) is not None and prev!=v]
                record={"time":now,"status":"ONLINE","di":di,"q":q,"changes":changes}
                output(now+"  ONLINE  "+" ".join(f"{k}={v}" for k,v in di.items())+
                      "  |  "+" ".join(f"{k}={v}" for k,v in q.items()))
                if changes:output("ИЗМЕНЕНИЯ: "+"; ".join(changes))
                elif not last_online:output("СВЯЗЬ: ответ Modbus RTU подтверждён")
                previous={"di":di,"q":q}
                successful+=1
                last_online=True
            except Exception as exc:
                record={"time":now,"status":"OFFLINE","error":str(exc)[:160]}
                output(now+"  OFFLINE  "+record["error"])
                previous=None
                last_online=False
            finally:
                if client is not None:
                    try:client.close()
                    except Exception:pass
            if log:
                log.write(json.dumps(record,ensure_ascii=False)+"\n")
                log.flush()
            if index+1<args.cycles: time.sleep(args.interval)
    finally:
        if log:log.close()
    return successful

def main():
    args=build_parser().parse_args()
    try:
        print(f"PR100 READ ONLY | {args.com} | {args.baud} 8{args.parity}{args.stopbits} | Slave {args.unit}")
        successful=run(args)
        if not successful:
            print("НЕТ ПОДТВЕРЖДЁННЫХ ОТВЕТОВ ПР100",file=sys.stderr)
            return 1
    except (KeyboardInterrupt,ValueError) as e:
        print("ОСТАНОВЛЕНО: "+str(e),file=sys.stderr)
        return 2
    return 0

if __name__=="__main__":sys.exit(main())
