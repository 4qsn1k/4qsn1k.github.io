"use strict";
/* Pure simulation of one-shot normal-access attempts through the generated
 * airlock FBD netlist: SCUD card at CNC-1257, local button elsewhere.
 * NO pulses to a physical lock, no virtual unlocking actuator, no COM.
 */
const graph=require("./native-timed-fbd-plan.js");
const assert=(x,m)=>{if(!x)throw Error(m)};
function create(plan,scudDoorIds=["D_CNC_1257"]){
 graph.validate(plan);
 const keys=plan.doors.map(x=>x.doorId);
 const scud=new Set(scudDoorIds);
 assert(scud.size===scudDoorIds.length&&[...scud].every(k=>keys.includes(k)),
  "BAD_SCUD_DOOR_IDS");
 let engine=graph.simulator(plan),state=engine.step({},0);
 let eventNumber=0;
 const attempts=[];
 function step(change={},elapsedMs=0){
  state=engine.step(change,elapsedMs);
  return view();
 }
 function view(){
  return {
   timeMs:state.timeMs,
   fireNormal:state.FireNormal,
   closed:{...state.Closed},
   logicalPermit:{...state.green},
   logicalInhibit:{...state.inhibit},
   lastAttempt:attempts.at(-1)||null,
   allAttempts:attempts.length,
   physicalLockOutputsAllocated:0,
   actualHardwareReleased:null
  };
 }
 function request(doorId,method){
  assert(keys.includes(doorId),"UNKNOWN_PHYSICAL_DOOR");
  assert(method==="card"||method==="button","UNKNOWN_REQUEST_METHOD");
  const permittedMethod=scud.has(doorId)?"card":"button";
  assert(method===permittedMethod,"WRONG_REQUEST_CHANNEL");
  const isClosed=state.Closed[doorId];
  const isReady=state.green[doorId];
  const accepted=isClosed===true&&isReady===true&&state.FireNormal===true;
  const reason=!state.FireNormal?"FIRE_SEPARATE_EMERGENCY_RELEASE":
   !isClosed?"DOOR_ALREADY_OPEN":
   !isReady?"ZONE_HOLD_ACTIVE":"NORMAL_ACCESS_LOGIC_READY";
  const result=Object.freeze({
   eventNumber:++eventNumber,timeMs:state.timeMs,doorId,method,
   plcPermit:isReady,logicalRequestAccepted:accepted,reason,
   physicalDoorUnlocked:null,outputPulseGenerated:false,
   actualEgressVerified:false
  });
  attempts.push(result);
  return result;
 }
 return {step,view,request,history:()=>[...attempts]};
}
module.exports={create};
