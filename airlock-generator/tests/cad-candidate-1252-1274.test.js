"use strict";
/* Real operator-confirmed FIRST stage 1257 only. Downstream NOT inferred.
 * Pure JS offline test; no COM, native .owle, PLC or hardware writes.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root=path.join(__dirname,"..");
const candidate=JSON.parse(fs.readFileSync(path.join(root,
  "experimental/fixtures/real-cad-1252-1274-candidate.json"),"utf8"));
assert.equal(candidate.schema,"airlock-cad-candidate/1");
assert.equal(candidate.status,"FIRST_STAGE_1257_CONFIRMED_DOWNSTREAM_UNVERIFIED");
assert.equal(candidate.outputSafety,"NOT_FOR_NATIVE_OWLE_GENERATION_OR_PLC");
assert.deepEqual(candidate.physicalSpaces.map(s=>s.number),
 ["1252","1253","1254","1255","1256","1257"]);
assert.deepEqual(candidate.physicalSpaces.map(s=>s.pressurePa),
 [50,37.5,37.5,25,25,12.5]);
assert.deepEqual(candidate.excludedSpaces.map(s=>s.number),["1274"]);
assert.equal(candidate.physicalSpaces.some(x=>x.number==="1274"),false);
assert.equal(candidate.excludedSpaces[0].purpose,"PARTS STORAGE");
assert.deepEqual(candidate.externalSpaces.map(s=>s.id),["CNC"]);

const doorIds=["D_CNC_1257","D_1257_1256","D_1257_1255"];
assert.deepEqual(candidate.physicalDoors.map(x=>x.id),doorIds);
assert.deepEqual(candidate.physicalDoors.map(x=>[x.a,x.b]),
 [["CNC","R1257"],["R1257","R1256"],["R1257","R1255"]]);
assert(candidate.physicalDoors.every(x=>x.source==="OPERATOR_CONFIRMED"));
assert(candidate.physicalDoors.every(x=>x.hardwareTerminal===null));
assert.deepEqual(candidate.interlockZones.map(z=>z.id),["Z_R1257"]);
assert.deepEqual(candidate.interlockZones[0].doorIds,doorIds);
assert.equal(candidate.interlockZones[0].purgeSeconds,null);
assert.equal(candidate.interlockZones[0].timingMode,null);
assert.deepEqual(candidate.confirmedRules,[{
 triggerOpen:"D_CNC_1257",
 inhibitDoors:["D_1257_1256","D_1257_1255"],
 source:"OPERATOR_EXPLICIT_2026_10_20"
}]);
assert.deepEqual(candidate.unresolvedTopology.downstreamFromRooms,["R1256","R1255"]);
assert.deepEqual(candidate.unresolvedTopology.downstreamDoorIds,[]);
assert.deepEqual(candidate.unresolvedTopology.interlockZoneIds,[]);
assert.deepEqual(candidate.controllerAssignments,[]);
assert.deepEqual(candidate.inputAssignments,[]);
assert.deepEqual(candidate.outputAssignments,[]);
assert.equal(candidate.designInvariants.onePhysicalReedPerDoor,true);
assert.equal(candidate.designInvariants.doorMayParticipateInTwoInterlockZones,true);
assert.equal(candidate.designInvariants.openingOnlyBlocksOtherDoorsInIncidentZones,true);

// A CAD candidate MUST NOT be considered a deployable generator project.
const ctx=vm.createContext({});
for(const name of ["st-generator.js","st-testbench.js","project-wiring.js",
 "hardware-planner.js","distributed-planner.js","fbd-generator.js","interzone-testbench.js"]){
 vm.runInContext(fs.readFileSync(path.join(root,name),"utf8"),ctx,{filename:name});
}
const [fbd,roomTest,interzone,wiring]=vm.runInContext(
 "[AirlockFbdGenerator,AirlockStTestbench,AirlockInterzoneTestbench,AirlockProjectWiring]",ctx);
assert.throws(()=>fbd.build(candidate),/rooms\[\] and doors\[\]/);

// OFFLINE-only isolated first-stage model: the other rooms remain unmodeled
// as interlock zones; choosing "mutual" here is not confirmation of its
// site operating time or fire/lock polarity.
const model={
 rooms:[...candidate.physicalSpaces.map(s=>({id:s.id,
  interlockMode:s.id==="R1257"?"mutual":"none"})),
  {id:"CNC",interlockMode:"none"}],
 doors:candidate.physicalDoors.map(d=>({id:d.id,a:d.a,b:d.b})),
 rules:[],exemptions:[],fireMode:"all-electrical-interlocks-off",
 defaultOpenDoorAlarmSec:30
};
const roomIds=new Set(model.rooms.map(x=>x.id));
assert(model.doors.every(d=>roomIds.has(d.a)&&roomIds.has(d.b)));
const t=interzone.create(model,roomTest,wiring);
let state=t.step({},3200);
assert.equal(state.rooms.R1257.state,10);
state=t.step({Closed:{D_CNC_1257:false}},100);
assert.equal(state.rooms.R1257.state,20);
assert.equal(state.blocked.D_CNC_1257,false,"the opened door cannot self-block");
assert.equal(state.blocked.D_1257_1256,true);
assert.equal(state.blocked.D_1257_1255,true);
assert.equal(state.traffic.D_CNC_1257.logicalGreenPermit,false);
state=t.step({Closed:{D_CNC_1257:true}},100);
assert.equal(state.rooms.R1257.state,10,"test-only mutual release after close");

// Verify the same three-door structure can be converted into a typed FBD
// PLAN, without materializing hardware wiring, Q outputs or a native file.
const hardware={primary:{family:"PR103",baseDi:32,baseDo:32,modules:[]},
 secondary:[],link:"none",signaling:"door"};
const topology={roomOwners:{R1257:"PLC1"},
 doorInputOwners:Object.fromEntries(doorIds.map(d=>[d,"PLC1"])),
 doorOutputOwners:Object.fromEntries(doorIds.map(d=>[d,"PLC1"])),
 alarmOwner:"PLC1"};
const plan=fbd.build(model,{hardware,topology,timeoutMs:500});
assert.equal(plan.verification.plan,"FBD_PLAN_PASS");
assert.equal(plan.blocks.length,1);
assert.equal(plan.blocks[0].roomId,"R1257");
assert.equal(plan.doors.length,3);
assert.equal(plan.nodes.filter(n=>n.physicalReed).length,3);
assert.equal(plan.native.status,"NEEDS_NATIVE_GUI");
assert.equal(plan.verification.physical,"NOT_TESTED");
for(const door of plan.doors)assert.equal(door.lockCommand,null);
fbd.validate(plan);
console.log("CAD_1257_FIRST_STAGE_PASS 6_INTERLOCK_ROOMS_METADATA 3_DOORS 1_CONTROLLED_ROOM EXCLUDED_1274 NO_PLC_EXPORT");
