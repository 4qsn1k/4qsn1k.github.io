"use strict";
// Isolated COM maintenance tests. Fake Modbus transport, no physical COM open.
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {EventEmitter}=require("node:events"),{PassThrough,Writable}=require("node:stream");
const {createPoller}=require("../gateway/telemetry");
const {createTransport}=require("../gateway/modbus-rtu");
const {start}=require("../gateway/server");
const model=require("../model.json");
let count=0;const ok=t=>{count++;console.log("PASS COM RELEASE "+t)};
const cfg={schema:"airlock-scada-connection/1",model,controllers:[
 {id:"PR1",model:"PR100",protocol:"modbus-rtu",comPort:"COM5",baudrate:9600,parity:"N",stopbits:1,unitId:16,timeoutMs:800,rtuMode:"persistent"},
 {id:"PR2",model:"PR100",protocol:"modbus-rtu",comPort:"COM5",baudrate:9600,parity:"N",stopbits:1,unitId:17,timeoutMs:800,rtuMode:"persistent"},
 {id:"ETH",model:"other",protocol:"modbus-tcp",host:"127.0.0.1",port:502,unitId:18,timeoutMs:800}
],bindings:[
 {signal:"PLC_PR1.DI3",controllerId:"PR1",fc:2,address:4098},
 {signal:"PLC_PR2.DI1",controllerId:"PR2",fc:2,address:4096},
 {signal:"PLC_ETH.DI1",controllerId:"ETH",fc:2,address:4096}
],pollMs:800,staleMs:5000};
const sleep=t=>new Promise(resolve=>setTimeout(resolve,t));
function fakeSerial(){
 const children=[];let active=0,maximum=0;
 const spawnWorker=()=> {
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.stdin=new Writable({write(_d,_e,cb){cb()}});
  child.kills=[];child.closed=false;
  active++;maximum=Math.max(active,maximum);children.push(child);
  child.kill=signal=>{child.kills.push(signal||"SIGTERM");return true};
  child.exit=()=>{if(child.closed)return;child.closed=true;active--;child.emit("close",0)};
  return child;
 };
 return {spawnWorker,children,get maximum(){return maximum}};
}
(async()=>{
 const fake=fakeSerial(),transport=createTransport({spawnWorker:fake.spawnWorker,idleMs:100000});
 try{
  const p={comPort:"COM5",baudrate:9600,parity:"N",stopbits:1,unitId:16,functionCode:2,address:4098,count:1,timeoutMs:800,rtuMode:"persistent"};
  const request=transport.query(p).catch(e=>e.code);
  assert.equal(fake.children.length,1);
  let released=false;
  const stopping=transport.pauseBus("com5").then(()=>{released=true});
  assert.equal(transport.isPaused("COM5"),true);
  assert.equal(fake.children[0].kills.length,1);
  assert.equal(released,false);
  assert.equal(await transport.query(p).catch(e=>e.code),"PORT_RELEASED");
  assert.equal(released,false,"must wait for OS process close event");
  fake.children[0].exit();await stopping;
  assert.equal(released,true);assert.equal(await request,"PORT_RELEASED");
  assert.equal(fake.maximum,1);ok("COM is NOT released until worker emits close; no second owner");
  const again=transport.resumeBus("COM5");assert.equal(again.paused,false);
  const next=transport.query(p).catch(e=>e.code);
  assert.equal(fake.children.length,2);
  const stop2=transport.pauseBus("COM5");
  fake.children[1].exit();await stop2;
  assert.equal(await next,"PORT_RELEASED");ok("resume can poll again; re-release works without duplicate owners");
 }finally{const c=transport.close();for(const child of fake.children)child.exit();await c;}
 const calls=[];
 const rtu={pauseBus:async p=>{calls.push("pause "+p);await sleep(40);return {released:true}},
  resumeBus:p=>{calls.push("resume "+p);return {paused:false}},
  close:async()=>{},stats:()=>[],query:()=>{throw Error("no fake serial I/O allowed")}};
 const reader=async ctrl=>Object.fromEntries(cfg.bindings.filter(b=>b.controllerId===ctrl.id).map(b=>[b.signal,1]));
 const poller=createPoller(cfg,reader,{},rtu);
 try{
  await poller.poll();assert.equal(poller.get().controllers.PR1.online,true);
  assert.equal(poller.get().controllers.ETH.online,true);
  const pausing=poller.pausePort("COM5");
  assert.equal(poller.get().controllers.PR1.online,false);
  assert.equal(poller.get().controllers.PR2.online,false);
  assert.equal(poller.get().controllers.ETH.online,true);
  assert.deepEqual(poller.get().controllers.PR1.raw,{});
  assert.equal(poller.portStatus()[0].releasing,true);
  await pausing;
  assert.equal(poller.portStatus()[0].paused,true);
  assert.equal(poller.portStatus()[0].releasing,false);
  assert.equal(poller.get().controllers.PR1.error,"PORT_RELEASED");
  await poller.poll();
  assert.equal(poller.get().controllers.PR1.online,false);
  assert.equal(poller.get().controllers.ETH.online,true);
  ok("shared-port PR1/PR2 become OFFLINE immediately; unrelated Ethernet PR stays ONLINE");
  poller.resumePort("COM5");
  assert.equal(poller.get().controllers.PR1.online,false,"old sample must not reappear");
  assert.equal(poller.get().controllers.PR1.error,"NOT_POLLED");
  await poller.poll();
  assert.equal(poller.get().controllers.PR1.online,true);
  assert.equal(poller.get().controllers.PR2.online,true);
  assert.deepEqual(calls,["pause COM5","resume COM5"]);
  ok("no stale DI/Q after resume; new verified sample needed");
 }finally{await poller.close();}
 // A transport or vendor DLL may deliver a response after abort. Resuming the
 // port must NOT validate any reply from the previous ownership generation.
 let unblock,oldStarts=0;
 const raceReader=async ctrl=>{
  if(ctrl.id==="PR1"&&oldStarts++===0)
   return await new Promise(resolve=>{unblock=resolve});
  return Object.fromEntries(cfg.bindings.filter(b=>b.controllerId===ctrl.id).map(b=>[b.signal,1]));
 };
 const raceRtu={pauseBus:async()=>({released:true}),resumeBus:()=>({paused:false}),
  close:async()=>{},stats:()=>[]};
 const race=createPoller(cfg,raceReader,{},raceRtu);
 try{
  race.tick();
  for(let i=0;i<30&&!unblock;i++)await sleep(2);
  assert.equal(typeof unblock,"function");
  await race.pausePort("COM5");
  race.resumePort("COM5");
  unblock({"PLC_PR1.DI3":1});
  await sleep(10);
  assert.equal(race.get().controllers.PR1.online,false,"old worker reply must stay rejected after resume");
  assert.deepEqual(race.get().controllers.PR1.raw,{});
  await race.poll();
  assert.equal(race.get().controllers.PR1.online,true);
  ok("generation fence discards late response across rapid release/resume");
 }finally{await race.close();}
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-maintenance-"));
 try{
  const config=path.join(tmp,"config.json");fs.writeFileSync(config,JSON.stringify(cfg));
  let pauseCalls=0,resumeCalls=0;
  const portPoller={portStatus:()=>[{port:"COM5",controllerIds:["PR1","PR2"],paused:pauseCalls>resumeCalls,releasing:false}],
   pausePort:async()=>{pauseCalls++;return {released:true,port:"COM5"}},
   resumePort:()=>{resumeCalls++;return {paused:false,port:"COM5"}},
   get:()=>({timestamp:Date.now(),source:"offline",rooms:{},doors:{},controllers:{},fire:null}),
   tick:()=>({timestamp:Date.now(),source:"offline",rooms:{},doors:{},controllers:{},fire:null}),
   close:async()=>{}};
  const app=start({configPath:config,port:0,pollerFactory:()=>portPoller,logger:{log(){},error(){}}});
  try{
   await new Promise(resolve=>app.server.once("listening",resolve));
   const origin="http://127.0.0.1:"+app.server.address().port;
   const values=await fetch(origin+"/api/ports").then(r=>r.json());
   assert.equal(values.ports[0].port,"COM5");assert.equal(values.controlToken.length,48);
   const url=origin+"/api/ports/COM5/release";
   const noToken=await fetch(url,{method:"POST",headers:{Origin:origin},body:""});
   assert.equal(noToken.status,403);assert.equal(pauseCalls,0);
   const wrongOrigin=await fetch(url,{method:"POST",headers:{Origin:"http://evil.test","X-Airlock-Control":values.controlToken},body:""});
   assert.equal(wrongOrigin.status,403);assert.equal(pauseCalls,0);
   const wrongPort=await fetch(origin+"/api/ports/COM6/release",{method:"POST",headers:{Origin:origin,"X-Airlock-Control":values.controlToken},body:""});
   assert.equal(wrongPort.status,404);
   const req={method:"POST",headers:{Origin:origin,"X-Airlock-Control":values.controlToken},body:""};
   const done=await fetch(url,req);assert.equal(done.status,200);assert.equal((await done.json()).released,true);
   assert.equal(pauseCalls,1);
   const resumed=await fetch(origin+"/api/ports/COM5/resume",req);
   assert.equal(resumed.status,200);assert.equal(resumeCalls,1);
   assert.equal((await fetch(origin+"/api/ports")).status,200);
   assert.equal((await fetch(origin+"/api/status",{method:"POST"})).status,405);
   ok("localhost port control requires explicit token and same-origin; other methods remain read-only");
  }finally{await app.close();}
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 console.log("SCADA_PORT_MAINTENANCE_OFFLINE_PASS "+count+"/6");
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
