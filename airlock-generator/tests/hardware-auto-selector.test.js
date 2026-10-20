"use strict";
const assert=require("node:assert/strict");
const h=require("../hardware-auto-selector.js");
let tests=0;const test=(n,f)=>{f();tests++;console.log("PASS HARDWARE_AUTO "+n)};
test("vendor catalog exact 24V relay models, 1-2 RS485 port variants",()=>{
 assert(h.PRS.some(p=>p.id==="PR100-24.1208.03.1"&&p.di===8&&p.relayDo===8&&p.maxPrm===0));
 assert(h.PRS.some(p=>p.id==="PR102-24.2416.03.1"&&p.di===16&&p.relayDo===16&&p.rs485===1));
 assert(h.PRS.some(p=>p.id==="PR102-24.2416.03.2"&&p.rs485===2));
 assert(h.PRS.some(p=>p.id==="PR103-24.1610.03.1.0"&&p.di===6&&p.specialDi===4&&p.relayDo===10&&p.ethernet));
 assert(h.PRS.some(p=>p.id==="PR103-24.1610.03.2.0"&&p.rs485===2));
 assert.deepEqual(h.PRM.map(p=>[p.id,p.di,p.relayDo]),
  [["PRM-1.24",8,8],["PRM-5.24",0,16],["PRM-6.24",16,12]]);
});
test("legacy budget without sampled requests, independent lamp and lock DO count",()=>{
 const s=h.select(7);
 assert.equal(s.required.di,9);
 assert.equal(s.required.relayDo,16);
 assert.equal(s.required.reserve.di,2);
 assert.equal(s.required.reserve.relayDo,2);
 assert.deepEqual(s.required.breakdown,{reedInputs:7,fireInputs:1,resetInputs:1,
  extraInputs:0,locks:7,lamps:7,buzzer:1,busy:1,extraOutputs:0});
 assert(s.primary&&s.primary.reservesMet);
 assert(s.primary.totalDi>=11&&s.primary.totalDo>=18);
 assert(s.primary.modules.length<=2);
 assert(!s.primary.controller.startsWith("PR100"),"PR100 cannot fit 16 DO");
 assert(s.alternatives.some(c=>c.family==="PR102"));
});
test("PR100 is eligible without PRM for two-door rig",()=>{
 const s=h.select(2,{reserveDo:0,reserveDi:0});
 assert.equal(s.primary.family,"PR100");
 assert.deepEqual(s.primary.modules,[]);
});
test("PR103 fast inputs are excluded from guaranteed dry contact DI",()=>{
 const s=h.select(7);
 const withFast=s.alternatives.concat(s.primary).filter(c=>c.family==="PR103");
 for(const c of withFast)assert(c.totalDi===6+c.modules.reduce((sum,name)=>
  sum+h.PRM.find(m=>m.id===name).di,0));
});
test("additional six exit buttons move selection away from bare PR103+PRM1",()=>{
 const s=h.select(7,{extraInputs:6});
 assert.equal(s.required.di,15);
 assert(s.primary.totalDi>=17&&s.primary.totalDo>=18);
 assert.notDeepEqual([s.primary.family,s.primary.modules],["PR103",["PRM-1.24"]]);
});
test("additional DO and scene option produce another verified module choice",()=>{
 const s=h.select(7,{extraOutputs:5,reserveDi:3});
 assert.equal(s.required.relayDo,21);
 assert(s.primary&&s.primary.reservesMet);
 assert(s.primary.modules.length>=1);
 const roomLamps=h.select(7,{lampChannelsTotal:6});
 assert.equal(roomLamps.required.breakdown.lamps,6);
 assert.equal(roomLamps.required.relayDo,15);
});
test("Ethernet-only requires native PR103 ethernet",()=>{
 const s=h.select(7,{networkMode:"ethernet-modbus-tcp"});
 assert(s.primary&&s.primary.family==="PR103");
 assert(s.alternatives.every(c=>c.ethernet));
});
test("two separate RS485 ports are a selectable modified model",()=>{
 const s=h.select(7,{preferTwoRs485:true});
 assert(h.PRS.some(p=>p.id==="PR102-24.2416.03.2"));
 assert(s.primary.rs485Ports>=1);
});
test("large site offers multi-PLC aggregate but never a commissioning claim",()=>{
 const s=h.select(60);
 assert.equal(s.primary,null);
 assert(s.networkAlternative);
 assert.equal(s.networkAlternative.status,"AGGREGATE_CAPACITY_ONLY_NO_PLACEMENT_OR_WATCHDOG");
 assert(s.networkAlternative.count>1);
 assert.equal(s.status,"PRELIMINARY_CAPACITY_SELECTION_ONLY");
});
test("reject impossible values and fail-closed instead of equipment suggestion",()=>{
 assert.throws(()=>h.select(-1),/BAD_DOORS/);
 assert.throws(()=>h.select(7,{readers:9}),/MORE_READERS/);
 assert.throws(()=>h.select(7,{reserveDo:-2}),/BAD_RESERVE_DO/);
 assert.throws(()=>h.select(7,{networkMode:"wifi"}),/UNKNOWN_NETWORK_MODE/);
});
test("same input always yields deterministic recommendation",()=>{
 assert.equal(JSON.stringify(h.select(7)),JSON.stringify(h.select(7)));
});
test("reservation uses seven actual request DI including K1, zero BUSY, reserves",()=>{
 const s=h.select(7,{requestInputs:7,busyChannels:0,lampOutputsPerDoor:0});
 assert.equal(s.required.di,16);assert.equal(s.required.requestInputs,7);assert.equal(s.required.relayDo,8);
 assert(s.primary.reservesMet);assert(s.primary.totalDi>=18);assert(s.primary.totalDo>=10);
 assert.notEqual(s.primary.family,'PR100');assert(s.primary.moduleCount<=2);
 const zeroReserve=h.select(7,{requestInputs:7,busyChannels:0,lampOutputsPerDoor:0,reserveDi:0,reserveDo:0});
 assert.equal(zeroReserve.primary.family,'PR102');assert.equal(zeroReserve.primary.moduleCount,0);
 const ethernet=h.select(7,{requestInputs:7,busyChannels:0,lampOutputsPerDoor:0,networkMode:'ethernet-modbus-tcp'});
 assert.equal(ethernet.primary.family,'PR103');assert(ethernet.primary.totalDi>=18);
 assert.throws(()=>h.select(7,{requestInputs:-1}),/BAD_REQUEST_INPUTS/);
});

console.log("HARDWARE_AUTO_QA "+tests+"/"+tests+" PASS ADVISORY_NOT_BOM");
