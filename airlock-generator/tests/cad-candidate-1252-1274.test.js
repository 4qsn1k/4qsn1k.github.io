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
assert.equal(candidate.status,"TWO_ROUTES_10S_POST_CLOSE_HOLD_CONFIRMED_HARDWARE_PENDING");
const scudDoor="D_CNC_1257";
const secondaryDoors=expectedDoors.map(x=>x[0]).filter(d=>d!==scudDoor);
assert.equal(candidate.accessControlTopology.cardReaderDoorId,scudDoor);
assert.equal(candidate.accessControlTopology.cardReaderController,"BOLID_S2000_2");
assert.equal(candidate.accessControlTopology.authorizationDirection,"CNC_TO_R1257");
assert.equal(candidate.accessControlTopology.reverseDirectionExitPolicy,null);
assert.equal(candidate.accessControlTopology.bolidBusyContactMapping,"UNVERIFIED_PHYSICAL");
assert.equal(candidate.accessControlTopology.noReadersOnOtherDoors,true);
assert.deepEqual(candidate.accessControlTopology.otherDoorIds,secondaryDoors);
assert.deepEqual(candidate.timedBlockingRequirement.doorIds,expectedDoors.map(x=>x[0]));
assert.equal(candidate.timedBlockingRequirement.holdSeconds,10);
assert.equal(candidate.timedBlockingRequirement.prohibitedCurrentInterpretation,"mutual_immediate_release");
assert.equal(candidate.timedBlockingRequirement.timerStartsOn,
 "AFTER_ALL_DOORS_OF_EACH_INCIDENT_GROUP_CONFIRMED_CLOSED");
assert.equal(candidate.timedBlockingRequirement.doorHeldOpenBehavior,
 "BLOCK_OTHER_DOORS_OF_INCIDENT_GROUP_WHILE_OPEN");
assert.equal(candidate.timedBlockingRequirement.timerResetOnRepeatedOpening,
 "RESET_AND_RESTART_FULL_TEN_SECONDS_AFTER_RE_CLOSE");
assert.equal(candidate.timedBlockingRequirement.scopeBetweenAdjacentZones,
 "ONLY_INCIDENT_GROUPS_OR_SHARED_DOOR_REQUESTS");
assert.equal(candidate.timedBlockingRequirement.requiresOperatorClarification,false);
assert.equal(candidate.timedBlockingRequirement.appliesToCncDoorWithinFirstZone,true);
assert.equal(candidate.timedBlockingRequirement.independentVentilationCommand,false);
assert.equal(candidate.timedBlockingRequirement.heldGroupLogicMode,"TIMED_HOLD_NOT_VENTILATION");
assert.equal(candidate.physicalDoors.filter(d=>d.readerRequired).length,1);
assert.equal(candidate.physicalDoors.filter(d=>d.busyContactToBolid).length,1);
for(const door of candidate.physicalDoors){
 const isEntry=door.id===scudDoor;
 assert.equal(door.accessControl,isEntry?"BOLID_S2000_2_ENTRY_ONLY":"LOCAL_AIRLOCK_NO_SCUD_READER");
 assert.equal(door.readerRequired,isEntry);
 assert.equal(door.busyContactToBolid,isEntry);
 assert.equal(door.timedBlockHoldSec,10);
 assert.equal(door.timedBlockTrigger,"CLOSED_DOOR_EVENT_IN_INCIDENT_GROUP");
}
for(const zone of candidate.interlockZones){
 assert.equal(zone.timingMode,"timed-hold");
 assert.equal(zone.timedBlockHoldSec,10);
 assert.equal(zone.timedBlockStartEvent,"ALL_ZONE_DOORS_CLOSED_STABLE");
 assert.equal(zone.timedBlockRepeatOpenPolicy,"RESTART_AFTER_RE_CLOSE");
 assert.equal(zone.purgeSeconds,null,"no ventilation/purge process configured");
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
assert(candidate.interlockZones.every(z=>z.timingMode==="timed-hold"&&
 z.purgeSeconds===null&&z.doorOpenAlarmSeconds===null));
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

// A TEST-ONLY model using the existing timed "purge" state machine
// as a ten-second POST-CLOSE HOLD, with ventilation explicitly independent.
// This is NOT authorization for a ventilation action or physical relay output.
const model={
 rooms:[...candidate.physicalSpaces.map(s=>({
  id:s.id,interlockMode:"purge",purgeSec:10,
  ventilationControlMode:"independent"})),{id:"CNC",interlockMode:"none"}],
 doors:candidate.physicalDoors.map(d=>({id:d.id,a:d.a,b:d.b})),
 rules:[],exemptions:[],fireMode:"all-electrical-interlocks-off",
 defaultOpenDoorAlarmSec:30
};
let cases=0;
for(const [open,expected] of Object.entries(expectedBlocked)){
 const t=interzone.create(model,roomTest,wiring);
 let state=t.step({},11000);
 for(const id of expectedDoorIds)
  assert.equal(state.blocked[id],false,"initial 10s restart must complete "+id);
 // The incident rooms are occupied; only their OTHER doors inhibit.
 state=t.step({Closed:{[open]:false}},100);
 assert.equal(state.blocked[open],false,"open physical door cannot inhibit itself "+open);
 assert.equal(state.traffic[open].logicalGreenPermit,false,"opened door GREEN denied "+open);
 assert.deepEqual(sort(Object.entries(state.blocked).filter(([,yes])=>yes).map(([d])=>d)),
  sort(expected),"nonlocal/incomplete open-door block for "+open);
 for(const other of expectedDoorIds.filter(d=>d!==open&&!expected.includes(d)))
  assert.equal(state.blocked[other],false,"transitive block forbidden "+open+"→"+other);
 state=t.step({},20000);
 assert.deepEqual(sort(Object.entries(state.blocked).filter(([,yes])=>yes).map(([d])=>d)),
  sort(expected),"open indefinitely: never remove interlocks "+open);
 // All affected incident-room doors are closed again. Their OWN timers
 // must hold every incident door (including the previously open door).
 state=t.step({Closed:{[open]:true}},100);
 assert.deepEqual(sort(Object.entries(state.blocked).filter(([,yes])=>yes).map(([d])=>d)),
  sort([open,...expected]),"post-close hold should include all incident doors "+open);
 for(const room of candidate.interlockZones.filter(z=>z.doorIds.includes(open)))
  assert.equal(state.rooms[room.roomId].state,30,"incident room starts post-close hold "+room.roomId);
 state=t.step({},9000);
 assert.deepEqual(sort(Object.entries(state.blocked).filter(([,yes])=>yes).map(([d])=>d)),
  sort([open,...expected]),"must hold nine seconds "+open);
 state=t.step({},700);
 assert.deepEqual(sort(Object.entries(state.blocked).filter(([,yes])=>yes).map(([d])=>d)),
  sort([open,...expected]),"must hold through 9.7 seconds "+open);
 state=t.step({},600);
 for(const id of expectedDoorIds)
  assert.equal(state.blocked[id],false,"must release after >10s following closure "+open+"→"+id);
 for(const door of expectedDoorIds)
  assert.equal(state.traffic[door].logicalGreenPermit,true,"green after full delay "+open+"→"+door);
 assert.equal(state.alarm,false,"closed reed cannot indicate overtime");
 cases++;
}
assert.equal(cases,7);
// A door reopened DURING the ten-second hold resets the timer fully.
{
 const t=interzone.create(model,roomTest,wiring);
 const id="D_1257_1256";
 t.step({},11000);
 t.step({Closed:{[id]:false}},100);
 t.step({Closed:{[id]:true}},100);
 let s=t.step({},6500);
 assert.equal(s.blocked.D_CNC_1257,true);
 s=t.step({Closed:{[id]:false}},100);
 assert.equal(s.blocked.D_1256_1254,true);
 s=t.step({},11000);
 assert.equal(s.blocked.D_1256_1254,true,"holding a door open never expires hold");
 s=t.step({Closed:{[id]:true}},100);
 assert.equal(s.blocked.D_CNC_1257,true);
 s=t.step({},9500);
 assert.equal(s.blocked.D_CNC_1257,true,"no premature release after reopen");
 s=t.step({},900);
 assert.equal(s.blocked.D_CNC_1257,false,"new full 10s complete");
 assert.equal(s.blocked.D_1256_1254,false);
 assert.equal(s.blocked.D_1255_1253,false,"nonincident zone never blocked");
}
// Fire input removes only software interlock requests and DENIES green:
// it is NOT a physical demonstration of fail-safe emergency unlock.
{
 const t=interzone.create(model,roomTest,wiring);
 t.step({},11000);
 const s=t.step({FireNormal:false},100);
 for(const id of expectedDoorIds){
  assert.equal(s.blocked[id],false,id+" software release in fire state");
  assert.equal(s.traffic[id].logicalGreenPermit,false,id+" no green in fire state");
 }
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
for(const block of plan.blocks){
 assert.equal(block.mode,"purge","offline timing state machine used for timed hold");
 assert.equal(block.ventilationControlMode,"independent");
 assert(block.st.includes("PurgeTimer(I := (State = 30) AND AllClosed AND FireNormal AND NOT FaultLatch, T := T#10s);"),
  "the post-close timed hold must use 10 seconds");
 assert.equal(block.st.includes("O_VentilationRequest"),false,
  "ten-second lockout does not operate ventilation");
}
assert.equal(plan.verification.physical,"NOT_TESTED");
for(const d of expectedDoors){
 const entry=plan.doors.find(x=>x.doorId===d[0]);
 assert(entry);assert.equal(entry.lockCommand,null);
 const consumers=d[1]==="CNC"||d[2]==="CNC"?1:2;
 assert.equal(plan.nodes.find(n=>n.kind==="OR"&&n.doorId===d[0]).inputs.length,consumers);
}
fbd.validate(plan);
console.log("CAD_10S_POST_CLOSE_HOLD_PASS 6_ROOMS 7_DOORS 7_OPEN_CLOSE_CASES REOPEN_RESET SCUD_ENTRY_ONLY NO_NATIVE_OR_PLC_EXPORT");
