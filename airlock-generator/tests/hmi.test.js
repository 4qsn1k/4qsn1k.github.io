/* node tests/hmi.test.js */
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const model=JSON.parse(read("model.json"));
const engine=vm.runInNewContext(read("engine.js")+"\nAirlockEngine",{});
const toolbar={append(){}},dummy={closest:()=>toolbar};
const buttons={},capturedExports=[];
const browser={
  getElementById:()=>dummy,
  createElement:()=>({style:{},click(){},remove(){}}),
  body:{append(){}}
};
toolbar.append=el=>{if(el.id)buttons[el.id]=el};
const windowMock={};
const context=vm.createContext({
  document:browser,
  window:windowMock,
  model,
  AirlockEngine:engine,
  Blob:class{constructor(parts){this.body=parts.join("")}},
  URL:{createObjectURL(blob){capturedExports.push(blob.body);return "blob:test"},revokeObjectURL(){}},
  setTimeout(){},alert(message){throw Error(message)}
});
vm.runInContext(read("project-package.js"),context);
vm.runInContext(read("hmi-export.js"),context);
assert.equal(windowMock.AirlockProjectPackage,undefined,"top-level const is a lexical binding, not a Window property");
buttons.exportProjectScada.onclick();
const scada=JSON.parse(capturedExports[0]);
assert.equal(scada.schema,"airlock-scada-project/1");assert.equal(scada.model.doors.length,model.doors.length);
const manifest=windowMock.airlockHmiExport.buildSignalMap(model);
assert.equal(manifest.schema,"airlock-hmi-bindings/0.1");
assert.equal(manifest.lightGroups.length,model.rooms.filter(r=>engine.roomMode(r)!=="none").length);
assert(manifest.lightGroups.some(g=>g.roomId==="4"));
assert(manifest.lightGroups.some(g=>g.roomId==="1"));
assert.equal(manifest.lightGroups.reduce((n,g)=>n+g.fixtures.length,0),7);
assert(manifest.signals.every(s=>s.address===null&&s.controllerId===null));
assert.equal(new Set(manifest.signals.map(s=>s.signal)).size,manifest.signals.length);
for(const group of manifest.lightGroups){
 assert(manifest.signals.some(s=>s.signal===group.redOutputSignal));
 assert(manifest.signals.some(s=>s.signal===group.greenOutputSignal));
 for(const fixture of group.fixtures){
  const door=model.doors.find(d=>d.id===fixture.doorId);
  assert(door&&[door.a,door.b].includes(group.roomId));
 }
}
const html=read("monitor.html");
assert(html.includes('<script id="modelData" type="application/json">'));
assert(html.includes('window.airlockHmi=Object.freeze({applyFrame(frame)'));
assert(html.includes('if(state.source==="live"&&Date.now()-state.updatedAt>10000)'));
assert(html.includes('state.source==="offline"'));
assert(html.includes('state.source==="demo"'));
const embedded=html.match(/<script id="modelData" type="application\/json">([\s\S]*?)<\/script>/);
assert(embedded);
const sample=JSON.parse(embedded[1]);
assert.equal(sample.rooms.length,model.rooms.length);
assert.equal(sample.doors.length,model.doors.length);
const inline=html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);
assert(inline);
new Function(inline[1]);
const js=read("hmi-export.js");
new Function(js);
console.log("PASS HMI standalone template with embedded project");
console.log("PASS demo and stale-telemetry defensive rendering");
console.log("PASS physical traffic-light catalogue: "+manifest.lightGroups.length+" groups");
console.log("PASS unassigned signal inventory: "+manifest.signals.length+" signals");
console.log("PASS SCADA browser lexical module export produces valid portable JSON");
console.log("ALL HMI UNIT CHECKS PASSED");
