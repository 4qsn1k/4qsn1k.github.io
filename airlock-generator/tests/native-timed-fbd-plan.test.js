"use strict";
/* Runs the GENERATED primitive-only FBD netlist, not ST simulator or PLC.
 * No native .owle is produced, no COM/IO accessed.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const f=require("../native-timed-fbd-plan.js");
const candidate=JSON.parse(fs.readFileSync(path.join(__dirname,
 "../experimental/fixtures/real-cad-1252-1274-candidate.json"),"utf8"));
const plan=f.build(candidate),doors=plan.doors.map(d=>d.doorId);
const matrix={
 D_CNC_1257:["D_1257_1256","D_1257_1255"],
 D_1257_1256:["D_CNC_1257","D_1257_1255","D_1256_1254"],
 D_1256_1254:["D_1257_1256","D_1254_1252"],
 D_1254_1252:["D_1256_1254","D_1253_1252"],
 D_1257_1255:["D_CNC_1257","D_1257_1256","D_1255_1253"],
 D_1255_1253:["D_1257_1255","D_1253_1252"],
 D_1253_1252:["D_1255_1253","D_1254_1252"]
};
const truth=d=>Object.keys(d).filter(k=>d[k]).sort();
let checked=0;
function test(title,fn){fn();checked++;console.log("PASS NATIVE_TIMED_FBD "+title)}
test("six independent vendor-native TON-style nodes, seven shared reeds, zero ST",()=>{
 assert.equal(f.validate(plan),true);
 assert.equal(plan.schema,f.SCHEMA);
 assert.equal(plan.status,"OFFLINE_NATIVE_PRIMITIVE_NETLIST_ONLY");
 assert.equal(plan.noStructuredText,true);
 assert.equal(plan.physicallyDeployable,false);
 assert.equal(plan.nativeOwleSerialized,false);
 assert.equal(plan.nativeGuiCompiled,false);
 assert.deepEqual(plan.fbdPrimitives,["AND","NOT","OR","TON"]);
 assert.equal(plan.groups.length,6);
 assert.equal(plan.nodes.filter(x=>x.kind==="TON").length,6);
 assert.equal(plan.nodes.filter(x=>x.kind==="TON").every(x=>x.presetMs===10000),true);
 assert.equal(plan.nodes.filter(x=>x.doorId&&x.kind==="INPUT").length,7);
 assert.equal(plan.doors.length,7);
 assert(plan.nodes.length>80&&plan.edges.length>140);
 assert(plan.nodes.every(x=>x.hardwareTerminal===null||x.hardwareTerminal===undefined));
 assert.deepEqual(truth(Object.fromEntries(plan.doors.map(x=>[x.doorId,x.readers==="BOLID_S2000_2_ENTRY_ONLY"]))),["D_CNC_1257"]);
});
test("initial ten seconds block all doors on controller restart",()=>{
 const t=f.simulator(plan);
 let s=t.step({},9000);
 assert.deepEqual(truth(s.inhibit),doors.slice().sort());
 assert.deepEqual(truth(s.green),[]);
 s=t.step({},1200);
 assert.deepEqual(truth(s.inhibit),[]);
 assert.deepEqual(truth(s.green),doors.slice().sort());
 assert.equal(s.bolidBusy,false);
});
for(const [opened,expected] of Object.entries(matrix)){
 test("opened "+opened+" holds exactly its incident door set, then resets in 10s",()=>{
  const t=f.simulator(plan);
  t.step({},11000);
  let s=t.step({Closed:{[opened]:false}},100);
  assert.deepEqual(truth(s.inhibit),expected.slice().sort(),"opening "+opened);
  assert.equal(s.inhibit[opened],false,"no self-inhibit while open");
  assert.equal(s.green[opened],false,"opened door not green");
  for(const d of expected)assert.equal(s.green[d],false,"blocked door cannot turn green");
  const others=doors.filter(d=>d!==opened&&!expected.includes(d));
  for(const d of others){
   assert.equal(s.inhibit[d],false,"nonincident inhibit "+d);
   assert.equal(s.green[d],true,"nonincident green "+d);
  }
  s=t.step({},20000);
  assert.deepEqual(truth(s.inhibit),expected.slice().sort(),
   "indefinitely open must not expire timer");
  s=t.step({Closed:{[opened]:true}},100);
  assert.deepEqual(truth(s.inhibit),[opened,...expected].sort(),"all incident doors under post-close hold");
  assert.equal(s.green[opened],false);
  s=t.step({},9300);
  assert.deepEqual(truth(s.inhibit),[opened,...expected].sort(),"no release before 10s");
  s=t.step({},900);
  assert.deepEqual(truth(s.inhibit),[],"all clear after full ten seconds");
  assert.deepEqual(truth(s.green),doors.slice().sort());
 });
}
test("reopened door during hold resets TON; another ten seconds is required",()=>{
 const t=f.simulator(plan);
 const target="D_1257_1256";
 t.step({},11000);
 t.step({Closed:{[target]:false}},100);
 t.step({Closed:{[target]:true}},100);
 let s=t.step({},6000);
 assert.equal(s.inhibit.D_CNC_1257,true);
 s=t.step({Closed:{[target]:false}},100);
 assert.equal(s.inhibit[target],false);
 assert.equal(s.inhibit.D_1256_1254,true);
 s=t.step({},12000);
 assert.equal(s.inhibit.D_1256_1254,true,"cannot release while held open");
 s=t.step({Closed:{[target]:true}},100);
 s=t.step({},9600);
 assert.equal(s.inhibit.D_CNC_1257,true,"before complete restarted timer");
 s=t.step({},600);
 assert.equal(s.inhibit.D_CNC_1257,false,"release after new post-close dwell");
 assert.equal(s.inhibit.D_1255_1253,false,"independent second branch remains ready");
});
test("Bolid BUSY asserted on CNC entry even when its own door cannot self-inhibit",()=>{
 const t=f.simulator(plan);
 t.step({},11000);
 let s=t.step({Closed:{D_CNC_1257:false}},100);
 assert.equal(s.bolidBusy,true,"busy must not alias own door inhibit");
 assert.equal(s.inhibit.D_CNC_1257,false);
 assert.equal(s.inhibit.D_1257_1255,true);
 s=t.step({Closed:{D_CNC_1257:true}},100);
 assert.equal(s.bolidBusy,true);
 s=t.step({},10200);
 assert.equal(s.bolidBusy,false);
});
test("fire input suppresses software inhibit and green, restarting timers afterwards",()=>{
 const t=f.simulator(plan);
 t.step({},11000);
 t.step({Closed:{D_1257_1255:false}},100);
 let s=t.step({FireNormal:false},100);
 assert.deepEqual(truth(s.inhibit),[]);
 assert.deepEqual(truth(s.green),[]);
 assert.equal(s.bolidBusy,false);
 s=t.step({Closed:{D_1257_1255:true},FireNormal:true},100);
 assert.deepEqual(truth(s.inhibit),doors.slice().sort(),
  "timer starts fresh after fire state clears");
 s=t.step({},10400);
 assert.deepEqual(truth(s.inhibit),[]);
});
test("reject duplicate door record and missing zone membership",()=>{
 const dup=structuredClone(candidate);
 dup.physicalDoors.push(structuredClone(dup.physicalDoors[0]));
 assert.throws(()=>f.build(dup),/DUPLICATE_PHYSICAL_DOORS/);
 const missing=structuredClone(candidate);
 missing.interlockZones[0].doorIds.pop();
 assert.throws(()=>f.build(missing),/ZONE_ROOM_OR_SIZE|ZONE_EDGE_SET_MISMATCH/);
});
test("reject unconfirmed timing parameters and non-deployable envelope violation",()=>{
 const copy=structuredClone(candidate);
 copy.timedBlockingRequirement.requiresOperatorClarification=true;
 assert.throws(()=>f.build(copy),/UNCONFIRMED_10S_BEHAVIOR/);
 copy.timedBlockingRequirement.requiresOperatorClarification=false;
 copy.interlockZones[0].timedBlockHoldSec=9;
 assert.throws(()=>f.build(copy),/ZONE_TIMING_UNCONFIRMED/);
 const unsafe=structuredClone(candidate);
 unsafe.outputSafety="READY_FOR_PLC";
 assert.throws(()=>f.build(unsafe),/CANDIDATE_MUST_BE_NONDEPLOYABLE/);
});
test("detect duplicate drivers and unpowered/unwired FBD gate pins",()=>{
 const tampered=structuredClone(plan);
 tampered.edges.push({...tampered.edges[0]});
 assert.throws(()=>f.validate(tampered),/MULTIPLE_DRIVERS_/);
 const cut=structuredClone(plan);
 cut.edges.pop();
 assert.throws(()=>f.validate(cut),/UNWIRED_GATE/);
});
test("repeated generation is byte-for-byte identical without UUID randomness",()=>{
 const next=f.build(candidate);
 assert.equal(JSON.stringify(next),JSON.stringify(plan));
});
console.log("NATIVE_TIMED_FBD_QA "+checked+"/"+checked+" PASS; VENDOR_OWLE_NOT_CREATED; NO_ST");
