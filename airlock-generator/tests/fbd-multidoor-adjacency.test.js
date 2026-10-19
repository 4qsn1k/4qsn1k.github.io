"use strict";
/* Issue #14 / multi-room verification — PURE OFFLINE GRAPH, not native OWLE QA.
 * Covers 2,3,4,5-door rooms, shared door fan-out, adjacent-room independence,
 * fire, purge and simultaneous door faults. No COM/PLC/physical I/O.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,".."),ctx=vm.createContext({});
for(const name of ["st-generator.js","st-testbench.js","project-wiring.js",
 "hardware-planner.js","distributed-planner.js","fbd-generator.js","interzone-testbench.js"]){
 vm.runInContext(fs.readFileSync(path.join(root,name),"utf8"),ctx,{filename:name});
}
const [fbd,roomTest,interzone,wiring]=vm.runInContext(
 "[AirlockFbdGenerator,AirlockStTestbench,AirlockInterzoneTestbench,AirlockProjectWiring]",ctx);
const pr=()=>({family:"PR103",baseDi:32,baseDo:32,modules:[]});
const cmp=(a,b)=>String(a).localeCompare(String(b));
function star(n){
 const rooms=[{id:"H",interlockMode:"purge",purgeSec:1},{id:"X",interlockMode:"none"}];
 const doors=[];
 for(let i=1;i<=n;i++){
  const leaf="L"+i;rooms.push({id:leaf,interlockMode:"mutual"});
  doors.push({id:"H"+leaf,a:"H",b:leaf},{id:leaf+"X",a:leaf,b:"X"});
 }
 return {name:"Hub "+n,rooms,doors,rules:[],exemptions:[],
  defaultOpenDoorAlarmSec:30,fireMode:"all-electrical-interlocks-off"};
}
const four=JSON.parse(fs.readFileSync(path.join(root,
 "experimental/fixtures/fbd-four-rooms.model.json"),"utf8"));
function singlePLC(model){
 const hardware={primary:pr(),secondary:[],link:"none",signaling:"door"};
 const roomOwners=Object.fromEntries(model.rooms.filter(r=>r.interlockMode!=="none")
  .map(r=>[r.id,"PLC1"]));
 const doorInputOwners=Object.fromEntries(model.doors.map(d=>[d.id,"PLC1"]));
 const doorOutputOwners={...doorInputOwners};
 return fbd.build(model,{hardware,topology:{roomOwners,doorInputOwners,doorOutputOwners,
  alarmOwner:"PLC1"},timeoutMs:500});
}
let checked=0;
function test(name,fn){fn();checked++;console.log("PASS MULTIDOOR "+name)}
const namesFor=(m,r)=>m.doors.filter(d=>d.a===r||d.b===r).map(d=>d.id).sort(cmp);
function reqSource(n,plan){
 const edge=plan.edges.find(e=>e.to===n.id);
 assert(edge,"missing driver: "+n.id);
 return plan.nodes.find(node=>node.outputs.some(p=>p.id===edge.from));
}
test("hub rooms with 2/3/4/5 doors generate exact ST/FBD inputs and outputs",()=>{
 for(const degree of [2,3,4,5]){
  const m=star(degree),plan=singlePLC(m);
  assert.equal(plan.verification.plan,"FBD_PLAN_PASS");
  assert.equal(plan.blocks.length,degree+1);
  assert.equal(plan.doors.length,degree*2);
  assert.equal(plan.nodes.filter(n=>n.physicalReed).length,degree*2);
  const hub=plan.blocks.find(x=>x.roomId==="H");
  assert(hub);assert.deepEqual(Array.from(hub.doorIds).sort(cmp),namesFor(m,"H"));
  const hubNode=plan.nodes.find(n=>n.kind==="ROOM_FB"&&n.roomId==="H");
  assert.equal(hubNode.inputs.filter(p=>p.name.startsWith("I_D_")).length,degree);
  assert.equal(hubNode.outputs.filter(p=>p.name.endsWith("_Block")).length,degree);
  assert.equal(hubNode.outputs.filter(p=>p.name.endsWith("_Overtime")).length,degree);
  for(const b of plan.blocks)assert.deepEqual(Array.from(b.doorIds).sort(cmp),namesFor(m,b.roomId));
  fbd.validate(plan);
 }
});
test("each shared door has exactly one physical reed, two independent FB consumers and OR",()=>{
 for(const degree of [2,3,4,5]){
  const m=star(degree),plan=singlePLC(m);
  for(const door of m.doors){
   const participants=[door.a,door.b].filter(id=>id!=="X").sort(cmp);
   const entry=plan.doors.find(d=>d.doorId===door.id);
   assert(entry);assert.deepEqual(Array.from(entry.roomIds),participants);
   const physical=plan.nodes.filter(n=>n.physicalReed&&n.doorId===door.id);
   assert.equal(physical.length,1,door.id);
   const qualified=plan.nodes.find(n=>n.kind==="QUALIFIED_REED"&&n.doorId===door.id);
   assert(qualified,"missing qualified reed "+door.id);
   const source=plan.nodes.find(n=>n.kind==="INPUT"&&n.physicalReed&&n.doorId===door.id);
   const closed=plan.edges.find(e=>e.to===qualified.inputs.find(x=>x.name==="Closed").id);
   assert.equal(closed.from,source.outputs[0].id);
   for(const r of participants){
    const room=plan.nodes.find(n=>n.kind==="ROOM_FB"&&n.roomId===r);
    const pin=room.inputs.find(p=>p.name==="I_D_"+door.id+"_Closed");
    assert(pin,door.id+" missing "+r+" input");
    assert.equal(plan.edges.find(e=>e.to===pin.id).from,qualified.outputs[0].id);
   }
   const or=plan.nodes.find(n=>n.kind==="OR"&&n.doorId===door.id);
   assert.equal(or.inputs.length,participants.length);
   assert.deepEqual(Array.from(or.inputs.map(p=>p.name)).sort(cmp),
    participants.map(r=>"FB_Room_N"+r+".O_D_"+door.id+"_Block").sort(cmp));
   const green=plan.nodes.find(n=>n.kind==="DOOR_GREEN"&&n.doorId===door.id);
   assert(green);for(const r of participants)assert(green.inputs.some(p=>p.name==="Ready:"+r));
   assert.equal(entry.lockCommand,null);
  }
 }
});
test("hub opening one door inhibits four other hub doors, not unrelated neighbor exits",()=>{
 const m=star(5);
 for(let idx=1;idx<=5;idx++){
  const t=interzone.create(m,roomTest,wiring);
  let s=t.step({},3000);assert.equal(s.rooms.H.state,10);
  const opened="HL"+idx;
  s=t.step({Closed:{[opened]:false}},100);
  assert.equal(s.rooms.H.state,20);assert.equal(s.rooms["L"+idx].state,20);
  assert.equal(s.traffic[opened].logicalGreenPermit,false);
  assert.equal(s.blocked[opened],false,"open door has no self-inhibit request");
  for(let other=1;other<=5;other++){
   if(other===idx){
    assert.equal(s.blocked["L"+other+"X"],true);
   }else{
    assert.equal(s.blocked["HL"+other],true);
    assert.equal(s.blocked["L"+other+"X"],false);
    assert.equal(s.traffic["L"+other+"X"].logicalGreenPermit,true);
   }
  }
 }
});
test("mutual neighbor releases immediately; hub purge blocks until full delay",()=>{
 const m=star(5),t=interzone.create(m,roomTest,wiring);
 t.step({},3000);t.step({Closed:{HL1:false}},100);
 let s=t.step({Closed:{HL1:true}},100);
 assert.equal(s.rooms.L1.state,10);assert.equal(s.rooms.H.state,30);
 assert.equal(s.blocked.HL1,true);assert.equal(s.blocked.HL2,true);
 assert.equal(s.traffic.L1X.logicalGreenPermit,true);
 s=t.step({},700);assert.equal(s.rooms.H.state,30);
 s=t.step({},400);assert.equal(s.rooms.H.state,10);
 assert.equal(s.blocked.HL1,false);assert.equal(s.traffic.HL1.logicalGreenPermit,true);
});
test("opening another hub door during purge restarts full dwell",()=>{
 const t=interzone.create(star(5),roomTest,wiring);
 t.step({},3000);t.step({Closed:{HL1:false}},100);
 t.step({Closed:{HL1:true}},100);
 t.step({},600);
 let s=t.step({Closed:{HL2:false}},100);
 assert.equal(s.rooms.H.state,20);
 s=t.step({Closed:{HL2:true}},100);
 assert.equal(s.rooms.H.state,30);
 s=t.step({},600);assert.equal(s.rooms.H.state,30);
 s=t.step({},500);assert.equal(s.rooms.H.state,10);
});
test("two simultaneously open hub doors latch a fault and deny every hub permit",()=>{
 const t=interzone.create(star(5),roomTest,wiring);
 t.step({},3000);t.step({Closed:{HL1:false}},100);
 let s=t.step({Closed:{HL2:false}},100);
 assert.equal(s.rooms.H.state,90);assert.equal(s.rooms.H.fault,true);
 for(let i=1;i<=5;i++)assert.equal(s.traffic["HL"+i].logicalGreenPermit,false);
 s=t.step({Closed:{HL1:true,HL2:true}},3000);
 assert.equal(s.rooms.H.fault,true);
 for(let i=1;i<=5;i++)assert.equal(s.traffic["HL"+i].logicalGreenPermit,false);
});
test("four adjacent rooms remain independent outside the two incident open zones",()=>{
 const t=interzone.create(four,roomTest,wiring);
 let s=t.step({},3200);
 for(const id of ["A","B","C","D"])assert.equal(s.rooms[id].state,10);
 assert.equal(s.traffic.CD.logicalGreenPermit,true);
 s=t.step({Closed:{AB:false}},100);
 assert.equal(s.rooms.A.state,20);assert.equal(s.rooms.B.state,20);
 assert.equal(s.rooms.C.state,10);assert.equal(s.rooms.D.state,10);
 assert.deepEqual(Object.keys(s.blocked).filter(d=>s.blocked[d]).sort(),
  ["AX","BC","BX","DA"].sort());
 assert.equal(s.traffic.CD.logicalGreenPermit,true);
 assert.equal(s.traffic.AB.logicalGreenPermit,false);
 s=t.step({Closed:{AB:true}},100);
 assert.equal(s.rooms.A.state,30);assert.equal(s.rooms.B.state,10);
 assert.equal(s.blocked.AB,true);assert.equal(s.traffic.CD.logicalGreenPermit,true);
 s=t.step({},1200);
 assert.equal(s.rooms.A.state,10);assert.equal(s.traffic.AB.logicalGreenPermit,true);
});
test("four-room native-source planner correctly assigns eight doors across three PLCs",()=>{
 const plan=fbd.build(four,{timeoutMs:500});
 assert.equal(plan.blocks.length,4);assert.equal(plan.doors.length,8);
 assert.equal(plan.placement.controllers.length,3);
 assert.equal(plan.nodes.filter(n=>n.physicalReed).length,8);
 for(const d of four.doors){
  const logical=plan.doors.find(x=>x.doorId===d.id);
  const participants=[d.a,d.b].filter(r=>r!=="X").sort(cmp);
  assert.deepEqual(Array.from(logical.roomIds),participants);
  const gate=plan.nodes.find(n=>n.kind==="OR"&&n.doorId===d.id);
  assert.equal(gate.inputs.length,participants.length);
 }
 assert(plan.nodes.some(n=>n.kind==="REMOTE"));
 assert(plan.placement.network.signals.length>0);
 fbd.validate(plan);
});
test("fire releases only software inhibit while every GREEN stays denied",()=>{
 for(const m of [star(5),four]){
  const t=interzone.create(m,roomTest,wiring);
  t.step({},3000);
  const s=t.step({FireNormal:false},100);
  for(const d of m.doors){
   assert.equal(s.blocked[d.id],false,d.id);
   assert.equal(s.traffic[d.id].logicalGreenPermit,false,d.id);
  }
 }
});
test("single-door controlled room fails closed rather than emitting incomplete ST",()=>{
 const m={rooms:[{id:"H",interlockMode:"purge",purgeSec:1},
  {id:"X",interlockMode:"none"}],doors:[{id:"HX",a:"H",b:"X"}],rules:[],exemptions:[]};
 assert.throws(()=>singlePLC(m),/Минимум две двери|две двери|two doors/);
});
test("five-room chain: a middle doorway affects its two rooms, not next-next rooms",()=>{
 const rooms=[...["A","B","C","D","E"].map((id,i)=>({
  id,interlockMode:i%2===0?"purge":"mutual",purgeSec:2})),
  {id:"X",interlockMode:"none"}];
 const doors=[...["AB","BC","CD","DE"].map(id=>({id,a:id[0],b:id[1]})),
  ...["A","B","C","D","E"].map(id=>({id:id+"X",a:id,b:"X"}))];
 const model={rooms,doors,rules:[],exemptions:[],
  fireMode:"all-electrical-interlocks-off"};
 const plan=singlePLC(model);
 assert.equal(plan.blocks.length,5);assert.equal(plan.doors.length,9);
 for(const door of doors){
  const owners=[door.a,door.b].filter(id=>id!=="X");
  assert.equal(plan.nodes.find(n=>n.kind==="OR"&&n.doorId===door.id).inputs.length,owners.length);
 }
 const t=interzone.create(model,roomTest,wiring);
 let s=t.step({},4000);assert.equal(s.rooms.C.state,10);
 s=t.step({Closed:{BC:false}},100);
 assert.equal(s.rooms.B.state,20);assert.equal(s.rooms.C.state,20);
 for(const id of ["A","D","E"])assert.equal(s.rooms[id].state,10);
 assert.deepEqual(Object.keys(s.blocked).filter(d=>s.blocked[d]).sort(),
  ["AB","BX","CD","CX"].sort());
 assert.equal(s.traffic.DE.logicalGreenPermit,true);
 s=t.step({Closed:{BC:true}},100);
 assert.equal(s.rooms.B.state,10);assert.equal(s.rooms.C.state,30);
 for(const id of ["BC","CD","CX"])assert.equal(s.blocked[id],true);
 s=t.step({},1100);assert.equal(s.rooms.C.state,30);
 s=t.step({},1000);assert.equal(s.rooms.C.state,10);
 assert.equal(s.traffic.BC.logicalGreenPermit,true);
});
test("parallel doors between adjacent rooms keep independent reeds and inhibits",()=>{
 const model={rooms:[{id:"A",interlockMode:"mutual"},{id:"B",interlockMode:"mutual"},
  {id:"X",interlockMode:"none"}],doors:[
  {id:"AB1",a:"A",b:"B"},{id:"AB2",a:"A",b:"B"},
  {id:"AX",a:"A",b:"X"},{id:"BX",a:"B",b:"X"}],
  rules:[],exemptions:[],fireMode:"all-electrical-interlocks-off"};
 const p=singlePLC(model);
 assert.equal(p.nodes.filter(n=>n.physicalReed).length,4);
 for(const door of ["AB1","AB2"]){
  const entry=p.doors.find(d=>d.doorId===door);
  assert.equal(entry.roomIds.length,2);
  assert.equal(p.nodes.find(n=>n.kind==="OR"&&n.doorId===door).inputs.length,2);
 }
 const t=interzone.create(model,roomTest,wiring);
 t.step({},200);
 let s=t.step({Closed:{AB1:false}},100);
 assert.equal(s.blocked.AB2,true);assert.equal(s.blocked.AX,true);
 assert.equal(s.blocked.BX,true);
 assert.equal(s.blocked.AB1,false);
 s=t.step({Closed:{AB1:true}},100);
 assert.equal(s.traffic.AB2.logicalGreenPermit,true);
 s=t.step({Closed:{AB2:false,AB1:false}},100);
 assert.equal(s.rooms.A.fault,true);assert.equal(s.rooms.B.fault,true);
 for(const id of ["AB1","AB2","AX","BX"])
  assert.equal(s.traffic[id].logicalGreenPermit,false);
});
test("every A-B-C-D-E doorway blocks only remaining doors of both incident rooms",()=>{
 const letters=["A","B","C","D","E"];
 const model={rooms:[...letters.map((id,i)=>({id,
  interlockMode:i%2===0?"purge":"mutual",purgeSec:2})),
  {id:"X",interlockMode:"none"}],
  doors:[...["AB","BC","CD","DE"].map(id=>({id,a:id[0],b:id[1]})),
   ...letters.map(id=>({id:id+"X",a:id,b:"X"}))],
  rules:[],exemptions:[],fireMode:"all-electrical-interlocks-off"};
 const p=singlePLC(model);
 for(const id of ["AB","BC","CD","DE"]){
  const door=model.doors.find(d=>d.id===id),participants=new Set([door.a,door.b]);
  const expectedBlocked=model.doors.filter(d=>d.id!==id&&(participants.has(d.a)||participants.has(d.b)))
   .map(d=>d.id).sort(cmp);
  const t=interzone.create(model,roomTest,wiring);
  let s=t.step({},4200);
  assert(letters.every(r=>s.rooms[r].state===10),"all rooms start READY");
  s=t.step({Closed:{[id]:false}},100);
  assert.equal(s.inputs.Closed[id],false,"single physical reed "+id);
  assert.equal(s.rooms[door.a].state,20,id+" first room busy");
  assert.equal(s.rooms[door.b].state,20,id+" second room busy");
  assert.deepEqual(Object.keys(s.blocked).filter(key=>s.blocked[key]).sort(cmp),expectedBlocked,
   id+" adjacent-only block requests");
  assert.equal(s.blocked[id],false,id+" own open door remains able to close");
  assert.equal(s.traffic[id].logicalGreenPermit,false,id+" never green when open");
  for(const d of model.doors){
   const forbidden=d.id===id||expectedBlocked.includes(d.id);
   assert.equal(s.traffic[d.id].logicalGreenPermit,!forbidden,
    id+" affects only its two incident rooms: "+d.id);
  }
  for(const r of letters.filter(n=>!participants.has(n)))
   assert.equal(s.rooms[r].state,10,id+" remote "+r+" stays ready");
  // Validate both room block outputs independently flow into this shared OR.
  const gate=p.nodes.find(n=>n.kind==="OR"&&n.doorId===id);
  assert(gate);assert.equal(gate.inputs.length,2);
  const observed=Array.from(gate.inputs,pin=>{
   const edge=p.edges.find(e=>e.to===pin.id);
   assert(edge);
   const owner=p.nodes.find(n=>n.outputs.some(port=>port.id===edge.from));
   assert(owner);
   return pin.name;
  }).sort(cmp);
  assert.deepEqual(observed,Array.from(participants).map(r=>
   "FB_Room_N"+r+".O_D_"+id+"_Block").sort(cmp));
 }
});
test("reversing both endpoints does not change A-B-C-D-E inhibition matrix",()=>{
 const letters=["A","B","C","D","E"];
 const make=reversed=>({rooms:[...letters.map((id,i)=>({id,
  interlockMode:i%2?"mutual":"purge",purgeSec:2})),{id:"X",interlockMode:"none"}],
  doors:[...["AB","BC","CD","DE"].map(id=>({
   id,a:reversed?id[1]:id[0],b:reversed?id[0]:id[1]})),
   ...letters.map(id=>({id:id+"X",a:reversed?"X":id,b:reversed?id:"X"}))],
  rules:[],exemptions:[],fireMode:"all-electrical-interlocks-off"});
 const reference=make(false),flipped=make(true);
 for(const id of ["AB","BC","CD","DE"]){
  const outcomes=[];
  for(const model of [reference,flipped]){
   const t=interzone.create(model,roomTest,wiring);
   t.step({},4200);
   const s=t.step({Closed:{[id]:false}},100);
   outcomes.push({
    blocked:Object.keys(s.blocked).filter(d=>s.blocked[d]).sort(cmp),
    denied:Object.keys(s.traffic).filter(d=>!s.traffic[d].logicalGreenPermit).sort(cmp)
   });
  }
  assert.deepEqual(outcomes[1],outcomes[0],id+" direction must not matter");
 }
});
test("opening an outside exit inhibits only the controlled room, not the whole chain",()=>{
 const rooms=[...["A","B","C","D","E"].map(id=>({id,interlockMode:"mutual"})),
  {id:"X",interlockMode:"none"}];
 const doors=[...["AB","BC","CD","DE"].map(id=>({id,a:id[0],b:id[1]})),
  ...["A","B","C","D","E"].map(id=>({id:id+"X",a:id,b:"X"}))];
 const m={rooms,doors,rules:[],exemptions:[]};
 for(const letter of ["A","B","C","D","E"]){
  const id=letter+"X",t=interzone.create(m,roomTest,wiring);
  t.step({},200);
  const s=t.step({Closed:{[id]:false}},100);
  assert.equal(s.rooms[letter].state,20);
  const expected=doors.filter(d=>d.id!==id&&(d.a===letter||d.b===letter)).map(d=>d.id).sort(cmp);
  assert.deepEqual(Object.keys(s.blocked).filter(d=>s.blocked[d]).sort(cmp),expected);
  assert.equal(s.traffic[id].logicalGreenPermit,false);
  for(const key of ["A","B","C","D","E"].filter(k=>k!==letter))
   assert.equal(s.rooms[key].state,10);
 }
});
test("versioned five-room FBD fixture exports nine doors across three logical PLCs",()=>{
 const fixture=JSON.parse(fs.readFileSync(path.join(root,
  "experimental/fixtures/fbd-five-rooms-chain.model.json"),"utf8"));
 const plan=fbd.build(fixture,{timeoutMs:500});
 assert.equal(plan.verification.plan,"FBD_PLAN_PASS");
 assert.equal(plan.blocks.length,5);
 assert.equal(plan.doors.length,9);
 assert.equal(plan.placement.controllers.length,3);
 assert.equal(plan.nodes.filter(n=>n.physicalReed).length,9);
 assert.equal(plan.native.status,"NEEDS_NATIVE_GUI");
 assert.equal(plan.verification.physical,"NOT_TESTED");
 assert(plan.placement.network.signals.length>0,"remote interlocks require validated link routes");
 const owners=Object.fromEntries(plan.doors.map(d=>[d.doorId,Array.from(d.roomIds).sort(cmp)]));
 assert.deepEqual(owners,{AB:["A","B"],AX:["A"],BC:["B","C"],
  BX:["B"],CD:["C","D"],CX:["C"],DE:["D","E"],DX:["D"],EX:["E"]});
 for(const controller of plan.placement.controllers){
  const hardware=[fixture.hardware.primary,...fixture.hardware.secondary][
   Number(controller.id.replace("PLC",""))-1];
  for(const [kind,slots] of [["DI",hardware.baseDi],["DO",hardware.baseDo]]){
   const count=plan.placement.allocations[kind].filter(x=>x.controller===controller.id).length;
   assert(count<=slots,kind+" logical resource budget exceeded on "+controller.id);
  }
 }
 for(const door of plan.doors)
  assert.equal(door.lockCommand,null,"never produce a physical lock command");
 fbd.validate(plan);
});
console.log("MULTIDOOR_ADJACENCY_QA "+checked+"/"+checked+" PASS — JS_MODEL_ONLY; NATIVE_OWLE_NOT_VERIFIED");
