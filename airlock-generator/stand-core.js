/* Offline educational inter-zone demonstrator.
 * NEVER connects to a controller. Uses the existing deterministic reference
 * FB model (not executable ST/Owen Logic or actual pressure/lock feedback).
 */
const AirlockStandCore=(()=>{
 "use strict";
 const MODES=Object.freeze({10:"READY",20:"OPEN",30:"PURGE",90:"FAULT",99:"FIRE",0:"INIT"});
 const SCENARIOS=Object.freeze({
  A:{title:"N1 продувается, N4 готова",description:"Две закрытые зоны. N1 выполняет выдержку, поэтому общая 1–4 заблокирована."},
  B:{title:"В N4 открыта дверь 3–4",description:"N1 готова. N4 занята другой дверью и запрещает проход через общую 1–4."},
  C:{title:"Обе зоны готовы",description:"Все герконы закрыты. Обе зоны READY, общий программный запрет снят."},
  D:{title:"Общая дверь 1–4 открыта",description:"Один геркон меняется на входах обоих блоков. Остальные двери получают запрет."},
  E:{title:"Дверь 1–4 закрыта",description:"N4 становится READY; N1 продувается 30 секунд. Общий запрет сохраняется до готовности обеих."},
  F:{title:"Пожарный сигнал",description:"FireNormal=0 снимает программные запреты, но зелёный не разрешён. Аппаратное освобождение НЕ моделируется."}
 });
 function create(model,roomModel,wiring,integration){
  if(!model || !roomModel || !wiring || !integration)throw Error("Missing stand dependencies");
  let bench, snapshot, supply=true;
  const logs=[];
  const deep=()=>JSON.parse(JSON.stringify(snapshot));
  function record(action){
   logs.unshift({at:snapshot.timeMs,action});
   if(logs.length>70)logs.length=70;
  }
  function init(){
   bench=integration.create(model,roomModel,wiring);
   snapshot=bench.step({},100);
   logs.length=0;
   record("Новый демонстрационный цикл. Все герконы закрыты.");
   return deep();
  }
  function sync(next,ms,label){
   snapshot=bench.step(next,ms);
   if(label)record(label);
   return deep();
  }
  function step(ms=1000){
   if(!Number.isFinite(ms)||ms<=0||ms>3600000)throw Error("Invalid simulated step");
   return sync({},ms,null);
  }
  function door(id){
   const key=String(id);
   if(!bench.controlledDoorIds.includes(key))throw Error("Door outside controlled demonstration");
   const next=!snapshot.inputs.Closed[key];
   return sync({Closed:{[key]:next}},100,"Дверь "+key+": геркон "+(next?"закрыт":"открыт"));
  }
  function fire(){
   const next=!snapshot.inputs.FireNormal;
   return sync({FireNormal:next},100,next?"Пожарный вход восстановлен":"FireNormal=0: пожарный режим");
  }
  function resetFault(){
   // Never silently close an open door to clear a latched fault.
   if(bench.controlledDoorIds.some(id=>!snapshot.inputs.Closed[id]))throw Error("Для сброса сначала закройте все двери");
   sync({ResetFault:true},100,null);
   return sync({ResetFault:false},100,"Импульс ResetFault: 1 → 0");
  }
  function scenario(id){
   if(!Object.prototype.hasOwnProperty.call(SCENARIOS,id))throw Error("Unknown scenario");
   init();
   if(id!=="A")sync({},30500,null);
   if(id==="B")sync({Closed:{"3-4":false}},100,null);
   if(id==="D"||id==="E")sync({Closed:{"1-4":false}},100,null);
   if(id==="E")sync({Closed:{"1-4":true}},100,null);
   if(id==="F")sync({FireNormal:false},100,null);
   record("Сценарий "+id+": "+SCENARIOS[id].title);
   return deep();
  }
  function status(state){return MODES[state]||"INIT"}
  function contactForDoor(id){
   const s=snapshot;
   const command=!!s.traffic[String(id)]?.logicalGreenPermit;
   // The NC branch is red, NO branch green. Loss of lamp supply = both OFF.
   return {
    doorId:String(id),command,coilEnergized:command,
    contact:command?"NO":"NC",
    redLit:supply&&!command,
    greenLit:supply&&command,
    lampsPowered:supply,
    inhibit:!!s.blocked[String(id)],
    sourceRequests:s.requestSources[String(id)]||[],
    reedClosed:!!s.inputs.Closed[String(id)],
    caveat:!supply?"Лампы без питания: обе погасли":!s.inputs.FireNormal?
     "Пожар: NC=красный только как индикация; аварийное отпирание — отдельная цепь":
     command?"Условное разрешение модели":"Красный не доказывает физическую блокировку"
   };
  }
  function setSupply(value){
   supply=!!value;
   record(supply?"Питание индикаторов включено":"Питание индикаторов пропало — обе лампы погашены");
   return supply;
  }
  function state(){
   return {snapshot:deep(),lampsPowered:supply,logs:logs.slice(),roomStates:Object.fromEntries(
    Object.entries(snapshot.rooms).map(([id,r])=>[id,status(r.state)])
   )};
  }
  init();
  return {step,door,fire,resetFault,scenario,reset:init,setSupply,state,contactForDoor,
   scenarios:SCENARIOS,plan:bench.plan,controlledDoorIds:bench.controlledDoorIds};
 }
 return {create,SCENARIOS,MODES};
})();
