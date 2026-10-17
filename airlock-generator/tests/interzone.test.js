/* node tests/interzone.test.js — independent reference logic, NOT Owen Logic. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const load=(file,symbol)=>vm.runInNewContext(fs.readFileSync(path.join(root,file),"utf8")+"\n"+symbol,{});
const bench=load("st-testbench.js","AirlockStTestbench");
const wiring=load("project-wiring.js","AirlockProjectWiring");
const integration=load("interzone-testbench.js","AirlockInterzoneTestbench");
const model=JSON.parse(fs.readFileSync(path.join(root,"model.json"),"utf8"));
const run=(id,description,fn)=>{
 fn();console.log("PASS "+id+" "+description);
};
const create=()=>integration.create(model,bench,wiring);
const expectRequest=(s,door,fromRoom,expected)=>{
 const sources=s.requestSources[door];
 assert(sources,door+" has no sources");
 const x=sources.find(x=>x.roomId===String(fromRoom));
 assert(x,"missing room "+fromRoom+" for "+door);
 assert.equal(x.requested,expected,door+" room "+fromRoom);
};
const bothReady=t=> {
 const s=t.step({},30500);
 assert.equal(s.rooms["1"].state,10);
 assert.equal(s.rooms["4"].state,10);
 return s;
};
run("QA-OR-012A","N1 purge + N4 ready still inhibits shared 1-4",()=>{
 const t=create(),s=t.step({},100);
 assert.equal(s.rooms["1"].state,30);
 assert.equal(s.rooms["4"].state,10);
 expectRequest(s,"1-4","1",true);
 expectRequest(s,"1-4","4",false);
 assert.equal(s.blocked["1-4"],true);
 assert.equal(s.traffic["1-4"].logicalGreenPermit,false);
});
run("QA-OR-012B","N4 other door opened blocks shared 1-4 while N1 ready",()=>{
 const t=create();bothReady(t);
 const s=t.step({Closed:{"3-4":false}},100);
 assert.equal(s.rooms["1"].state,10);
 assert.equal(s.rooms["4"].state,20);
 expectRequest(s,"1-4","1",false);
 expectRequest(s,"1-4","4",true);
 assert.equal(s.blocked["1-4"],true);
 assert.equal(s.traffic["1-4"].logicalGreenPermit,false);
});
run("QA-OR-012C","Both room READY => no shared inhibit, permitted in model",()=>{
 const t=create(),s=bothReady(t);
 assert.equal(s.blocked["1-4"],false);
 assert.equal(s.traffic["1-4"].logicalGreenPermit,true);
 assert.equal(t.plan.inputs.filter(x=>x.doorId==="1-4").length,1);
 assert.equal(s.requestSources["1-4"].length,2);
});
run("QA-OR-012D","Shared 1-4 reed opens once but reaches both room FBs",()=>{
 const t=create();bothReady(t);
 const s=t.step({Closed:{"1-4":false}},100);
 assert.equal(s.inputs.Closed["1-4"],false);
 assert.equal(s.rooms["1"].state,20);
 assert.equal(s.rooms["4"].state,20);
 assert.equal(s.blocked["1-4"],false);
 assert.equal(s.blocked["1-2"],true);
 assert.equal(s.blocked["1-5"],true);
 assert.equal(s.blocked["2-4"],true);
 assert.equal(s.blocked["3-4"],true);
 assert.equal(s.blocked["4-6"],true);
 assert.equal(s.traffic["1-4"].logicalGreenPermit,false);
});
run("QA-OR-012E","Closing shared door releases N4 but N1 runs full purge",()=>{
 const t=create();bothReady(t);
 t.step({Closed:{"1-4":false}},100);
 let s=t.step({Closed:{"1-4":true}},100);
 assert.equal(s.rooms["1"].state,30);
 assert.equal(s.rooms["4"].state,10);
 assert.equal(s.blocked["1-4"],true);
 assert.equal(s.traffic["1-4"].logicalGreenPermit,false);
 s=t.step({},20000);
 assert.equal(s.rooms["1"].state,30);
 assert.equal(s.blocked["1-4"],true);
 s=t.step({},11000);
 assert.equal(s.rooms["1"].state,10);
 assert.equal(s.rooms["4"].state,10);
 assert.equal(s.blocked["1-4"],false);
 assert.equal(s.traffic["1-4"].logicalGreenPermit,true);
});
run("QA-OR-012F","Fire removes both software requests; green never lights",()=>{
 const t=create();bothReady(t);
 const s=t.step({FireNormal:false},100);
 assert.equal(s.rooms["1"].state,99);
 assert.equal(s.rooms["4"].state,99);
 assert.equal(s.blocked["1-4"],false);
 for(const id of t.controlledDoorIds){
  assert.equal(s.blocked[id],false,id);
  assert.equal(s.traffic[id].logicalGreenPermit,false,id);
 }
});
run("QA-OR-012G","Unrecognized physical reed is rejected",()=>{
 const t=create();
 assert.throws(()=>t.step({Closed:{"unknown":false}},100),/Unknown controlled reed/);
});
run("QA-OR-012H","Reopening shared door during N1 purge restarts delay",()=>{
 const t=create();bothReady(t);
 t.step({Closed:{"1-4":false}},100);
 t.step({Closed:{"1-4":true}},100);
 let s=t.step({},22000);
 assert.equal(s.rooms["1"].state,30);
 s=t.step({Closed:{"1-4":false}},100);
 assert.equal(s.rooms["1"].state,20);
 assert.equal(s.rooms["4"].state,20);
 s=t.step({Closed:{"1-4":true}},100);
 assert.equal(s.rooms["1"].state,30);
 assert.equal(s.rooms["4"].state,10);
 s=t.step({},13000);
 assert.equal(s.blocked["1-4"],true);
 s=t.step({},18000);
 assert.equal(s.rooms["1"].state,10);
 assert.equal(s.blocked["1-4"],false);
});
run("QA-OR-012I","Alarm from either zone propagates to ANY_ALARM",()=>{
 const t=create();bothReady(t);
 let s=t.step({Closed:{"3-4":false}},31500);
 assert.equal(s.rooms["4"].alarm,true);
 assert.equal(s.rooms["1"].alarm,false);
 assert.equal(s.alarm,true);
 s=t.step({Closed:{"3-4":true}},100);
 assert.equal(s.alarm,false);
});
console.log("REFERENCE_INTERZONE_TESTS_PASS 9/9 — NOT A NATIVE OWEN LOGIC QA-OL-012 PASS");
