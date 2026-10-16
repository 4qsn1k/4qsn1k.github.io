/* Tests one DO per changeover red-green lamp pair and shared door logic. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const moduleCode=fs.readFileSync(path.join(root,"project-wiring.js"),"utf8");
const wire=vm.runInNewContext(moduleCode+"\nAirlockProjectWiring",{});
const model=JSON.parse(fs.readFileSync(path.join(root,"model.json"),"utf8"));
const plan=wire.build(model);
const check=(label,fn)=>{fn();console.log("PASS "+label)};
check("one changeover relay signal per room, not separate red/green DO",()=>{
 assert.equal(plan.schema,"airlock-project-wiring/0.2");
 assert.equal(plan.planningCounts.controlledRooms,2);
 assert.equal(plan.planningCounts.roomTrafficRelays,2);
 assert.equal(plan.planningCounts.doorTrafficRelays,6);
 assert.equal(plan.logicalOutputs.filter(x=>x.id.match(/^ROOM_.*_SIGNAL_RELAY$/)).length,2);
 assert.equal(plan.logicalOutputs.filter(x=>/^ROOM_.*_(RED|GREEN)$/.test(x.id)).length,0);
});
check("red is on NC and green is on NO",()=>{
 for(const row of plan.trafficLightOptions.roomGroups){
  assert.equal(row.contactWiring.nc,"RED");
  assert.equal(row.contactWiring.no,"GREEN");
  assert.equal(row.energizeFor,"GREEN");
  assert.equal(row.scope,"ROOM_STATUS_NOT_DOOR_ACCESS");
 }
 for(const row of plan.trafficLightOptions.perDoor){
  assert.equal(row.contactWiring.nc,"RED");
  assert.equal(row.contactWiring.no,"GREEN");
  assert.equal(row.energizeFor,"GREEN");
 }
});
check("one shared door uses both room READY and final block",()=>{
 const row=plan.trafficLightOptions.perDoor.find(x=>x.doorId==="1-4");
 assert(row,"Door 1-4 plan missing");
 assert(row.greenExpression.includes("FB_Room_N1.O_Ready"));
 assert(row.greenExpression.includes("FB_Room_N4.O_Ready"));
 assert(row.greenExpression.includes("NOT FINAL_BLOCK_D_1_4"));
 assert(row.greenExpression.includes("CLOSED_D_1_4"));
 assert(row.greenExpression.includes("FireNormal"));
 const block=plan.blockRequests.find(x=>x.doorId==="1-4");
 assert.equal(block.sources.length,2);
 assert.equal(block.operator,"OR");
});
check("different room and per-door DO counts remain engineering estimates",()=>{
 const n=plan.planningCounts;
 assert.equal(n.logicalBlockingRequests,6);
 assert.equal(n.estimatedDOWithRoomSignals,9);
 assert.equal(n.estimatedDOWithDoorSignals,13);
 assert.equal(plan.inputs.filter(x=>x.doorId==="1-4").length,1);
 assert(plan.warnings.some(x=>x.includes("питания")));
});
console.log("ALL CHANGEOVER SIGNAL PLANNING TESTS PASS");
