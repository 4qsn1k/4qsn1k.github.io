"use strict";
// Per-controller communication health QA. No hardware, no sockets.
const assert=require("node:assert/strict");
const model=require("../model.json");
const {createPoller}=require("../gateway/telemetry");
const profile={schema:"airlock-scada-connection/1",model,
 controllers:[
  {id:"PR1",protocol:"modbus-rtu",comPort:"COM3",baudrate:9600,parity:"N",stopbits:1,unitId:16,timeoutMs:1000},
  {id:"PR2",protocol:"modbus-tcp",host:"127.0.0.1",port:502,unitId:17,timeoutMs:1000}
 ],
 bindings:[
  {signal:"PLC_PR1.DI1",controllerId:"PR1",fc:2,address:4096},
  {signal:"PLC_PR2.DI1",controllerId:"PR2",fc:2,address:4096}
 ],pollMs:1500,staleMs:5000
};
let cycle=0;
const poller=createPoller(profile,async c=>{
 await new Promise(resolve=>setTimeout(resolve,c.id==="PR1"?4:2));
 if(c.id==="PR2"&&cycle<=1)throw Error("simulated cable offline");
 return {["PLC_"+c.id+".DI1"]:cycle%2};
});
(async()=>{
 let s=await poller.poll();
 assert.equal(s.controllers.PR1.online,true);assert.equal(s.controllers.PR2.online,false);
 assert.equal(s.controllers.PR2.consecutiveFailures,1);
 assert(Number.isInteger(s.controllers.PR1.durationMs)&&s.controllers.PR1.durationMs>=0);
 assert(Number.isFinite(s.controllers.PR1.lastSuccessAt));
 console.log("PASS HEALTH independent PLC poll and response duration");
 cycle=1;s=await poller.poll();
 assert.equal(s.controllers.PR2.consecutiveFailures,2);
 assert.equal(s.controllers.PR2.lastSuccessAt,null);
 assert.equal(s.controllers.PR1.consecutiveFailures,0);
 console.log("PASS HEALTH failures counted only on offline controller");
 cycle=2;s=await poller.poll();
 assert.equal(s.controllers.PR2.online,true);
 assert.equal(s.controllers.PR2.consecutiveFailures,0);
 assert(s.controllers.PR2.lastSuccessAt>0);
 console.log("PASS HEALTH recovery resets failure streak");
 const now=s.timestamp,oldNow=Date.now;
 try{
  Date.now=()=>now+profile.staleMs+25;
  const expired=poller.get();
  assert.equal(expired.source,"offline");
  assert.equal(expired.controllers.PR1.online,false);
  assert.equal(expired.controllers.PR2.online,false);
  assert.equal(expired.controllers.PR2.lastSuccessAt,s.controllers.PR2.lastSuccessAt);
  assert.equal(expired.doors["1-4"].state,"unknown");
 }finally{Date.now=oldNow;}
 console.log("PASS HEALTH stale telemetry remains offline/UNKNOWN while preserving diagnostics");
 console.log("AIRLOCK_TELEMETRY_HEALTH_PASS 4/4");
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
