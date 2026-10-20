"use strict";
const assert=require("node:assert/strict");
const {estimate}=require("../s2000-2-hardware-bridge.js");
const c=(id,doorId,domain,hasCardReader=true,hasExitButton=true)=>({
 id,doorId,hasCardReader,hasExitButton,receiveBusy:!!domain,issueBusy:false,blockingDomain:domain
});
const device=(id,a,b)=>({id,mode:"two-independent-doors",channels:[a,b]});
let count=0;
function test(n,fn){fn();count++;console.log("PASS BUSY_BRIDGE "+n)}
test("one S2000-2 with two readers still only one shared BUSY relay on PLC",()=>{
 const s=estimate(7,[device("S2000_1",c("1","D1","SAME"),c("2","D2","SAME"))]);
 assert.equal(s.status,"CAPACITY_SHORTLIST_NOT_DEVICE_CONFIGURATION");
 assert.equal(s.resourceBasis.cardReaderChannels,2);
 assert.equal(s.resourceBasis.physicalS2000Controllers,1);
 assert.equal(s.resourceBasis.physicalBusyTerminals,1);
 assert.equal(s.resourceBasis.separatePlcBusyOutputs,1);
 assert.equal(s.hardware.required.breakdown.busy,1);
 assert.equal(s.hardware.required.relayDo,16);
 assert(s.hardware.primary);
});
test("one reader + button-only second door with Busy disabled on second",()=>{
 const s=estimate(7,[device("SCUD",c("1","D1","Z1"),
  c("2","D2",null,false,true))]);
 assert.equal(s.hardware.required.breakdown.busy,1);
 assert.equal(s.resourceBasis.cardReaderChannels,1);
 assert.equal(s.access.controllers[0].affected[1].exitButtonBlockedOnBusy,false);
});
test("two independent external holds on the SAME controller must not produce a hardware shortlist",()=>{
 const s=estimate(7,[device("SCUD",c("1","D1","Z1257"),c("2","D2","Z1255"))]);
 assert.equal(s.status,"STOP_UNRESOLVABLE_BUSY_DOMAINS");
 assert.equal(s.hardware,null);
});
test("two separate controllers with isolated BUSY circuits require two physical BUSY DO",()=>{
 const s=estimate(7,[
  device("SCUD1",c("1","D1","Z1"),c("2","NONE1",null,false,false)),
  device("SCUD2",c("1","D2","Z2"),c("2","NONE2",null,false,false))
 ]);
 assert.equal(s.resourceBasis.physicalS2000Controllers,2);
 assert.equal(s.resourceBasis.separatePlcBusyOutputs,2);
 assert.equal(s.hardware.required.breakdown.busy,2);
 assert.equal(s.hardware.required.relayDo,17);
});
test("the planner does not allow caller to spoof derived busy channels",()=>{
 const p=[device("SCUD",c("1","D1","Z"),c("2","D2",null,false,true))];
 assert.throws(()=>estimate(7,p,{busyChannels:0}),/DERIVED_ACCESS_RESOURCES_CANNOT_BE_OVERRIDDEN/);
 assert.throws(()=>estimate(7,p,{readers:7}),/DERIVED_ACCESS_RESOURCES_CANNOT_BE_OVERRIDDEN/);
});
console.log("BUSY_TO_HARDWARE_QA "+count+"/"+count+" PASS NEVER_COUNTS_PER_READER");
