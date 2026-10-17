/* No hardware access: validate physical placement DRAFT and network dependencies. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const load=(file,name)=>vm.runInNewContext(fs.readFileSync(path.join(root,file),"utf8")+"\n"+name,{});
const project=load("project-wiring.js","AirlockProjectWiring");
const hardware=load("hardware-planner.js","AirlockHardwarePlanner");
const planner=load("distributed-planner.js","AirlockDistributedPlanner");
const model=JSON.parse(fs.readFileSync(path.join(root,"model.json"),"utf8"));
const wiring=project.build(model);
const pr=(di,doo)=>({family:"PR103",modification:"USER SPEC VERIFIED SEPARATELY",baseDi:di,baseDo:doo,modules:[]});
const one={primary:pr(12,14),secondary:[],link:"none",signaling:"room"};
const dual={primary:pr(6,6),secondary:[pr(6,6)],link:"ethernet-modbus-tcp",signaling:"room"};
const topoOne={
 roomOwners:{"1":"PLC1","4":"PLC1"},
 doorInputOwners:Object.fromEntries(wiring.blockRequests.map(x=>[x.doorId,"PLC1"])),
 doorOutputOwners:Object.fromEntries(wiring.blockRequests.map(x=>[x.doorId,"PLC1"])),
 alarmOwner:"PLC1"
};
const topoTwo={
 roomOwners:{"1":"PLC1","4":"PLC2"},
 doorInputOwners:{"1-2":"PLC1","1-4":"PLC1","1-5":"PLC1","2-4":"PLC2","3-4":"PLC2","4-6":"PLC2"},
 doorOutputOwners:{"1-2":"PLC1","1-4":"PLC1","1-5":"PLC1","2-4":"PLC2","3-4":"PLC2","4-6":"PLC2"},
 alarmOwner:"PLC1"
};
const test=(label,fn)=>{fn();console.log("PASS "+label)};
test("one PR consumes one physical reed per door and no remote transfers",()=>{
 const result=planner.build(model,wiring,one,hardware,topoOne);
 assert.equal(result.allocations.DI.length,8);
 assert.equal(result.allocations.DO.length,9);
 assert.equal(result.network.signals.length,0);
 assert.equal(result.capacity[0].usedDi,8);
 assert.equal(result.capacity[0].usedDo,9);
 assert(result.allocations.DI.every(x=>x.physicalTerminal===null));
});
test("two PRs each receive local FireNormal/ResetFault and one shared reed is forwarded",()=>{
 const result=planner.build(model,wiring,dual,hardware,topoTwo);
 assert.equal(result.allocations.DI.length,10);
 assert.equal(result.allocations.DO.length,9);
 assert.equal(result.allocations.DI.filter(x=>x.signal.startsWith("CLOSED_D_1_4")).length,1);
 assert(result.network.signals.some(x=>
   x.signal==="CLOSED_D_1_4" && x.from==="PLC1" && x.to==="PLC2"));
 assert(result.allocations.DI.some(x=>x.signal==="FireNormal@PLC1"));
 assert(result.allocations.DI.some(x=>x.signal==="FireNormal@PLC2"));
 assert.deepEqual(Array.from(result.capacity, x=>x.usedDi),[5,5]);
 assert.deepEqual(Array.from(result.capacity, x=>x.usedDo),[5,4]);
});
test("remote final OR request from N4 published to PLC1",()=>{
 const result=planner.build(model,wiring,dual,hardware,topoTwo);
 const route=result.network.signals.find(x=>
   x.signal==="FB_Room_N4.O_D_1_4_Block"&&x.from==="PLC2"&&x.to==="PLC1");
 assert(route,"route missing");
 assert(route.consumers.includes("FINAL_BLOCK_D_1_4"));
 assert.equal(route.requireFresh,true);
 assert.equal(route.proposedModbusAddress,null);
 assert.equal(result.network.timeoutMs,null);
});
test("PRM channels allocated only after onboard channels",()=>{
 const config={primary:{...pr(5,5),family:"PR200",modules:["PRM-1"]},secondary:[],link:"none",signaling:"room"};
 const result=planner.build(model,wiring,config,hardware,topoOne);
 assert(result.allocations.DI.some(x=>x.slot==="PLC1.PRM1.DI1"));
 assert(result.allocations.DO.some(x=>x.slot==="PLC1.PRM1.DO1"));
});
test("per-controller insufficient DI fails even if aggregate DI sufficient",()=>{
 const config={...dual,primary:pr(4,9),secondary:[pr(10,10)]};
 assert.throws(()=>planner.build(model,wiring,config,hardware,topoTwo),/Недостаточно DI на PLC1/);
});
test("per-controller insufficient DO fails even if total DO sufficient",()=>{
 const config={...dual,primary:pr(6,4),secondary:[pr(6,20)]};
 assert.throws(()=>planner.build(model,wiring,config,hardware,topoTwo),/Недостаточно DO на PLC1/);
});
test("unknown room owner and missing door owner are rejected",()=>{
 assert.throws(()=>planner.build(model,wiring,dual,hardware,
   {...topoTwo,roomOwners:{"1":"PLC9","4":"PLC2"}}),/существующий ПР/);
 const inputs={...topoTwo.doorInputOwners};delete inputs["1-4"];
 assert.throws(()=>planner.build(model,wiring,dual,hardware,
   {...topoTwo,doorInputOwners:inputs}),/назначь существующий ПР/);
});
test("door-specific lamp requires both zones' ready bits across network",()=>{
 const config={...dual,signaling:"door",primary:pr(6,10),secondary:[pr(6,10)]};
 const result=planner.build(model,wiring,config,hardware,topoTwo);
 assert(result.network.signals.some(x=>
   x.signal==="FB_Room_N4.O_Ready"&&x.to==="PLC1"&&x.consumers.includes("DOOR_D_1_4_SIGNAL_RELAY")));
});
test("logical green permit fails closed for stale, unknown, fault and fire",()=>{
 const p={closed:true,fireNormal:true,allRoomReady:true,finalBlock:false,networkFresh:true,localFault:false};
 assert.equal(planner.logicalDoorPermit(p),true);
 for(const change of [{networkFresh:false},{networkFresh:undefined},{allRoomReady:undefined},
  {finalBlock:undefined},{localFault:true},{fireNormal:false},{closed:false}]){
  assert.equal(planner.logicalDoorPermit({...p,...change}),false);
 }
});
test("ventilation request is assigned to its room's controller only",()=>{
 const m=structuredClone(model);
 m.rooms.find(x=>x.id==="1").ventilationControlMode="integrated";
 const cfg=project.build(m);
 const result=planner.build(m,cfg,{...dual,primary:pr(6,7)},hardware,topoTwo);
 const req=result.allocations.DO.filter(x=>x.signal==="ROOM_1_VENTILATION_REQUEST");
 assert.equal(req.length,1);
 assert.equal(req[0].controller,"PLC1");
});
console.log("DISTRIBUTED_PLACEMENT_QA 10/10 PASS — schematic draft only");
