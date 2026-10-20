"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {buildVectors,save}=require("../scripts/export-st-reference-vectors.js");
const file=path.join(__dirname,"../experimental/issue28/ST_REFERENCE_VECTORS_OFFLINE.json");
const pinned=JSON.parse(fs.readFileSync(file,"utf8"));
const current=buildVectors();
assert.deepEqual(current,pinned,"committed golden reference must match current executable model");
assert.equal(current.qualification,"JS_REFERENCE_ONLY_NOT_NATIVE_OWEN");
assert.equal(current.physicalDeviceWrites,0);
assert.equal(current.physicalBusyDo,0);
assert.equal(current.sevenDoorGroups.length,6);
assert.equal(current.all128SevenDoorRequests.length,128);
assert.equal(current.twoDoorTrace.length,11);
const steps=Object.fromEntries(current.twoDoorTrace.map(x=>[x.label,x.expected]));
assert.equal(steps.startup_9_9s.ready.AB,false);
assert.equal(steps.startup_10s.ready.AB,true);
assert.equal(steps.same_scan_A_B_requests.permit.A,true);
assert.equal(steps.same_scan_A_B_requests.permit.B,false);
assert.equal(steps.A_open.permit.A,false);
assert.equal(steps.A_open.reserved.A,true);
assert.equal(steps.post_close_9_9s.ready.AB,false);
assert.equal(steps.post_close_10s.ready.AB,true);
assert.equal(steps.fresh_B_request.permit.B,true);
const groups=current.sevenDoorGroups;
for(const item of current.all128SevenDoorRequests){
 assert(item.granted.every(x=>item.requested.includes(x)));
 for(const g of groups)assert(g.doorIds.filter(id=>item.granted.includes(id)).length<=1,
  "Conflicting grant in "+g.id+" mask "+item.mask);
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-st-vec-"));
try{
 const out=path.join(temp,"vectors.json");save(out);
 assert.equal(fs.readFileSync(out,"utf8"),fs.readFileSync(file,"utf8"));
 assert.throws(()=>save(out),/REFUSE_OVERWRITE/);
 assert.throws(()=>save(path.join(temp,"fake.owle")) ,/USAGE_JSON_OUTPUT/);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log("ST_REFERENCE_VECTORS_QA PASS 11_TRACE_STEPS 128_SEVEN_MASKS 6_GROUPS OFFLINE_ONLY");
