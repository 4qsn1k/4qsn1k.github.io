/* Advisory-only equipment shortlist for Airlock Generator.
 * Vendor-specific catalogue values are a curated subset for 24V architectures.
 * No prices, physical terminal assignments, certified safety claim or PLC writes.
 */
const AirlockEquipmentAdvisor=(()=>{
"use strict";
const catalogue=[
 {id:"PR100-24.1208.03.1",family:"PR100",di:8,specialDi:0,aiDigitalPossible:4,relayDo:8,
  ethernet:false,rs485:true,maxPrm:0,rank:4,
  source:"https://agriculture.owen.ru/product/pr100/modifications",
  note:"8 дискретных входов + 4 универсальных AI. AI допускают дискретный режим при отдельной электрической проверке."},
 {id:"PR102-24.2416.03.1",family:"PR102",di:16,specialDi:0,aiDigitalPossible:8,relayDo:16,
  ethernet:false,rs485:true,maxPrm:2,rank:0,
  source:"https://agriculture.owen.ru/product/pr102/modifications",
  note:"16 обычных DI, 8 AI и 16 релейных DO; RS-485, без встроенного Ethernet."},
 {id:"PR103-24.1610.03.1.0",family:"PR103",di:6,specialDi:4,aiDigitalPossible:6,relayDo:10,
  ethernet:true,rs485:true,maxPrm:2,rank:1,
  source:"https://agriculture.owen.ru/product/pr103/modifications",
  note:"6 обычных DI + 4 быстрых дискретных входа (FDI) + 6 AI, 10 релейных DO; Ethernet и RS-485. Пригодность FDI для выбранного геркона подтвердить."}
];
const expansion=[
 {id:"PRM-1",di:8,relayDo:8,source:"https://owen.ru/product/prm1/specifications"},
 {id:"PRM-5",di:0,relayDo:16,source:"https://owen.ru/product/prm5"},
 {id:"PRM-6",di:16,relayDo:12,source:"https://owen.ru/product/prm6/specifications"}
];
function combos(max){
 const out=[[]];
 if(max>=1)for(const m of expansion)out.push([m]);
 if(max>=2)for(let i=0;i<expansion.length;i++)
  for(let j=i;j<expansion.length;j++)out.push([expansion[i],expansion[j]]);
 return out;
}
function currentUpgrade(hardware,required,reserve){
 if(!hardware?.primary)return null;
 if((hardware.secondary||[]).length>0)return{
  status:"MULTI_CONTROLLER_REQUIRES_LOCAL_PLACEMENT",
  note:"В проекте выбрано несколько ПР. Модули расширения надо выбирать по свободным каналам конкретного контроллера, а не по общей сумме. Используй раздел «Размещение сигналов по контроллерам».",
  additions:[]
 };
 const selected=hardware.primary;
 const variation=String(selected.modification||"");
 const exact=catalogue.find(x=>x.family===selected.family&&
   (variation.includes(x.id.slice(x.id.indexOf("-")+1))||
    variation.replace(/^ПР/,"PR").includes(x.id)));
 const familyRules={"PR100":0,"PR102":2,"PR200":2,"PR103":2,"PR205":2};
 const max=familyRules[selected.family];
 if(max===undefined)return {status:"UNSUPPORTED_SELECTED_FAMILY",note:"Для текущего прибора нет проверенной конфигурации.",additions:[]};
 const modules=Array.isArray(selected.modules)?selected.modules:[];
 const knownModules=modules.map(name=>expansion.find(m=>m.id===name));
 if(knownModules.some(x=>!x))return{
  status:"UNKNOWN_MODULE",note:"Установлен неизвестный модуль. Проверь состав ПРМ до автоматического подбора.",additions:[]
 };
 const baseDi=exact?exact.di+exact.specialDi:selected.baseDi;
 const baseDo=exact?exact.relayDo:selected.baseDo;
 if(!Number.isInteger(baseDi)||!Number.isInteger(baseDo)||baseDi<0||baseDo<0)
  return {status:"INVALID_SELECTED_COUNTS",note:"Введи число DI и релейных DO текущего ПР.",additions:[]};
 const currentDi=baseDi+knownModules.reduce((n,m)=>n+m.di,0);
 const currentDo=baseDo+knownModules.reduce((n,m)=>n+m.relayDo,0);
 const remainingSlots=max-modules.length;
 const targetDi=required.di+reserve.di,targetDo=required.relayDo+reserve.relayDo;
 const capacity={di:currentDi,relayDo:currentDo,freeDi:currentDi-required.di,
  freeDo:currentDo-required.relayDo};
 const caveat=exact?"Паспортные количества из проверенной модели. Универсальные AI не включены в DI.":
  "DI/DO взяты из ручных полей. Перед заказом проверь модификацию и тип выхода по паспорту.";
 if(currentDi>=targetDi&&currentDo>=targetDo)return{
  status:"SUFFICIENT_WITH_MARGIN",capacity,note:"Каналов текущего ПР хватает с заданным резервом. "+caveat,additions:[]
 };
 if(remainingSlots<=0)return{
  status:"NO_EXPANSION",capacity,
  note:max===0?"Для ПР100 штатные ПРМ не предусмотрены. Если каналов не хватает, выбирай другой контроллер или утверждённую архитектуру из нескольких ПР.":
  "Все слоты ПРМ заняты. Необходимо изменить контроллер или архитектуру.",
  additions:[]
 };
 const options=[];
 for(const extra of combos(remainingSlots)){
  if(!extra.length)continue;
  const d=currentDi+extra.reduce((n,x)=>n+x.di,0);
  const o=currentDo+extra.reduce((n,x)=>n+x.relayDo,0);
  if(d<required.di||o<required.relayDo)continue;
  const meets=d>=targetDi&&o>=targetDo;
  options.push({modules:extra.map(x=>x.id),sources:extra.map(x=>x.source),
    capacity:{di:d,relayDo:o,freeDi:d-required.di,freeDo:o-required.relayDo},
    meetsReserve:meets,score:(meets?0:1000)+extra.length*100+
      Math.abs(d-targetDi)*0.2+Math.abs(o-targetDo)*0.4});
 }
 options.sort((a,b)=>a.score-b.score);
 if(!options.length)return {status:"CANNOT_EXPAND_ENOUGH",capacity,
  note:"Одними доступными ПРМ требуемую ёмкость не обеспечить. Нужен новый ПР или распределённая схема. "+caveat,
  additions:[]};
 return {
  status:options[0].meetsReserve?"ADD_MODULE":"ADD_MODULE_WITHOUT_DESIRED_RESERVE",
  capacity,note:caveat,
  additions:options.slice(0,2).map(x=>({
   modules:x.modules,capacity:x.capacity,meetsReserve:x.meetsReserve,sources:x.sources
  }))
 };
}
function check(wiring,settings={}){
 if(!wiring||!wiring.planningCounts)throw Error("Нет рассчитанных дверей и помещений");
 const c=wiring.planningCounts, perDoor=settings.signaling==="door";
 const required={di:c.uniqueReedInputs+c.commonInputs,
  relayDo:perDoor?c.estimatedDOWithDoorSignals:c.estimatedDOWithRoomSignals,
  doorInputs:c.uniqueReedInputs,
  commonInputs:c.commonInputs,
  lampPairs:perDoor?c.doorTrafficRelays:c.roomTrafficRelays,
  ventilationRequests:c.integratedVentilationRequests,
  doors:c.logicalBlockingRequests,rooms:c.controlledRooms};
 const reserveDi=Number.isInteger(settings.reserveDi)&&settings.reserveDi>=0?settings.reserveDi:2;
 const reserveDo=Number.isInteger(settings.reserveDo)&&settings.reserveDo>=0?settings.reserveDo:2;
 const requireEthernet=settings.requireEthernet===true;
 const candidates=[];
 for(const device of catalogue){
  if(requireEthernet&&!device.ethernet)continue;
  for(const modules of combos(device.maxPrm)){
   const di=device.di+device.specialDi+modules.reduce((n,m)=>n+m.di,0);
   const relayDo=device.relayDo+modules.reduce((n,m)=>n+m.relayDo,0);
   const freeDi=di-required.di,freeDo=relayDo-required.relayDo;
   if(freeDi<0||freeDo<0)continue;
   const meetsReserve=freeDi>=reserveDi&&freeDo>=reserveDo;
   const score=(meetsReserve?0:2000)+modules.length*180+device.rank*20+
      Math.max(0,freeDi-reserveDi)*0.4+Math.max(0,freeDo-reserveDo)*0.6+
      (device.specialDi>0?5:0);
   const warnings=[];
   if(device.specialDi)warnings.push("Часть расчётных DI — быстрые входы FDI. Проверить режимы и совместимость датчиков.");
   if(device.aiDigitalPossible)warnings.push("AI не включены в гарантированное число DI. Использование AI в дискретном режиме рассматривается отдельно.");
   if(!meetsReserve)warnings.push("Каналов на схему хватает, но запрошенный резерв DI/DO не обеспечен.");
   candidates.push({
    id:device.id+"|"+modules.map(m=>m.id).join("+"),controller:device.id,family:device.family,
    modules:modules.map(m=>m.id),
    resources:{di,relayDo,freeDi,freeDo,regularDi:device.di,specialDi:device.specialDi},
    meetsReserve,requiresVendorIoCheck:true,ethernet:device.ethernet,
    communication:device.ethernet?"Ethernet/Modbus TCP или RS-485/RTU":"RS-485/Modbus RTU",
    source:device.source,moduleSources:modules.map(m=>m.source),
    explanation:device.note,
    warnings,score
   });
  }
 }
 candidates.sort((a,b)=>a.score-b.score||a.id.localeCompare(b.id));
 const primary=candidates[0]||null;
 let alternatives=[];
 if(primary){
  const distinctFamilies=new Set([primary.family]);
  for(const x of candidates.slice(1)){
   if(distinctFamilies.has(x.family))continue;
   alternatives.push(x);distinctFamilies.add(x.family);
   if(alternatives.length>=2)break;
  }
 }
 const accessories=[
  {id:"CHANGEOVER_RELAYS",quantity:required.lampPairs,
   name:"Промежуточное реле с переключающим контактом COM/NC/NO",
   details:"По одному на красно-зелёную пару, если DO контроллера — простой НО контакт; NC — красный, NO — зелёный. Катушка и контакты должны соответствовать питанию и нагрузке."},
  {id:"PSU_24V",quantity:null,name:"Блок питания 24 В DC и резерв питания по заданию",
   details:"Рассчитать ток ПР, ПРМ, промежуточных реле, считывателей, сигнализации и запас. Не выбирать мощность до расчёта нагрузки."},
  {id:"CIRCUIT_PROTECTION",quantity:null,name:"Клеммы, защита цепей, разделение питания",
   details:"Предусмотреть автоматы/предохранители, маркировку, гальваническую развязку и отдельную аппаратную цепь пожарного отпирания."},
  {id:"ACCESS_INTERFACE",quantity:required.doors,name:"Согласование запросов блокировки со СКУД",
   details:"Уточнить интерфейс BUSY контроллера С2000-2 и логическую полярность; расчёт выходов завышен, если допускается групповое или иное согласованное объединение."}
 ];
 const current=currentUpgrade(settings.currentHardware,required,{di:reserveDi,relayDo:reserveDo});
 const constraints=[
  "Расчёт основан на логических запросах: физические реле, аппаратные контакты и безопасное отпирание требуют проекта.",
  "Индивидуальные входы/выходы и допустимые типы датчиков/нагрузок проверить в паспорте точной модификации.",
  "Для общей двери и нескольких ПР нужна проверка отказа Modbus, питания, АПС и аварийного выхода.",
  "Перекидное реле требуется дополнительно, если у выхода ПР только нормально-разомкнутый контакт.",
  "Технологический таймер не подтверждает фактическую продувку."
 ];
 if(!primary)constraints.unshift("В рассмотренном каталоге нет одиночной конфигурации с достаточной ёмкостью. Нужна отдельная разбивка по нескольким ПР и расчёт сети.");
 if(settings.hasRemoteControllers)constraints.unshift("В проекте уже несколько ПР; единый ПР можно рекомендовать лишь при допустимой длине кабелей и размещении зон. Иначе проектировать распределённую систему.");
 return {
  schema:"airlock-equipment-advice/0.1",status:"PRELIMINARY_ENGINEERING_SELECTION_NOT_BOM",
  required,reserve:{di:reserveDi,relayDo:reserveDo},requireEthernet,
  recommended:primary,alternatives,current,accessories,constraints,
  allSingleControllerCandidates:candidates.length,
  assumptions:["Питание базового перечня ПР — 24 В DC",
   "Сигналы внешней АПС и ResetFault учтены как два логических DI; реальное исполнение может потребовать большего",
   "Расчёт светофоров: один DO на пару через внешний переключающий контакт при необходимости"]
 };
}
return {catalogue,expansion,check};
})();
