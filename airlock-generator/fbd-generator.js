/* Whole-project, typed FBD intermediate representation. No vendor serialization,
 * physical I/O binding, network traffic or controller writes.
 * Reuses the existing room ST, wiring and distributed resource planners.
 */
const AirlockFbdGenerator=(()=>{
"use strict";
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const sym=id=>"D_"+String(id).replace(/[^A-Za-z0-9_]/g,"_");
const mode=r=>r.interlockMode||(r.interlockEnabled?"purge":"none");
const portId=(node,name)=>JSON.stringify([node,name]);
const routeKey=r=>JSON.stringify([r.from,r.to,r.signal]);
function canonicalModel(raw){
 if(!raw||!Array.isArray(raw.rooms)||!Array.isArray(raw.doors))throw Error("Expected rooms[] and doors[]");
 const m=JSON.parse(JSON.stringify(raw));
 const ids=new Set(),names=new Set(),doorIds=new Set(),reeds=new Set(),symbols=new Set();
 for(const r of m.rooms){
  if(!r||!['string','number'].includes(typeof r.id)||!String(r.id).match(/^[A-Za-z0-9_]+$/))
   throw Error("Room ID must use ASCII letters, numbers or underscore");
  r.id=String(r.id);
  if(ids.has(r.id)||names.has(r.id.toUpperCase()))throw Error("Duplicate room/ST identifier: "+r.id);
  if(["__proto__","constructor","prototype"].includes(r.id))throw Error("Reserved room ID");
  ids.add(r.id);names.add(r.id.toUpperCase());
  if(!["none","purge","mutual"].includes(mode(r)))throw Error("Unsupported room policy: "+r.id);
  if(mode(r)==="purge"&&r.purgeSec!==undefined&&
    (!Number.isInteger(r.purgeSec)||r.purgeSec<1||r.purgeSec>3600))throw Error("Invalid purgeSec");
 }
 if(!ids.size)throw Error("No rooms");
 for(const d of m.doors){
  if(!d||!['string','number'].includes(typeof d.id)||!String(d.id).trim())throw Error("Missing door ID");
  d.id=String(d.id);d.a=String(d.a);d.b=String(d.b);
  if(doorIds.has(d.id)||symbols.has(sym(d.id).toUpperCase()))throw Error("Duplicate door/ST identifier: "+d.id);
  doorIds.add(d.id);symbols.add(sym(d.id).toUpperCase());
  if(d.a===d.b||!ids.has(d.a)||!ids.has(d.b))throw Error("Invalid door endpoints: "+d.id);
  if(d.reedInput!=null){
   if(typeof d.reedInput!=="string"||!d.reedInput.trim())throw Error("Invalid reed mapping");
   const key=d.reedInput.trim().toUpperCase();
   if(reeds.has(key))throw Error("Duplicate physical reed: "+d.reedInput);
   reeds.add(key);
  }
 }
 if(m.rules!=null&&(!Array.isArray(m.rules)||m.rules.length))throw Error("Directed rules are not supported by room ST; unresolved policy");
 if(m.exemptions!=null&&(!Array.isArray(m.exemptions)||m.exemptions.length))throw Error("Exemptions are not supported by room ST; unresolved policy");
 if(m.fireMode!==undefined&&m.fireMode!=="all-electrical-interlocks-off")throw Error("Unresolved fire policy");
 if(m.defaultOpenDoorAlarmSec!==undefined&&(!Number.isInteger(m.defaultOpenDoorAlarmSec)||
   m.defaultOpenDoorAlarmSec<1||m.defaultOpenDoorAlarmSec>3600))throw Error("Invalid open-door timeout");
 m.rooms.sort((a,b)=>cmp(a.id,b.id));m.doors.sort((a,b)=>cmp(a.id,b.id));
 return m;
}
function build(raw,options={}){
 const m=canonicalModel(raw?.schema==="airlock-scada-project/1"?raw.model:raw);
 const wiring=AirlockProjectWiring.build(m);
 if(!wiring.activeRoomIds.length)throw Error("No controlled rooms");
 const hardware=options.hardware||m.hardware;
 if(!hardware)throw Error("Select controller hardware and placements");
 if(hardware.signaling!==undefined&&!["door","room"].includes(hardware.signaling))throw Error("Unsupported signaling policy");
 const topology=options.topology||hardware.placements;
 const placement=AirlockDistributedPlanner.build(m,wiring,hardware,AirlockHardwarePlanner,topology);
 const timeoutMs=options.timeoutMs??null;
 if(timeoutMs!==null&&(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>600000))throw Error("Explicit timeoutMs must be 100..600000");
 const nodes=[],edges=[],signals=new Map(),remotes=new Map(),outputOwners=new Map();
 function node(id,kind,controller,inputs,outputs,meta={}){
  const ports=(items,direction)=>items.map(x=>({id:portId(id,x.name),name:x.name,
   direction,type:x.type||"BOOL",...(direction==="output"?{observable:true}:{})}));
  const n={id,kind,controller,inputs:ports(inputs,"input"),outputs:ports(outputs,"output"),...meta};
  nodes.push(n);for(const p of n.outputs)outputOwners.set(p.id,n);return n;
 }
 const output=n=>n.outputs[0].id;
 const input=(n,name)=>n.inputs.find(x=>x.name===name).id;
 const nodeFor=p=>outputOwners.get(p);
 function wire(from,to){edges.push({id:JSON.stringify([from,to]),from,to,type:"BOOL"})}
 function local(signal,source,dest){
  const src=nodeFor(source);
  if(src.controller===dest)return source;
  const route=placement.network.signals.find(r=>r.from===src.controller&&r.to===dest&&r.signal===signal);
  if(!route)throw Error("Missing distributed route: "+signal+" -> "+dest);
  const key=routeKey(route);
  if(!remotes.has(key)){
   const n=node("REMOTE:"+key,"REMOTE",dest,[{name:"Published"}],[{name:"Value"}],{route,
    mappingStatus:"UNASSIGNED",modbusAddress:null});
   wire(source,input(n,"Published"));remotes.set(key,output(n));
  }
  return remotes.get(key);
 }
 const diagnostic=(id,controller)=>{
  const n=node(id,"DIAGNOSTIC",controller,[],[{name:"Value"}],{signal:id,
   mappingStatus:"UNASSIGNED",terminal:null});return output(n);
 };
 const power=new Map(placement.controllers.map(d=>[d.id,diagnostic("CONTROLLER_OK@"+d.id,d.id)]));
 for(const a of placement.allocations.DI){
  const d=wiring.inputs.find(x=>x.id===a.signal&&x.doorId!==undefined);
  const n=node("DI:"+a.signal,"INPUT",a.controller,[],[{name:"Value"}],{
   signal:a.signal,doorId:d?String(d.doorId):null,
   physicalReed:!!d,slot:a.slot,terminal:null,mappingStatus:"UNASSIGNED"});
  let p=output(n);
  if(d){
   const sensor=diagnostic("SENSOR_OK:"+d.doorId,a.controller);
   const q=node("QUALIFIED:"+a.signal,"QUALIFIED_REED",a.controller,
    [{name:"Closed"},{name:"PowerOK"},{name:"SensorOK"}],[{name:"Value"}],{doorId:String(d.doorId)});
   wire(p,input(q,"Closed"));wire(power.get(a.controller),input(q,"PowerOK"));wire(sensor,input(q,"SensorOK"));
   p=output(q);
  }
  signals.set(a.signal,p);
 }
 const blocks=[];
 for(const roomId of wiring.activeRoomIds.map(String)){
  const block=AirlockStGenerator.build(m,roomId),controller=placement.topology.roomOwners[roomId];
  blocks.push(block);
  const n=node(block.blockName,"ROOM_FB",controller,
   block.io.filter(x=>x.direction==="input").map(x=>({name:x.signal})),
   block.io.filter(x=>x.direction==="output").map(x=>({name:x.signal,type:x.signal==="O_State"?"UDINT":"BOOL"})),
   {roomId,blockName:block.blockName});
  const health=node("ROOM_DATA_VALID_N"+roomId,"ALL_TRUE",controller,
   [{name:"FireNormal"},{name:"PowerOK"},...block.doorIds.map(d=>({name:"Closed:"+d}))],[{name:"Value"}]);
  wire(signals.get("FireNormal@"+controller),input(n,"FireNormal"));
  wire(signals.get("ResetFault@"+controller),input(n,"ResetFault"));
  wire(signals.get("FireNormal@"+controller),input(health,"FireNormal"));
  wire(power.get(controller),input(health,"PowerOK"));
  for(const d of block.doorIds){
   const p=local("CLOSED_"+sym(d),signals.get("CLOSED_"+sym(d)),controller);
   wire(p,input(n,"I_"+sym(d)+"_Closed"));wire(p,input(health,"Closed:"+d));
  }
  for(const p of n.outputs)signals.set(block.blockName+"."+p.name,p.id);
  signals.set(health.id,output(health));
 }
 const doors=[];
 for(const request of wiring.blockRequests){
  const doorId=String(request.doorId),controller=placement.topology.doorOutputOwners[doorId];
  const d=m.doors.find(x=>x.id===doorId),roomIds=[d.a,d.b].filter(x=>wiring.activeRoomIds.includes(x)).sort(cmp);
  const inhibit=node(request.result,"OR",controller,request.sources.map(s=>({name:s})),[{name:"Value"}],{doorId});
  for(const s of request.sources)wire(local(s,signals.get(s),controller),input(inhibit,s));
  signals.set(inhibit.id,output(inhibit));
  const names=["Closed","FireNormal","PowerOK","FinalBlock",
   ...roomIds.flatMap(r=>["Ready:"+r,"Fault:"+r,"Fire:"+r,"Healthy:"+r])];
  const green=node("GREEN_PERMIT_"+sym(doorId),"DOOR_GREEN",controller,
   names.map(name=>({name})),[{name:"Value"}],{doorId,roomIds});
  wire(local("CLOSED_"+sym(doorId),signals.get("CLOSED_"+sym(doorId)),controller),input(green,"Closed"));
  wire(signals.get("FireNormal@"+controller),input(green,"FireNormal"));
  wire(power.get(controller),input(green,"PowerOK"));wire(output(inhibit),input(green,"FinalBlock"));
  for(const r of roomIds){
   for(const [prefix,suffix] of [["Ready","O_Ready"],["Fault","O_Fault"],["Fire","O_Fire"]]){
    const s="FB_Room_N"+r+"."+suffix;
    wire(local(s,signals.get(s),controller),input(green,prefix+":"+r));
   }
   const s="ROOM_DATA_VALID_N"+r;
   wire(local(s,signals.get(s),controller),input(green,"Healthy:"+r));
  }
  signals.set(green.id,output(green));
  doors.push({doorId,roomIds,reed:signals.get("CLOSED_"+sym(doorId)),finalBlock:output(inhibit),green:output(green),
   lockCommand:null,contactWiring:{com:"lamp supply",nc:"RED",no:"GREEN"},
   deenergized:"RED_ONLY_IF_LAMP_SUPPLY_AVAILABLE"});
 }
 const alarmOwner=placement.topology.alarmOwner;
 const alarm=node("ANY_ALARM","OR",alarmOwner,blocks.map(b=>({name:b.blockName+".O_Alarm"})),[{name:"Value"}]);
 for(const p of alarm.inputs)wire(local(p.name,signals.get(p.name),alarmOwner),p.id);
 signals.set(alarm.id,output(alarm));
 for(const a of placement.allocations.DO){
  let source=signals.get(a.signal);
  if(!source&&a.signal.startsWith("ROOM_")){
   const b=blocks.find(x=>a.signal==="ROOM_"+x.roomId+"_SIGNAL_RELAY"||a.signal==="ROOM_"+x.roomId+"_VENTILATION_REQUEST");
   if(b){
    const ventilation=a.signal.endsWith("VENTILATION_REQUEST");
    const guard=node("GUARDED:"+a.signal,"ROOM_SIGNAL",a.controller,
     [{name:"Request"},{name:"Healthy"},{name:"Fault"},{name:"Fire"}],[{name:"Value"}]);
    wire(signals.get(b.blockName+"."+(ventilation?"O_VentilationRequest":"O_Ready")),input(guard,"Request"));
    wire(signals.get("ROOM_DATA_VALID_N"+b.roomId),input(guard,"Healthy"));
    wire(signals.get(b.blockName+".O_Fault"),input(guard,"Fault"));
    wire(signals.get(b.blockName+".O_Fire"),input(guard,"Fire"));source=output(guard);
   }
  }
  if(!source){
   const door=doors.find(x=>a.signal==="DOOR_"+sym(x.doorId)+"_SIGNAL_RELAY");
   if(door)source=door.green;
  }
  if(!source)throw Error("Output without source: "+a.signal);
  const n=node("DO:"+a.signal,"OUTPUT",a.controller,[{name:"Value"}],[],{
   signal:a.signal,slot:a.slot,terminal:null,mappingStatus:"UNASSIGNED",
   scope:a.signal.startsWith("FINAL_BLOCK_")?"LOGICAL_INHIBIT_NOT_LOCK_POWER":"LOGICAL_SIGNAL"});
  wire(source,input(n,"Value"));
 }
 nodes.sort((a,b)=>cmp(a.id,b.id));edges.sort((a,b)=>cmp(a.id,b.id));
 for(const r of placement.network.signals){
  const remote=remotes.get(routeKey(r));
  r.typedConsumers=edges.filter(e=>e.from===remote).map(e=>e.to).sort(cmp);
  if(!r.typedConsumers.length)throw Error("Unused distributed route: "+r.signal);
 }
 const plan={schema:"airlock-fbd-plan/1",status:"FBD_PLAN_GENERATED",testOnly:true,
  verification:{plan:"NOT_CHECKED",nativeCompile:"NEEDS_NATIVE_GUI",physical:"NOT_TESTED"},
  nodes,edges,doors,blocks,placement,timeoutMs,
  unresolvedRequirements:["PHYSICAL_TERMINALS","MODBUS_REGISTER_MAP","SENSOR_HEALTH_SOURCE",
   "CONTROLLER_POWER_HEALTH_SOURCE","REED_POLARITY_AND_DIAGNOSTICS","FIRE_RECOVERY_POLICY","POWER_RECOVERY_POLICY","SENSOR_FAILURE_POLICY",
   ...(timeoutMs===null?["FRESHNESS_TIMEOUT"]:[])],
  native:{status:"NEEDS_NATIVE_GUI",reason:"Existing GUI fixture has ST instances but no ConnectorModels/OR schema. PR #6 proves two-room simulation only; no reusable full serialization fixture is present."}};
 validate(plan);plan.verification.plan="FBD_PLAN_PASS";
 return plan;
}
function validate(plan){
 if(plan?.schema!=="airlock-fbd-plan/1")throw Error("Unknown FBD plan schema");
 const nodes=new Map(),ports=new Map(),drivers=new Map(),ids=new Set();
 for(const n of plan.nodes){
  if(nodes.has(n.id))throw Error("Duplicate node ID");nodes.set(n.id,n);
  if(!["INPUT","DIAGNOSTIC","QUALIFIED_REED","ROOM_FB","REMOTE","OR","ALL_TRUE","ROOM_SIGNAL","DOOR_GREEN","OUTPUT"].includes(n.kind))throw Error("Unknown node kind");
  if(!plan.placement.controllers.some(d=>d.id===n.controller))throw Error("Unknown controller");
  for(const [direction,list] of [["input",n.inputs],["output",n.outputs]])for(const p of list){
   if(ports.has(p.id))throw Error("Duplicate port ID");
   if(p.id!==portId(n.id,p.name)||p.direction!==direction||!["BOOL","UDINT"].includes(p.type))throw Error("Invalid typed port");
   ports.set(p.id,{...p,node:n});
  }
  if("terminal" in n&&(n.terminal!==null||n.mappingStatus!=="UNASSIGNED"))throw Error("Physical mapping must remain UNASSIGNED");
 }
 for(const e of plan.edges){
  if(ids.has(e.id))throw Error("Duplicate wire");ids.add(e.id);
  const a=ports.get(e.from),b=ports.get(e.to);
  if(!a||!b)throw Error("Orphaned wire");
  if(a.direction!=="output"||b.direction!=="input"||a.type!==b.type||e.type!==a.type)throw Error("Wire type/direction mismatch");
  if(drivers.has(e.to))throw Error("Multiple drivers");drivers.set(e.to,e.from);
  if(a.node.controller!==b.node.controller&&b.node.kind!=="REMOTE")throw Error("Unmonitored cross-controller wire");
 }
 for(const n of plan.nodes)for(const p of n.inputs)if(!drivers.has(p.id))throw Error("Unconnected input: "+p.id);
 const source=(n,name)=>{
  const p=n.inputs.find(p=>p.name===name);
  if(!p)throw Error("Missing required port: "+n.id+"."+name);
  let s=ports.get(drivers.get(p.id));
  if(s.node.kind==="REMOTE")s=ports.get(drivers.get(s.node.inputs[0]?.id));
  if(!s)throw Error("Missing source");return s;
 };
 const expect=(n,name,id,port="Value")=>{
  const s=source(n,name);
  if(s.node.id!==id||s.name!==port)throw Error("Wrong signal provenance: "+n.id+"."+name);
 };
 for(const n of plan.nodes){
  if(n.kind==="REMOTE"){
   const r=n.route,p=source(n,"Published");
   if(n.inputs.length!==1||n.outputs.length!==1||r.from!==p.node.controller||r.to!==n.controller||
    !plan.placement.network.signals.some(x=>routeKey(x)===routeKey(r))||n.modbusAddress!==null)
    throw Error("Invalid monitored route");
   const label=p.node.kind==="ROOM_FB"?p.node.id+"."+p.name:p.node.kind==="QUALIFIED_REED"?
    p.node.id.replace(/^QUALIFIED:/,""):p.node.id;
   if(label!==r.signal)throw Error("Wrong remote signal");
  }
  if(n.kind==="QUALIFIED_REED"){
   expect(n,"Closed","DI:CLOSED_"+sym(n.doorId));expect(n,"PowerOK","CONTROLLER_OK@"+n.controller);
   expect(n,"SensorOK","SENSOR_OK:"+n.doorId);
  }
  if(n.kind==="ROOM_FB"){
   const b=plan.blocks.find(b=>b.blockName===n.id);
   if(!b||JSON.stringify(n.inputs.map(p=>p.name))!==JSON.stringify(b.io.filter(x=>x.direction==="input").map(x=>x.signal))||
    JSON.stringify(n.outputs.map(p=>p.name))!==JSON.stringify(b.io.filter(x=>x.direction==="output").map(x=>x.signal)))throw Error("ST signature mismatch");
   if(n.inputs.some(p=>p.type!=="BOOL")||n.outputs.some(p=>p.type!==(p.name==="O_State"?"UDINT":"BOOL")))throw Error("ST port type mismatch");
   expect(n,"FireNormal","DI:FireNormal@"+n.controller);expect(n,"ResetFault","DI:ResetFault@"+n.controller);
   const health=nodes.get("ROOM_DATA_VALID_N"+n.roomId);
   if(health?.kind!=="ALL_TRUE"||health.inputs.length!==b.doorIds.length+2)throw Error("Missing room health");
   expect(health,"FireNormal","DI:FireNormal@"+n.controller);expect(health,"PowerOK","CONTROLLER_OK@"+n.controller);
   for(const d of b.doorIds){
    expect(n,"I_"+sym(d)+"_Closed","QUALIFIED:CLOSED_"+sym(d));
    expect(health,"Closed:"+d,"QUALIFIED:CLOSED_"+sym(d));
   }
  }
 }
 const physical=plan.nodes.filter(x=>x.physicalReed);
 if(new Set(physical.map(x=>x.doorId)).size!==physical.length||physical.length!==plan.doors.length)throw Error("Duplicate/missing physical reed");
 for(const d of plan.doors){
  const participants=plan.blocks.filter(b=>b.doorIds.map(String).includes(d.doorId)).map(b=>b.roomId).sort(cmp);
  if(JSON.stringify(participants)!==JSON.stringify(d.roomIds))throw Error("Missing door participant");
  const gate=ports.get(d.finalBlock)?.node,green=ports.get(d.green)?.node;
  if(gate?.kind!=="OR"||green?.kind!=="DOOR_GREEN"||gate.inputs.length!==d.roomIds.length)throw Error("Door aggregation invariant");
  const sources=gate.inputs.map(p=>ports.get(drivers.get(p.id))).map(p=>{
   if(p.node.kind==="REMOTE")return ports.get(drivers.get(p.node.inputs[0].id));return p;
  }).map(p=>p.node.id+"."+p.name).sort(cmp);
  const expected=d.roomIds.map(r=>"FB_Room_N"+r+".O_"+sym(d.doorId)+"_Block").sort(cmp);
  if(JSON.stringify(sources)!==JSON.stringify(expected))throw Error("Missing independent inhibit producer");
  if(green.inputs.length!==4+4*d.roomIds.length||new Set(green.roomIds).size!==d.roomIds.length||
   JSON.stringify(green.roomIds)!==JSON.stringify(d.roomIds))throw Error("Invalid green participant set");
  expect(green,"Closed","QUALIFIED:CLOSED_"+sym(d.doorId));expect(green,"FinalBlock",gate.id);
  expect(green,"FireNormal","DI:FireNormal@"+green.controller);expect(green,"PowerOK","CONTROLLER_OK@"+green.controller);
  for(const r of d.roomIds){
   for(const [prefix,suffix] of [["Ready","O_Ready"],["Fault","O_Fault"],["Fire","O_Fire"]])expect(green,prefix+":"+r,"FB_Room_N"+r,suffix);
   expect(green,"Healthy:"+r,"ROOM_DATA_VALID_N"+r);
  }
 }
 // Kahn traversal catches accidental cycles, including remote feedback.
 const pending=new Map(plan.nodes.map(n=>[n.id,new Set(n.inputs.map(p=>ports.get(drivers.get(p.id)).node.id))]));
 const order=[];
 while(pending.size){
  const ready=[...pending].filter(([,deps])=>!deps.size).map(([id])=>id).sort(cmp);
  if(!ready.length)throw Error("FBD dependency cycle");
  for(const id of ready){order.push(id);pending.delete(id);for(const deps of pending.values())deps.delete(id)}
 }
 return {order,drivers,ports};
}
function matrix(plan){
 validate(plan);
 const ports=new Map(plan.nodes.flatMap(n=>[...n.inputs,...n.outputs].map(p=>[p.id,{...p,controller:n.controller}])));
 const quote=s=>'"'+String(s).replace(/"/g,'""')+'"';
 return [["SourcePort","TargetPort","Type","FromController","ToController"],...plan.edges.map(e=>
  [e.from,e.to,e.type,ports.get(e.from).controller,ports.get(e.to).controller])].map(row=>row.map(quote).join(";")).join("\r\n")+"\r\n";
}
function nativeTestPlan(plan){
 validate(plan);
 return ["# Issue #10 — generated Owen Logic TEST plan","",
  "Status: NEEDS_NATIVE_GUI. FBD_PLAN_PASS is an offline graph result, not NATIVE_COMPILE_PASS or PHYSICAL_PASS.",
  "Historical QA-OL-006 and QA-OL-012 A–F are already accepted for the old two-room TEST copy (PR #6). This plan qualifies the newly generated graph; do not overwrite those results.","",
  "1. Create a distinct new TEST project in Owen Logic. Preserve the original and autosaves. Do not connect any PLC, COM port, lock, SCUD or fire circuit.",
  "2. Import/create the following ST definitions using the existing generator outputs: "+plan.blocks.map(b=>b.blockName+".st").join(", ")+".",
  "3. Place the room instances on their assigned controller TEST sheets. The plan's stable port IDs identify logical connections; they are NOT native Owen GUIDs.",
  "4. Create virtual inputs only. Every physical door has one reed source. Fan it out as listed in connection-matrix.csv. All physical terminals and Modbus addresses remain UNASSIGNED.",
  "5. Build every OR, green-permit and diagnostic guard from the matrix. ROOM_DATA_VALID requires local power, fire normal, every qualified closed reed. SENSOR_OK must be explicit; a closed bit cannot prove a healthy sensor.",
  "6. Model each REMOTE with a receiver-side monotonic clock, explicitly selected timeout, valid BOOL and strictly increasing sequence. Replayed, invalid, future and expired data must not enable green. No live network transport is generated.",
  "7. Capture the actual saved ConnectorModels, OR and guard schemas with port names/types and SHA256 in a sanitized fixture. Current fixture is insufficient for a complete .owle. No guessed fields are permitted.",
  "8. Capture native editor diagnostics and run the actual new graph in the built-in simulator. Record input values, actual outputs, simulated time and evidence hashes; until then keep NEEDS_NATIVE_GUI.","",
  "## Per-door acceptance (new generated graph)","",
  ...plan.doors.flatMap((d,i)=>[
   `### FBD-10-${String(i+1).padStart(3,"0")} — door ${d.doorId}`,
   `Participating rooms: ${d.roomIds.join(", ")}. Final inhibit port: ${d.finalBlock}. Green port: ${d.green}.`,
   "- All participating rooms READY, all reeds closed/healthy, FireNormal and controller power confirmed, all required remote signals fresh: green TRUE and inhibit FALSE.",
   ...d.roomIds.map(r=>`- Assert only room ${r}'s inhibit request: final inhibit TRUE and green FALSE even if the other rooms are READY.`),
   "- Open this single shared reed: every participating FB sees the same opening, green FALSE. Close it: mutual/purge delays follow the existing room ST; reopening restarts purge.",
   "- Inject one fault, missing sensor health, power loss, fire, stale or replayed route at a time: green FALSE. Unknown inhibit remains UNKNOWN; never turn it into a physical lock decision.",
   "- Restore signals after an observed failure: recovery remains UNRESOLVED until the separate engineering policy is approved; no automatic relocking/green acceptance.",
   "- Indicator coil TRUE selects NO/GREEN; FALSE selects NC/RED only if lamp power is present. Loss of lamp power can extinguish both. This says nothing about lock power or evacuation.",""
  ]),
  "## Outstanding engineering/native requirements","",
  ...plan.unresolvedRequirements.map(x=>"- "+x),"",
  "Sign off FBD_PLAN_PASS, NATIVE_COMPILE_PASS and PHYSICAL_PASS separately. No physical commissioning is authorized by this plan.",""
 ].join("\n");
}
// Evidence adapter for the only available GUI-saved ST instance shape. It
// describes matching ports without cloning UUIDs, geometry or invented wires.
function nativeEvidence(plan,fixture){
 validate(plan);
 if(fixture?.schema!=="airlock-owle-fbd-elements/1"||!Array.isArray(fixture.elements))throw Error("Unsupported native fixture");
 const ids=new Set();
 for(const item of fixture.elements){
  const e=item.ElementBlockStoreModel?.ElementModel,meta=item.FunctionalBlocksDirectorStoreModel;
  if(!e||!meta||e.Ports.length!==meta.InputNames.length+meta.OutputNames.length)throw Error("Malformed native fixture");
  for(const p of e.Ports){
   if(!p.UniqueId||ids.has(p.UniqueId))throw Error("Duplicate native fixture port ID");ids.add(p.UniqueId);
   if(![0,1].includes(p.PortType))throw Error("Native fixture port direction mismatch");
   const isInput=p.PortType===0,match=new RegExp(isInput?"^Input(\\d+)$":"^Output(\\d+)$").exec(p.Name);
   const types=isInput?meta.InputDataTypes:meta.OutputDataTypes;
   if(!match||types[Number(match[1])]!==p.DataType)throw Error("Native fixture port type mismatch");
  }
 }
 const blocks=plan.blocks.map(b=>{
  const input=b.io.filter(x=>x.direction==="input").map(x=>x.signal),out=b.io.filter(x=>x.direction==="output").map(x=>x.signal);
  const item=fixture.elements.find(x=>{
   const m=x.FunctionalBlocksDirectorStoreModel;
   return JSON.stringify(m.InputNames)===JSON.stringify(input)&&JSON.stringify(m.OutputNames)===JSON.stringify(out)&&
    // GUI FBD port metadata uses BOOL=0 (unlike the ST archive's BOOL=6).
    m.InputDataTypes.every(t=>t===0)&&m.OutputDataTypes.every((t,i)=>t===(out[i]==="O_State"?3:0));
  });
  return {blockName:b.blockName,status:item?"GUI_SIGNATURE_MATCH":"NEEDS_NATIVE_GUI",template:item?.Name||null,
   portNames:item?[...input.map((name,i)=>({logicalName:name,nativeName:"Input"+i})),
    ...out.map((name,i)=>({logicalName:name,nativeName:"Output"+i}))]:[]};
 });
 return {schema:"airlock-fbd-native-evidence/1",status:"NEEDS_NATIVE_GUI",nativeDocument:null,
  usableForSerialization:false,blocks,
  missing:["COMPLETE_CONNECTOR_MODELS","OR_AND_GUARD_ELEMENTS","REMOTE_QUALITY_GUARDS","NATIVE_COMPILE_AND_SIMULATION"]};
}
return {build,validate,matrix,nativeTestPlan,nativeEvidence,portId,routeKey};
})();
