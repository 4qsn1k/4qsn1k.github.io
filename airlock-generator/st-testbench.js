/* Fast deterministic virtual I/O test bench for generated ST room module.
 * Mirrors proposed ST states and timers, not a substitute for Owen Logic simulation.
 */
const AirlockStTestbench=(()=>{
"use strict";
function create(model,roomId){
 const r=model.rooms.find(x=>String(x.id)===String(roomId));
 if(!r)throw Error("Нет помещения "+roomId);
 const mode=r.interlockMode||(r.interlockEnabled?"purge":"none");
 if(mode!=="mutual"&&mode!=="purge")throw Error("Режим должен быть mutual или purge");
 const doorIds=model.doors.filter(d=>d.a===r.id||d.b===r.id).map(d=>d.id).sort();
 if(doorIds.length<2)throw Error("Минимум две двери");
 const closed=Object.fromEntries(doorIds.map(id=>[id,true]));
 const elapsedClose=Object.fromEntries(doorIds.map(id=>[id,0]));
 const elapsedOpen=Object.fromEntries(doorIds.map(id=>[id,0]));
 let clock=0,state=0,fault=false,purgeElapsed=0,last=null;
 const purgeMs=(Number(r.purgeSec)||30)*1000;
 const alarmMs=(Number(model.defaultOpenDoorAlarmSec)||30)*1000;
 let signals={FireNormal:true,ResetFault:false,Closed:{...closed}};
 function compute(){
  const anyOpen=doorIds.some(id=>!signals.Closed[id]);
  const confirmedClosed=doorIds.every(id=>elapsedClose[id]>=80);
  const overtime=Object.fromEntries(doorIds.map(id=>[id,signals.FireNormal&&!signals.Closed[id]&&elapsedOpen[id]>=alarmMs]));
  const ready=signals.FireNormal && state===10 && !fault;
  const blocked=Object.fromEntries(doorIds.map(id=>[id,
   signals.FireNormal&&!ready&&(state!==20||signals.Closed[id])
  ]));
  return {timeMs:clock,state,anyOpen,confirmedClosed,fault,fire:!signals.FireNormal,
   green:ready,red:signals.FireNormal&&!ready,
   alarm:Object.values(overtime).some(Boolean),overtime,blocked,
   purgeRemainingSec:state===30?Math.max(0,Math.ceil((purgeMs-purgeElapsed)/1000)):null};
 }
 function scan(dt){
  clock+=dt;
  for(const id of doorIds){
   if(signals.Closed[id]){elapsedClose[id]+=dt;elapsedOpen[id]=0}
   else {elapsedClose[id]=0;elapsedOpen[id]+=dt}
  }
  const all=doorIds.every(id=>elapsedClose[id]>=80);
  const count=doorIds.filter(id=>!signals.Closed[id]).length;
  const any=count>0;
  // TON invoked before case transitions, just as in generated source.
  if(mode==="purge"&&state===30&&all&&signals.FireNormal&&!fault)purgeElapsed+=dt;
  else purgeElapsed=0;
  if(count>1)fault=true;
  if(signals.ResetFault&&all&&signals.FireNormal){fault=false;state=0}
  if(!signals.FireNormal)state=99;
  else if(fault)state=90;
  else {
   switch(state){
    case 0:
      if(any)state=20;
      else if(all)state=mode==="purge"?30:10;
      break;
    case 10:if(any)state=20;break;
    case 20:if(all)state=mode==="purge"?30:10;break;
    case 30:
      if(any)state=20;
      else if(purgeElapsed>=purgeMs)state=10;
      break;
    case 90:
    case 99:
    default:state=0;
   }
  }
  return compute();
 }
 function step(next={},ms=50){
  if(next.FireNormal!==undefined)signals.FireNormal=Boolean(next.FireNormal);
  if(next.ResetFault!==undefined)signals.ResetFault=Boolean(next.ResetFault);
  if(next.Closed)for(const id of Object.keys(next.Closed)){
   if(!doorIds.includes(id))throw Error("Неизвестная дверь "+id);
   signals.Closed[id]=Boolean(next.Closed[id]);
  }
  if(!Number.isFinite(ms)||ms<0||ms>3600000)throw Error("Шаг 0..3600000 мс");
  // 20ms scan approximates controller; timer threshold is not a calibrated test.
  const pieces=Math.max(1,Math.ceil(ms/20)),dt=ms/pieces;
  for(let i=0;i<pieces;i++)last=scan(dt);
  return last;
 }
 function reset(){return create(model,roomId)}
 return {doorIds,mode,step,snapshot:()=>last||compute(),reset};
}
return {create};
})();
