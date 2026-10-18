"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const context=vm.createContext({});
for(const f of ["st-generator.js","project-wiring.js","hardware-planner.js","distributed-planner.js","fbd-generator.js"])
 vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),context,{filename:f});
const fbd=vm.runInContext("AirlockFbdGenerator",context);
const sample=JSON.parse(fs.readFileSync(path.join(root,"model.json"),"utf8"));
const pr=(di=32,doCount=32)=>({family:"PR103",baseDi:di,baseDo:doCount,modules:[]});
const hw={primary:pr(),secondary:[],link:"none",signaling:"door"};
function topology(m,owners={}){
 return {roomOwners:Object.fromEntries(m.rooms.filter(r=>r.interlockMode!=="none").map(r=>[r.id,owners[r.id]||"PLC1"])),
  doorInputOwners:Object.fromEntries(m.doors.map(d=>[d.id,"PLC1"])),
  doorOutputOwners:Object.fromEntries(m.doors.map(d=>[d.id,"PLC1"])),alarmOwner:"PLC1"};
}
const build=(m=sample,options={})=>fbd.build(m,{hardware:hw,topology:topology(m.model||m),...options});
let count=0;
function test(name,fn){fn();count++;console.log("PASS FBD "+name)}
test("demo reuses ST and distributed planners, six unique reeds and shared OR",()=>{
 const p=build();assert.equal(p.verification.plan,"FBD_PLAN_PASS");assert.equal(p.blocks.length,2);
 assert.equal(p.nodes.filter(n=>n.physicalReed).length,6);
 assert.equal(p.nodes.find(n=>n.id==="FINAL_BLOCK_D_1_4").inputs.length,2);
 assert.equal(p.placement.allocations.DI.length,8);assert.equal(p.placement.allocations.DO.length,13);
 assert(p.nodes.filter(n=>"terminal" in n).every(n=>n.terminal===null&&n.mappingStatus==="UNASSIGNED"));
 assert(p.blocks.every(b=>b.st.includes("FUNCTION_BLOCK "+b.blockName)));
});
test("deterministic and idempotent regardless of array order, no input mutation",()=>{
 const before=JSON.stringify(sample),p=build();
 const reversed=structuredClone(sample);reversed.rooms.reverse();reversed.doors.reverse();
 assert.equal(JSON.stringify(p),JSON.stringify(build(reversed)));
 assert.equal(JSON.stringify(p),JSON.stringify(build()));assert.equal(JSON.stringify(sample),before);
 assert.equal(JSON.stringify(p),JSON.stringify(build({schema:"airlock-scada-project/1",model:sample})));
});
test("1, 2 and 4 active rooms and repeated shared-door fan-outs",()=>{
 for(const size of [1,2,4]){
  const m={rooms:[{id:"outside",interlockMode:"none"}],doors:[],rules:[],exemptions:[]};
  for(let i=0;i<size;i++){
   m.rooms.push({id:String(i),interlockMode:i%2?"purge":"mutual",purgeSec:3});
   m.doors.push({id:"exit"+i,a:String(i),b:"outside"});
   if(i)m.doors.push({id:"shared"+i,a:String(i-1),b:String(i)});
  }
  if(size===1)m.doors.push({id:"exitAgain",a:"0",b:"outside"});
  const p=build(m);
  assert.equal(p.blocks.length,size);assert.equal(p.nodes.filter(n=>n.physicalReed).length,m.doors.length);
  for(const d of p.doors){
   const raw=p.nodes.find(n=>n.physicalReed&&n.doorId===d.doorId);
   assert(raw);assert.equal(p.nodes.find(n=>n.id==="FINAL_BLOCK_D_"+d.doorId).inputs.length,d.roomIds.length);
  }
 }
});
test("remote door owner without room needs only one fire DI and monitored input/status routes",()=>{
 const hardware={...hw,secondary:[pr(),pr(1,32)],link:"ethernet-modbus-tcp"};
 const t=topology(sample,{"4":"PLC2"});t.doorOutputOwners["1-4"]="PLC3";
 const p=build(sample,{hardware,topology:t});
 assert(p.placement.allocations.DI.some(x=>x.signal==="FireNormal@PLC3"));
 assert(!p.placement.allocations.DI.some(x=>x.signal==="ResetFault@PLC3"));
 for(const signal of ["CLOSED_D_1_4","FB_Room_N1.O_Ready","FB_Room_N4.O_Fault","FB_Room_N4.O_Fire","ROOM_DATA_VALID_N4"])
  assert(p.placement.network.signals.some(r=>r.to==="PLC3"&&r.signal===signal),signal);
 assert(p.nodes.some(n=>n.kind==="REMOTE"));
});
test("duplicate reeds, room IDs, door IDs and ST symbol collisions rejected",()=>{
 for(const mutate of [
  m=>m.rooms.push({...m.rooms[0]}),m=>m.doors.push({...m.doors[0]}),
  m=>{m.doors[0].reedInput="PLC1.DI1";m.doors[1].reedInput="plc1.di1"},
  m=>{m.doors[0].id="A-B";m.doors[1].id="A_B"}
 ]){const m=structuredClone(sample);mutate(m);assert.throws(()=>build(m),/Duplicate/)}
});
test("malformed topology and unsupported policies never silently generate partial plans",()=>{
 for(const mutate of [m=>m.doors[0].a="missing",m=>m.doors[0].a=m.doors[0].b,
  m=>m.rooms[0].interlockMode="unsafe",m=>m.rules.push({id:"rule"}),m=>m.exemptions.push({room:"1",door:"1-4"}),
  m=>m.rooms.find(r=>r.id==="1").purgeSec=0,m=>m.defaultOpenDoorAlarmSec=-1,
  m=>m.rooms.find(r=>r.id==="1").id="room-1"
 ]){const m=structuredClone(sample);mutate(m);assert.throws(()=>build(m))}
 assert.throws(()=>build(sample,{topology:{...topology(sample),roomOwners:{"1":"PLC9","4":"PLC1"}}}));
});
test("resource shortages rejected on individual PR, not just aggregate",()=>{
 const hardware={...hw,primary:pr(4,32),secondary:[pr()],link:"ethernet-modbus-tcp"};
 assert.throws(()=>build(sample,{hardware}),/Недостаточно DI на PLC1/);
 assert.throws(()=>build(sample,{hardware:{...hardware,primary:pr(32,3)}}),/Недостаточно DO на PLC1/);
});
test("validator rejects broken wires, duplicate ports, missing producers, cycles and types",()=>{
 const p=build();
 for(const mutate of [
  p=>p.edges[0].from="missing",p=>p.edges.push({...p.edges[0]}),
  p=>p.nodes.find(n=>n.outputs.length).outputs.push({...p.nodes.find(n=>n.outputs.length).outputs[0]}),
  p=>p.edges.pop(),p=>p.edges[0].type="UDINT",
  p=>{const gate=p.nodes.find(n=>n.id==="FINAL_BLOCK_D_1_4");p.edges.find(e=>e.to===gate.inputs[0].id).from=gate.outputs[0].id},
  p=>{p.nodes.find(n=>n.kind==="INPUT").terminal="DI1"},
  p=>{const g=p.nodes.find(n=>n.id==="GREEN_PERMIT_D_1_4");
   p.edges.find(e=>e.to===g.inputs.find(i=>i.name==="Ready:1").id).from=p.nodes.find(n=>n.id==="DI:FireNormal@PLC1").outputs[0].id}
 ]){const broken=JSON.parse(JSON.stringify(p));mutate(broken);assert.throws(()=>fbd.validate(broken))}
});
test("matrix is complete, native serialization and safety policies remain explicit blockers",()=>{
 const p=build();assert.equal(fbd.matrix(p).trim().split("\r\n").length,p.edges.length+1);
 assert.equal(p.native.status,"NEEDS_NATIVE_GUI");assert(p.unresolvedRequirements.includes("FRESHNESS_TIMEOUT"));
 assert(p.unresolvedRequirements.includes("FIRE_RECOVERY_POLICY"));
 assert.equal(build(sample,{timeoutMs:500}).timeoutMs,500);
 assert.throws(()=>build(sample,{timeoutMs:0}),/timeoutMs/);
});
console.log(`FBD_GENERATOR_QA ${count}/${count} PASS`);
