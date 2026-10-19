"use strict";
// Report only; never writes OWLE. A new output directory is mandatory.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const native=require("../experimental/native-owle-schema.js");
const root=path.resolve(__dirname,"..");
function run(args){
 if(args.length!==2||args.some(a=>a.startsWith("--")))throw Error("Usage: node scripts/export-native-evidence.js MODEL_JSON NEW_REPORT_DIRECTORY (OWLE serialization blocked: incomplete native fixture)");
 const [source,destination]=args,dest=path.resolve(destination);
 if(dest.toLowerCase().endsWith(".owle"))throw Error("SERIALIZATION_BLOCKED_INCOMPLETE_NATIVE_FIXTURE");
 const context=vm.createContext({});
 for(const f of ["st-generator.js","project-wiring.js","hardware-planner.js","distributed-planner.js","fbd-generator.js"])
  vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),context,{filename:f});
 const fbd=vm.runInContext("AirlockFbdGenerator",context),plan=fbd.build(JSON.parse(fs.readFileSync(source,"utf8")));
 const read=name=>fs.readFileSync(path.join(root,"experimental/fixtures",name));
 const shapeBytes=read("owle-qa012-sanitized-ports-and-connectors.json"),signatureBytes=read("fbd-two-native-blocks.sample.json");
 const specimen=JSON.parse(shapeBytes),report=native.mapPlan(fbd,plan,specimen,JSON.parse(signatureBytes));
 report.sourceFixtureSha256=native.hash(shapeBytes);report.signatureFixtureSha256=native.hash(signatureBytes);
 const reference=native.specimenReferences(specimen);
 const files={"native-mapping-report.json":JSON.stringify(report,null,2)+"\n",
  "specimen-reference-graph.json":JSON.stringify(reference,null,2)+"\n",
  "shape-inspection.json":JSON.stringify(native.inspectEvidence(specimen),null,2)+"\n"};
 const manifest={schema:"airlock-native-report-manifest/1",status:report.status,nativeDocument:null,
  files:Object.fromEntries(Object.entries(files).map(([name,body])=>[name,native.hash(body)])),
  sourceModelSha256:native.hash(fs.readFileSync(source)),nativeGui:"NEEDS_NATIVE_GUI",physical:"PHYSICAL_NOT_TESTED"};
 fs.mkdirSync(dest,{recursive:false});
 for(const [name,body]of Object.entries(files))fs.writeFileSync(path.join(dest,name),body,{flag:"wx"});
 fs.writeFileSync(path.join(dest,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
 console.log(report.status+"; NATIVE_STRUCTURE_FIXTURE_PASS; NEEDS_NATIVE_GUI; no .owle written");
}
try{run(process.argv.slice(2))}catch(e){console.error(e.message);process.exitCode=1}
