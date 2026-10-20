#!/usr/bin/env node
/* Deterministic, OFFLINE primitive FBD wiring plan export (NOT Owen .owle).
 * Refuses any existing destination or .owle path. Never uses serial I/O.
 */
"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const f=require("../native-timed-fbd-plan.js");
const abort=s=>{throw Error(s)};
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const json=v=>JSON.stringify(v,null,2)+"\n";
const csvItem=v=>'"'+String(v??"").replaceAll('"','""')+'"';
const csv=rows=>"\uFEFF"+rows.map(row=>row.map(csvItem).join(";")).join("\r\n")+"\r\n";
function main(argv){
 if(argv.length!==2)abort("USAGE: node scripts/export-native-timed-fbd-plan.js <candidate.json> <NEW output directory>");
 const [source,destination]=argv.map(x=>path.resolve(x));
 if(!fs.statSync(source).isFile())abort("CANDIDATE_IS_NOT_FILE");
 if(path.extname(destination).toLowerCase()===".owle")abort("REFUSE_VENDOR_OWLE_DESTINATION");
 if(fs.existsSync(destination))abort("REFUSE_OVERWRITE_EXISTING_OUTPUT_DIR");
 const raw=fs.readFileSync(source);
 if(raw.byteLength>1024*1024)abort("CANDIDATE_TOO_LARGE");
 const candidate=JSON.parse(raw.toString("utf8").replace(/^\uFEFF/,""));
 const plan=f.build(candidate);
 f.validate(plan);
 const rows=[["From node.port","To node.port","Virtual-only"],...plan.edges.map(e=>[e.from,e.to,"NO_PLC_TERMINALS"])];
 const guide=[
  "# Vendor-native FBD construction plan (offline only)",
  "",
  "This is NOT a real Owen Logic .owle, not a compiled PLC application.",
  "No motor, lock, reader, relay, or fire-system terminal is assigned.",
  "",
  "## Schematic recipe",
  "",
  "Create six independent BOOL AND(all closed) -> BOOL AND(FireNormal) -> native TON blocks",
  "with exact 10-second preset. A TON input becoming FALSE resets its timer.",
  "For each door+room incidence: AND(doorClosed, NOT(TON.Q), FireNormal).",
  "Combine the two incident-room requests using OR for internal shared doors.",
  "Logical GREEN = AND(doorClosed, FireNormal, all incident TON.Q).",
  "Bolid BUSY for CNC to 1257 = AND(FireNormal, NOT(TON of zone 1257.Q)).",
  "The Bolid reader shall exist ONLY at the CNC entry. No other readers.",
  "",
  "## Verified offline size",
  "",
  "- 6 independent TON primitive blocks, preset 10 seconds",
  "- 7 logical door-reed input ports (all unique)",
  "- "+plan.nodes.length+" virtual nodes including INPUT/OUTPUT placeholders",
  "- "+plan.edges.length+" typed BOOL wire connections",
  "",
  "## Required vendor gates before any .owle claim",
  "",
  "- Obtain an Owen Logic GUI-SAVED pure-native BOOL TON(10s) sample",
  "- Inspect its actual time-unit enum, port layout, templates and UUID fields",
  "- Preserve hardware pin index semantics and vendor metadata",
  "- Serialize NEW isolated test .owle, open, Save As, Compile and Simulate",
  "- Test three-door zone 1257, two-branch convergence at 1252, re-opening",
  "- Validate hardware DI/DO budget on a specific real PR100/PR103 configuration",
  "- Separate logic of physical lock type, S2000-2 BUSY, faults, fire and egress",
  "",
  "The original candidate is not a deployable controller configuration.",
  "No ST, real hardware outputs, fire safety acceptance, timer calibration",
  "or native vendor compile is claimed.",
  ""
 ].join("\n");
 const generated={
  "primitive-netlist.json":json(plan),
  "wires.csv":csv(rows),
  "vendor-native-next-steps.md":guide
 };
 const hashes=Object.fromEntries(Object.entries(generated).map(([n,body])=>[n,sha(Buffer.from(body))]));
 const manifest={
  schema:"airlock-timed-fbd-export-manifest/1",
  candidateSha256:sha(raw),
  files:hashes,sourceRef:path.basename(source),
  counts:{zones:plan.groups.length,doors:plan.doors.length,
   tonBlocks:plan.nodes.filter(x=>x.kind==="TON").length,
   nodes:plan.nodes.length,edges:plan.edges.length},
  noStructuredText:true,
  outputIsOwenOwle:false,
  physicalDevicesWritten:0,
  qualification:"OFFLINE_NETLIST_ONLY_NATIVE_EDITOR_AND_PLC_UNVERIFIED"
 };
 // Directory created only after ALL in-memory validation succeeds.
 fs.mkdirSync(destination,{recursive:false});
 let ok=false;
 try{
  for(const [name,body]of Object.entries({...generated,"sha256-manifest.json":json(manifest)})){
   fs.writeFileSync(path.join(destination,name),body,{flag:"wx"});
  }
  ok=true;
 }finally{
  if(!ok)fs.rmSync(destination,{recursive:true,force:true});
 }
 console.log("NATIVE_TIMED_FBD_EXPORT_PASS "+JSON.stringify(manifest.counts)+" OFFLINE_ONLY");
 console.log("EXPORT_DIR "+destination);
 return manifest;
}
if(require.main===module){
 try{main(process.argv.slice(2))}
 catch(e){console.error("NATIVE_TIMED_FBD_EXPORT_REFUSED",e.message);process.exitCode=1}
}
module.exports={main};
