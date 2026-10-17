/* In-memory reference watchdog for conceptual Modbus link QA.
 * No communications, registers, real PLC I/O, or time synchronization.
 * Requires explicitly chosen timeout; sequence counters prevent stale replay.
 */
const AirlockLinkWatchdog=(()=>{
"use strict";
const key=r=>[r.from,r.to,r.signal].join("|");
function create(plan,{timeoutMs}={}){
 if(!plan||!plan.network||!Array.isArray(plan.network.signals))
  throw Error("Ожидается карта межконтроллерных сигналов");
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>600000)
  throw Error("Требуется явный тестовый timeoutMs 100..600000; нет безопасного значения по умолчанию");
 const allowed=new Map(plan.network.signals.map(r=>[key(r),r]));
 if(allowed.size!==plan.network.signals.length)throw Error("Дублирование межконтроллерного сигнала");
 const seen=new Map();
 function receive({from,to,signal,value,seq,atMs}){
  const k=[from,to,signal].join("|");
  if(!allowed.has(k))throw Error("Неизвестный сетевой сигнал");
  if(typeof value!=="boolean")throw Error("Некорректное значение BOOL");
  if(!Number.isSafeInteger(seq)||seq<0||!Number.isSafeInteger(atMs)||atMs<0)
   throw Error("Неверный номер кадра или время");
  const previous=seen.get(k);
  if(previous && (seq<=previous.seq||atMs<=previous.atMs))
   return {accepted:false,reason:"STALE_OR_REPLAYED_FRAME"};
  seen.set(k,{value,seq,atMs});
  return {accepted:true};
 }
 function status(route,nowMs){
  if(!Number.isSafeInteger(nowMs)||nowMs<0)throw Error("Некорректное время проверки");
  const registered=allowed.get(key(route));
  if(!registered)throw Error("Нет такого сетевого канала");
  const data=seen.get(key(route));
  const ageMs=data?nowMs-data.atMs:null;
  const fresh=!!data&&ageMs>=0&&ageMs<=timeoutMs;
  return {signal:route.signal,from:route.from,to:route.to,
    fresh,value:fresh?data.value:null,ageMs,reason:!data?"NEVER_RECEIVED":
      ageMs<0?"CLOCK_ANOMALY":ageMs>timeoutMs?"TIMEOUT":"VALID"};
 }
 function freshFor(consumer,nowMs){
  const needed=plan.network.signals.filter(r=>r.consumers.includes(consumer));
  return needed.every(r=>status(r,nowMs).fresh);
 }
 function requirePermit(consumer,nowMs,conditions,distributedPlanner){
  const networkFresh=freshFor(consumer,nowMs);
  return distributedPlanner.logicalDoorPermit({...conditions,networkFresh});
 }
 return {receive,status,freshFor,requirePermit,timeoutMs};
}
return {create};
})();
