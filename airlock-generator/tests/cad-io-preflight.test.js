"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {build,validateGraph}=require("../cad-io-preflight.js");
const candidate=JSON.parse(fs.readFileSync(path.join(__dirname,
 "../experimental/fixtures/real-cad-1252-1274-candidate.json"),"utf8"));
const clone=x=>structuredClone(x);
const opts={normalAccessInterface:"lock-permit"};
let passes=0;
const test=(name,fn)=>{fn();passes++;console.log("PASS CAD_IO_PREFLIGHT "+name)};
test("strictly validates six room groups and seven unique physical doors",()=>{
 const g=validateGraph(candidate);
 assert.equal(g.rooms.length,6);
 assert.equal(g.doors.length,7);
 assert.equal(g.zones.length,6);
 assert.equal(g.cardDoor,"D_CNC_1257");
 assert(!g.rooms.some(r=>r.id==="R1274"));
});
test("one local button per other door produces 15 DI and 15 relay DO no BUSY",()=>{
 const p=build(candidate,opts);
 assert.deepEqual(p.totals,{
  physicalDoors:7,controlledRooms:6,localButtonChannels:6,
  physicalReedChannels:7,requiredDi:15,requiredRelayDo:15,
  reserveDi:2,reserveDo:2,requiredWithReserveDi:17,requiredWithReserveDo:17
 });
 assert.equal(p.policy.physicalBolidBusyDo,0);
 assert.equal(p.inputs.filter(x=>x.source==="PHYSICAL_REED").length,7);
 assert.equal(p.inputs.filter(x=>x.source==="LOCAL_BUTTON").length,6);
 assert.equal(p.inputs.filter(x=>x.source==="FIRE_NORMAL_UNVERIFIED").length,1);
 assert.equal(p.inputs.filter(x=>x.source==="OPERATOR_RESET_BUTTON_UNCONFIRMED").length,1);
 assert.equal(p.outputs.filter(x=>x.id.startsWith("NORMAL_PERMIT_")).length,7);
 assert.equal(p.outputs.filter(x=>x.id.startsWith("LAMP_GREEN_")).length,7);
 assert.equal(p.outputs.filter(x=>x.id==="BUZZER_COMMON").length,1);
 assert(!p.inputs.some(x=>x.id.includes("BUSY")));
 assert(!p.outputs.some(x=>x.id.includes("BUSY")));
 assert.equal(p.status,"PRELIMINARY_ONLY_TERMINALS_UNVERIFIED_NO_PLC_IO");
 assert(p.warnings.some(x=>x.includes("LEGACY busyContactToBolid")));
 assert.equal(p.safety.independentFireEgressApproved,false);
 assert.equal(p.safety.nativeOwenLogicCompiled,false);
});
test("the CNC-to-1257 K1 is EXTERNAL auth, no extra Owen DI assumed",()=>{
 const p=build(candidate,opts);
 const cnc=p.outputs.find(x=>x.doorId==="D_CNC_1257"&&x.id.startsWith("NORMAL_PERMIT"));
 assert.equal(cnc.source,"PLC_PERMIT_AND_BOLID_K1_EXTERNAL");
 assert.equal(p.inputs.some(x=>x.id==="BOLID_K1_MONITOR"),false);
 assert.equal(p.policy.physicalScudReaders,1);
 const q=build(candidate,{...opts,readerRelayFeedbackDi:true});
 assert.equal(q.totals.requiredDi,16);
 assert.equal(q.totals.requiredRelayDo,15);
 assert(q.inputs.some(x=>x.id==="BOLID_K1_MONITOR"));
 assert.equal(q.cncRequestArbitration.preOpenReservationInputPresent,true);
 assert.equal(q.cncRequestArbitration.wiringApproved,false);
 assert.equal(p.cncRequestArbitration.status,"BLOCKED_NO_CNC_REQUEST_SIGNAL");
});
test("physical shared doors have exactly one DI and one normal relay request",()=>{
 const p=build(candidate,opts);
 for(const door of candidate.physicalDoors){
  const di=p.inputs.filter(x=>x.doorId===door.id&&x.source==="PHYSICAL_REED");
  const outputs=p.outputs.filter(x=>x.doorId===door.id&&x.id.startsWith("NORMAL_PERMIT"));
  assert.equal(di.length,1,door.id);
  assert.equal(outputs.length,1,door.id);
  assert.deepEqual(di[0].incidentRooms.sort(),[door.a,door.b].filter(x=>x.startsWith("R")).sort());
 }
 assert.equal(p.inputs.find(x=>x.doorId==="D_1257_1256"&&x.source==="PHYSICAL_REED").incidentRooms.length,2);
});
test("PR102 + PRM-1 candidate has 24+24 channels, headroom and abstract-only slot IDs",()=>{
 const p=build(candidate,opts);
 assert.equal(p.proposedHardware.controller,"PR102-24.2416.03.1");
 assert.deepEqual(p.proposedHardware.modules,["PRM-1.24"]);
 assert.equal(p.proposedHardware.availableDi,24);
 assert.equal(p.proposedHardware.availableRelayDo,24);
 assert.equal(p.proposedHardware.spareDi,9);
 assert.equal(p.proposedHardware.spareRelayDo,9);
 assert.equal(p.proposedHardware.terminalNumbersVerified,false);
 const inputSlots=p.inputs.map(x=>x.tentativeChannel.unit+":"+x.tentativeChannel.channel);
 const outputSlots=p.outputs.map(x=>x.tentativeChannel.unit+":"+x.tentativeChannel.channel);
 assert.equal(new Set(inputSlots).size,15);
 assert.equal(new Set(outputSlots).size,15);
 assert(p.inputs.every(x=>x.physicalTerminal===null&&x.tentativeChannel.verifiedTerminal===null));
 assert(p.outputs.every(x=>x.physicalTerminal===null&&x.tentativeChannel.verifiedTerminal===null));
});
test("all inputs of local-button scenario are assigned without crossing device capacity",()=>{
 const p=build(candidate,opts);
 assert.equal(p.inputs[0].tentativeChannel.channel,"DI01");
 assert.equal(p.inputs[14].tentativeChannel.channel,"DI15");
 assert.equal(p.outputs[14].tentativeChannel.channel,"DO15");
 assert(p.inputs.every(x=>x.tentativeChannel.unit===p.proposedHardware.controller));
 assert(p.outputs.every(x=>x.tentativeChannel.unit===p.proposedHardware.controller));
});
test("two sided buttons are 21 DI, use extension DI and retain 3 DI spare",()=>{
 const p=build(candidate,{...opts,perLocalDoorButtons:2});
 assert.equal(p.totals.localButtonChannels,12);
 assert.equal(p.totals.requiredDi,21);
 assert.equal(p.totals.requiredRelayDo,15);
 assert.equal(p.proposedHardware.spareDi,3);
 assert.equal(p.inputs.filter(x=>x.source==="LOCAL_BUTTON").length,12);
 assert.equal(p.inputs.filter(x=>x.tentativeChannel.unit.startsWith("PRM-1.24")).length,5);
});
test("optional common alarm DO and room traffic scope change counts, not lock outputs",()=>{
 const p=build(candidate,{...opts,includeCommonAlarmRelay:true,lampMode:"room"});
 assert.equal(p.totals.requiredDi,15);
 assert.equal(p.totals.requiredRelayDo,15);
 assert.equal(p.outputs.filter(x=>x.id.startsWith("LAMP_GREEN_")).length,6);
 assert(p.outputs.some(x=>x.id==="ANY_ALARM_RELAY"));
 assert.equal(p.outputs.filter(x=>x.id.startsWith("NORMAL_PERMIT_")).length,7);
});
test("with no extra lamp relay settings cannot silently replace false egress claims",()=>{
 const p=build(candidate,opts);
 assert.equal(p.safety.lockTypeAndPolarityApproved,false);
 assert.equal(p.safety.relayWiringVerified,false);
 assert.equal(p.safety.physicalEquipmentProgrammed,false);
 assert(p.outputs.filter(x=>x.id.startsWith("NORMAL_PERMIT_"))
  .every(x=>x.emergencyRelease==="SEPARATE_APPROVED_HARDWARE"));
});
test("original legacy candidate BUSY flag cannot override explicit new no-BUSY policy",()=>{
 const p=build(candidate,opts);
 assert.equal(candidate.physicalDoors[0].busyContactToBolid,true);
 assert.equal(p.policy.physicalBolidBusyDo,0);
 assert.throws(()=>build(candidate,{}),/EXPLICIT_NO_BUSY_LOCK_GATE_REQUIRED/);
 assert.throws(()=>build(candidate,{normalAccessInterface:"busy"}),/EXPLICIT_NO_BUSY_LOCK_GATE_REQUIRED/);
});
test("reject duplicate doors, spoofed physical terminals, and invalid zone adjacency",()=>{
 const dup=clone(candidate);dup.physicalDoors.push(clone(dup.physicalDoors[0]));
 assert.throws(()=>build(dup,opts),/DUPLICATE_PHYSICAL_DOORS/);
 const terminal=clone(candidate);terminal.physicalDoors[0].reedInput="I1";
 assert.throws(()=>build(terminal,opts),/SITE_WIRING_ALREADY_PRESENT_REQUIRES_REVIEW/);
 const zone=clone(candidate);zone.interlockZones[0].doorIds=[zone.physicalDoors[0].id];
 assert.throws(()=>build(zone,opts),/INCIDENT_ZONE_MEMBERSHIP_MISMATCH/);
});
test("reject accidental removal of SCUD reader or moving excluded room to active",()=>{
 const noReader=clone(candidate);noReader.accessControlTopology.cardReaderDoorId="D_1257_1256";
 assert.throws(()=>build(noReader,opts),/SINGLE_READER_MAPPING_REQUIRED/);
 const excluded=clone(candidate);excluded.physicalSpaces.push({id:"R1274"});
 assert.throws(()=>build(excluded,opts),/EXCLUDED_ROOM_IN_ACTIVE_GRAPH/);
});
test("reject guessed button count, unknown setting, invalid reserves",()=>{
 assert.throws(()=>build(candidate,{...opts,perLocalDoorButtons:3}),/LOCAL_BUTTON_COUNT/);
 assert.throws(()=>build(candidate,{...opts,pinMapping:true}),/UNKNOWN_PRELIMINARY_SETTING/);
 assert.throws(()=>build(candidate,{...opts,reserveDi:-1}),/INVALID_RESERVE/);
 assert.throws(()=>build(candidate,{...opts,includeCommonAlarmRelay:1}),/BAD_COMMON_ALARM/);
});
test("input order and selection are deterministic across repeated builds",()=>{
 const a=build(candidate,opts),b=build(candidate,opts);
 assert.equal(JSON.stringify(a),JSON.stringify(b));
});
console.log("CAD_IO_PREFLIGHT_QA "+passes+"/"+passes+" PASS CAPACITY_ONLY_NO_REAL_TERMINALS");
