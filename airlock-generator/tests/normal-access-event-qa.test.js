"use strict";
const assert=require("node:assert/strict");
const {create}=require("../normal-access-event-qa.js");
const fbd=require("../native-timed-fbd-plan.js");
const cad=require("../experimental/fixtures/real-cad-1252-1274-candidate.json");
const plan=fbd.build(cad);
const all=plan.doors.map(d=>d.doorId);
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log("PASS NORMAL_ACCESS_EVENT "+name)};
test("no physical lock output or claimed release exists",()=>{
 const t=create(plan),s=t.view();
 assert.equal(s.physicalLockOutputsAllocated,0);
 assert.equal(s.actualHardwareReleased,null);
 assert.equal(s.allAttempts,0);
});
test("card from CNC denied during initial 10s hold",()=>{
 const t=create(plan);
 const event=t.request("D_CNC_1257","card");
 assert.equal(event.logicalRequestAccepted,false);
 assert.equal(event.reason,"ZONE_HOLD_ACTIVE");
 assert.equal(event.outputPulseGenerated,false);
});
test("a denied card is not retroactively accepted when 10s timer expires",()=>{
 const t=create(plan);
 const denied=t.request("D_CNC_1257","card");
 t.step({},11000);
 assert.equal(denied.logicalRequestAccepted,false);
 assert.equal(t.history().length,1);
 assert.equal(t.view().lastAttempt.logicalRequestAccepted,false);
 assert.equal(t.request("D_CNC_1257","card").logicalRequestAccepted,true);
});
test("a closed remote group does not inhibit an unrelated valid button",()=>{
 const t=create(plan);
 t.step({},11000);
 t.step({Closed:{D_CNC_1257:false}},100);
 const x=t.request("D_1256_1254","button");
 assert.equal(x.logicalRequestAccepted,true);
 assert.equal(x.reason,"NORMAL_ACCESS_LOGIC_READY");
 const blocked=t.request("D_1257_1256","button");
 assert.equal(blocked.logicalRequestAccepted,false);
});
test("the opened door cannot accept a new normal unlock request",()=>{
 const t=create(plan);
 t.step({},11000);
 t.step({Closed:{D_1257_1255:false}},100);
 const x=t.request("D_1257_1255","button");
 assert.equal(x.logicalRequestAccepted,false);
 assert.equal(x.reason,"DOOR_ALREADY_OPEN");
});
test("reclosing and restarting the ten-second hold requires a new request",()=>{
 const t=create(plan);
 t.step({},11000);
 t.step({Closed:{D_1257_1255:false}},100);
 t.step({Closed:{D_1257_1255:true}},100);
 assert.equal(t.request("D_1257_1255","button").logicalRequestAccepted,false);
 t.step({},9600);
 assert.equal(t.request("D_1257_1255","button").logicalRequestAccepted,false);
 t.step({},600);
 assert.equal(t.request("D_1257_1255","button").logicalRequestAccepted,true);
});
test("fire blocks normal commands, but cannot imply actual emergency unlock",()=>{
 const t=create(plan);
 t.step({},11000);
 t.step({FireNormal:false},100);
 const req=t.request("D_CNC_1257","card");
 assert.equal(req.logicalRequestAccepted,false);
 assert.equal(req.reason,"FIRE_SEPARATE_EMERGENCY_RELEASE");
 assert.equal(req.physicalDoorUnlocked,null);
 assert.equal(req.actualEgressVerified,false);
});
test("distinct SCUD-card and local-button request methods validated",()=>{
 const t=create(plan);
 assert.throws(()=>t.request("D_CNC_1257","button"),/WRONG_REQUEST_CHANNEL/);
 assert.throws(()=>t.request("D_1257_1256","card"),/WRONG_REQUEST_CHANNEL/);
 assert.throws(()=>t.request("unknown","button"),/UNKNOWN_PHYSICAL_DOOR/);
 assert.throws(()=>create(plan,["invalid"]),/BAD_SCUD_DOOR_IDS/);
});
test("seven normal command request sources and no extra BUSY counted",()=>{
 const scud=all.filter(id=>id==="D_CNC_1257");
 const t=create(plan,scud);
 t.step({},11000);
 assert.equal(t.request(scud[0],"card").logicalRequestAccepted,true);
 for(const id of all.filter(x=>!scud.includes(x))){
  assert.equal(t.request(id,"button").logicalRequestAccepted,true);
 }
 assert.equal(t.history().length,7);
 assert.equal(t.history().every(e=>e.outputPulseGenerated===false),true);
});
console.log("NORMAL_ACCESS_EVENT_QA "+passed+"/"+passed+" PASS LOGIC_ONLY");
