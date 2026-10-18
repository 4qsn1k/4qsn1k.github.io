"use strict";
// Structural evidence only. This fixture is NOT a generated or compilable OWLE.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const p=path.join(__dirname,"..","experimental","fixtures","owle-qa012-sanitized-ports-and-connectors.json");
const raw=fs.readFileSync(p,"utf8"),x=JSON.parse(raw);
assert.equal(x.schema,"airlock-owle-test-metadata/1");
assert.deepEqual(x.counts,{elements:25,connectors:16});
assert.equal(x.edges.length,16);assert.equal(x.examples.length,5);
assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw));
assert(!/FUNCTION_BLOCK|VAR_INPUT|END_FUNCTION_BLOCK/.test(raw));
const roles=Object.fromEntries(x.examples.map(e=>[e.role,e]));
for(const [role,code,count]of [["OR_SHARED",18,3],["ROOM_A",41,18],["ROOM_B",41,21],["INPUT_SHARED",2,1],["OUTPUT_OR",3,1]]){
 assert.equal(roles[role].discriminator,code);
 assert.equal(roles[role].nativePortCount,count);
 const names=new Set(roles[role].ports.map(p=>p.name));assert.equal(names.size,count);
}
for(const edge of x.edges){
 for(const end of [edge.from,edge.to]){
  if(roles[end.element]){
   assert(roles[end.element].ports.some(p=>p.name===end.port),"unknown native port "+end.element+"."+end.port);
  }
 }
 assert(edge.connectorKeys.includes("FromPortUId")&&edge.connectorKeys.includes("ToPortUId"));
}
const links=new Set(x.edges.map(e=>e.from.element+"."+e.from.port+" -> "+e.to.element+"."+e.to.port));
for(const expected of [
 "INPUT_SHARED.Output0 -> ROOM_A.Input3",
 "INPUT_SHARED.Output0 -> ROOM_B.Input2",
 "ROOM_A.Output8 -> OR_SHARED.Input0",
 "ROOM_B.Output7 -> OR_SHARED.Input1",
 "OR_SHARED.Output2 -> OUTPUT_OR.Input0"
])assert(links.has(expected),"missing native link "+expected);
assert.deepEqual(roles.OR_SHARED.ports.map(p=>p.dataType),[0,0,0]);
assert.deepEqual(roles.OR_SHARED.ports.map(p=>p.portType),[0,0,1]);
assert.equal(x.validation.newNativeSerializerValidated,false);
assert.equal(x.validation.realPLCConnected,false);
console.log("OWLE_SANITIZED_SHAPE_PASS 25_ELEMENTS 16_NATIVE_EDGES 5_CRITICAL_LINKS; NOT_NATIVE_COMPILER_QA");
