/* node tests/st-generator.test.js */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,".."),read=n=>fs.readFileSync(path.join(root,n),"utf8");
const gen=vm.runInNewContext(read("st-generator.js")+"\nAirlockStGenerator",{});
const bench=vm.runInNewContext(read("st-testbench.js")+"\nAirlockStTestbench",{});
const model=JSON.parse(read("model.json"));
const check=(label,fn)=>{fn();console.log("PASS "+label)};
check("ST generator emits a complete FB for purge room 1",()=>{
 const g=gen.build(model,"1");
 assert(g.st.startsWith("// TEST ONLY"));
 assert(g.st.includes("FUNCTION_BLOCK "+g.blockName));
 assert(g.st.includes("PurgeTimer(I :="));
 assert(g.st.includes("O_Red := FireNormal AND NOT O_Ready"));
 assert(g.st.includes("I_D_1_5_Closed"));
 assert.equal(g.doorIds.length,3);
 assert.equal(g.io.filter(x=>x.direction==="input").length,5);
 assert(g.io.every(x=>x.terminal===null&&x.controllerId===null));
});
check("mutual room 4 has four sensors, no purge timer",()=>{
 const g=gen.build(model,"4");
 assert.equal(g.doorIds.length,4);
 assert(!g.st.includes("PurgeTimer"));
 assert(g.st.includes("State := 10;"));
 assert(g.st.includes("O_D_3_4_Block"));
});
check("unsupported room rejected before codegen",()=>{
 assert.throws(()=>gen.build(model,"2"),/режим/);
});
check("all outputs begin unassigned and names are unique",()=>{
 for(const rid of ["1","4"]){
  const g=gen.build(model,rid);
  assert.equal(new Set(g.io.map(x=>x.signal)).size,g.io.length);
  assert(g.io.every(x=>x.terminal==null));
 }
});
check("mutual releases other doors after 80ms closure",()=>{
 const t=bench.create(model,"4");
 assert(t.step({},100).green);
 let s=t.step({Closed:{"3-4":false}},40);
 assert(s.blocked["1-4"]&&!s.blocked["3-4"]);
 s=t.step({Closed:{"3-4":true}},100);
 assert(s.green&&!Object.values(s.blocked).some(Boolean));
});
check("purge holds others blocked for full 30s",()=>{
 const t=bench.create(model,"1");
 t.step({},30500);
 let s=t.step({Closed:{"1-5":false}},40);
 assert(s.blocked["1-2"]&&!s.blocked["1-5"]);
 t.step({Closed:{"1-5":true}},100);
 s=t.step({},29000);assert(!s.green&&s.blocked["1-4"]);
 s=t.step({},1200);assert(s.green);
});
check("purge restarts on new opening",()=>{
 const t=bench.create(model,"1");t.step({},31000);
 t.step({Closed:{"1-2":false}},100);
 t.step({Closed:{"1-2":true}},100);
 t.step({},20000);
 t.step({Closed:{"1-2":false}},100);
 t.step({Closed:{"1-2":true}},100);
 assert(!t.step({},12000).green);
 assert(t.step({},18500).green);
});
check("30-second open door alarm",()=>{
 const t=bench.create(model,"4");t.step({},100);
 const s=t.step({Closed:{"4-6":false}},30200);
 assert(s.alarm&&s.overtime["4-6"]);
 assert(!t.step({Closed:{"4-6":true}},100).alarm);
});
check("concurrent opening latches fault until manual reset",()=>{
 const t=bench.create(model,"4");t.step({},100);
 assert(t.step({Closed:{"3-4":false,"4-6":false}},100).fault);
 assert(t.step({Closed:{"3-4":true,"4-6":true}},100).fault);
 assert(!t.step({ResetFault:true},100).fault);
});
check("fire removes all logical lock requests",()=>{
 const t=bench.create(model,"4");t.step({},100);
 const s=t.step({FireNormal:false},100);
 assert.equal(s.state,99);
 assert(!Object.values(s.blocked).some(Boolean));
});
check("default independent ventilation emits no PLC request",()=>{
 const g=gen.build(model,"1");
 const t=bench.create(model,"1");
 assert.equal(g.ventilationControlMode,"independent");
 assert(!g.st.includes("O_VentilationRequest"));
 assert(!g.io.some(x=>x.signal==="O_VentilationRequest"));
 assert.equal(t.step({},100).ventilationRequest,false);
});
check("integrated ventilation request follows closed-door timer and drops on opening or fire",()=>{
 const m=structuredClone(model);
 m.rooms.find(x=>x.id==="1").ventilationControlMode="integrated";
 const g=gen.build(m,"1"),t=bench.create(m,"1");
 assert.equal(g.ventilationControlMode,"integrated");
 assert(g.st.includes("O_VentilationRequest : BOOL;"));
 assert(g.st.includes("O_VentilationRequest := (State = 30) AND AllClosed AND FireNormal AND NOT FaultLatch;"));
 assert(g.io.some(x=>x.signal==="O_VentilationRequest"&&x.terminal===null));
 let s=t.step({},100);
 assert.equal(s.ventilationRequest,true);
 s=t.step({},30300);
 assert.equal(s.ventilationRequest,false);
 s=t.step({Closed:{"1-2":false}},100);
 assert.equal(s.ventilationRequest,false);
 s=t.step({Closed:{"1-2":true}},100);
 assert.equal(s.ventilationRequest,true);
 s=t.step({FireNormal:false},100);
 assert.equal(s.ventilationRequest,false);
});
check("invalid ventilation mode rejected for purge",()=>{
 const m=structuredClone(model);
 m.rooms.find(x=>x.id==="1").ventilationControlMode="unknown";
 assert.throws(()=>gen.build(m,"1"),/вентиляции/);
});
console.log("ALL GENERATION TESTS PASSED");
