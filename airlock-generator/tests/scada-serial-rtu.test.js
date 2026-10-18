"use strict";
// Offline protocol tests: fake pymodbus through PYTHONPATH; NO hardware/real serial port opened.
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {query,createTransport}=require("../gateway/modbus-rtu");
const {parse,readOnce}=require("../gateway/pr100-readonly-probe");
const {validate}=require("../gateway/profile-schema");
const {readController,createPoller}=require("../gateway/telemetry");
const model=require("../model.json");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-fake-rtu-"));
const fake=path.join(tmp,"pymodbus");
fs.mkdirSync(fake);
fs.writeFileSync(path.join(fake,"__init__.py"),"");
fs.writeFileSync(path.join(fake,"client.py"),`
class Response:
 def __init__(self, bits=None, registers=None): self.bits=bits; self.registers=registers
 def isError(self): return False
class ModbusSerialClient:
 def __init__(self,**kw):
  if kw["baudrate"]!=9600 or kw["parity"]!="N" or kw["bytesize"]!=8 or kw["stopbits"]!=1:
   raise ValueError("Unexpected serial settings")
  self.port=kw["port"]
 def connect(self): return self.port!="COM99"
 def close(self): pass
 def read_coils(self,address,count,device_id):
  if device_id!=16: raise ValueError("Wrong slave ID")
  return Response(bits=[int((address+i)%2==1) for i in range(count)])
 def read_discrete_inputs(self,address,count,device_id):
  if device_id!=16: raise ValueError("Wrong slave ID")
  return Response(bits=[int((address+i)%2==0) for i in range(count)])
 def read_holding_registers(self,address,count,device_id):
  return Response(registers=[address+i for i in range(count)])
 def read_input_registers(self,address,count,device_id):
  return Response(registers=[address+i for i in range(count)])
`);
const env={...process.env,PYTHONPATH:tmp};
const serial={protocol:"modbus-rtu",id:"PR1",model:"PR100",comPort:"COM3",
 baudrate:9600,parity:"N",stopbits:1,unitId:16,timeoutMs:900};
let passed=0;
const check=(name,fn)=>{passed++;console.log("PASS RTU "+name);};
(async()=>{
 const cfg={schema:"airlock-scada-connection/1",model,controllers:[serial],bindings:[
  ...Array.from({length:8},(_,i)=>({signal:"PLC_PR1.DI"+(i+1),controllerId:"PR1",fc:2,address:4096+i})),
  ...Array.from({length:8},(_,i)=>({signal:"PLC_PR1.Q"+(i+1),controllerId:"PR1",fc:1,address:i}))
 ],pollMs:1800,staleMs:5000};
 assert.equal(validate(cfg).controllers[0].comPort,"COM3");check("COM3/9600 8N1 Slave16 schema");
 const options=parse(["--com","COM3","--unit","16","--baud","9600","--cycles","1"]);
 assert.equal(options.comPort,"COM3");assert.equal(options.unitId,16);
 assert.throws(()=>parse(["--com","COM0"]),/Invalid/);
 check("read-only PR100 diagnostic CLI validates COM and slave options");
 assert.throws(()=>validate({...cfg,controllers:[{...serial,parity:"X"}]}),/parity/);
 assert.throws(()=>validate({...cfg,controllers:[{...serial,comPort:"COM0"}]}),/port/);
 check("reject unsupported parity / port");
 await assert.rejects(query({...serial,functionCode:6,address:4096,count:1},{env}),/read-only/i);
 await assert.rejects(query({...serial,functionCode:2,address:65535,count:8},{env}),/address/i);
 check("reject Modbus writes and overflow before serial worker");
 const di=await query({...serial,functionCode:2,address:4096,count:8},{env});
 assert.deepEqual(di,[1,0,1,0,1,0,1,0]);check("real Python process reads fake DI1-DI8 via FC02");
 const q=await query({...serial,functionCode:1,address:0,count:8},{env});
 assert.deepEqual(q,[0,1,0,1,0,1,0,1]);check("real Python process reads fake Q1-Q8 via FC01");
 const frame=await readOnce(serial,request=>query(request,{env}));
 assert.equal(frame.di.DI1,1);assert.equal(frame.q.Q2,1);
 check("real read-only PowerShell-friendly diagnostic command exposes DI/Q values");
 for(const functionCode of [3,4]){
  const vals=await query({...serial,functionCode,address:256,count:1},{env});
  assert.deepEqual(vals,[256]);
 }
 check("holding/input register reading with FC03/FC04");
 const before=process.env.PYTHONPATH;
 process.env.PYTHONPATH=tmp;
 try {
  const readings=await readController(serial,cfg.bindings);
  assert.equal(readings["PLC_PR1.DI1"],1);
  assert.equal(readings["PLC_PR1.Q2"],1);
  const poller=createPoller(cfg);
  const frame=await poller.poll();
  assert.equal(frame.source,"live");
  assert.equal(frame.controllers.PR1.raw.DI1,1);
  assert.equal(frame.controllers.PR1.raw.Q2,1);
  assert.equal(frame.rooms["1"],undefined);
  assert.equal(frame.doors["1-4"].state,"unknown");
  check("Node poller -> Python -> decoded raw DI/Q, but no false green");
  const fail={...serial,comPort:"COM99"};
  await assert.rejects(query({...fail,functionCode:2,address:4096,count:1},{env}),/RTU_UNAVAILABLE/);
  const failedCfg={...cfg,controllers:[fail]};
  const offline=await createPoller(failedCfg).poll();
  assert.equal(offline.source,"offline");
  assert.deepEqual(offline.controllers.PR1.raw,{});
  check("disconnected adapter yields OFFLINE with no cached green");
 }finally{
  if(before===undefined)delete process.env.PYTHONPATH;else process.env.PYTHONPATH=before;
 }
 const persistent=createTransport();
 try{
  const results=await Promise.all([1,2,3,4].map(unitId=>persistent.query({...serial,unitId,rtuMode:"persistent",functionCode:3,address:unitId,count:1},{env})));
  assert.deepEqual(results,[[1],[2],[3],[4]]);
  assert.equal(persistent.stats().length,1);assert.equal(persistent.stats()[0].worker,true);
  assert.equal(persistent.stats()[0].queued,0);
  check("actual Node -> persistent Python JSONL -> fake library for four parallel Unit IDs");
 }finally{await persistent.close();}
 console.log("AIRLOCK_SERIAL_RTU_OFFLINE_PASS "+passed+"/11");
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(()=>{
 fs.rmSync(tmp,{recursive:true,force:true});
});
