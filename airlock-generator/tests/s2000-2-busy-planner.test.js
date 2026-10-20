"use strict";
const assert=require("node:assert/strict");
const {assess,assessSystem}=require("../s2000-2-busy-planner.js");
const h=require("../hardware-auto-selector.js");
const channel=(id,doorId,domain,hasCardReader=true,hasExitButton=true)=>({
 id,doorId,hasCardReader,hasExitButton,receiveBusy:domain!==null,issueBusy:false,blockingDomain:domain
});
const mk=(id,c1,c2)=>({id,mode:"two-independent-doors",channels:[c1,c2]});
let checked=0;
function test(n,fn){fn();checked++;console.log("PASS BOLID_BUSY_SCOPE "+n)}
test("one controller, two doors, only first receives BUSY, button-only second unaffected",()=>{
 const p=assess(mk("S2000_1",channel("1","D_CNC_1257","Z1257"),
  channel("2","D_BTN_GATE",null,false,true)));
 assert.equal(p.physicalBusyTerminalsOnDevice,1);
 assert.equal(p.plannedExternalPlcBusyRelayOutputs,1);
 assert.equal(p.status,"SHARED_BUSY_FEASIBLE_PENDING_HARDWARE_QA");
 assert.equal(p.affected[0].cardAccessBlockedOnBusy,true);
 assert.equal(p.affected[0].exitButtonBlockedOnBusy,true);
 assert.equal(p.affected[1].noEffectFromBusy,true);
 assert.equal(p.affected[1].exitButtonBlockedOnBusy,false);
 assert.deepEqual(p.exitButtonsAffectedByBusy,["1"]);
 assert.equal(p.emergencyEgressProven,false);
});
test("two reader doors with same busy domain require one PLC BUSY output",()=>{
 const p=assess(mk("S2000_1",channel("1","D1","SHARED_ZONE"),
  channel("2","D2","SHARED_ZONE")));
 assert.equal(p.plannedExternalPlcBusyRelayOutputs,1);
 assert.deepEqual(p.exitButtonsAffectedByBusy,["1","2"]);
 assert.equal(p.affected.every(c=>c.cardAccessBlockedOnBusy),true);
});
test("two reader doors with independent holds cannot use one common BUSY terminal",()=>{
 const p=assess(mk("S2000_1",channel("1","D1","Z_A"),
  channel("2","D2","Z_B")));
 assert.equal(p.status,"CONFLICT_INDEPENDENT_DOMAINS_SHARE_ONE_BUSY");
 assert.equal(p.plannedExternalPlcBusyRelayOutputs,null);
 assert.deepEqual(p.distinctRequestedExternalBlockDomains,["Z_A","Z_B"]);
 assert(p.recommendations.some(s=>s.includes("ШС")));
});
test("two independent S2000-2 units can be given separate BUSY circuits",()=>{
 const result=assessSystem([
  mk("SCUD_1",channel("1","D1","Z_A"),channel("2","D_UNUSED1",null,false,false)),
  mk("SCUD_2",channel("1","D2","Z_B"),channel("2","D_UNUSED2",null,false,false))
 ]);
 assert.equal(result.status,"CAPACITY_ONLY_NOT_APPROVED_FOR_SITE");
 assert.equal(result.physicalBusyTerminalCount,2);
 assert.equal(result.plannedIsolatedPlcBusyOutputs,2);
});
test("one controller two readers cannot be conflated with two BUSY DO in hardware sizing",()=>{
 const device=assessSystem([mk("SCUD_1",channel("1","D1","COMMON"),
  channel("2","D2","COMMON"))]);
 const hw=h.select(7,{readers:2,busyChannels:device.plannedIsolatedPlcBusyOutputs});
 assert.equal(hw.required.breakdown.busy,1);
 assert.equal(hw.required.breakdown.reedInputs,7);
 assert.equal(hw.required.relayDo,16);
});
test("two different BUSY domains MUST NOT pass selector with fake count 1",()=>{
 const res=assessSystem([mk("SCUD_1",channel("1","D1","Z_A"),
  channel("2","D2","Z_B"))]);
 assert.equal(res.status,"NOT_FEASIBLE_USING_ONLY_BUSY");
 assert.equal(res.plannedIsolatedPlcBusyOutputs,null);
});
test("no receiving channels requires no external PLC BUSY output",()=>{
 const p=assess(mk("SCUD",channel("1","D1",null),channel("2","D2",null)));
 assert.equal(p.status,"NO_EXTERNAL_BUSY_REQUESTED");
 assert.equal(p.plannedExternalPlcBusyRelayOutputs,0);
});
test("one door, two reading directions allowed as same physical door",()=>{
 const p=assess({id:"SCUD",mode:"one-door-two-directions",
  channels:[channel("1","COMMON","C"),channel("2","COMMON",null)]});
 assert.equal(p.plannedExternalPlcBusyRelayOutputs,1);
});
test("two doors in mantrap mode are not two independent access points",()=>{
 const p=assess({id:"SCUD",mode:"single-two-door-mantrap",
  channels:[channel("1","D1","C"),channel("2","D2","C")]});
 assert.equal(p.mode,"single-two-door-mantrap");
 assert(p.limitations.some(s=>s.includes("ONE_ACCESS_POINT_ONLY")));
});
test("reject implicit busy configuration, channel duplication and misleading data",()=>{
 assert.throws(()=>assess(mk("X",channel("1","D1","Z"),{...channel("1","D2",null)})),/DUPLICATE_CHANNEL_ID/);
 assert.throws(()=>assess(mk("X",{...channel("1","D1","Z"),receiveBusy:false},channel("2","D2",null))),/BLOCKING_DOMAIN_WITHOUT_RECEIVE_BUSY/);
 assert.throws(()=>assessSystem([mk("X",channel("1","D1","Z"),channel("2","D2",null)),mk("X",channel("1","D3","Z"),channel("2","D4",null))]),/DUPLICATE_ACCESS_CONTROLLER/);
});
console.log("BOLID_BUSY_SCOPE_QA "+checked+"/"+checked+" PASS; NO_DEVICE_WRITES");
