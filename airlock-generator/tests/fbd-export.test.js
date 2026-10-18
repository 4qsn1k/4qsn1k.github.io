"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto"),vm=require("node:vm");
const assert=require("node:assert/strict"),{spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,".."),fixture=path.join(root,"experimental/fixtures/fbd-four-rooms.model.json");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-fbd-export-"));
const context=vm.createContext({});
for(const f of ["st-generator.js","project-wiring.js","hardware-planner.js","distributed-planner.js","fbd-generator.js"])
 vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),context,{filename:f});
const fbd=vm.runInContext("AirlockFbdGenerator",context);
const hash=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run=out=>spawnSync(process.execPath,[path.join(root,"scripts/export-fbd-plan.js"),fixture,out],{cwd:temp,encoding:"utf8"});
let count=0;
function test(name,fn){fn();count++;console.log("PASS FBD-EXPORT "+name)}
try{
 const before=hash(fixture),out=path.join(temp,"first");
 test("CLI exports four-room/three-PR manifest, full matrix, ST and native QA",()=>{
  const result=run(out);assert.equal(result.status,0,result.stderr);assert(result.stdout.includes("FBD_PLAN_PASS"));
  const plan=JSON.parse(fs.readFileSync(path.join(out,"fbd-plan.json")));
  assert.equal(plan.blocks.length,4);assert.equal(plan.doors.length,8);assert.equal(plan.placement.controllers.length,3);
  fbd.validate(plan);
  const manual=fs.readFileSync(path.join(out,"native-test-plan.md"),"utf8");
  assert(manual.includes("NEEDS_NATIVE_GUI"));assert(manual.includes("FBD-10-008"));
  assert.equal(fs.readFileSync(path.join(out,"connection-matrix.csv"),"utf8"),fbd.matrix(plan));
  assert(!fs.readdirSync(out).some(f=>f.endsWith(".owle")));
  const evidence=JSON.parse(fs.readFileSync(path.join(out,"native-evidence.json")));
  assert.equal(evidence.nativeDocument,null);assert.equal(evidence.usableForSerialization,false);
  assert.equal(evidence.sourceFixtureSha256,hash(path.join(root,"experimental/fixtures/fbd-two-native-blocks.sample.json")));
 });
 test("checksums cover every generated artifact, outputs repeat byte-for-byte",()=>{
  const checks=JSON.parse(fs.readFileSync(path.join(out,"sha256.json")));
  for(const [name,value] of Object.entries(checks))assert.equal(hash(path.join(out,name)),value,name);
  const second=path.join(temp,"second");assert.equal(run(second).status,0);
  for(const name of fs.readdirSync(out))assert.equal(hash(path.join(out,name)),hash(path.join(second,name)),name);
 });
 test("existing output cannot overwrite user files or source fixture",()=>{
  const original=hash(path.join(out,"fbd-plan.json"));assert.equal(run(out).status,1);
  assert.equal(hash(path.join(out,"fbd-plan.json")),original);assert.equal(hash(fixture),before);
 });
 test("evidence adapter validates observed types and does not fabricate new block schemas",()=>{
  const native=JSON.parse(fs.readFileSync(path.join(root,"experimental/fixtures/fbd-two-native-blocks.sample.json")));
  const model=JSON.parse(fs.readFileSync(path.join(root,"model.json")));
  const hardware={primary:{family:"PR103",baseDi:16,baseDo:16,modules:[]},secondary:[],link:"none",signaling:"room"};
  const topology={roomOwners:{"1":"PLC1","4":"PLC1"},doorInputOwners:{},doorOutputOwners:{},alarmOwner:"PLC1"};
  for(const d of model.doors){topology.doorInputOwners[d.id]="PLC1";topology.doorOutputOwners[d.id]="PLC1"}
  const plan=fbd.build(model,{hardware,topology});
  const e=fbd.nativeEvidence(plan,native);
  assert(e.blocks.every(b=>b.status==="GUI_SIGNATURE_MATCH"));assert.equal(e.status,"NEEDS_NATIVE_GUI");
  const broken=structuredClone(native);broken.elements[0].ElementBlockStoreModel.ElementModel.Ports[0].DataType=-1;
  assert.throws(()=>fbd.nativeEvidence(plan,broken),/type mismatch/);
  assert.throws(()=>fbd.nativeEvidence(plan,{schema:"unknown"}),/Unsupported/);
 });
 const artifacts=path.join(root,"qa-reports/fbd-four-rooms");
 // QA artifacts are ignored; preserve previous output directories by using a
 // unique directory for each run, while printing its exact location for CI.
 fs.mkdirSync(path.join(root,"qa-reports"),{recursive:true});
 const artifact=fs.mkdtempSync(artifacts+"-");
 fs.cpSync(out,artifact,{recursive:true});
 console.log("FBD_TEST_ARTIFACT "+artifact);
}finally{fs.rmSync(temp,{recursive:true,force:true})}
console.log(`FBD_EXPORT_QA ${count}/${count} PASS`);
