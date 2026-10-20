"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os");
const path=require("node:path"),crypto=require("node:crypto");
const {exportPlan,parseArgs}=require("../scripts/export-cad-io-preflight.js");
const source=path.join(__dirname,"../experimental/fixtures/real-cad-1252-1274-candidate.json");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-cad-io-preflight-"));
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
let checks=0;
function test(n,fn){fn();checks++;console.log("PASS CAD_IO_EXPORT "+n)}
try{
 const a=path.join(tmp,"planA"),b=path.join(tmp,"planB"),c=path.join(tmp,"twoButtons");
 test("offline export writes exactly four artifacts and no OWLE",()=>{
  const report=exportPlan([source,a]);
  assert.equal(report.hardwareWriteCount,0);
  assert.equal(report.nativeOwleGenerated,false);
  assert.equal(report.verifiedTerminalCount,0);
  assert.deepEqual(report.counts,{di:15,relayDo:15,doors:7,rooms:6});
  assert.deepEqual(fs.readdirSync(a).sort(),
   ["IO-CHANNELS.csv","IO-PLAN-RU.md","IO-PREFLIGHT.json","MANIFEST-SHA256.json"]);
  const md=fs.readFileSync(path.join(a,"IO-PLAN-RU.md"),"utf8");
  assert(md.includes("**15**")||md.includes("| 15 | 17 | 24 |"));
  assert(md.includes("PR102-24.2416.03.1 + PRM-1.24"));
  assert(md.includes("НЕ клемма"));
  assert(md.includes("аппаратным")||md.includes("аппаратного"));
  const csv=fs.readFileSync(path.join(a,"IO-CHANNELS.csv"),"utf8");
  assert(csv.startsWith("\uFEFF"));
  assert(csv.includes('"RELAY_DO"'));
  assert(!csv.includes('=""'));
 });
 test("manifest cryptographically binds all generated files and source",()=>{
  const man=JSON.parse(fs.readFileSync(path.join(a,"MANIFEST-SHA256.json"),"utf8"));
  assert.equal(man.sourceSha256,hash(fs.readFileSync(source)));
  for(const [name,sha] of Object.entries(man.filesSha256))
   assert.equal(hash(fs.readFileSync(path.join(a,name))),sha,name);
 });
 test("second run with identical candidate has identical bytes",()=>{
  exportPlan([source,b]);
  for(const f of fs.readdirSync(a))
   assert.equal(hash(fs.readFileSync(path.join(a,f))),hash(fs.readFileSync(path.join(b,f))),f);
 });
 test("two local buttons per non-SCUD door raises required DI from 15 to 21",()=>{
  exportPlan([source,c,"--buttons=2"]);
  const p=JSON.parse(fs.readFileSync(path.join(c,"IO-PREFLIGHT.json"),"utf8"));
  assert.equal(p.totals.requiredDi,21);
  assert.equal(p.totals.requiredRelayDo,15);
  assert.equal(p.proposedHardware.spareDi,3);
  assert(p.inputs.some(x=>x.tentativeChannel.unit.startsWith("PRM-1.24")));
 });
 test("additional alarm, room lamps and K1 monitor accepted only when explicit",()=>{
  const dest=path.join(tmp,"custom");
  exportPlan([source,dest,"--alarm","--room-lamps","--k1-feedback"]);
  const p=JSON.parse(fs.readFileSync(path.join(dest,"IO-PREFLIGHT.json"),"utf8"));
  assert.equal(p.totals.requiredDi,16);
  assert.equal(p.totals.requiredRelayDo,15);
  assert(p.outputs.some(x=>x.id==="ANY_ALARM_RELAY"));
 });
 test("fail closed on unknown and duplicate command flags",()=>{
  assert.throws(()=>parseArgs([source,path.join(tmp,"bad"),"--busy"]),/UNKNOWN_FLAG/);
  assert.throws(()=>parseArgs([source,path.join(tmp,"bad"),"--buttons=1","--buttons=2"]),/DUPLICATE_FLAG/);
  assert.throws(()=>parseArgs([source,path.join(tmp,"bad"),"--buttons=0"]),/UNKNOWN_FLAG/);
 });
 test("reject overwrite even after correct prior generation",()=>{
  const before=hash(fs.readFileSync(path.join(a,"IO-PREFLIGHT.json")));
  assert.throws(()=>exportPlan([source,a]),/NO_OVERWRITE_EXISTING_DIRECTORY/);
  assert.equal(before,hash(fs.readFileSync(path.join(a,"IO-PREFLIGHT.json"))));
 });
 test("reject fake .owle target path",()=>{
  const t=path.join(tmp,"not-native.owle");
  assert.throws(()=>exportPlan([source,t]),/NOT_AN_OWLE_GENERATOR/);
  assert.equal(fs.existsSync(t),false);
 });
 test("reject candidate with altered physical-door incidence without writing files",()=>{
  const bad=JSON.parse(fs.readFileSync(source,"utf8"));
  bad.interlockZones[0].doorIds=[];
  const fake=path.join(tmp,"wrong.json"),dest=path.join(tmp,"shouldNotExist");
  fs.writeFileSync(fake,JSON.stringify(bad));
  assert.throws(()=>exportPlan([fake,dest]),/INCIDENT_ZONE_MEMBERSHIP_MISMATCH/);
  assert.equal(fs.existsSync(dest),false);
 });
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
console.log("CAD_IO_EXPORT_QA "+checks+"/"+checks+" PASS NO_TERMINALS_NO_PLC");
