"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {SCHEMA,validate}=require("./profile-schema");
const {query:queryTcp}=require("./modbus-tcp");
const {query:queryRtu}=require("./modbus-rtu");
function load(file){
 const data=JSON.parse(fs.readFileSync(path.resolve(file),"utf8"));
 const packageModel=data.package&&data.package.model?data.package.model:data.model;
 if(!packageModel||!Array.isArray(packageModel.rooms)||!Array.isArray(packageModel.doors))
  throw Error("project.model missing");
 if(data.schema!=="airlock-scada-connection/1")throw Error("unsupported SCADA connection schema");
 const result=validate(data);
 return {...result,model:packageModel};
}
async function readController(controller,bindings){
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
    count:last-start+1,timeoutMs:controller.timeoutMs};
  const values=controller.protocol==="modbus-rtu"?
   await queryRtu({...parameters,comPort:controller.comPort,baudrate:controller.baudrate,
     parity:controller.parity,stopbits:controller.stopbits}):
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
  diagnostics[controller.id]={online:!errors[controller.id],error:errors[controller.id]||null,raw};
  if(!errors[controller.id])valid++;
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
  fire:anyFire,controllers:diagnostics,
  ageMs:0,validControllers:valid,totalControllers:profile.controllers.length,
  info:"SCADA displays read-only Modbus values. No PLC writes."};
}
function createPoller(profile,modbusRead=readController){
 let inFlight=null,latest=frameFor(profile,{},Object.fromEntries(profile.controllers.map(c=>[c.id,"not polled"])),0);
 const statistics=Object.fromEntries(profile.controllers.map(c=>[c.id,{
  lastPollAt:null,lastSuccessAt:null,durationMs:null,consecutiveFailures:0
 }]));
 function withStats(frame){
  for(const c of profile.controllers){
   Object.assign(frame.controllers[c.id],statistics[c.id]);
  }
  return frame;
 }
 const poll=()=>{
  if(inFlight)return inFlight;
  inFlight=(async()=>{
   const readings={},errors={};
   await Promise.all(profile.controllers.map(async c=>{
    const bindings=profile.bindings.filter(b=>b.controllerId===c.id);
    const started=Date.now();
    try{Object.assign(readings,await modbusRead(c,bindings));}
    catch(e){errors[c.id]=String(e.message||e).slice(0,160);}
    const ended=Date.now(),stat=statistics[c.id];
    stat.lastPollAt=ended;
    stat.durationMs=Math.max(0,ended-started);
    if(errors[c.id])stat.consecutiveFailures++;
    else{stat.consecutiveFailures=0;stat.lastSuccessAt=ended;}
   }));
   latest=withStats(frameFor(profile,readings,errors));
   return latest;
  })().finally(()=>{inFlight=null;});
  return inFlight;
 };
 return {poll,get:()=>{
  const now=Date.now();
  if(!latest.timestamp||now-latest.timestamp>profile.staleMs){
   return {...withStats(frameFor(profile,{},Object.fromEntries(profile.controllers.map(c=>[c.id,"stale"])),now)),
    source:"offline",ageMs:latest.timestamp?now-latest.timestamp:null};
  }
  return {...latest,ageMs:now-latest.timestamp};
 }};
}
module.exports={load,readController,frameFor,createPoller};
