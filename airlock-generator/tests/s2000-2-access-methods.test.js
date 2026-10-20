"use strict";
const assert=require("node:assert/strict");
const {analyze,catalogue}=require("../s2000-2-access-methods.js");
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log("PASS S2000_ACCESS_METHODS "+name)};
test("all five supported strategies and no invented independent BUSY terminal",()=>{
 assert.deepEqual(Object.keys(catalogue),[
  "normal","access-closed","tech-loop-reader-gate","armed-security-loop","busy"]);
 assert.equal(analyze({mode:"busy",independentHoldDomains:2}).status,"CANNOT_AUTO_APPROVE");
 assert(analyze({mode:"busy",independentHoldDomains:2}).issues.includes(
  "ONE_SHARED_BUSY_CANNOT_CARRY_TWO_INDEPENDENT_DOMAINS"));
});
test("closed access and technological Z1 Z2 gating leave ordinary EXIT button operative",()=>{
 for(const mode of ["access-closed","tech-loop-reader-gate"]){
  const x=analyze({mode,blockNormalExit:true});
  assert.equal(x.capabilities.cardBlocked,true);
  assert.equal(x.capabilities.exitButtonBlocked,false);
  assert(x.issues.includes("MODE_DOES_NOT_BLOCK_NORMAL_EXIT_BUTTON"));
 }
});
test("armed loop blocks both card and ordinary exit, but no unlock from loop normalization",()=>{
 const x=analyze({mode:"armed-security-loop",blockNormalExit:true,independentHoldDomains:2});
 assert.equal(x.capabilities.cardBlocked,true);
 assert.equal(x.capabilities.exitButtonBlocked,true);
 assert.equal(x.capabilities.remoteCommandBlocked,false);
 assert.equal(x.capabilities.minimumFirmware,"2.20");
 assert.match(x.capabilities.release,/DISARM/);
 assert(x.issues.includes("REQUIRES_EXPLICIT_DISARM_NOT_RESTORED_CONTACT"));
 assert(x.issues.includes("NO_LOCAL_OWEN_MODBUS_ARM_DISARM_OVER_S2000_2_ORION_ASSUMED"));
});
test("armed loop does not block Orion commands like physical BUSY",()=>{
 const x=analyze({mode:"armed-security-loop",blockRemoteCommands:true});
 assert(x.issues.includes("REMOTE_COMMANDS_NOT_BLOCKED"));
 const b=analyze({mode:"busy",blockRemoteCommands:true});
 assert.equal(b.capabilities.remoteCommandBlocked,true);
});
test("early exit into dirtier area cannot be authorized from a single reed",()=>{
 const x=analyze({mode:"busy",allowReturnToDirtierDuringHold:true});
 assert(x.issues.includes("DIRECTION_CANNOT_BE_DEDUCED_FROM_ONE_REED"));
 assert(x.issues.includes("EARLY_RETURN_NEEDS_APPROVED_EGRESS_EXCEPTION_NOT_NORMAL_BLOCKED_EXIT_BUTTON"));
});
test("explicit direction sensors do not erase exit block under BUSY",()=>{
 const x=analyze({mode:"busy",hasDirectionEvidence:true,allowReturnToDirtierDuringHold:true});
 assert(!x.issues.includes("DIRECTION_CANNOT_BE_DEDUCED_FROM_ONE_REED"));
 assert(x.issues.some(i=>i.includes("EARLY_RETURN")));
});
test("even feasible reader blocking has no safety acceptance",()=>{
 const x=analyze({mode:"busy",independentHoldDomains:1,blockNormalExit:true});
 assert.equal(x.status,"LOGICALLY_POSSIBLE_SUBJECT_TO_COMMISSIONING");
 assert.equal(x.physicalEgressAccepted,false);
 assert.equal(x.nativePlcTested,false);
});
test("reject unknown mode and unbounded independent zone count",()=>{
 assert.throws(()=>analyze({mode:"firelock"}),/UNKNOWN_ACCESS_MODE/);
 assert.throws(()=>analyze({mode:"busy",independentHoldDomains:3}),/INVALID_DOMAINS/);
});
console.log("S2000_ACCESS_METHODS_QA "+passed+"/"+passed+" PASS OFFLINE");
