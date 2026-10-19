#!/usr/bin/env node
"use strict";
// Offline-only export. Reads a model and writes a NEW output directory.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const [modelPath,outPath]=process.argv.slice(2);
if(!modelPath||!outPath){console.error("Usage: node scripts/export-fbd-plan.js model.json NEW_OUTPUT_DIRECTORY");process.exit(2)}
const root=path.resolve(__dirname,".."),dest=path.resolve(outPath);
const context=vm.createContext({});
for(const f of ["st-generator.js","project-wiring.js","hardware-planner.js","distributed-planner.js","fbd-generator.js"])
 vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),context,{filename:f});
const fbd=vm.runInContext("AirlockFbdGenerator",context);
try{
 const model=JSON.parse(fs.readFileSync(modelPath,"utf8"));
 const plan=fbd.build(model);
 const fixtureBytes=fs.readFileSync(path.join(root,"experimental/fixtures/fbd-two-native-blocks.sample.json"));
 const evidence=fbd.nativeEvidence(plan,JSON.parse(fixtureBytes));
 evidence.sourceFixtureSha256=crypto.createHash("sha256").update(fixtureBytes).digest("hex");
 const files={"fbd-plan.json":JSON.stringify(plan,null,2)+"\n","connection-matrix.csv":fbd.matrix(plan),
  "native-test-plan.md":fbd.nativeTestPlan(plan),"native-evidence.json":JSON.stringify(evidence,null,2)+"\n",
  ...Object.fromEntries(plan.blocks.map(b=>[b.blockName+".st",b.st]))};
 const hashes=Object.fromEntries(Object.entries(files).map(([name,body])=>[name,crypto.createHash("sha256").update(body).digest("hex")]));
 // Refuse existing directories/files to preserve user work and source files.
 fs.mkdirSync(dest,{recursive:false});
 for(const [name,body] of Object.entries(files))fs.writeFileSync(path.join(dest,name),body,{flag:"wx"});
 fs.writeFileSync(path.join(dest,"sha256.json"),JSON.stringify(hashes,null,2)+"\n",{flag:"wx"});
 console.log("FBD_PLAN_PASS: "+plan.blocks.length+" room blocks, "+plan.doors.length+" doors; output "+dest);
 console.log("NEEDS_NATIVE_GUI; PHYSICAL_PASS: NOT_TESTED; no .owle serialization or terminal assignment");
}catch(e){console.error(e.message);process.exitCode=1}
