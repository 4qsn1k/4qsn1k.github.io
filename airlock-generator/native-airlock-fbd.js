/* Stateful FBD construction + scan reference for Issue 28. No ST, no device I/O.
 * This logical netlist is NOT an OWLE. RS/edge scan ordering requires vendor QA.
 */
"use strict";
const assert=(v,m)=>{if(!v)throw Error(m)};
const schema="airlock-reserved-fbd/1";
function twoDoor(){return {doors:[{id:"A",requestSource:"VIRTUAL"},{id:"B",requestSource:"VIRTUAL"}],
 groups:[{id:"AB",doorIds:["A","B"]}],priority:["A","B"]};}
function sevenDoor(candidate){
 // Reuse the existing strict CAD incidence/timing validator, never its BUSY output.
 require("./native-timed-fbd-plan.js").build(candidate);
 return {doors:candidate.physicalDoors.map(d=>({id:d.id,requestSource:d.readerRequired?"S2000_2_K1":"LOCAL_BUTTON"})),
 groups:candidate.interlockZones.map(z=>({id:z.id,doorIds:[...z.doorIds]})),
 priority:candidate.physicalDoors.map(d=>d.id)};
}
function build(config,{grantMs=5000}={}){
 assert(Number.isSafeInteger(grantMs)&&grantMs>=100&&grantMs<=60000,"INVALID_TEST_GRANT_MS");
 assert(config&&Array.isArray(config.doors)&&Array.isArray(config.groups),"CONFIG_REQUIRED");
 const doors=structuredClone(config.doors),groups=structuredClone(config.groups),priority=[...config.priority];
 const valid=x=>typeof x==="string"&&/^[A-Za-z0-9_]+$/.test(x);
 assert(doors.length>=2&&doors.every(d=>valid(d.id))&&new Set(doors.map(d=>d.id)).size===doors.length,"BAD_DOORS");
 assert(groups.length&&groups.every(g=>valid(g.id)&&Array.isArray(g.doorIds)&&g.doorIds.length>=2&&
  new Set(g.doorIds).size===g.doorIds.length&&g.doorIds.every(id=>doors.some(d=>d.id===id))),"BAD_GROUPS");
 assert(new Set(groups.map(g=>g.id)).size===groups.length,"DUPLICATE_GROUPS");
 assert(doors.every(d=>groups.some(g=>g.doorIds.includes(d.id))),"UNZONED_DOOR");
 assert(priority.length===doors.length&&new Set(priority).size===doors.length&&priority.every(id=>doors.some(d=>d.id===id)),"INVALID_PRIORITY");
 const nodes=[],edges=[];
 const add=(id,kind,inputs=[],extra={})=>{assert(!nodes.some(n=>n.id===id),"DUPLICATE_NODE");nodes.push({id,kind,inputs,...extra});return id;};
 const wire=(from,id,port)=>{edges.push({from,to:id+"."+port});};
 let serial=0;
 const gate=(kind,args)=>{assert(args.length>0,"EMPTY_GATE");if(args.length===1&&kind!=="NOT")return args[0];
  const id=add("G"+(++serial),kind,args.map((_,i)=>"I"+i));args.forEach((x,i)=>wire(x,id,"I"+i));return id;};
 const and=(...a)=>gate("AND",a),or=(...a)=>gate("OR",a),not=a=>gate("NOT",[a]);
 const input=id=>add(id,"INPUT");
 const edge=src=>{const id=add("EDGE_"+src,"R_TRIG",["CLK"],{initialPrevious:true});wire(src,id,"CLK");return id;};
 const latch=id=>add(id,"RS",["S","R"],{initial:false,resetDominant:true});
 const drive=(id,s,r)=>{wire(s,id,"S");wire(r,id,"R");};
 const ton=(id,src,presetMs)=>{add(id,"TON",["IN"],{presetMs,resetOnFalse:true});wire(src,id,"IN");return id;};
 const output=(id,src,role)=>{add(id,"OUTPUT",["IN"],{role,hardwareTerminal:null});wire(src,id,"IN");return id;};
 const fire=input("FIRE_NORMAL"),healthy=input("DATA_HEALTHY"),reset=edge(input("RESET"));
 const closed={},request={},armed={},reserved={},opened={},pulse={},expired={},overtime={};
 const fault=latch("FAULT");
 for(const d of doors){const id=d.id;
  closed[id]=input("CLOSED_"+id);request[id]=input("REQUEST_"+id);
  pulse[id]=edge(request[id]);armed[id]=latch("ARMED_"+id);
  reserved[id]=latch("RESERVED_"+id);opened[id]=latch("OPENED_"+id);
 }
 const pairs=[];
 for(const g of groups)for(let i=0;i<g.doorIds.length;i++)for(let j=i+1;j<g.doorIds.length;j++)
  pairs.push(and(not(closed[g.doorIds[i]]),not(closed[g.doorIds[j]])));
 const unsafe=or(not(fire),not(healthy),...pairs);
 const recovery=and(fire,healthy,...doors.map(d=>closed[d.id]),...doors.map(d=>not(request[d.id])));
 drive(fault,unsafe,and(reset,recovery));
 const normal=and(fire,healthy,not(fault),not(unsafe));
 const ready={},allClosed={};
 for(const g of groups){
  allClosed[g.id]=and(...g.doorIds.map(id=>closed[id]));
  ready[g.id]=ton("HOLD_"+g.id,and(allClosed[g.id],normal),10000);
 }
 const accepted={};
 for(const id of priority){
  const incident=groups.filter(g=>g.doorIds.includes(id));
  const neighbors=[...new Set(incident.flatMap(g=>g.doorIds))];
  expired[id]=ton("UNUSED_"+id,and(reserved[id],not(opened[id]),closed[id]),grantMs);
  overtime[id]=ton("OVERTIME_"+id,not(closed[id]),30000);
  drive(armed[id],not(request[id]),not(normal));
  accepted[id]=and(normal,closed[id],pulse[id],armed[id],not(opened[id]),
   ...incident.map(g=>ready[g.id]),...neighbors.map(k=>not(reserved[k])),
   ...priority.slice(0,priority.indexOf(id)).filter(k=>neighbors.includes(k)).map(k=>not(accepted[k])));
  // Reservation survives the button release AFTER observed opening, until close.
  const unusedCancel=and(not(opened[id]),or(expired[id],not(request[id]),
   ...neighbors.filter(k=>k!==id).map(k=>not(closed[k]))));
  drive(reserved[id],accepted[id],or(not(normal),and(opened[id],closed[id]),unusedCancel));
  drive(opened[id],and(reserved[id],not(closed[id])),or(not(normal),not(reserved[id])));
 }
 const outputs={permits:{},ready:{},overtime:{}};
 for(const d of doors){const id=d.id,incident=groups.filter(g=>g.doorIds.includes(id));
  // Keep normal request AND PLC reservation in the final command. Never idle-ready DO.
  const permit=and(normal,reserved[id],not(opened[id]),closed[id],request[id],not(expired[id]),
   ...incident.map(g=>allClosed[g.id]));
  outputs.permits[id]=output("PERMIT_"+id,permit,"NORMAL_LOCK_PERMISSION_TEST_ONLY");
  outputs.overtime[id]=output("ALARM_"+id,overtime[id],"VIRTUAL_DIAGNOSTIC");
 }
 for(const g of groups)outputs.ready[g.id]=output("READY_"+g.id,ready[g.id],"VIRTUAL_DIAGNOSTIC");
 outputs.fault=output("FAULT_LATCH",fault,"VIRTUAL_DIAGNOSTIC");
 outputs.emergency=output("EMERGENCY",not(fire),"VIRTUAL_DIAGNOSTIC");
 outputs.buzzer=output("BUZZER",or(fault,...Object.values(overtime)),"BUZZER_TEST_ONLY");
 const plan={schema,doors,groups,priority,nodes,edges,outputs,grantMs,
  qualification:"NATIVE_GUI_NOT_VERIFIED",noStructuredText:true,physicalBusyDo:0,
  nativeOwleSerialized:false,physicallyDeployable:false,
  scanContract:"SNAPSHOT_RS_THEN_EVALUATE_TIMERS_EDGES_THEN_SIMULTANEOUS_RESET_DOMINANT_COMMIT_THEN_OUTPUTS",
  initialRequestPolicy:"REQUIRE_OBSERVED_LOW_BEFORE_FRESH_RISE",
  grantTimeoutStatus:"TEST_PARAMETER_NOT_SITE_APPROVED"};
 validate(plan);return plan;
}
function validate(p){
 assert(p.schema===schema&&p.noStructuredText===true&&p.physicallyDeployable===false,"INVALID_PLAN");
 const nodes=new Map(p.nodes.map(n=>[n.id,n]));assert(nodes.size===p.nodes.length,"DUPLICATE_NODE");
 const drivers=new Set();
 for(const e of p.edges){const [id,port]=e.to.split(".");
  assert(nodes.has(e.from)&&nodes.get(id)?.inputs.includes(port),"BAD_EDGE");
  assert(!drivers.has(e.to),"MULTIPLE_DRIVERS");drivers.add(e.to);
 }
 for(const n of p.nodes){
  assert(["INPUT","OUTPUT","AND","OR","NOT","RS","R_TRIG","TON"].includes(n.kind),"UNKNOWN_PRIMITIVE");
  for(const port of n.inputs)assert(drivers.has(n.id+"."+port),"UNWIRED_PORT");
 }
 assert(p.nodes.filter(n=>n.kind==="INPUT"&&n.id.startsWith("CLOSED_")).length===p.doors.length,"REED_COUNT");
 assert(Object.keys(p.outputs.permits).length===p.doors.length&&p.physicalBusyDo===0,"OUTPUT_COUNT");
 return true;
}
function simulator(plan){
 validate(plan);
 const nodes=new Map(plan.nodes.map(n=>[n.id,n])),drivers=new Map(plan.edges.map(e=>[e.to,e.from]));
 let now=0,last;
 const values=Object.fromEntries(plan.nodes.filter(n=>n.kind==="INPUT").map(n=>[n.id,false]));
 const states=new Map(plan.nodes.filter(n=>n.kind==="RS").map(n=>[n.id,false]));
 const previous=new Map(plan.nodes.filter(n=>n.kind==="R_TRIG").map(n=>[n.id,true]));
 const since=new Map(plan.nodes.filter(n=>n.kind==="TON").map(n=>[n.id,null]));
 function scan(){
  const cache=new Map(),busy=new Set(),timers=new Map(),edges=new Map();
  function evaluate(id,committed=false){
   const n=nodes.get(id);assert(n,"UNKNOWN_SIGNAL");
   if(n.kind==="RS")return states.get(id);
   if(n.kind==="INPUT")return values[id];
   if(committed&&n.kind==="TON")return timers.get(id);
   if(committed&&n.kind==="R_TRIG")return edges.get(id);
   if(cache.has(id))return cache.get(id);
   assert(!busy.has(id),"COMBINATIONAL_CYCLE");busy.add(id);
   const args=n.inputs.map(port=>evaluate(drivers.get(id+"."+port),committed));
   let v;
   if(n.kind==="AND")v=args.every(Boolean);
   else if(n.kind==="OR")v=args.some(Boolean);
   else if(n.kind==="NOT")v=!args[0];
   else if(n.kind==="OUTPUT")v=args[0];
   else if(n.kind==="R_TRIG"){
    v=args[0]&&!previous.get(id);edges.set(id,v);previous.set(id,args[0]);
   }else if(n.kind==="TON"){
    if(!args[0])since.set(id,null);else if(since.get(id)===null)since.set(id,now);
    v=since.get(id)!==null&&now-since.get(id)>=n.presetMs;timers.set(id,v);
   }
   busy.delete(id);cache.set(id,v);return v;
  }
  // Evaluate every stateful primitive exactly once, even if an output is unused.
  for(const n of plan.nodes)if(n.kind==="TON"||n.kind==="R_TRIG")evaluate(n.id);
  const next=new Map();
  for(const n of plan.nodes)if(n.kind==="RS"){
   const s=evaluate(drivers.get(n.id+".S")),r=evaluate(drivers.get(n.id+".R"));
   next.set(n.id,!r&&(s||states.get(n.id)));
  }
  for(const [id,v] of next)states.set(id,v);
  cache.clear();
  const output=Object.fromEntries(plan.nodes.filter(n=>n.kind==="OUTPUT").map(n=>[n.id,evaluate(n.id,true)]));
  const map=xs=>Object.fromEntries(Object.entries(xs).map(([id,n])=>[id,output[n]]));
  last={timeMs:now,permit:map(plan.outputs.permits),ready:map(plan.outputs.ready),
   overtime:map(plan.outputs.overtime),fault:output[plan.outputs.fault],emergency:output[plan.outputs.emergency],
   buzzer:output[plan.outputs.buzzer],reserved:Object.fromEntries(plan.doors.map(d=>[d.id,states.get("RESERVED_"+d.id)])),
   timerElapsedMs:Object.fromEntries([...since].map(([id,t])=>[id,t===null?0:now-t])),
   qualification:"REFERENCE_SCAN_ONLY_NOT_OWEN_LOGIC"};
  return structuredClone(last);
 }
 function step(change={},elapsedMs=0){
  assert(Number.isSafeInteger(elapsedMs)&&elapsedMs>=0&&elapsedMs<=600000,"BAD_ELAPSED_MS");
  for(const [id,v]of Object.entries(change))assert(Object.hasOwn(values,id)&&typeof v==="boolean","INVALID_INPUT_"+id);
  Object.assign(values,change);scan();
  const end=now+elapsedMs;
  while(now<end){now=Math.min(end,now+20);scan();}
  return structuredClone(last);
 }
 return {step,snapshot:()=>structuredClone(last),restart:()=>simulator(plan)};
}
module.exports={twoDoor,sevenDoor,build,validate,simulator};
