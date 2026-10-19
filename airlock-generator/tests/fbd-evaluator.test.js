"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,".."),context=vm.createContext({});
for(const f of ["st-generator.js","st-testbench.js","project-wiring.js","hardware-planner.js","distributed-planner.js","network-watchdog.js","fbd-generator.js","fbd-evaluator.js"])
 vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),context,{filename:f});
const [generator,evaluator,roomModel,watchdogs]=vm.runInContext("[AirlockFbdGenerator,AirlockFbdEvaluator,AirlockStTestbench,AirlockLinkWatchdog]",context);
const model=JSON.parse(fs.readFileSync(path.join(root,"model.json"),"utf8"));
const pr={family:"PR103",baseDi:32,baseDo:32,modules:[]};
const hw={primary:pr,secondary:[],link:"none",signaling:"door"};
function make({distributed=false,raw=model}={}){
 const active=raw.rooms.filter(r=>["purge","mutual"].includes(r.interlockMode)).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 const topo={roomOwners:Object.fromEntries(active.map((r,i)=>[r.id,distributed?"PLC"+(i+1):"PLC1"])),
  doorInputOwners:Object.fromEntries(raw.doors.map(d=>[d.id,"PLC1"])),
  doorOutputOwners:Object.fromEntries(raw.doors.map(d=>[d.id,"PLC1"])),alarmOwner:"PLC1"};
 const hardware=distributed?{...hw,secondary:active.slice(1).map(()=>pr),link:"ethernet-modbus-tcp"}:hw;
 const plan=generator.build(raw,{hardware,topology:topo,timeoutMs:500});
 const rooms=Object.fromEntries(active.map(r=>[r.id,roomModel.create(raw,r.id)]));
 for(const r of Object.values(rooms))r.step({},32000);
 const closed=Object.fromEntries(raw.doors.map(d=>[d.id,true]));
 const samples={};
 function refresh(atMs=100,fire=true){
  for(const n of plan.nodes){
   if(n.kind==="INPUT"||n.kind==="DIAGNOSTIC"){
    const value=n.signal.startsWith("ResetFault@")?false:n.signal.startsWith("FireNormal@")?fire:n.physicalReed?closed[n.doorId]:true;
    samples[n.signal]={value,valid:true,atMs};
   }
   if(n.kind==="ROOM_FB"){
    const s=rooms[n.roomId].snapshot();
    for(const p of n.outputs){
     let value=({O_State:s.state,O_Ready:s.green,O_Green:s.green,O_Red:s.red,O_Fault:s.fault,
      O_Fire:s.fire,O_Alarm:s.alarm,O_VentilationRequest:s.ventilationRequest})[p.name];
     if(p.name.endsWith("_Block")||p.name.endsWith("_Overtime")){
      const d=raw.doors.find(d=>p.name==="O_D_"+d.id.replace(/[^A-Za-z0-9_]/g,"_")+(p.name.endsWith("_Block")?"_Block":"_Overtime"));
      value=p.name.endsWith("_Block")?s.blocked[d.id]:s.overtime[d.id];
     }
     samples[n.id+"."+p.name]={value,valid:true,atMs};
    }
   }
  }
 }
 function step(next={},ms=100){
  Object.assign(closed,next.Closed||{});
  for(const [id,r] of Object.entries(rooms)){
   r.step({...next,Closed:Object.fromEntries(r.doorIds.map(d=>[d,closed[d]]))},ms);
  }
  refresh(100,next.FireNormal??true);
 }
 refresh();return {plan,rooms,samples,refresh,step,closed};
}
let count=0;
const test=(name,fn)=>{fn();count++;console.log("PASS FBD-EVAL "+name)};
const run=x=>evaluator.evaluate(x.plan,{samples:x.samples,nowMs:100});
test("both actual room reference models READY => common-door green",()=>{
 const x=make(),r=run(x);assert.equal(r.doors["1-4"].logicalGreenPermit,true);
 assert.equal(r.doors["1-4"].finalBlock,false);assert.equal(r.diagnostics.length,0);
});
test("N1 opening and purge inhibit shared door despite N4 READY",()=>{
 const x=make();x.step({Closed:{"1-2":false}});
 assert.equal(run(x).doors["1-4"].finalBlock,true);assert.equal(run(x).doors["1-4"].logicalGreenPermit,false);
 x.step({Closed:{"1-2":true}});
 assert.equal(x.rooms["4"].snapshot().green,true);assert.equal(run(x).doors["1-4"].finalBlock,true);
 x.step({},31000);assert.equal(run(x).doors["1-4"].logicalGreenPermit,true);
});
test("N4 opening blocks shared door even with N1 READY",()=>{
 const x=make();x.step({Closed:{"3-4":false}});
 assert.equal(x.rooms["1"].snapshot().green,true);assert.equal(run(x).doors["1-4"].logicalGreenPermit,false);
 assert.equal(run(x).doors["1-4"].finalBlock,true);
});
test("shared reed reaches both FBs, opening denies green even if own inhibit clear",()=>{
 const x=make();x.step({Closed:{"1-4":false}});
 assert.equal(x.rooms["1"].snapshot().state,20);assert.equal(x.rooms["4"].snapshot().state,20);
 assert.equal(run(x).doors["1-4"].logicalGreenPermit,false);
});
test("fault, fire and power have no positive permission or fabricated lock command",()=>{
 for(const [signal,value] of [["CONTROLLER_OK@PLC1",false],["FireNormal@PLC1",false],
  ["SENSOR_OK:1-4",false],["FB_Room_N4.O_Fault",true],["FB_Room_N1.O_Fire",true]]){
  const x=make();x.samples[signal].value=value;const r=run(x);
  assert.equal(r.doors["1-4"].logicalGreenPermit,false,signal);assert.equal(r.doors["1-4"].lockCommand,null);
 }
});
test("missing, invalid, future or stale samples never coerce to BOOL",()=>{
 for(const bad of [undefined,{value:"false",valid:true,atMs:100},{value:true,valid:false,atMs:100},
  {value:true,valid:true,atMs:101},{value:true,valid:true,atMs:-1}]){
  const x=make();x.samples["CLOSED_D_1_4"]=bad;assert.equal(run(x).doors["1-4"].logicalGreenPermit,false);
 }
 const x=make();assert.equal(evaluator.evaluate(x.plan,{samples:x.samples,nowMs:601}).doors["1-4"].logicalGreenPermit,false);
});
test("an unrelated lost reed still invalidates READY for every dependent room",()=>{
 const x=make();delete x.samples.CLOSED_D_3_4;
 assert.equal(run(x).doors["1-4"].logicalGreenPermit,false);
 assert.equal(run(x).doors["1-2"].logicalGreenPermit,true,"unaffected N1 door should remain available");
});
test("fresh remote frames required; replay invalidates channel immediately",()=>{
 const x=make({distributed:true}),w=watchdogs.create(x.plan.placement,{timeoutMs:500});
 const remoteValues=Object.fromEntries(Object.entries(x.samples).map(([k,v])=>[k,v.value]));
 for(const b of x.plan.blocks)remoteValues["ROOM_DATA_VALID_N"+b.roomId]=true;
 for(const route of x.plan.placement.network.signals)w.receive({...route,value:remoteValues[route.signal],seq:1,atMs:100});
 const evalAt=nowMs=>evaluator.evaluate(x.plan,{samples:x.samples,nowMs,watchdog:w});
 assert.equal(evalAt(100).doors["1-4"].logicalGreenPermit,true);
 const route=x.plan.placement.network.signals.find(r=>r.signal==="FB_Room_N4.O_Ready");
 assert.equal(w.receive({...route,value:true,seq:1,atMs:110}).accepted,false);
 assert.equal(evalAt(110).doors["1-4"].logicalGreenPermit,false);
 assert.equal(w.status(route,110).reason,"STALE_OR_REPLAYED_FRAME");
 assert.equal(w.receive({...route,value:true,seq:2,atMs:120}).accepted,true);
 assert.equal(evalAt(120).doors["1-4"].logicalGreenPermit,true);
 x.refresh(601);assert.equal(evalAt(601).doors["1-4"].logicalGreenPermit,false,"remote expires even with fresh local samples");
});
test("missing watchdog, timeout mismatch and unselected timeout deny permission",()=>{
 const x=make({distributed:true});assert.equal(run(x).doors["1-4"].logicalGreenPermit,false);
 const w=watchdogs.create(x.plan.placement,{timeoutMs:300});
 assert.equal(evaluator.evaluate(x.plan,{samples:x.samples,nowMs:100,watchdog:w}).doors["1-4"].logicalGreenPermit,false);
 const y=make();y.plan.timeoutMs=null;assert.equal(run(y).doors["1-4"].logicalGreenPermit,false);
});
test("recovery stays unresolved per affected door after fire/power/sensor/quality loss",()=>{
 for(const signal of ["FireNormal@PLC1","CONTROLLER_OK@PLC1","SENSOR_OK:1-4","CLOSED_D_3_4","FB_Room_N4.O_Fault"]){
  const x=make(),session=evaluator.create(x.plan),options={samples:x.samples,nowMs:100};
  assert.equal(session.evaluate(options).doors["1-4"].logicalGreenPermit,true);
  if(signal==="CLOSED_D_3_4")delete x.samples[signal];else x.samples[signal].value=signal.endsWith("O_Fault");
  assert.equal(session.evaluate(options).doors["1-4"].logicalGreenPermit,false);
  x.refresh();const r=session.evaluate(options);
  assert.equal(r.doors["1-4"].logicalGreenPermit,false,signal);
  assert.equal(r.doors["1-4"].status,"UNRESOLVED_RECOVERY_POLICY");
  if(signal==="CLOSED_D_3_4")assert.equal(r.doors["1-2"].logicalGreenPermit,true);
 }
});
test("exhaustive shared-door green truth table matches all independent requirements",()=>{
 const fields=["CLOSED_D_1_4","FireNormal@PLC1","FB_Room_N1.O_Ready","FB_Room_N4.O_Ready",
  "FB_Room_N1.O_D_1_4_Block","FB_Room_N4.O_D_1_4_Block","FB_Room_N1.O_Fault","CONTROLLER_OK@PLC1"];
 const x=make();
 for(let mask=0;mask<256;mask++){
  x.refresh();fields.forEach((s,i)=>x.samples[s].value=!!(mask&(1<<i)));
  const bits=fields.map(s=>x.samples[s].value),expected=bits[0]&&bits[1]&&bits[2]&&bits[3]&&!bits[4]&&!bits[5]&&!bits[6]&&bits[7];
  assert.equal(run(x).doors["1-4"].logicalGreenPermit,expected,"mask="+mask);
 }
});
test("seeded arbitrary graphs with 1/2/4 rooms obey OR and one-reed invariants",()=>{
 let seed=10;
 const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
 for(let caseNo=0;caseNo<36;caseNo++){
  const size=[1,2,4][caseNo%3];
  const raw={rooms:[{id:"outside",interlockMode:"none"}],doors:[],rules:[],exemptions:[]};
  for(let i=0;i<size;i++){
   raw.rooms.push({id:String(i),interlockMode:rand(2)?"purge":"mutual",purgeSec:1});
   for(let j=0;j<2;j++)raw.doors.push({id:`exit${i}_${j}`,a:String(i),b:"outside"});
   for(let j=0;j<i;j++)if(rand(2))raw.doors.push({id:`shared${j}_${i}`,a:String(j),b:String(i)});
  }
  const x=make({raw,distributed:caseNo%2===0&&size>1});
  assert.equal(x.plan.nodes.filter(n=>n.physicalReed).length,raw.doors.length);
  const snapshot=make({raw});
  for(const b of snapshot.plan.blocks)for(const d of b.doorIds)
   snapshot.samples[b.blockName+".O_D_"+d+"_Block"].value=!!rand(2);
  const r=run(snapshot);
  for(const d of snapshot.plan.doors){
   const expected=d.roomIds.some(id=>snapshot.samples["FB_Room_N"+id+".O_D_"+d.doorId+"_Block"].value);
   assert.equal(r.doors[d.doorId].finalBlock,expected);assert.equal(r.doors[d.doorId].logicalGreenPermit,!expected);
  }
 }
});
fs.mkdirSync(path.join(root,"qa-reports"),{recursive:true});
fs.writeFileSync(path.join(root,"qa-reports/fbd-evaluator.json"),JSON.stringify({schema:"airlock-fbd-qa/1",passed:count,failed:0,
 exhaustiveCases:256,seededGraphs:36,scope:"OFFLINE_MODEL_ONLY",native:"NEEDS_NATIVE_GUI",physical:"NOT_TESTED"},null,2)+"\n");
console.log(`FBD_EVALUATOR_QA ${count}/${count} PASS (256 truth-table cases, 36 seeded graphs)`);
