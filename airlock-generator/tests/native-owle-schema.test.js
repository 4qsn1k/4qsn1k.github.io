"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),os=require("node:os"),{spawnSync}=require("node:child_process");
const native=require("../experimental/native-owle-schema.js"),root=path.resolve(__dirname,"..");
const specimen=JSON.parse(fs.readFileSync(path.join(root,"experimental/fixtures/owle-qa012-sanitized-ports-and-connectors.json")));
const signatures=JSON.parse(fs.readFileSync(path.join(root,"experimental/fixtures/fbd-two-native-blocks.sample.json")));
const context=vm.createContext({});
for(const f of ["st-generator.js","project-wiring.js","hardware-planner.js","distributed-planner.js","fbd-generator.js"])
 vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),context,{filename:f});
const fbd=vm.runInContext("AirlockFbdGenerator",context);
let count=0;
const test=(name,fn)=>{fn();count++;console.log("PASS NATIVE-SCHEMA "+name)};
const mutate=(x,fn)=>{const y=structuredClone(x);fn(y);return y};
test("authentic specimen distinguishes described and opaque elements",()=>{
 const report=native.inspectEvidence(specimen);
 assert.equal(native.inspectEvidence({...specimen,counts:{connectors:16,elements:25}}).status,"NATIVE_STRUCTURE_FIXTURE_PASS");
 assert.equal(report.status,"NATIVE_STRUCTURE_FIXTURE_PASS");assert.equal(report.fullyDescribedElements,5);assert.equal(report.opaqueElements,20);
 assert.equal(report.nativeDocument,null);assert.equal(report.usableForSerialization,false);assert(report.missing.includes("ST_DEFINITION_INSTANCE_AND_MODIFICATION_REFERENCES"));
});
test("strict evidence rejects unknown wrappers, primitives, duplicated ports, wrong types and incomplete OR",()=>{
 for(const edit of [
  x=>x.examples[0].discriminator=99,
  x=>x.examples[0].wrapperKeys.push("InventedDefault"),
  x=>x.examples[0].primitiveFieldShapes.push(["Discriminator","InventedPrimitive"]),
  x=>x.examples.find(e=>e.role==="ROOM_A").ports[1].name="Input0",
  x=>x.examples.find(e=>e.role==="ROOM_A").ports[0].dataType=3,
  x=>x.examples.find(e=>e.role==="ROOM_A").ports.find(p=>p.name==="Output6").dataType=0,
  x=>x.examples.find(e=>e.role==="OR_SHARED").ports[0].isFloating=false,
  x=>x.edges.find(e=>e.to.element==="OR_SHARED").to.port="Input9",
  x=>x.edges.splice(x.edges.findIndex(e=>e.to.element==="OR_SHARED"),1),
  x=>x.examples.find(e=>e.role==="OR_SHARED").ports.pop(),
  x=>x.edges[0].connectorKeys.push("InventedDefault"),
  x=>x.edges[0].from.element="UNPUBLISHED_ELEMENT"
 ])assert.throws(()=>native.inspectEvidence(mutate(specimen,edit)));
});
test("reference subset has fresh UUIDs, fanout and five observed links, no geometry assumptions",()=>{
 const graph=native.specimenReferences(specimen);assert(native.validateReferences(graph));
 assert.equal(graph.elements.length,5);assert.equal(graph.connectors.length,5);assert.equal(graph.nativeDocument,null);
 const input=graph.elements.find(e=>e.role==="INPUT_SHARED").ports[0];
 assert.equal(graph.connectors.filter(e=>e.FromPortUId===input.id).length,2);
 assert(!JSON.stringify(graph).includes('"Points"'));assert(!JSON.stringify(graph).includes('"OrderExecution"'));
});
test("GUID lookup is case insensitive; all identities and ST references remap consistently",()=>{
 const graph=native.specimenReferences(specimen);
 graph.connectors.forEach(e=>{e.FromPortUId=e.FromPortUId.toUpperCase();e.ToPortUId=e.ToPortUId.toUpperCase()});
 graph.elements.filter(e=>e.definitionId).forEach(e=>e.definitionId=e.definitionId.toUpperCase());
 assert(native.validateReferences(graph));
 const before=JSON.stringify(graph),again=native.remapReferences(graph);
 assert.equal(JSON.stringify(graph),before);assert(native.validateReferences(again));
 const ids=x=>[...x.definitions.map(d=>d.id),...x.elements.flatMap(e=>[e.id,...e.ports.map(p=>p.id)]),...x.connectors.map(e=>e.id)].map(s=>s.toLowerCase());
 const old=new Set(ids(graph));assert(ids(again).every(id=>!old.has(id)));
 const source=JSON.stringify(signatures);assert(ids(again).every(id=>!source.includes(id)));
});
test("negative reference tests reject dangling GUIDs, namespace collisions, UDINT wiring and unresolved ST",()=>{
 const graph=native.specimenReferences(specimen);
 for(const edit of [
  g=>g.connectors[0].ToPortUId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  g=>g.connectors[0].ToPortUId=g.elements[0].id,
  g=>g.elements[0].ports[0].id=g.elements[1].ports[0].id.toUpperCase(),
  g=>g.connectors.find(c=>c.ToPortUId===g.elements.find(e=>e.role==="OR_SHARED").ports[0].id).FromPortUId=g.elements.find(e=>e.role==="ROOM_A").ports.find(p=>p.type==="UDINT").id,
  g=>g.elements.find(e=>e.role==="ROOM_A").definitionId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  g=>g.elements.find(e=>e.role==="ROOM_A").definitionId=g.elements.find(e=>e.role==="ROOM_B").definitionId,
  g=>g.connectors=g.connectors.filter(c=>c.ToPortUId!==g.elements.find(e=>e.role==="OR_SHARED").ports[0].id),
  g=>g.connectors[1].ToPortUId=g.connectors[0].ToPortUId,
  g=>g.elements[0].ports[0].type="BOOL=6",
  g=>g.nativeDocument={},
  g=>g.elements[0].rawSourceId=g.elements[0].id,
  g=>g.connectors[0].Points=[],
  g=>g.elements[0].role="UNKNOWN"
 ])assert.throws(()=>native.validateReferences(mutate(graph,edit)));
});
function demo(){
 const model=JSON.parse(fs.readFileSync(path.join(root,"model.json")));
 const topology={roomOwners:{"1":"PLC1","4":"PLC1"},doorInputOwners:{},doorOutputOwners:{},alarmOwner:"PLC1"};
 for(const d of model.doors){topology.doorInputOwners[d.id]="PLC1";topology.doorOutputOwners[d.id]="PLC1"}
 return fbd.build(model,{topology,hardware:{primary:{family:"PR103",baseDi:16,baseDo:16,modules:[]},secondary:[],link:"none",signaling:"room"}});
}
test("adapter reuses typed plan and ST signatures; every node/edge is accounted for",()=>{
 const p=demo(),before=JSON.stringify(p),r=native.mapPlan(fbd,p,specimen,signatures);
 assert.equal(JSON.stringify(p),before);
 assert.equal(r.mappedNodes.filter(n=>n.kind==="ROOM_FB").length,2);
 assert.equal(r.mappedNodes.find(n=>n.node==="FINAL_BLOCK_D_1_4").discriminator,18);
 for(const role of ["ROOM_A","ROOM_B"]){
  const n=r.mappedNodes.find(n=>n.evidenceRole===role);
  assert.equal(n.ports.find(p=>p.type==="UDINT").nativeName,"Output6");
 }
 assert.equal(r.coverage.mappedNodes+r.coverage.blockedNodes,p.nodes.length);
 assert.equal(r.coverage.mappedEdges+r.coverage.blockedEdges,p.edges.length);
 assert(r.blockedNodes.some(n=>n.kind==="QUALIFIED_REED"));assert(r.blockedNodes.some(n=>n.kind==="DOOR_GREEN"));
 assert(!r.mappedEdges.some(e=>e.from.node==="DI:CLOSED_D_1_4"&&e.to.node==="FB_Room_N1"));
 assert.equal(r.nativeDocument,null);assert.equal(r.usableForSerialization,false);
 assert.equal(r.status,"SERIALIZATION_BLOCKED_INCOMPLETE_NATIVE_FIXTURE");
 assert.equal(JSON.stringify(r),JSON.stringify(native.mapPlan(fbd,p,specimen,signatures)));
});
test("four-room plan never fabricates unknown FB signatures or remote guard templates",()=>{
 const p=fbd.build(JSON.parse(fs.readFileSync(path.join(root,"experimental/fixtures/fbd-four-rooms.model.json"))));
 const r=native.mapPlan(fbd,p,specimen,signatures);
 assert(r.blockedNodes.some(n=>n.kind==="ROOM_FB"));assert(r.blockedNodes.some(n=>n.kind==="REMOTE"));
 assert(!r.mappedEdges.some(e=>e.from.controller!==e.to.controller));
 assert.equal(r.coverage.nodes,p.nodes.length);assert.equal(r.coverage.edges,p.edges.length);
});
test("CLI writes hash-covered reports only, refuses overwrite and OWLE destinations",()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-native-"));
 try{
  const model=path.join(root,"experimental/fixtures/fbd-four-rooms.model.json"),out=path.join(temp,"reports");
  const run=dest=>spawnSync(process.execPath,[path.join(root,"scripts/export-native-evidence.js"),model,dest],{encoding:"utf8"});
  assert.equal(run(out).status,0);
  const manifest=JSON.parse(fs.readFileSync(path.join(out,"manifest.json")));
  for(const [name,digest]of Object.entries(manifest.files))assert.equal(native.hash(fs.readFileSync(path.join(out,name))),digest);
  assert(!fs.readdirSync(out).some(n=>n.endsWith(".owle")));
  const snapshot=fs.readFileSync(path.join(out,"manifest.json"),"utf8");assert.equal(run(out).status,1);
  assert.equal(fs.readFileSync(path.join(out,"manifest.json"),"utf8"),snapshot);
  const rejected=path.join(temp,"test.owle");assert.equal(run(rejected).status,1);assert(!fs.existsSync(rejected));
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
console.log(`NATIVE_SCHEMA_QA ${count}/${count} PASS; NEEDS_NATIVE_GUI; PHYSICAL_NOT_TESTED`);
