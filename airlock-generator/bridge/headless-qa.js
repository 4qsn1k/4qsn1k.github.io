#!/usr/bin/env node
"use strict";
/*
 * Headless QA for Airlock Generator JS reference logic.
 * NOT the native Owen Logic simulator, not PLC or physical I/O validation.
 * Command: node bridge/headless-qa.js [--out <directory>]
 */
const fs=require("node:fs"), path=require("node:path"),
  vm=require("node:vm"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const read=n=>fs.readFileSync(path.join(root,n),"utf8");
const modelText=read("model.json"),benchText=read("st-testbench.js"),
  genText=read("st-generator.js"),model=JSON.parse(modelText);
const bench=vm.runInNewContext(benchText+"\nAirlockStTestbench",{}),
  generator=vm.runInNewContext(genText+"\nAirlockStGenerator",{});
const args=process.argv.slice(2);
if(args.length && (args.length!==2||args[0]!=="--out"))throw Error("Usage: node headless-qa.js [--out dir]");
const outDir=args.length?path.resolve(args[1]):path.join(__dirname,"reports");
let active=null;const tests=[];
const eq=(a,b,what)=>assert.equal(a,b,what);
function capture(label,s){active.steps.push({label,...JSON.parse(JSON.stringify(s))});return s}
function test(id,description,fn){
  const t={id,description,status:"PASS",steps:[]};active=t;
  try{fn()}catch(e){t.status="FAIL";t.error=String(e.stack||e)}
  active=null;tests.push(t);
  console.log(t.status+" "+id+" "+description);
  if(t.error)console.error(t.error);
}
const make=id=>bench.create(model,id);
function allBlocks(state,ids,val){
  for(const id of ids)eq(state.blocked[id],val,"Block "+id);
}
function ready(t){
  eq(capture("startup",t.step({},100)).state,30,"initial purge");
  const s=capture("after initial purge",t.step({},30300));
  eq(s.state,10,"ready state");return s;
}
test("QA-MODEL-001","Initial purge followed by ready",()=>{
  const t=make("1"),s=ready(t);
  eq(s.green,true,"green");eq(s.red,false,"red");allBlocks(s,t.doorIds,false);
});
test("QA-MODEL-002","Open 1-2 blocks the other doors",()=>{
  const t=make("1");ready(t);
  const s=capture("open 1-2",t.step({Closed:{"1-2":false}},100));
  eq(s.state,20,"open");eq(s.red,true,"red");
  eq(s.blocked["1-2"],false,"passage");allBlocks(s,["1-4","1-5"],true);
});
test("QA-MODEL-003","Opening during purge restarts full 30 seconds",()=>{
  const t=make("1");ready(t);
  eq(capture("open",t.step({Closed:{"1-2":false}},100)).state,20,"open");
  eq(capture("close",t.step({Closed:{"1-2":true}},100)).state,30,"first purge");
  eq(capture("20 seconds",t.step({},20000)).state,30,"first purge pending");
  eq(capture("reopen",t.step({Closed:{"1-2":false}},100)).state,20,"cancel purge");
  eq(capture("reclose",t.step({Closed:{"1-2":true}},100)).state,30,"restart purge");
  const before=capture("12 seconds after reclose",t.step({},12000));
  eq(before.state,30,"must not reuse previous timer");
  eq(before.green,false,"no green early");allBlocks(before,t.doorIds,true);
  const after=capture("30.5 seconds after reclose",t.step({},18500));
  eq(after.state,10,"ready only after fresh purge");
  eq(after.green,true,"green");allBlocks(after,t.doorIds,false);
});
test("QA-MODEL-004","Door open longer than 30 seconds gives alarm",()=>{
  const t=make("1");ready(t);
  let s=capture("open 29 sec",t.step({Closed:{"1-2":false}},29000));
  eq(s.alarm,false,"no early alarm");
  s=capture("open 30.1 sec",t.step({},1100));
  eq(s.alarm,true,"alarm on");eq(s.overtime["1-2"],true,"overtime output");
  s=capture("door closed",t.step({Closed:{"1-2":true}},100));
  eq(s.alarm,false,"clear alarm");eq(s.state,30,"purge");
});
test("QA-MODEL-005","Two doors opened latch fault",()=>{
  const t=make("1");ready(t);
  let s=capture("two doors open",t.step({Closed:{"1-2":false,"1-4":false}},100));
  eq(s.fault,true,"fault");eq(s.state,90,"fault state");
  s=capture("both closed",t.step({Closed:{"1-2":true,"1-4":true}},100));
  eq(s.fault,true,"latched");
  s=capture("reset",t.step({ResetFault:true},100));
  eq(s.fault,false,"reset complete");eq(s.state,30,"purge after reset");
});
test("QA-MODEL-006","Fire releases requests, restore returns to initial purge",()=>{
  const t=make("1");ready(t);
  let s=capture("fire",t.step({FireNormal:false},100));
  eq(s.state,99,"fire state");allBlocks(s,t.doorIds,false);
  s=capture("fire restore",t.step({FireNormal:true},100));
  eq(s.state,0,"reinitialization");
  s=capture("begin purge",t.step({},100));
  eq(s.state,30,"restart purge");
});
test("QA-MODEL-007","Mutual room 4 releases locks immediately",()=>{
  const t=make("4");
  eq(capture("ready",t.step({},100)).state,10,"mutual ready");
  let s=capture("open 3-4",t.step({Closed:{"3-4":false}},100));
  eq(s.state,20,"open");allBlocks(s,t.doorIds.filter(x=>x!=="3-4"),true);
  s=capture("close 3-4",t.step({Closed:{"3-4":true}},100));
  eq(s.state,10,"mutual return");allBlocks(s,t.doorIds,false);
});
test("QA-MODEL-008","Generated ST contains expected interfaces",()=>{
  const a=generator.build(model,"1"),b=generator.build(model,"4");
  assert(a.st.includes("FUNCTION_BLOCK FB_Room_N1"));
  assert(a.st.includes("PurgeTimer(I :="));
  assert(a.st.includes("I_D_1_2_Closed"));
  assert(a.st.includes("O_D_1_2_Block"));
  assert(b.st.includes("FUNCTION_BLOCK FB_Room_N4"));
  assert(!b.st.includes("PurgeTimer"));
  capture("static ST generation",{room1Bytes:a.st.length,room4Bytes:b.st.length});
});
const digest=s=>crypto.createHash("sha256").update(s).digest("hex");
const report={
  kind:"Independent Airlock JS reference model. Not Owen Logic runtime.",
  generatedAt:new Date().toISOString(),
  environment:{node:process.version,platform:process.platform},
  source:{modelSha256:digest(modelText),testbenchSha256:digest(benchText),generatorSha256:digest(genText)},
  passed:tests.filter(x=>x.status==="PASS").length,
  failed:tests.filter(x=>x.status==="FAIL").length,tests
};
fs.mkdirSync(outDir,{recursive:true});
const filename="headless-qa-"+report.generatedAt.replace(/[:.]/g,"-")+".json";
fs.writeFileSync(path.join(outDir,filename),JSON.stringify(report,null,2)+"\n");
fs.writeFileSync(path.join(outDir,"latest.json"),JSON.stringify(report,null,2)+"\n");
const lines=["# Headless Airlock reference model QA","",
 "This is an independent JS MODEL test, NOT native Owen Logic or physical PR100.",
 "","Run: "+report.generatedAt,"",
 "Results: "+report.passed+" PASS / "+report.failed+" FAIL",
 "","| ID | Status | Check |","|---|---|---|"];
for(const t of tests)lines.push("| "+t.id+" | "+t.status+" | "+t.description+" |");
lines.push("","JSON report: "+filename,"");
fs.writeFileSync(path.join(outDir,"latest.md"),lines.join("\n"));
console.log("MODEL_QA_REPORT "+path.join(outDir,filename));
console.log("MODEL_QA_FINAL "+(report.failed?"FAIL":"PASS")+" "+report.passed+"/"+tests.length);
if(report.failed)process.exitCode=1;
