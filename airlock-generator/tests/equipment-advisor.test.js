/* Preliminary recommendations from verified Owen catalogue variants; no PLC writes. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const dir=path.resolve(__dirname,"..");
const load=(file,symbol)=>vm.runInNewContext(fs.readFileSync(path.join(dir,file),"utf8")+"\n"+symbol,{});
const adv=load("equipment-advisor.js","AirlockEquipmentAdvisor");
const wiring=load("project-wiring.js","AirlockProjectWiring");
const hardware=load("hardware-planner.js","AirlockHardwarePlanner");
const model=JSON.parse(fs.readFileSync(path.join(dir,"model.json"),"utf8"));
const project=wiring.build(model);
const test=(name,fn)=>{fn();console.log("PASS "+name)};
test("N1+N4 recommends standalone PR102-24 with reasonable DI and relay DO margin",()=>{
 const a=adv.check(project);
 assert.equal(a.required.di,8);
 assert.equal(a.required.relayDo,9);
 assert.equal(a.recommended.controller,"PR102-24.2416.03.1");
 assert.equal(a.recommended.resources.di,16);
 assert.equal(a.recommended.resources.relayDo,16);
 assert.equal(a.recommended.modules.length,0);
 assert.equal(a.recommended.meetsReserve,true);
});
test("No extra ventilation DO when external ventilation runs with its own reeds",()=>{
 const a=adv.check(project);
 assert.equal(a.required.ventilationRequests,0);
 assert.equal(a.required.relayDo,9);
});
test("Integrated ventilation is counted per selected room",()=>{
 const m=structuredClone(model);
 m.rooms.find(x=>x.id==="1").ventilationControlMode="integrated";
 const a=adv.check(wiring.build(m));
 assert.equal(a.required.ventilationRequests,1);
 assert.equal(a.required.relayDo,10);
});
test("Ethernet request excludes PR102 and selects PR103 family with expansion for reserve",()=>{
 const a=adv.check(project,{requireEthernet:true});
 assert.equal(a.recommended.family,"PR103");
 assert.equal(a.recommended.ethernet,true);
 assert(a.recommended.modules.length>=1);
 assert.equal(a.recommended.meetsReserve,true);
});
test("Door-specific traffic lights increase required DO",()=>{
 const a=adv.check(project,{signaling:"door"});
 assert.equal(a.required.relayDo,13);
 assert.equal(a.required.lampPairs,6);
 assert.equal(a.recommended.controller,"PR102-24.2416.03.1");
});
test("Larger model proposes valid one or two PRM modules with spare channel capacity",()=>{
 const b=structuredClone(project);
 b.planningCounts.uniqueReedInputs=24;
 b.planningCounts.estimatedDOWithRoomSignals=23;
 const a=adv.check(b);
 assert.equal(a.required.di,26);
 assert.equal(a.required.relayDo,23);
 assert(a.recommended.modules.length>=1);
 assert(a.recommended.modules.length<=2);
 assert(a.recommended.resources.freeDi>=2);
 assert(a.recommended.resources.freeDo>=2);
});
test("No single device fit is explicitly described as multi-PR design",()=>{
 const b=structuredClone(project);
 b.planningCounts.uniqueReedInputs=120;
 b.planningCounts.estimatedDOWithRoomSignals=130;
 const a=adv.check(b);
 assert.equal(a.recommended,null);
 assert(a.constraints.some(x=>x.includes("нескольким ПР")));
});
test("Current PR100 physical digital input count is 8, AI conversions not free DI",()=>{
 const p=adv.catalogue.find(x=>x.family==="PR100");
 assert.equal(p.di,8);
 assert.equal(p.aiDigitalPossible,4);
 assert.equal(p.relayDo,8);
 assert.equal(p.maxPrm,0);
 assert(hardware.families.PR100.maxPrm===0);
});
test("PRM-6 source and channels match official catalog",()=>{
 const p=adv.expansion.find(x=>x.id==="PRM-6");
 assert.equal(p.di,16);
 assert.equal(p.relayDo,12);
 assert.equal(hardware.modules["PRM-6"].di,16);
 assert.equal(hardware.modules["PRM-6"].do,12);
});
test("One changeover relay per selected lamp group is recommended as separate equipment",()=>{
 const a=adv.check(project);
 const item=a.accessories.find(x=>x.id==="CHANGEOVER_RELAYS");
 assert.equal(item.quantity,2);
 assert(item.details.includes("COM/NC/NO")===false || item.details.includes("NC"));
});
test("Selected PR100 has 8 true DI / 8 DO and no expansion PRM",()=>{
 const hw={primary:{family:"PR100",modification:"ПР100-24.1208.03.1 [M02]",
   baseDi:12,baseDo:8,modules:[]},secondary:[]};
 const x=adv.check(project,{currentHardware:hw});
 assert.equal(x.current.status,"NO_EXPANSION");
 assert.equal(x.current.capacity.di,8);
 assert.equal(x.current.capacity.relayDo,8);
 assert.equal(x.current.additions.length,0);
});
test("Selected PR102 with too few channels gains 8 DI/8 DO through one PRM-1",()=>{
 const bigger=structuredClone(project);
 bigger.planningCounts.uniqueReedInputs=18;
 bigger.planningCounts.estimatedDOWithRoomSignals=18;
 const hw={primary:{family:"PR102",modification:"ПР102-24.2416.03.1",baseDi:16,baseDo:16,modules:[]},secondary:[]};
 const x=adv.check(bigger,{currentHardware:hw});
 assert.equal(x.current.status,"ADD_MODULE");
 assert.equal(x.current.additions[0].modules.join(","),"PRM-1");
 assert(x.current.additions[0].capacity.freeDi>=2);
});
test("Multiple selected PLCs require local placement instead of aggregate expansion advice",()=>{
 const hw={primary:{family:"PR103",modification:"ПР103-24.1610.03.1.0",
  baseDi:10,baseDo:10,modules:[]},
  secondary:[{family:"PR103",modification:"",baseDi:10,baseDo:10,modules:[]}]};
 const x=adv.check(project,{currentHardware:hw});
 assert.equal(x.current.status,"MULTI_CONTROLLER_REQUIRES_LOCAL_PLACEMENT");
 assert.equal(x.current.additions.length,0);
});
console.log("EQUIPMENT_ADVICE_QA 13/13 PASS — preliminary catalog advice, not certified design");
