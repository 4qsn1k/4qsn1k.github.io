/* Offline vendor-primitive FBD netlist for independently timed airlock zones.
 * NO ST, NO .owle serialization, NO PLC outputs, NO physical I/O mapping.
 * Permits later translation only after vendor-saved native template capture.
 */
"use strict";
const SCHEMA="airlock-native-timed-fbd-plan/1";
const TOKEN=x=>String(x).replace(/[^A-Za-z0-9_]/g,"_");
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const sort=items=>[...items].sort((a,b)=>String(a).localeCompare(String(b),"en"));
function build(candidate){
 assert(candidate?.schema==="airlock-cad-candidate/1","CANDIDATE_SCHEMA_REQUIRED");
 assert(candidate.outputSafety==="NOT_FOR_NATIVE_OWLE_GENERATION_OR_PLC","CANDIDATE_MUST_BE_NONDEPLOYABLE");
 assert(candidate?.timedBlockingRequirement?.requiresOperatorClarification===false,
   "UNCONFIRMED_10S_BEHAVIOR");
 assert(candidate.timedBlockingRequirement.timerStartsOn===
   "AFTER_ALL_DOORS_OF_EACH_INCIDENT_GROUP_CONFIRMED_CLOSED","UNSUPPORTED_TIMER_START");
 assert(candidate.timedBlockingRequirement.timerResetOnRepeatedOpening===
   "RESET_AND_RESTART_FULL_TEN_SECONDS_AFTER_RE_CLOSE","UNSUPPORTED_TIMER_RESET");
 assert(candidate.timedBlockingRequirement.scopeBetweenAdjacentZones===
   "ONLY_INCIDENT_GROUPS_OR_SHARED_DOOR_REQUESTS","UNSUPPORTED_CASCADE_POLICY");
 assert(candidate.timedBlockingRequirement.heldGroupLogicMode===
   "TIMED_HOLD_NOT_VENTILATION","VENTILATION_NOT_PART_OF_DOOR_HOLD");
 const rooms=candidate.physicalSpaces||[], doors=candidate.physicalDoors||[],
   zones=candidate.interlockZones||[], req=candidate.timedBlockingRequirement;
 assert(rooms.length>=1&&zones.length===rooms.length,"ROOM_ZONE_COUNT_MISMATCH");
 assert(doors.length>=2,"MISSING_DOORS");
 const names=new Set(rooms.map(r=>r.id));
 assert(names.size===rooms.length,"DUPLICATE_ROOMS");
 const doorIds=new Set(doors.map(d=>d.id));
 assert(doorIds.size===doors.length,"DUPLICATE_PHYSICAL_DOORS");
 assert(req.doorIds.length===doors.length &&
    sort(req.doorIds).join("|")===sort(doorIds).join("|"),"UNCONFIRMED_PHYSICAL_HOLD_DOORS");
 const zoneMap=new Map(zones.map(z=>[z.roomId,z]));
 assert(zoneMap.size===zones.length,"DUPLICATE_ZONE");
 for(const r of rooms)assert(zoneMap.has(r.id),"ROOM_MISSING_ZONE "+r.id);
 const groups=new Map();
 for(const z of zones){
  assert(z.timingMode==="timed-hold" && z.timedBlockHoldSec===10 &&
   z.timedBlockStartEvent==="ALL_ZONE_DOORS_CLOSED_STABLE" &&
   z.timedBlockRepeatOpenPolicy==="RESTART_AFTER_RE_CLOSE",
   "ZONE_TIMING_UNCONFIRMED "+z.id);
  assert(names.has(z.roomId)&&z.doorIds.length>=2,"ZONE_ROOM_OR_SIZE "+z.id);
  assert(new Set(z.doorIds).size===z.doorIds.length,"DUPLICATE_ZONE_MEMBERS "+z.id);
  const edges=doors.filter(d=>d.a===z.roomId||d.b===z.roomId).map(d=>d.id);
  assert(sort(edges).join("|")===sort(z.doorIds).join("|"),
   "ZONE_EDGE_SET_MISMATCH "+z.id);
  groups.set(z.id,z);
 }
 assert(doors.filter(d=>d.readerRequired).length===1,"ONE_BOLID_READER_REQUIRED");
 const entry=candidate.accessControlTopology?.cardReaderDoorId;
 assert(doorIds.has(entry),"BAD_BOLID_ENTRY");
 assert(doors.find(d=>d.id===entry).readerRequired===true,"MISSING_BOLID_ENTRY_READER");
 assert(candidate.accessControlTopology.cardReaderController==="BOLID_S2000_2",
  "BOLID_CONTROLLER_UNVERIFIED");
 assert(doors.every(d=>d.timedBlockHoldSec===10),"DOOR_HOLD_DURATION_MISMATCH");
 assert(doors.every(d=>d.reedInput===null&&d.hardwareTerminal===null),
   "PHYSICAL_TERMINAL_MAPPING_IS_NOT_APPROVED");

 const nodes=[],edges=[],ids=new Set(),ports=new Map();
 function add(id,kind,inputs=[],outputs=["Q"],extra={}){
  assert(!ids.has(id),"DUPLICATE_FBD_NODE "+id);ids.add(id);
  const node={id,kind,inputs:[...inputs],outputs:[...outputs],...extra};
  nodes.push(node);
  for(const x of inputs)ports.set(id+"."+x,{id,port:x,type:"in"});
  for(const x of outputs)ports.set(id+"."+x,{id,port:x,type:"out"});
  return id;
 }
 function link(src,sp,dst,dp){
  const a=ports.get(src+"."+sp),b=ports.get(dst+"."+dp);
  assert(a?.type==="out"&&b?.type==="in","INVALID_LINK "+src+"."+sp+" -> "+dst+"."+dp);
  edges.push({from:src+"."+sp,to:dst+"."+dp});
 }
 function gate(id,kind,terms){
  assert(terms.length>=(kind==="NOT"?1:2),"BAD_GATE_ARITY "+id);
  if(kind==="NOT")assert(terms.length===1,"NOT_UNARY_ONLY");
  add(id,kind,terms.map((_,i)=>"I"+i));
  terms.forEach(([n,p],i)=>link(n,p,id,"I"+i));
  return [id,"Q"];
 }
 // Signal names are LOGICAL INPUTS, not concrete PR100/PR103 I/O addresses.
 const fire=add("IN_FIRE_NORMAL","INPUT",[],["Q"],{safety:"REFERENCE_ONLY"});
 const reedNames=new Map();
 for(const d of doors){
  assert([d.a,d.b].every(x=>names.has(x)||x==="CNC"),"UNKNOWN_DOOR_ENDPOINT "+d.id);
  assert(d.a!==d.b,"SAME_ROOM_DOOR "+d.id);
  const n=add("IN_CLOSED_"+TOKEN(d.id),"INPUT",[],["Q"],{doorId:d.id,hardwareTerminal:null});
  reedNames.set(d.id,[n,"Q"]);
 }
 const zoneNodes=new Map();
 for(const z of zones){
  const stem="Z_"+TOKEN(z.id);
  const all=gate(stem+"_ALL_CLOSED","AND",z.doorIds.map(d=>reedNames.get(d)));
  const enabled=gate(stem+"_TON_ENABLE","AND",[all,[fire,"Q"]]);
  const ton=add(stem+"_TON_10S","TON",["IN"],["Q"],
   {presetMs:10000,resetOnInputFalse:true,roomId:z.roomId,zoneId:z.id,
    note:"Native timer template parameters must be vendor-verified"});
  link(enabled[0],enabled[1],ton,"IN");
  const not=gate(stem+"_NOT_READY","NOT",[[ton,"Q"]]);
  const busy=gate(stem+"_LOGICAL_BUSY","AND",[[fire,"Q"],not]);
  zoneNodes.set(z.id,{zoneId:z.id,allClosed:all,ton:[ton,"Q"],notReady:not,busy});
  add("OUT_ZONE_BUSY_"+TOKEN(z.id),"OUTPUT",["IN"],[],
   {zoneId:z.id,hardwareTerminal:null,safety:"NO_HARDWARE_ASSIGNMENT"});
  link(busy[0],busy[1],"OUT_ZONE_BUSY_"+TOKEN(z.id),"IN");
 }
 const doorResults=[];
 for(const door of doors){
  const members=zones.filter(z=>z.doorIds.includes(door.id));
  assert(members.length>0&&members.length<=2,"BAD_DOOR_ZONE_COUNT "+door.id);
  const blockedRequests=[];
  for(const z of members){
   // IMPORTANT: own physically open door has Closed=false, no self-block.
   // While any OTHER zone door is open, TON.Q=false so this closed
   // door requests inhibit. After all close, TON.Q becomes true in 10s.
   const n="D_"+TOKEN(door.id)+"_IN_"+TOKEN(z.id);
   blockedRequests.push(gate(n+"_INHIBIT","AND",[
    reedNames.get(door.id),zoneNodes.get(z.id).notReady,[fire,"Q"]
   ]));
  }
  const requested=blockedRequests.length===1?blockedRequests[0]:
   gate("D_"+TOKEN(door.id)+"_BLOCK_OR","OR",blockedRequests);
  const out="OUT_BLOCK_"+TOKEN(door.id);
  add(out,"OUTPUT",["IN"],[],{doorId:door.id,hardwareTerminal:null,
   safety:"LOGICAL_INHIBIT_ONLY_NOT_LOCK_CONTROL"});
  link(requested[0],requested[1],out,"IN");
  const green=gate("D_"+TOKEN(door.id)+"_GREEN","AND",[
   reedNames.get(door.id),[fire,"Q"],...members.map(z=>zoneNodes.get(z.id).ton)
  ]);
  const g="OUT_GREEN_"+TOKEN(door.id);
  add(g,"OUTPUT",["IN"],[],{doorId:door.id,hardwareTerminal:null,
   safety:"LOGICAL_GREEN_ONLY_NOT_LAMP_CONTROL"});
  link(green[0],green[1],g,"IN");
  doorResults.push({doorId:door.id,zoneIds:members.map(z=>z.id),
   inhibitOutput:out,greenOutput:g,readers:door.id===entry?"BOLID_S2000_2_ENTRY_ONLY":"NONE"});
 }
 // Separate Bolid BUSY interface from DOOR BLOCK (open CNC door is
 // allowed to close, but the reader can still remain inhibited).
 const entryZone=zones.find(z=>z.doorIds.includes(entry));
 assert(entryZone,"BOLID_ENTRY_ZONE_MISSING");
 add("OUT_BOLID_BUSY_REQUEST","OUTPUT",["IN"],[],{
  doorId:entry,hardwareTerminal:null,safety:"NO_EGRESS_OR_BUSY_WIRING_APPROVAL"});
 const bz=zoneNodes.get(entryZone.id).busy;
 link(bz[0],bz[1],"OUT_BOLID_BUSY_REQUEST","IN");

 const plan={
  schema:SCHEMA,status:"OFFLINE_NATIVE_PRIMITIVE_NETLIST_ONLY",
  inputSchema:candidate.schema,candidateId:candidate.id,
  fbdPrimitives:["AND","NOT","OR","TON"],
  timings:{holdMs:10000,debounceMs:null,actualPlantVentilation:"NOT_CONNECTED"},
  noStructuredText:true,physicallyDeployable:false,nativeOwleSerialized:false,
  nativeGuiCompiled:false,physicsAndEgressApproved:false,
  inputs:{fireNormal:"IN_FIRE_NORMAL.Q",
   reeds:Object.fromEntries([...reedNames].map(([d,[n,p]])=>[d,n+"."+p]))},
  groups:zones.map(z=>({zoneId:z.id,roomId:z.roomId,doorIds:[...z.doorIds],
   holdMs:10000,tonId:zoneNodes.get(z.id).ton[0],busyOutput:"OUT_ZONE_BUSY_"+TOKEN(z.id)})),
  doors:doorResults,nodes,edges,
  outputs:{bolidBusy:"OUT_BOLID_BUSY_REQUEST",inhibitByDoor:Object.fromEntries(
   doorResults.map(d=>[d.doorId,d.inhibitOutput])),
   logicalGreenByDoor:Object.fromEntries(doorResults.map(d=>[d.doorId,d.greenOutput]))},
  restrictions:[
   "No real PLC terminals, relays, lock actuation, S2000-2 BUSY contact or egress approval",
   "No native Owen TON wrapper or ten-second vendor time-unit mapping has been captured",
   "No native OWLE Save-As, compiler, simulator, network link or failsafe acceptance",
   "Open-door overtime, fault latch, emergency evacuation and ventilation are separate unimplemented subsystems"
  ]
 };
 validate(plan);
 return plan;
}
function validate(plan){
 assert(plan.schema===SCHEMA && plan.noStructuredText===true,"NON_NATIVE_OR_BAD_PLAN");
 assert(plan.nativeOwleSerialized===false&&plan.physicallyDeployable===false,"FORBIDDEN_DEPLOY");
 const nodes=new Map(plan.nodes.map(n=>[n.id,n]));
 assert(nodes.size===plan.nodes.length,"DUPLICATE_NETLIST_NODES");
 const drivers=new Map();
 for(const e of plan.edges){
  const [sn,sp]=e.from.split("."),[tn,tp]=e.to.split(".");
  const src=nodes.get(sn),tgt=nodes.get(tn);
  assert(src?.outputs.includes(sp)&&tgt?.inputs.includes(tp),"INVALID_NETLIST_LINK");
  assert(!drivers.has(e.to),"MULTIPLE_DRIVERS_"+e.to);drivers.set(e.to,e.from);
 }
 for(const n of plan.nodes){
  for(const port of n.inputs)assert(drivers.has(n.id+"."+port),"UNWIRED_GATE "+n.id+"."+port);
  if(n.kind==="TON")assert(n.presetMs===10000&&n.resetOnInputFalse===true,"BAD_TIMED_BLOCK");
  assert(["INPUT","OUTPUT","AND","NOT","OR","TON"].includes(n.kind),"UNKNOWN_NATIVE_PRIMITIVE");
 }
 assert(plan.nodes.filter(n=>n.kind==="INPUT"&&n.doorId).length===plan.doors.length,
  "MULTIPLE_PHYSICAL_REEDS");
 assert(plan.nodes.filter(n=>n.kind==="TON").length===plan.groups.length,
  "TIMERS_NOT_ONE_PER_ZONE");
 return true;
}
// Deterministic reference evaluator executes the GENERATED NETLIST,
// not the previous ST room-state emulator. Never uses physical terminals.
function simulator(plan){
 validate(plan);
 const nodes=new Map(plan.nodes.map(n=>[n.id,n]));
 const drivers=new Map(plan.edges.map(e=>[e.to,e.from]));
 const memory=new Map(plan.nodes.filter(n=>n.kind==="TON").map(n=>[n.id,0]));
 const closed=Object.fromEntries(plan.doors.map(d=>[d.doorId,true]));
 let fireNormal=true,clock=0,last;
 function tick(dt){
  const cache=new Map(),stack=new Set();
  function value(pin){
   if(cache.has(pin))return cache.get(pin);
   assert(!stack.has(pin),"COMBINATIONAL_CYCLE "+pin);
   stack.add(pin);
   const [id,port]=pin.split(".");
   const n=nodes.get(id);
   assert(n,"UNKNOWN_NODE "+id);
   let result;
   if(n.kind==="INPUT"){
    result=id==="IN_FIRE_NORMAL"?fireNormal:closed[n.doorId];
   }else if(n.kind==="OUTPUT"){
    assert(port==="IN","BAD_OUTPUT_ACCESS");
    result=value(drivers.get(pin));
   }else{
    const args=n.inputs.map(x=>value(drivers.get(id+"."+x)));
    if(n.kind==="AND")result=args.every(Boolean);
    else if(n.kind==="OR")result=args.some(Boolean);
    else if(n.kind==="NOT")result=!args[0];
    else if(n.kind==="TON"){
     const next=args[0]?Math.min(n.presetMs,memory.get(id)+dt):0;
     memory.set(id,next);result=next>=n.presetMs;
    }
   }
   assert(typeof result==="boolean","NON_BOOLEAN_SIGNAL "+pin);
   stack.delete(pin);cache.set(pin,result);return result;
  }
  const inhibit={},green={},roomBusy={};
  // Compute each timer exactly once per scan; memoization guards the clock.
  for(const g of plan.groups)roomBusy[g.roomId]=value(g.busyOutput+".IN");
  for(const d of plan.doors){
   inhibit[d.doorId]=value(d.inhibitOutput+".IN");
   green[d.doorId]=value(d.greenOutput+".IN");
  }
  const busy=value(plan.outputs.bolidBusy+".IN");
  clock+=dt;
  last={timeMs:clock,Closed:{...closed},FireNormal:fireNormal,inhibit,green,
   roomBusy,bolidBusy:busy,signals:Object.fromEntries(cache),
   tonElapsedMs:Object.fromEntries(memory),
   safety:"JS NETLIST REFERENCE ONLY"};
  return last;
 }
 function step(next={},ms=100){
  assert(Number.isFinite(ms)&&ms>=0&&ms<=600000,"INVALID_SIM_STEP");
  if(next.FireNormal!==undefined)fireNormal=!!next.FireNormal;
  for(const [id,val]of Object.entries(next.Closed||{})){
   assert(Object.prototype.hasOwnProperty.call(closed,id),"UNKNOWN_REED "+id);
   closed[id]=!!val;
  }
  const slices=Math.max(1,Math.ceil(ms/20));
  for(let i=0;i<slices;i++)tick(ms/slices);
  return last;
 }
 return {step,snapshot:()=>last,reset:()=>simulator(plan)};
}
if(typeof module!=="undefined"&&module.exports)module.exports={build,validate,simulator,SCHEMA};
