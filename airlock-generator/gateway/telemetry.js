"use strict";
const {query:queryTcp}=require("./modbus-tcp");
const {createTransport}=require("./modbus-rtu");
const {fault,cause}=require("./health-errors");
function load(file){return require("./profile-store").read(file);}
async function readController(controller,bindings,{signal,rtu}={}){
 const queryRtu=rtu?.query||require("./modbus-rtu").query;
 if(!bindings.length)throw Error("No read-only signals assigned to this controller");
 const readings={};
 // Batch only adjacent, same-FC zero-based addresses.
 const sorted=[...bindings].sort((a,b)=>a.fc-b.fc||a.address-b.address);
 let current=[];
 const groups=[];
 for(const b of sorted){
  const end=current.length?current[current.length-1].address:null;
  if(current.length&& (b.fc!==current[0].fc||b.address>end+1||b.address-current[0].address>=32)){
   groups.push(current);current=[];
  }
  current.push(b);
 }
 if(current.length)groups.push(current);
 for(const items of groups){
  const fc=items[0].fc,start=items[0].address,last=items[items.length-1].address;
  const parameters={unitId:controller.unitId,functionCode:fc,address:start,
    count:last-start+1,timeoutMs:controller.timeoutMs,signal};
  const values=controller.protocol==="modbus-rtu"?
   await queryRtu({...parameters,comPort:controller.comPort,baudrate:controller.baudrate,
     parity:controller.parity,stopbits:controller.stopbits,rtuMode:controller.rtuMode},{signal}):
   await queryTcp({...parameters,host:controller.host,port:controller.port});
  for(const binding of items)readings[binding.signal]=values[binding.address-start];
 }
 return readings;
}
function frameFor(profile,readings,errors,time=Date.now()){
 const rooms={},doors={},diagnostics={};
 let valid=0;
 for(const controller of profile.controllers){
  const raw={};
  for(const [signal,value] of Object.entries(readings)){
   const m=/^PLC_([a-zA-Z0-9_-]+)\.(DI[1-9][0-9]*|Q[1-9][0-9]*)$/.exec(signal);
   if(m&&m[1]===controller.id&&!errors[controller.id])raw[m[2]]=value;
  }
  const confirmed=!errors[controller.id]&&profile.bindings.some(b=>b.controllerId===controller.id&&readings[b.signal]!==undefined);
  diagnostics[controller.id]={online:confirmed,error:errors[controller.id]||(confirmed?null:"NOT_POLLED"),raw};
  if(confirmed)valid++;
 }
 const values={};
 for(const b of profile.bindings){
  if(errors[b.controllerId])continue;
  if(readings[b.signal]===undefined)continue;
  values[b.signal]=readings[b.signal];
 }
 const normalized=id=>String(id).replace(/[^a-zA-Z0-9_-]+/g,"_");
 for(const room of profile.model.rooms){
  const raw=values["ROOM_"+normalized(room.id)+".State"];
  const state=({10:"ready",20:"busy",30:"purge",90:"fault",99:"fire"})[raw];
  if(state)rooms[String(room.id)]={state:state==="ready"&&values["SYSTEM.FireNormal"]!==1?"unknown":state};
 }
 const anyFire=values["SYSTEM.FireNormal"]===0;
 for(const d of profile.model.doors){
  const key=normalized(d.id),id=String(d.id);
  const closed=values["DOOR_"+key+".Closed"];
  const blocked=values["DOOR_"+key+".BlockRequested"];
  const permitted=values["DOOR_"+key+".GreenPermit"];
  const required=[d.a,d.b].filter(x=>profile.model.rooms.some(r=>String(r.id)===String(x)&&
      ["purge","mutual"].includes(r.interlockMode||(r.interlockEnabled?"purge":"none"))));
  let state="unknown";
  if(closed===0)state="open";
  else if(blocked===1)state="blocked";
  else if(closed===1&&blocked===0&&permitted===1&&!anyFire&&
   values["SYSTEM.FireNormal"]===1&&required.every(r=>rooms[String(r)]?.state==="ready"))
   state="ready";
  // Never infer a green status merely from a missing block request.
  doors[id]={state};
 }
 return {timestamp:time,source:valid?"live":"offline",rooms,doors,
  fire:values["SYSTEM.FireNormal"]===undefined?null:anyFire,controllers:diagnostics,
  ageMs:0,validControllers:valid,totalControllers:profile.controllers.length,
  info:"SCADA displays read-only Modbus values. No PLC writes."};
}
function createPoller(profile,modbusRead=readController,clock={}){
 const now=clock.now||(()=>Date.now()),elapsed=clock.monotonic||clock.now||(()=>performance.now());
 const setTimer=clock.setTimer||setTimeout,clearTimer=clock.clearTimer||clearTimeout;
 const rtu=createTransport();let stopped=false;
 const states=new Map(profile.controllers.map(c=>[c.id,{
  readings:{},error:"NOT_POLLED",lastPollAt:null,lastSuccessAt:null,sampleAt:null,sampleTick:null,durationMs:null,
  consecutiveFailures:0,totalFailures:0,inFlight:null,nextDue:0,abort:null
 }]));
 function get(){
  const time=now(),readings={},errors={};
  for(const c of profile.controllers){
   const state=states.get(c.id);
   const age=state.sampleTick===null?null:Math.max(0,elapsed()-state.sampleTick);
   const error=stopped?"STOPPED":state.error||(age===null||age>profile.staleMs?"STALE":null);
   if(error)errors[c.id]=error;else Object.assign(readings,state.readings);
  }
  const frame=frameFor(profile,readings,errors,time);
  const ages=[];
  for(const c of profile.controllers){
   const state=states.get(c.id),age=state.sampleTick===null?null:Math.max(0,elapsed()-state.sampleTick);
   Object.assign(frame.controllers[c.id],{
    lastPollAt:state.lastPollAt,lastSuccessAt:state.lastSuccessAt,sampleAt:state.sampleAt,durationMs:state.durationMs,
    consecutiveFailures:state.consecutiveFailures,totalFailures:state.totalFailures,
    dataAgeMs:age,offlineCause:frame.controllers[c.id].error,polling:!!state.inFlight
   });
   if(age!==null)ages.push(age);
  }
  frame.ageMs=ages.length?Math.max(...ages):null;
  frame.polling={active:[...states.values()].filter(s=>s.inFlight).length,queued:rtu.stats().reduce((n,s)=>n+s.queued,0)};
  return frame;
 }
 function begin(c){
  const state=states.get(c.id);
  if(state.inFlight)return state.observed;
  if(stopped)return Promise.resolve();
  const bindings=profile.bindings.filter(b=>b.controllerId===c.id),start=now(),startTick=elapsed();
  const abort=new AbortController();state.abort=abort;
  const budget=profile.pollBudgetMs||10000;
  let expired=false,timer;
  state.observed=new Promise(resolve=>{state.complete=resolve;});
  const complete=state.complete;
  const fail=code=>{
   state.readings={};state.error=code;state.lastPollAt=now();
   state.durationMs=Math.max(0,elapsed()-startTick);state.consecutiveFailures++;state.totalFailures++;
  };
  timer=state.timer=setTimer(()=>{
   expired=true;fail("POLL_DEADLINE");abort.abort();complete();
  },budget);
  state.inFlight=Promise.resolve().then(()=>{
   if(!bindings.length)throw fault("NO_BINDINGS");
   return modbusRead(c,bindings,{signal:abort.signal,rtu});
  }).then(values=>{
   if(expired||stopped)return; // A late reply cannot restore ONLINE.
   // Enforce elapsed budget even if a busy event loop delayed the timer callback.
   if(elapsed()-startTick>=budget){expired=true;fail("POLL_DEADLINE");abort.abort();return;}
   if(!values||bindings.some(b=>!Object.hasOwn(values,b.signal)))throw fault("INCOMPLETE_SAMPLE");
   if(bindings.some(b=>!Number.isInteger(values[b.signal])||values[b.signal]<0||values[b.signal]>65535||
    (!b.signal.endsWith(".State")&&values[b.signal]>1)))throw fault("INVALID_SAMPLE");
   // Commit one whole controller sample, never partial batches or unrelated values.
   state.readings=Object.fromEntries(bindings.map(b=>[b.signal,values[b.signal]]));
   state.error=null;state.lastPollAt=now();state.lastSuccessAt=now();state.sampleAt=start;state.sampleTick=startTick;
   state.durationMs=Math.max(0,elapsed()-startTick);state.consecutiveFailures=0;
  }).catch(error=>{if(!expired&&!stopped)fail(cause(error));}).finally(()=>{
   clearTimer(timer);state.inFlight=null;state.abort=null;state.nextDue=elapsed()+profile.pollMs;complete();
  });
  return state.observed;
 }
 // Each controller has one flight and one next-due time; missed ticks are discarded.
 // poll() is an explicit cycle for diagnostics/tests; tick() obeys normal cadence.
 function poll(){return Promise.all(profile.controllers.map(begin)).then(get);}
 function tick(){
  if(stopped)return get();
  for(const c of profile.controllers){const s=states.get(c.id);if(!s.inFlight&&elapsed()>=s.nextDue)begin(c);}
  return get();
 }
 async function close(){
  stopped=true;for(const s of states.values()){clearTimer(s.timer);s.abort?.abort();s.complete?.();}
  await rtu.close();
 }
 return {poll,tick,get,close};
}
module.exports={load,readController,frameFor,createPoller};
