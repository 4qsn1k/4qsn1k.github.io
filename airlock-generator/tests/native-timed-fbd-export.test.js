"use strict";
/* No COM, Owen editor, hardware or native PLC files. CLI export contract. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),
 crypto=require("node:crypto"),{spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const cli=path.join(root,"scripts/export-native-timed-fbd-plan.js");
const fixture=path.join(root,"experimental/fixtures/real-cad-1252-1274-candidate.json");
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-native-timed-qa-"));
let checked=0;
function test(label,fn){fn();checked++;console.log("PASS NATIVE_TIMED_EXPORT "+label)}
function run(src,dest){return spawnSync(process.execPath,[cli,src,dest],
 {encoding:"utf8",timeout:15000})}
try{
 const a=path.join(temp,"one"),b=path.join(temp,"two");
 test("create offline-only reproducible export with 6 TON timers",()=>{
  const r=run(fixture,a);
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/NATIVE_TIMED_FBD_EXPORT_PASS/);
  const files=fs.readdirSync(a).sort();
  assert.deepEqual(files,["primitive-netlist.json","sha256-manifest.json",
   "vendor-native-next-steps.md","wires.csv"]);
  const manifest=JSON.parse(fs.readFileSync(path.join(a,"sha256-manifest.json"),"utf8"));
  assert.equal(manifest.noStructuredText,true);
  assert.equal(manifest.outputIsOwenOwle,false);
  assert.equal(manifest.physicalDevicesWritten,0);
  assert.deepEqual(manifest.counts,{zones:6,doors:7,tonBlocks:6,nodes:85,edges:148});
  assert.equal(manifest.candidateSha256,hash(fs.readFileSync(fixture)));
  for(const [name,expected] of Object.entries(manifest.files))
   assert.equal(hash(fs.readFileSync(path.join(a,name))),expected,name);
  const plan=JSON.parse(fs.readFileSync(path.join(a,"primitive-netlist.json"),"utf8"));
  assert.equal(plan.nativeGuiCompiled,false);
  assert.equal(plan.physicallyDeployable,false);
  assert.equal(plan.nodes.filter(n=>n.kind==="TON").length,6);
  assert.equal(plan.nodes.filter(n=>n.kind==="TON").every(n=>n.presetMs===10000),true);
  assert(!files.some(n=>n.endsWith(".owle")));
 });
 test("second export is byte-identical",()=>{
  assert.equal(run(fixture,b).status,0);
  for(const name of fs.readdirSync(a))
   assert.equal(hash(fs.readFileSync(path.join(a,name))),
    hash(fs.readFileSync(path.join(b,name))),name);
 });
 test("refuse overwrite of existing plan output",()=>{
  const original=fs.readFileSync(path.join(a,"primitive-netlist.json"));
  const r=run(fixture,a);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/REFUSE_OVERWRITE_EXISTING_OUTPUT_DIR/);
  assert.deepEqual(fs.readFileSync(path.join(a,"primitive-netlist.json")),original);
 });
 test("refuse .owle destination even when no file exists",()=>{
  const target=path.join(temp,"UNVERIFIED.owle");
  const r=run(fixture,target);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/REFUSE_VENDOR_OWLE_DESTINATION/);
  assert.equal(fs.existsSync(target),false);
 });
 test("refuse invalid/unapproved 10s hold without writing output",()=>{
  const altered=JSON.parse(fs.readFileSync(fixture,"utf8"));
  altered.interlockZones[0].timedBlockHoldSec=3;
  const target=path.join(temp,"reject");
  const bad=path.join(temp,"invalid.json");
  fs.writeFileSync(bad,JSON.stringify(altered));
  const r=run(bad,target);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/ZONE_TIMING_UNCONFIRMED/);
  assert.equal(fs.existsSync(target),false);
 });
}finally{fs.rmSync(temp,{recursive:true,force:true})}
console.log("NATIVE_TIMED_FBD_EXPORT_QA "+checked+"/"+checked+" PASS; NO OWLE NOR PLC");
