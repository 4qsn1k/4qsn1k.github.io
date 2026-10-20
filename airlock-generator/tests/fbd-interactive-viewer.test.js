"use strict";
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const f=require("../native-timed-fbd-plan.js");
const render=require("../scripts/render-timed-fbd-viewer.js").render;
const candidate=require("../experimental/fixtures/real-cad-1252-1274-candidate.json");
const plan=f.build(candidate);
const html=render(plan);
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,3,"all simulator, hardware selector and UI code embedded");
assert(!/src=(['"])https?:/.test(html),"no remote script dependencies");
assert(/Автоподбор ПР и ПРМ/.test(html));
assert(/Визуальная FBD-цепь/.test(html));
assert(/Только программная симуляция/.test(html));
let tests=0;
function test(label,fn){fn();tests++;console.log("PASS FBD_VIEWER "+label)}
const elements=new Map();
function dom(id){
 if(!elements.has(id))elements.set(id,{
  value:({fire:"1",filter:"selected","sizing-doors":"7","sizing-lamps":"7",
  "sizing-extra-di":"0","sizing-reserve-di":"2","sizing-reserve-do":"2",
  "sizing-network":"rs485-modbus-rtu"})[id]||"",
  textContent:"",innerHTML:"",handlers:{},options:[],
  addEventListener(name,fn){this.handlers[name]=fn},
  appendChild(value){this.options.push(value)}
 });
 return elements.get(id);
}
const buttons=[100,1000,5000,10000].map(step=>({
 dataset:{step:String(step)},handlers:{},
 addEventListener(name,handler){this.handlers[name]=handler}
}));
const document={
 getElementById:dom,
 createElement:()=>({value:"",textContent:""}),
 querySelectorAll:()=>buttons
};
const context=vm.createContext({document,console});
test("inline code parses in isolated browser-like JavaScript context",()=>{
 for(const code of scripts)vm.runInContext(code,context,{timeout:7000});
 assert.match(dom("clock").textContent,/0,0 с/);
 assert.match(dom("hardware-result").innerHTML,/Рекомендуемая конфигурация/);
 assert.match(dom("doors").innerHTML,/D–CNC–1257/);
 assert.match(dom("zones").innerHTML,/Помещение 1257/);
 assert.match(dom("blocks").innerHTML,/TON|AND/);
});
test("interactive 10-second buttons update all netlist TON outputs",()=>{
 buttons[3].handlers.click();
 assert.match(dom("clock").textContent,/10,0 с/);
 assert.match(dom("zones").innerHTML,/ГОТОВО/);
 assert.match(dom("hardware-result").innerHTML,/DI: <strong>9<\/strong>/);
});
test("real door interaction updates FBD stage AND, TON, BUSY",()=>{
 dom("doors").handlers.click({target:{closest:()=>({dataset:{door:"D_CNC_1257"}})}});
 assert.match(dom("doors").innerHTML,/ОТКРЫТА/);
 assert.match(dom("zones").innerHTML,/ДВЕРЬ ОТКРЫТА/);
 assert.match(dom("bolid").innerHTML,/1 \(запрет\)/);
 dom("doors").handlers.click({target:{closest:()=>({dataset:{door:"D_CNC_1257"}})}});
 assert.match(dom("doors").innerHTML,/ЗАКРЫТА/);
 assert.match(dom("bolid").innerHTML,/1 \(запрет\)/);
 buttons[3].handlers.click();
 assert.match(dom("bolid").innerHTML,/0<\/span>/);
});
test("Fire input drops Bolid busy and denies green",()=>{
 dom("fire").value="0";
 dom("fire").handlers.change({target:{value:"0"}});
 assert.match(dom("bolid").innerHTML,/0<\/span>/);
 assert.match(dom("doors").innerHTML,/GREEN: 0/);
});
test("numeric hardware inputs recalculate controller/PRM options",()=>{
 dom("sizing-doors").value="18";
 dom("sizing-doors").handlers.change();
 assert.match(dom("hardware-result").innerHTML,/DI: <strong>20<\/strong>/);
 assert.match(dom("hardware-result").innerHTML,/DO: <strong>38<\/strong>/);
 assert.match(dom("hardware-result").innerHTML,/ПРМ/);
 dom("sizing-doors").value="60";
 dom("sizing-doors").handlers.change();
 assert.match(dom("hardware-result").innerHTML,/Распределённая архитектура/);
 assert.match(dom("hardware-result").innerHTML,/RS-485/);
});
test("reset removes simulated changes without disturbing hardware selections",()=>{
 dom("reset").handlers.click();
 assert.match(dom("clock").textContent,/0,0 с/);
 assert.match(dom("zones").innerHTML,/ВЫДЕРЖКА/);
 assert.equal(dom("sizing-doors").value,"60");
});
console.log("FBD_VISUAL_VIEWER_QA "+tests+"/"+tests+" PASS SELF_CONTAINED_NO_PLC");
