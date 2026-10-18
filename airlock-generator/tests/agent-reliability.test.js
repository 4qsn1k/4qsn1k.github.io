"use strict";
// Deterministic clock and uncooperative readers: no hardware, network or wall-clock sleeps.
const assert=require("node:assert/strict");
const {createPoller,readController}=require("../gateway/telemetry");
const {validate}=require("../gateway/profile-schema");
const {createJournal}=require("../gateway/event-journal");
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function clock(){let time=1000,id=0;const timers=new Map();return {
 now:()=>time,setTimer:(fn,ms)=>{timers.set(++id,{at:time+ms,fn});return id;},clearTimer:key=>timers.delete(key),
 advance:async ms=>{time+=ms;for(const [key,t] of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await settle();}
};}
const controllers=["A","B"].map((id,i)=>({id,protocol:"modbus-tcp",host:"127.0.0.1",port:15020+i,unitId:1,timeoutMs:200}));
const signals=["ROOM_1.State","SYSTEM.FireNormal","DOOR_d.Closed","DOOR_d.BlockRequested","DOOR_d.GreenPermit"];
const profile={schema:"airlock-scada-connection/1",controllers,model:{rooms:[{id:"1",interlockMode:"mutual"}],doors:[{id:"d",a:"1",b:"outside"}]},
 bindings:[...signals.map((signal,address)=>({signal,address,fc:3,controllerId:"A"})),{signal:"PLC_B.DI1",address:0,fc:2,controllerId:"B"}],pollMs:500,staleMs:1000,pollBudgetMs:1000};
const good=()=>Object.fromEntries(signals.map((s,i)=>[s,[10,1,1,0,1][i]]));
(async()=>{
 const time=clock();let mode="good",resolveLate,calls={A:0,B:0};
 const poller=createPoller(profile,async c=>{
  calls[c.id]++;
  if(c.id==="B")return {"PLC_B.DI1":1};
  if(mode==="stall")return new Promise(resolve=>{resolveLate=resolve;});
  if(mode==="error")throw Error("port COM123 host 10.99.88.77 password=private");
  if(mode==="partial")return {"ROOM_1.State":10};
  if(mode==="invalid")return {...good(),"SYSTEM.FireNormal":2};
  return good();
 },time);
 const j=createJournal();
 try{
  await poller.poll();assert.equal(poller.get().doors.d.state,"ready");
  mode="error";await poller.poll();let f=poller.get();
  assert.equal(f.controllers.A.online,false);assert.equal(f.controllers.B.online,true);
  assert.equal(f.doors.d.state,"unknown");assert.equal(f.controllers.A.offlineCause,"READ_FAILED");
  assert(!JSON.stringify(f).includes("private"));assert.deepEqual(f.controllers.A.raw,{});
  console.log("PASS RELIABILITY loss clears GREEN immediately and redacts library errors");
  for(const m of ["partial","invalid"]){mode=m;await poller.poll();assert.equal(poller.get().controllers.A.online,false);assert.equal(poller.get().doors.d.state,"unknown");}
  mode="good";await poller.poll();assert.equal(poller.get().doors.d.state,"ready");
  assert.equal(poller.get().controllers.A.consecutiveFailures,0);
  assert.equal(poller.get().controllers.A.totalFailures,3);
  console.log("PASS RELIABILITY incomplete/invalid sample rejected; complete recovery resets failure streak");
  mode="stall";poller.tick();await time.advance(500);poller.tick();await settle();
  const pendingObservation=poller.poll();await settle();
  const before={...calls};for(let i=0;i<500;i++)poller.tick();await settle();assert.deepEqual(calls,before);
  await time.advance(501);j.observe(poller.get()); // Per-controller age, independent of a healthy recent poll.
  assert.equal(poller.get().controllers.A.online,false);assert.equal(poller.get().doors.d.state,"unknown");
  assert.equal(poller.get().controllers.B.online,true);
  await time.advance(500);poller.tick();await settle();
  await pendingObservation;
  f=poller.get();assert.equal(f.controllers.A.offlineCause,"POLL_DEADLINE");
  assert.equal(f.controllers.A.polling,true);assert.equal(f.controllers.B.online,true);
  assert.equal(f.controllers.A.consecutiveFailures,1);
  const aCalls=calls.A;
  for(let i=0;i<30;i++){await time.advance(500);poller.tick();await settle();}
  assert.equal(calls.A,aCalls);assert(calls.B>20);assert.equal(poller.get().polling.queued,0);
  assert.equal(poller.get().controllers.A.consecutiveFailures,1);
  resolveLate(good());await settle();assert.equal(poller.get().controllers.A.online,false);
  assert.equal(poller.get().doors.d.state,"unknown");
  console.log("PASS RELIABILITY 30 missed cycles: one stalled flight, zero backlog, healthy PLC continues, late reply ignored");
  mode="good";await time.advance(500);poller.tick();await settle();f=poller.get();j.observe(f);
  assert.equal(f.controllers.A.online,true);assert.equal(f.doors.d.state,"ready");
  assert(j.recent().some(e=>e.type==="LINK_DOWN"));assert.equal(j.recent()[0].type,"LINK_UP");
  await time.advance(1001);f=poller.get();assert.equal(f.controllers.A.online,false);assert.equal(f.controllers.A.offlineCause,"STALE");
  console.log("PASS RELIABILITY recovery requires a new sample; freshness measured per PLC");
 }finally{await poller.close();}
 assert.equal(poller.get().doors.d.state,"unknown");
 const agingTime=clock();let finishSlow;
 const aging=createPoller({...profile,pollBudgetMs:3000},async c=>c.id==="A"?new Promise(resolve=>{finishSlow=resolve;}):{"PLC_B.DI1":1},agingTime);
 try{
  const flight=aging.poll();await settle();await agingTime.advance(1500);finishSlow(good());await flight;
  assert.equal(aging.get().controllers.A.lastSuccessAt,agingTime.now());
  assert.equal(aging.get().controllers.A.dataAgeMs,1500);assert.equal(aging.get().controllers.A.offlineCause,"STALE");
  assert.equal(aging.get().doors.d.state,"unknown");
 }finally{await aging.close();}
 let wall=10000,tick=1;
 const noClockJump=createPoller(profile,async c=>c.id==="A"?good():{"PLC_B.DI1":1},{now:()=>wall,monotonic:()=>tick});
 try{
  await noClockJump.poll();wall=-1000000;tick+=1001;
  assert.equal(noClockJump.get().controllers.A.offlineCause,"STALE");
  assert.equal(noClockJump.get().doors.d.state,"unknown");
 }finally{await noClockJump.close();}
 console.log("PASS RELIABILITY sample age starts before first batch; wall-clock rollback cannot prolong freshness");
 let blockedTime=0;
 const blocked=createPoller(profile,async c=>{blockedTime=1500;return c.id==="A"?good():{"PLC_B.DI1":1};},
  {now:()=>blockedTime,monotonic:()=>blockedTime,setTimer:()=>0,clearTimer:()=>{}});
 try{await blocked.poll();assert.equal(blocked.get().controllers.A.offlineCause,"POLL_DEADLINE");assert.equal(blocked.get().doors.d.state,"unknown");}
 finally{await blocked.close();}
 console.log("PASS RELIABILITY elapsed budget enforced when the watchdog callback is delayed");
 const empty=createPoller({...profile,bindings:[]},async()=>({}),clock());
 try{await empty.poll();assert.equal(empty.get().validControllers,0);assert.equal(empty.get().controllers.A.offlineCause,"NO_BINDINGS");}finally{await empty.close();}
 // Fail an actual multi-batch read after its first batch; never publish a partial controller sample.
 const read=await readController(controllers[0],[],{}).catch(e=>e);
 assert.match(read.message,/No read-only/);
 const serial={id:"S",protocol:"modbus-rtu",comPort:"COM9",baudrate:9600,parity:"N",stopbits:1,unitId:1,timeoutMs:200};
 const cfg={...profile,controllers:[serial,{...serial,id:"T",unitId:2}],bindings:[]};
 assert.doesNotThrow(()=>validate(cfg));
 assert.throws(()=>validate({...cfg,controllers:[serial,{...serial,id:"T",unitId:2,baudrate:19200}]}),/conflicting/);
 assert.throws(()=>validate({...cfg,controllers:[serial,{...serial,id:"T"}]}),/duplicate serial/);
 assert.throws(()=>validate({...cfg,controllers:[{...serial,id:"__proto__"}]}),/controller ID/);
 assert.throws(()=>validate({...profile,pollBudgetMs:0}),/budget/);
 console.log("PASS RELIABILITY empty mappings, conflicting bus settings, duplicate units and invalid IDs refused");
 console.log("AIRLOCK_RELIABILITY_OFFLINE_PASS");
})().catch(e=>{console.error(e);process.exitCode=1;});
