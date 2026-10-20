"use strict";
const assert=require("node:assert/strict");
const f=require("../s2000-2-lock-command-gate.js");
const doors=["D_CNC_1257","D_1257_1256","D_1256_1254","D_1254_1252",
 "D_1257_1255","D_1255_1253","D_1253_1252"].map(id=>({id}));
let count=0;
const test=(name,fn)=>{fn();count++;console.log("PASS LOCK_GATE "+name)}
test("one S2000-2 access door no BUSY, seven independent PLC lock permits",()=>{
 const a=f.assess({doors,scudDoorIds:["D_CNC_1257"]});
 assert.equal(a.scudPhysicalBusyChannelsUsed,0);
 assert.equal(a.plcLockPermissionOutputs,7);
 assert.equal(a.inputsRequiredForScudRelayFeedback,0);
 assert.equal(a.channels.length,7);
 assert.equal(a.channels[0].normalGrantSource,"S2000_2_K_RELAY_AUTHORIZED_CARD_OR_NORMAL_EXIT");
 assert.equal(a.channels[1].normalGrantSource,"LOCAL_AIRLOCK_BUTTON_OR_REQUEST");
 assert.equal(a.hardware.required.di,9);
 assert.equal(a.hardware.required.relayDo,15);
 assert.equal(a.hardware.required.breakdown.busy,0);
 assert.equal(a.hardware.required.breakdown.locks,7);
 assert.equal(a.hardware.required.breakdown.lamps,7);
 assert.equal(a.hardware.required.breakdown.buzzer,1);
 assert.equal(a.channels.every(d=>d.physicalLockTerminal===null),true);
 assert.equal(a.physicalLockReleaseApproved,false);
 assert(a.warnings.some(x=>x.includes("may still indicate/log access GRANTED")),
  "downstream gate cannot silently be mistaken for an upstream access denial");
});
test("two independent S2000-2 relay authorizations but zero common BUSY used",()=>{
 const a=f.assess({doors,scudDoorIds:["D_CNC_1257","D_1257_1256"]});
 assert.equal(a.scudPhysicalBusyChannelsUsed,0);
 assert.equal(a.plcLockPermissionOutputs,7,"one physical gate output per physical door, no duplication");
 assert.equal(a.hardware.required.breakdown.busy,0);
 assert.equal(a.hardware.required.relayDo,15);
 assert.equal(a.channels.slice(0,2).every(d=>d.normalGrantSource.startsWith("S2000_2_K")),true);
});
test("strict hold suppresses normal unlock despite Bolid grant or exit-button command",()=>{
 for(const hasScud of [true,false]){
  const r=f.evaluateNormalAccess({hasScud,scudGrant:true,localButton:true,plcPermit:false});
  assert.equal(r.normalUnlockRequest,false);
  assert.equal(r.interlockDenial,true);
 }
});
test("normal door release requires Bolid grant AND PLC permit",()=>{
 assert.equal(f.evaluateNormalAccess({hasScud:true,scudGrant:true,plcPermit:true}).normalUnlockRequest,true);
 assert.equal(f.evaluateNormalAccess({hasScud:true,scudGrant:false,plcPermit:true}).normalUnlockRequest,false);
 assert.equal(f.evaluateNormalAccess({hasScud:false,localButton:true,plcPermit:true}).normalUnlockRequest,true);
 assert.equal(f.evaluateNormalAccess({hasScud:false,localButton:false,plcPermit:true}).normalUnlockRequest,false);
});
test("fire does not produce a real unlock command or claim emergency egress",()=>{
 const r=f.evaluateNormalAccess({hasScud:true,scudGrant:true,plcPermit:true,fire:true});
 assert.equal(r.normalUnlockRequest,false);
 assert.equal(r.emergencyReleaseRequest,true);
 assert.equal(r.actualLockReleased,null);
 assert.equal(r.actualEmergencyEscapeVerified,false);
});
test("reserve still drives conservative PR/PRM auto-sizing",()=>{
 const a=f.assess({doors,scudDoorIds:["D_CNC_1257"]});
 assert(a.hardware.primary);
 assert.equal(a.hardware.primary.reservesMet,true);
 assert(a.hardware.primary.totalDo>=17,"15 outputs plus two DO reserve");
 assert.equal(a.hardware.status,"PRELIMINARY_CAPACITY_SELECTION_ONLY");
});
test("extra independent common alarm increases total DO count",()=>{
 const a=f.assess({doors,scudDoorIds:["D_CNC_1257"],settings:{extraOutputs:1}});
 assert.equal(a.hardware.required.relayDo,16);
});
test("busy count cannot be silently reintroduced; never allow double counting",()=>{
 assert.throws(()=>f.assess({doors,scudDoorIds:["D_CNC_1257"],settings:{busyChannels:1}}),
  /BUSY_NOT_USED/);
 assert.throws(()=>f.assess({doors,scudDoorIds:["D_CNC_1257"],settings:{lockOutputsPerDoor:2}}),
  /LOCK_GATE_CHANNEL_IS_COUNTED_ONCE/);
});
test("fail closed on unsupported schema duplicate gate physical door",()=>{
 const invalid=[...doors,{id:doors[0].id}];
 assert.throws(()=>f.assess({doors:invalid,scudDoorIds:["D_CNC_1257"]}),
  /DUPLICATE_OR_INVALID/);
 assert.throws(()=>f.assess({doors,scudDoorIds:["MISSING"]}),/SCUD_DOOR_NOT_PHYSICAL/);
});
test("no readers still creates local door gate without invented Bolid",()=>{
 const a=f.assess({doors:doors.slice(0,2),scudDoorIds:[],settings:{reserveDo:0,reserveDi:0}});
 assert.equal(a.plcLockPermissionOutputs,2);
 assert.equal(a.hardware.required.breakdown.busy,0);
 assert.equal(a.channels.every(c=>c.normalGrantSource==="LOCAL_AIRLOCK_BUTTON_OR_REQUEST"),true);
});
console.log("S2000_LOCK_COMMAND_GATE_QA "+count+"/"+count+" PASS NO_DEVICE_WRITES");
