"use strict";
// Read-only census of GUI-saved Owen Logic TEST metadata; no native writer or controller access.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const file=path.join(__dirname,"..","experimental","fixtures","owle-qa012-sanitized-rich-identity-metadata.json");
const text=fs.readFileSync(file,"utf8"),a=JSON.parse(text);
assert.equal(a.schema,"airlock-owle-test-native-rich-evidence/1");
assert.equal(a.status,"READ_ONLY_TEST_METADATA_NOT_SERIALIZABLE");
assert.deepEqual(a.modelSummary,{allElements:25,allConnectors:16,virtualVariables:6,stDefinitions:3});
assert.deepEqual(a.provenance.sourceMembers.map(e=>e.name),["Project","StFunctionBlocks"]);
assert.equal(a.nativeElementExamples.length,5);
assert.equal(a.nativeConnectors.length,16);
assert.equal(a.nativeVariables.length,6);
assert.equal(a.stDefinitionsRedacted.length,3);
assert.equal(a.guarantees.newNativeProjectGenerated,false);
assert.equal(a.guarantees.nativeGuiPass,false);
assert.equal(a.guarantees.hardwareTested,false);
assert(!/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/i.test(text));
assert(!/FUNCTION_BLOCK|END_FUNCTION_BLOCK|VAR_INPUT|\\Users\\|password=/i.test(text));
console.log("PASS OWLE RICH sealed TEST source, no raw UUIDs/code/config");
const byRole=new Map(a.nativeElementExamples.map(e=>[e.role,e.nativeWrapper]));
assert.deepEqual([...byRole.keys()].sort(),["OR_NATIVE","OR_OBSERVER","ROOM_A","ROOM_B","SHARED_DI"].sort());
const ports=new Map(),ids=new Set();let count=0;
for(const [role,wrapper] of byRole){
 const m=wrapper.ElementModel||wrapper.ElementBlockStoreModel?.ElementModel;
 assert(m&&Array.isArray(m.Ports)&&Array.isArray(m.Primitives));
 const anchors=new Set(m.Primitives.filter(x=>typeof x.UniqueId==="string").map(x=>x.UniqueId));
 assert(/^GUID_ALIAS_\d+$/.test(m.UniqueId));
 for(const p of m.Ports){
  assert(!ids.has(p.UniqueId));ids.add(p.UniqueId);
  assert(anchors.has(p.AnchorUniqueId),"dangling native port anchor "+role+"."+p.Name);
  assert.equal(p.ElementOwnerUId,"ZERO_UUID");
  ports.set(p.UniqueId,{role,port:p.Name,type:p.DataType,direction:p.PortType});count++;
 }
}
assert.equal(count,44);
console.log("PASS OWLE RICH 44 native ports and geometry/anchor aliases consistent");
const links=[];
for(const x of a.nativeConnectors){
 assert.equal(x.Discriminator,1);
 const c=x.ConnectorModel;
 assert(/^GUID_ALIAS_\d+$/.test(c.UniqueId));
 assert(Array.isArray(c.Points)&&c.Points.length>=2);
 assert(c.Points.every(p=>Number.isFinite(p.X)&&Number.isFinite(p.Y)));
 const from=ports.get(c.FromPortUId),to=ports.get(c.ToPortUId);
 if(from&&to)links.push(`${from.role}.${from.port} -> ${to.role}.${to.port}`);
}
for(const link of [
 "SHARED_DI.Output0 -> ROOM_A.Input3","SHARED_DI.Output0 -> ROOM_B.Input2",
 "ROOM_A.Output8 -> OR_NATIVE.Input0","ROOM_B.Output7 -> OR_NATIVE.Input1",
 "OR_NATIVE.Output2 -> OR_OBSERVER.Input0"
])assert(links.includes(link),"missing critical connector "+link);
assert.equal(links.length,5);
console.log("PASS OWLE RICH native I4 fanout and OR 5/5 edges");
const defIds=new Set(a.stDefinitionsRedacted.map(d=>d.interface.Id));
const defsById=new Map(a.stDefinitionsRedacted.map(d=>[d.interface.Id,d.interface]));
assert.equal(defIds.size,3);
for(const role of ["ROOM_A","ROOM_B"]){
 const w=byRole.get(role),def=defsById.get(w.FunctionBlockUId);
 assert(def,"unresolved native ST definition "+role);
 assert.equal(def.LastModificationId,w.LastModificationId,"ST version identity mismatch "+role);
 assert(typeof def.Discriminator==="number");
}
assert(a.stDefinitionsRedacted.every(d=>d.sourceLength>0&&/^[a-f0-9]{64}$/.test(d.sourceSha256)));
console.log("PASS OWLE RICH native FB instance-to-ST-definition version aliases match");
const subtype=new Set();
for(const w of byRole.values()){
 const m=w.ElementModel||w.ElementBlockStoreModel?.ElementModel;
 for(const p of m.Ports)subtype.add(p.DataType);
}
assert(subtype.has(0)&&subtype.has(3));
const ref=a.identityGraph.appearanceCounts;
assert.equal(Object.keys(ref).length,a.identityGraph.aliasCount);
assert.equal(a.identityGraph.aliasCount,131);
assert(Object.values(ref).every(x=>Number.isInteger(x)&&x>=1));
console.log("OWLE_RICH_STRUCTURE_PASS 25_ELEMENTS 16_CONNECTORS 131_ID_ALIASES; NOT_NATIVE_GUI_OR_SERIALIZATION");
