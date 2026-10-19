/* Offline evaluation of the generated graph and observed room-FB outputs.
 * Room logic remains in st-testbench.js / generated ST, not duplicated here.
 * Every sample needs explicit validity and a receiver-side monotonic timestamp.
 */
const AirlockFbdEvaluator=(()=>{
"use strict";
const unknown=reason=>({value:null,valid:false,reason});
const known=value=>({value,valid:true,reason:"VALID"});
function evaluate(plan,{samples={},nowMs,watchdog,timeoutMs=plan.timeoutMs}={}){
 const {order,drivers}=AirlockFbdGenerator.validate(plan);
 if(!Number.isSafeInteger(nowMs)||nowMs<0)throw Error("Explicit monotonic nowMs required");
 const timeoutValid=Number.isSafeInteger(timeoutMs)&&timeoutMs>=100&&timeoutMs<=600000;
 const nodes=new Map(plan.nodes.map(n=>[n.id,n])),values=new Map();
 function sample(signal,type){
  if(!timeoutValid)return unknown("UNRESOLVED_FRESHNESS_TIMEOUT");
  const s=Object.hasOwn(samples,signal)?samples[signal]:null;
  if(!s||s.valid!==true)return unknown("MISSING_OR_INVALID_SAMPLE:"+signal);
  if(type==="BOOL"?typeof s.value!=="boolean":!Number.isInteger(s.value)||s.value<0||s.value>4294967295)
   return unknown("INVALID_TYPE:"+signal);
  if(!Number.isSafeInteger(s.atMs)||s.atMs<0||s.atMs>nowMs)return unknown("CLOCK_ANOMALY:"+signal);
  if(nowMs-s.atMs>timeoutMs)return unknown("STALE_SAMPLE:"+signal);
  return known(s.value);
 }
 for(const id of order){
  const n=nodes.get(id),ins=Object.fromEntries(n.inputs.map(p=>[p.name,values.get(drivers.get(p.id))]));
  const all=Object.values(ins),valid=all.every(x=>x?.valid===true);
  const fail=()=>unknown(all.find(x=>!x?.valid)?.reason||"UNKNOWN_INPUT");
  let result;
  switch(n.kind){
   case "INPUT":case "DIAGNOSTIC":result=sample(n.signal,"BOOL");break;
   case "QUALIFIED_REED":
    result=!valid?fail():ins.PowerOK.value!==true?unknown("POWER_LOSS"):
     ins.SensorOK.value!==true?unknown("SENSOR_FAULT"):ins.Closed;break;
   case "ROOM_FB":
    for(const p of n.outputs)values.set(p.id,valid?sample(n.id+"."+p.name,p.type):fail());
    continue;
   case "REMOTE":{
    if(!watchdog){result=unknown("MISSING_WATCHDOG");break}
    if(!timeoutValid||watchdog.timeoutMs!==timeoutMs){result=unknown("WATCHDOG_TIMEOUT_MISMATCH");break}
    const r=watchdog.status(n.route,nowMs);
    result=!valid?fail():!r.fresh?unknown(r.reason):r.value!==ins.Published.value?
     unknown("INCONSISTENT_REMOTE_COPY"):known(r.value);break;
   }
   case "OR":
    result=all.some(x=>x.valid&&x.value===true)?known(true):valid?known(false):fail();break;
   case "ALL_TRUE":result=valid?known(all.every(x=>x.value===true)):fail();break;
   case "ROOM_SIGNAL":result=known(valid&&ins.Request.value===true&&ins.Healthy.value===true&&ins.Fault.value===false&&ins.Fire.value===false);break;
   case "DOOR_GREEN":{
    const conditions={closed:ins.Closed.value,fireNormal:ins.FireNormal.value,
     allRoomReady:n.roomIds.every(r=>ins["Ready:"+r].value===true&&ins["Healthy:"+r].value===true&&ins["Fire:"+r].value===false),
     finalBlock:ins.FinalBlock.value,networkFresh:valid,
     localFault:ins.PowerOK.value!==true||n.roomIds.some(r=>ins["Fault:"+r].value!==false)};
    // False is absence of positive logical authorization, not a lock command.
    result=known(AirlockDistributedPlanner.logicalDoorPermit(conditions));break;
   }
   case "OUTPUT":continue;
   default:throw Error("Unsupported FBD node: "+n.kind);
  }
  for(const p of n.outputs)values.set(p.id,result);
 }
 const doors=Object.fromEntries(plan.doors.map(d=>{
  const blocked=values.get(d.finalBlock),green=values.get(d.green);
  return [d.doorId,{finalBlock:blocked.value,logicalGreenPermit:green.value===true,
   status:!blocked.valid?"UNKNOWN":green.value?"PERMITTED":"DENIED",
   indicatedContact:green.value?"NO_GREEN":"NC_RED_IF_POWERED",lockCommand:null}];
 }));
 const diagnostics=[...new Set([...values.values()].filter(v=>!v.valid).map(v=>v.reason))].sort();
 return {schema:"airlock-fbd-evaluation/1",doors,diagnostics,
  unresolvedRequirements:plan.unresolvedRequirements,
  scope:"OFFLINE_MODEL_ONLY_NO_PHYSICAL_ACTION",values};
}
// An observed failure cannot authorize an automatic recovery policy. A new
// offline session starts a separate experiment; this API has no reset command.
function create(plan,{timeoutMs=plan.timeoutMs}={}){
 const {drivers,ports}=AirlockFbdGenerator.validate(plan);
 const dependencies=new Map(),initialized=new Set(),latched=new Map();
 for(const d of plan.doors){
  const seen=new Set();
  function visit(id){
   if(seen.has(id))return;seen.add(id);
   const n=ports.get(id).node;
   for(const p of n.inputs)visit(drivers.get(p.id));
  }
  visit(d.green);dependencies.set(d.doorId,seen);
 }
 return {evaluate(options){
  const r=evaluate(plan,{...options,timeoutMs});
  for(const d of plan.doors){
   const deps=[...dependencies.get(d.doorId)],reasons=[];
   if(initialized.has(d.doorId)&&deps.some(p=>r.values.get(p)?.valid!==true))reasons.push("SIGNAL_QUALITY_LOSS");
   for(const p of deps){
    const n=ports.get(p).node,v=r.values.get(p);
    if(!v?.valid)continue;
    if(n.kind==="INPUT"&&n.signal.startsWith("FireNormal@")&&v.value===false)reasons.push("FIRE_RECOVERY_POLICY");
    if(n.kind==="DIAGNOSTIC"&&v.value===false)reasons.push(n.signal.startsWith("SENSOR_OK:")?"SENSOR_FAILURE_POLICY":"POWER_RECOVERY_POLICY");
    if(n.kind==="ROOM_FB"&&ports.get(p).name==="O_Fault"&&v.value===true)reasons.push("FAULT_RECOVERY_POLICY");
   }
   if(deps.every(p=>r.values.get(p)?.valid===true))initialized.add(d.doorId);
   if(reasons.length)latched.set(d.doorId,[...new Set([...(latched.get(d.doorId)||[]),...reasons])].sort());
   const required=latched.get(d.doorId)||[];
   r.doors[d.doorId].recoveryRequired=required;
   if(required.length){
    r.doors[d.doorId].logicalGreenPermit=false;r.doors[d.doorId].status="UNRESOLVED_RECOVERY_POLICY";
    r.doors[d.doorId].indicatedContact="NC_RED_IF_POWERED";
    r.values.set(d.green,known(false));
   }
  }
  return r;
 }};
}
return {evaluate,create};
})();
