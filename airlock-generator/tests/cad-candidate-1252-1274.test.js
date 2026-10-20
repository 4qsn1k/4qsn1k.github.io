"use strict";
/* Confirmed physical ROUTES 1257→1256→1254→1252 and
 * 1257→1255→1253→1252. No field I/O or native .owle is generated.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const candidate=JSON.parse(fs.readFileSync(path.join(root,
 "experimental/fixtures/real-cad-1252-1274-candidate.json"),"utf8"));
const expectedRoutes=[
 ["CNC","1257","1256","1254","1252"],
 ["CNC","1257","1255","1253","1252"]
];
const expectedDoors=[
 ["D_CNC_1257","CNC","R1257"],
 ["D_1257_1256","R1257","R1256"],
 ["D_1256_1254","R1256","R1254"],
 ["D_1254_1252","R1254","R1252"],
 ["D_1257_1255","R1257","R1255"],
 ["D_1255_1253","R1255","R1253"],
 ["D_1253_1252","R1253","R1252"]
];
const expectedBlocked={
 D_CNC_1257:["D_1257_1256","D_1257_1255"],
 D_1257_1256:["D_CNC_1257","D_1257_1255","D_1256_1254"],
 D_1256_1254:["D_1257_1256","D_1254_1252"],
 D_1254_1252:["D_1256_1254","D_1253_1252"],
 D_1257_1255:["D_CNC_1257","D_1257_1256","D_1255_1253"],
 D_1255_1253:["D_1257_1255","D_1253_1252"],
 D_1253_1252:["D_1255_1253","D_1254_1252"]
};
const sort=x=>Array.from(x).sort();
assert.equal(candidate.schema,"airlock-cad-candidate/1");
assert.equal(candidate.status,"TWO_ROUTES_SCUD_ENTRY_ONLY_TIMED_10S_TRIGGER_UNCONFIRMED");
const scudDoor="D_CNC_1257";
const secondaryDoors=expectedDoors.map(x=>x[0]).filter(d=>d!==scudDoor);
assert.equal(candidate.accessControlTopology.cardReaderDoorId,scudDoor);
assert.equal(candidate.accessControlTopology.cardReaderController,"BOLID_S2000_2");
assert.equal(candidate.accessControlTopology.authorizationDirection,"CNC_TO_R1257");
assert.equal(candidate.accessControlTopology.reverseDirectionExitPolicy,null);
assert.equal(candidate.accessControlTopology.bolidBusyContactMapping,"UNVERIFIED_PHYSICAL");
assert.equal(candidate.accessControlTopology.noReadersOnOtherDoors,true);
assert.deepEqual(candidate.accessControlTopology.otherDoorIds,secondaryDoors);
assert.deepEqual(candidate.timedBlockingRequirement.doorIds,secondaryDoors);
assert.equal(candidate.timedBlockingRequirement.holdSeconds,10);
assert.equal(candidate.timedBlockingRequirement.prohibitedCurrentInterpretation,"mutual_immediate_release");
assert.equal(candidate.timedBlockingRequirement.timerStartsOn,null);
assert.equal(candidate.timedBlockingRequirement.doorHeldOpenBehavior,null);
assert.equal(candidate.timedBlockingRequirement.timerResetOnRepeatedOpening,null);
assert.equal(candidate.timedBlockingRequirement.scopeBetweenAdjacentZones,null);
assert.equal(candidate.timedBlockingRequirement.requiresOperatorClarification,true);
assert.equal(candidate.physicalDoors.filter(d=>d.readerRequired).length,1);
assert.equal(candidate.physicalDoors.filter(d=>d.busyContactToBolid).length,1);
for(const door of candidate.physicalDoors){
 const isEntry=door.id===scudDoor;
 assert.equal(door.accessControl,isEntry?"BOLID_S2000_2_ENTRY_ONLY":"LOCAL_AIRLOCK_NO_SCUD_READER");
 assert.equal(door.readerRequired,isEntry);
 assert.equal(door.busyContactToBolid,isEntry);
 assert.equal(door.timedBlockHoldSec,isEntry?null:10);
 assert.equal(door.timedBlockTrigger,null);
}
for(const zone of candidate.interlockZones){
 assert.equal(zone.timingMode,null,"never turn example mutual simulation into physical site mode");
 assert.equal(zone.timedBlockHoldSec,10);
 assert.equal(zone.timedBlockStartEvent,null);
}
assert.equal(candidate.outputSafety,"NOT_FOR_NATIVE_OWLE_GENERATION_OR_PLC");
assert.deepEqual(candidate.confirmedRoutes,expectedRoutes);
assert.deepEqual(candidate.physicalSpaces.map(s=>s.number),
 ["1252","1253","1254","1255","1256","1257"]);
assert.deepEqual(candidate.physicalSpaces.map(s=>s.pressurePa),
 [50,37.5,37.5,25,25,12.5]);
assert.deepEqual(candidate.excludedSpaces.map(s=>s.number),["1274"]);
assert(!candidate.physicalSpaces.some(s=>s.number==="1274"));
assert.deepEqual(candidate.externalSpaces.map(s=>s.id),["CNC"]);
assert.deepEqual(candidate.physicalDoors.map(d=>[d.id,d.a,d.b]),expectedDoors);
assert(candidate.physicalDoors.every(d=>d.reedInput===null&&d.hardwareTerminal===null&&d.lockType===null));
assert.equal(new Set(candidate.physicalDoors.map(d=>d.id)).size,7);
assert.equal(candidate.interlockZones.length,6);
assert(candidate.interlockZones.every(z=>z.timingMode===null&&z.purgeSeconds===null&&z.doorOpenAlarmSeconds===null));
assert.deepEqual(candidate.confirmedRules[0].inhibitDoors,expectedBlocked.D_CNC_1257);
assert.equal(candidate.topologyPolicy,"INCIDENT_ROOM_ONLY_NO_TRANSITIVE_CASCADE");
assert.equal(candidate.unresolvedTopology.allAdditionalDoorsVerifiedAbsent,false);
assert.deepEqual(candidate.controllerAssignments,[]);
assert.deepEqual(candidate.inputAssignments,[]);
assert.deepEqual(candidate.outputAssignments,[]);

// Confirm one reed identity, one physical door object, but two logical
// incident-room consumers for all six internal doors.
const expectedDoorIds=expectedDoors.map(d=>d[0]);
const counted=new Map();
for(const z of candidate.interlockZones){
 const room=z.roomId;
 const expected=expectedDoors.filter(([,a,b])=>a===room||b===room).map(([d])=>d);
 assert.deepEqual(z.doorIds,expected,"wrong interlock zone "+room);
 for(const d of z.doorIds)counted.set(d,(counted.get(d)||0)+1);
}
for(const [id,a,b] of expectedDoors)
 assert.equal(counted.get(id),a==="CNC"||b==="CNC"?1:2,id+" member count");
assert.equal(candidate.designInvariants.onePhysicalReedPerDoor,true);
assert.equal(candidate.designInvariants.doorMayParticipateInTwoInterlockZones,true);

const ctx=vm.createContext({});
for(const name of ["st-generator.js","st-testbench.js","project-wiring.js",
 "hardware-planner.js","distributed-planner.js","fbd-generator.js","interzone-testbench.js"]){
 vm.runInContext(fs.readFileSync(path.join(root,name),"utf8"),ctx,{filename:name});
}
const [fbd,roomTest,interzone,wiring]=vm.runInContext(
 "[AirlockFbdGenerator,AirlockStTestbench,AirlockInterzoneTestbench,AirlockProjectWiring]",ctx);
assert.throws(()=>fbd.build(candidate),/rooms\[\] and doors\[\]/);

// A temporary 1-PLC, mutual-only LOGIC FIXTURE for topology testing.
// This is *not* the configured site behavior, timing or I/O resource plan.
const model={
 rooms:[...candidate.physicalSpaces.map(s=>({
  id:s.id,interlockMode:"mutual"})),{id:"CNC",interlockMode:"none"}],
 doors:candidate.physicalDoors.map(d=>({id:d.id,a:d.a,b:d.b})),
 rules:[],exemptions:[],fireMode:"all-electrical-interlocks-off",
 defaultOpenDoorAlarmSec:30
};
for(const [open,expected] of Object.entries(expectedBlocked)){
 const t=interzone.create(model,roomTest,wiring);
 t.step({},3200);
 const state=t.step({Closed:{[open]:false}},100);
 assert.equal(state.blocked[open],false,"open physical door cannot inhibit itself "+open);
 assert.equal(state.traffic[open].logicalGreenPermit,false,"opened door GREEN denied "+open);
 assert.deepEqual(sort(Object.entries(state.blocked).filter(([,yes])=>yes).map(([d])=>d)),
  sort(expected),"nonlocal/incomplete block for "+open);
 for(const other of expectedDoorIds.filter(d=>d!==open&&!expected.includes(d)))
  assert.equal(state.blocked[other],false,"transitive block forbidden "+open+"→"+other);
 const restored=t.step({Closed:{[open]:true}},100);
 for(const id of expectedDoorIds)
  assert.equal(restored.blocked[id],false,"not restored "+open+"→"+id);
}

// Typed FBD intermediate plan: six room FBs and seven physical reeds.
// All assignments remain test-only; no terminal, real lock or vendor OWLE.
const hardware={primary:{family:"PR103",baseDi:32,baseDo:32,modules:[]},
 secondary:[],link:"none",signaling:"door"};
const topology={roomOwners:Object.fromEntries(
 candidate.physicalSpaces.map(s=>[s.id,"PLC1"])),
 doorInputOwners:Object.fromEntries(expectedDoorIds.map(d=>[d,"PLC1"])),
 doorOutputOwners:Object.fromEntries(expectedDoorIds.map(d=>[d,"PLC1"])),
 alarmOwner:"PLC1"};
const plan=fbd.build(model,{hardware,topology,timeoutMs:500});
assert.equal(plan.verification.plan,"FBD_PLAN_PASS");
assert.equal(plan.blocks.length,6);
assert.equal(plan.doors.length,7);
assert.equal(plan.nodes.filter(n=>n.physicalReed).length,7);
assert.equal(plan.native.status,"NEEDS_NATIVE_GUI");
assert.equal(plan.verification.physical,"NOT_TESTED");
for(const d of expectedDoors){
 const entry=plan.doors.find(x=>x.doorId===d[0]);
 assert(entry);assert.equal(entry.lockCommand,null);
 const consumers=d[1]==="CNC"||d[2]==="CNC"?1:2;
 assert.equal(plan.nodes.find(n=>n.kind==="OR"&&n.doorId===d[0]).inputs.length,consumers);
}
fbd.validate(plan);
console.log("CAD_TWO_PATHS_1257_1252_PASS 6_ROOMS 7_SHARED_PHYSICAL_DOORS 7_OPEN_CASES EXCLUDED_1274 NO_NATIVE_OR_PLC_EXPORT");
