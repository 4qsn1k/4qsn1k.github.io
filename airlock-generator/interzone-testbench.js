/* Airlock inter-zone REFERENCE simulator, not a native Owen Logic runtime.
 * Combines independently scanned room FB reference models through shared DI and OR.
 * Zero physical I/O; no deployed electrical or egress safety guarantee.
 */
const AirlockInterzoneTestbench=(()=>{
"use strict";
function create(model,roomModel,projectWiring){
 if(!model || !roomModel || !projectWiring)throw Error("Model and reference libraries required");
 const plan=projectWiring.build(model);
 const rooms=plan.activeRoomIds.map(id=>({
  id:String(id), fb:roomModel.create(model,id)
 }));
 if(rooms.length===0)throw Error("No controlled rooms");
 const controlled=plan.inputs.filter(x=>x.doorId);
 const allDoorIds=controlled.map(x=>String(x.doorId));
 const unique=new Set(allDoorIds);
 if(unique.size!==allDoorIds.length)throw Error("Duplicate physical reed");
 const closed=Object.fromEntries(allDoorIds.map(id=>[id,true]));
 let FireNormal=true,ResetFault=false;
 let clock=0;
 function evaluate(){
  const states=Object.fromEntries(rooms.map(x=>[x.id,x.fb.snapshot()]));
  const requestSources={},blocked={},traffic={};
  for(const block of plan.blockRequests){
   const claims=rooms.filter(r=>Object.prototype.hasOwnProperty.call(states[r.id].blocked,block.doorId))
    .map(r=>({roomId:r.id,source:"FB_Room_N"+r.id+".O_D_"+block.doorId.replace(/[^a-zA-Z0-9_]/g,"_")+"_Block",
      requested:!!states[r.id].blocked[block.doorId]}));
   if(claims.length!==block.sources.length)throw Error("Block sources mismatched for "+block.doorId);
   requestSources[block.doorId]=claims;
   blocked[block.doorId]=claims.some(x=>x.requested);
  }
  for(const door of plan.trafficLightOptions.perDoor){
   const permitted=FireNormal && closed[door.doorId] && !blocked[door.doorId] &&
     door.roomIds.every(id=>states[String(id)]?.green===true && states[String(id)]?.fault===false);
   traffic[door.doorId]={
    logicalGreenPermit:!!permitted,
    indicatedContact:permitted?"NO_GREEN":"NC_RED_IF_POWERED"
   };
  }
  const alarm=rooms.some(r=>states[r.id].alarm===true);
  const fault=rooms.some(r=>states[r.id].fault===true);
  return {
   timeMs:clock, inputs:{FireNormal,ResetFault,Closed:{...closed}},
   rooms:states, blocked,requestSources,traffic,
   alarm,fault,fire:!FireNormal,
   scope:"JS deterministic reference only — not Owen Logic compilation, physical outputs or egress validation"
  };
 }
 function step(next={},ms=100){
  if(!Number.isFinite(ms)||ms<0||ms>3600000)throw Error("Invalid ms");
  if(next.FireNormal!==undefined)FireNormal=Boolean(next.FireNormal);
  if(next.ResetFault!==undefined)ResetFault=Boolean(next.ResetFault);
  if(next.Closed){
   for(const id of Object.keys(next.Closed)){
    if(!unique.has(id))throw Error("Unknown controlled reed "+id);
    closed[id]=Boolean(next.Closed[id]);
   }
  }
  for(const room of rooms){
   const rc=Object.fromEntries(room.fb.doorIds.map(id=>[id,closed[id]]));
   room.fb.step({FireNormal,ResetFault,Closed:rc},ms);
  }
  clock+=ms;
  return evaluate();
 }
 return {
  plan,controlledDoorIds:[...allDoorIds],controlledRoomIds:rooms.map(x=>x.id),
  step,snapshot:evaluate
 };
}
return {create};
})();
