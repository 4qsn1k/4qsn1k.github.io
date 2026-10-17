/* Node.js tests for capacity-only Owen PR selection. No PLC connection. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const dir=path.resolve(__dirname,"..");
const load=(f,n)=>vm.runInNewContext(fs.readFileSync(path.join(dir,f),"utf8")+"\n"+n,{});
const hw=load("hardware-planner.js","AirlockHardwarePlanner");
const wire=load("project-wiring.js","AirlockProjectWiring");
const model=JSON.parse(fs.readFileSync(path.join(dir,"model.json"),"utf8"));
const plan=wire.build(model);
const check=(name,fn)=>{fn();console.log("PASS "+name)};
const primary=(family="PR100")=>({family,baseDi:12,baseDo:8,modification:"24.1208.03.1 M02",modules:[]});
check("PR100 12/8 insufficient DO for example",()=>{
 const s=hw.build(plan,{primary:primary(),signaling:"room"});
 assert.equal(s.required.di,8);
 assert.equal(s.required.do,9);
 assert.equal(s.capacity.di,12);
 assert.equal(s.capacity.do,8);
 assert.equal(s.aggregateCapacitySufficient,false);
});
check("PR100 refuses any PRM module",()=>{
 assert.throws(()=>hw.build(plan,{primary:{...primary(),modules:["PRM-1"]}}),/лимит ПРМ/);
});
check("PR200 plus one PRM-1 adds 8 DI + 8 relay DO",()=>{
 const s=hw.build(plan,{primary:{...primary("PR200"),modules:["PRM-1"]}});
 assert.equal(s.capacity.di,20);
 assert.equal(s.capacity.do,16);
 assert.equal(s.aggregateCapacitySufficient,true);
});
check("PR102 plus two PRM-5 adds 32 relay DO",()=>{
 const s=hw.build(plan,{primary:{...primary("PR102"),modules:["PRM-5","PRM-5"]}});
 assert.equal(s.capacity.do,40);
});
check("Reject third expansion module",()=>{
 assert.throws(()=>hw.build(plan,{primary:{...primary("PR103"),modules:["PRM-1","PRM-1","PRM-1"]}}),/лимит ПРМ/);
});
check("Link two PR103 over Ethernet with warning about local routing",()=>{
 const s=hw.build(plan,{primary:primary("PR103"),secondary:[{...primary("PR103"),baseDo:10}],
   link:"ethernet-modbus-tcp",signaling:"door"});
 assert.equal(s.devices.length,2);
 assert.equal(s.required.do,13);
 assert.equal(s.needsNetworkMapping,true);
 assert.equal(s.aggregateCapacitySufficient,true);
 assert(s.warnings.some(x=>x.includes("карта Modbus")));
});
check("PR100 cannot connect by Ethernet",()=>{
 assert.throws(()=>hw.build(plan,{primary:primary(),secondary:[primary("PR103")],
   link:"ethernet-modbus-tcp"}),/Ethernet/);
});
check("Two PR over RS485 must prove both physical interfaces",()=>{
 assert.throws(()=>hw.build(plan,{primary:primary(),secondary:[primary("PR200")],
   link:"rs485-modbus-rtu"}),/RS-485/);
 const s=hw.build(plan,{primary:primary(),secondary:[primary("PR200")],
   link:"rs485-modbus-rtu",rs485AvailableOnAll:true});
 assert(s.needsNetworkMapping);
});
check("Integrated ventilation request increments DO estimates",()=>{
 const configured=structuredClone(model);
 configured.rooms.find(r=>r.id==="1").ventilationControlMode="integrated";
 const p=wire.build(configured);
 assert.equal(p.planningCounts.integratedVentilationRequests,1);
 const s=hw.build(p,{primary:primary(),signaling:"room"});
 assert.equal(s.required.do,10);
});
console.log("HARDWARE_CAPACITY_TESTS_PASS 9/9. Physical terminals and network timing UNVERIFIED.");
