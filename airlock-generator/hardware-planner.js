/* Capacity estimator for Owen Logic controllers. NO wiring or PLC writes.
 * Device family does NOT imply the exact number or electrical type of I/O.
 * Installers must confirm exact modification, supply, channel types and link hardware.
 */
const AirlockHardwarePlanner=(()=>{
"use strict";
const families={
 PR100:{maxPrm:0,rs485:"optional",ethernet:false,source:"https://owen.ru/product/pr100/specifications"},
 PR102:{maxPrm:2,rs485:"optional",ethernet:false,source:"https://owen.ru/product/pr102"},
 PR200:{maxPrm:2,rs485:"optional",ethernet:false,source:"https://owen.ru/product/pr200/specifications"},
 PR103:{maxPrm:2,rs485:"optional",ethernet:true,source:"https://owen.ru/product/pr103"},
 PR205:{maxPrm:2,rs485:"optional",ethernet:true,source:"https://owen.ru/product/pr205/specifications"}
};
const modules={
 "PRM-1":{di:8,do:8,source:"https://owen.ru/product/prm1/specifications"},
 "PRM-5":{di:0,do:16,source:"https://owen.ru/product/prm5"}
};
const integer=(n,min,max,key)=>{
 if(!Number.isInteger(n)||n<min||n>max)throw Error("Недопустимое количество "+key);
 return n;
};
function device(info,id){
 if(!info||!families[info.family])throw Error("Неизвестное семейство ПР");
 const spec=families[info.family];
 const slots=info.modules||[];
 if(!Array.isArray(slots)||slots.length>spec.maxPrm)throw Error(info.family+": превышен лимит ПРМ ("+spec.maxPrm+")");
 let di=integer(info.baseDi,0,512,id+".DI"),doChannels=integer(info.baseDo,0,512,id+".DO");
 for(const moduleName of slots){
  const mod=modules[moduleName];
  if(!mod)throw Error("Неизвестный ПРМ "+moduleName+" — укажи проверенную конфигурацию");
  di+=mod.di;doChannels+=mod.do;
 }
 return {
  id, family:info.family,modification:String(info.modification||"НЕ УКАЗАНА"),
  modules:[...slots],baseDi:info.baseDi,baseDo:info.baseDo,
  totalDi:di,totalDo:doChannels,
  interfaces:{ethernet:spec.ethernet,rs485:spec.rs485},
  capacityConfidence:info.modification?"user_supplied_not_verified":"unverified_exact_modification",
  source:spec.source
 };
}
function build(wiring,hardware){
 if(!wiring||!wiring.planningCounts||!hardware)throw Error("Нет данных схемы или ПР");
 const main=device(hardware.primary,"PLC1");
 const secondaries=hardware.secondary||[];
 if(!Array.isArray(secondaries)||secondaries.length>16)throw Error("Недопустимое количество дополнительных ПР");
 const devices=[main,...secondaries.map((x,i)=>device(x,"PLC"+(i+2)))];
 const link=hardware.link||"none";
 if(!["none","rs485-modbus-rtu","ethernet-modbus-tcp"].includes(link))throw Error("Неизвестный протокол связи");
 if(devices.length>1){
  if(link==="none")throw Error("Для нескольких ПР настрой сетевой обмен");
  if(link==="ethernet-modbus-tcp"&&devices.some(x=>!x.interfaces.ethernet))
    throw Error("Не все выбранные ПР поддерживают Ethernet/Modbus TCP");
  if(link==="rs485-modbus-rtu"&&!hardware.rs485AvailableOnAll)
    throw Error("RS-485 должен быть физически установлен на всех ПР");
 }
 const counts=wiring.planningCounts;
 const required={
  di:counts.uniqueReedInputs+counts.commonInputs,
  do:hardware.signaling==="door"?counts.estimatedDOWithDoorSignals:counts.estimatedDOWithRoomSignals
 };
 const capacity={di:devices.reduce((n,x)=>n+x.totalDi,0),do:devices.reduce((n,x)=>n+x.totalDo,0)};
 const remaining={di:capacity.di-required.di,do:capacity.do-required.do};
 const warnings=[];
 if(devices.some(x=>!x.modification||x.modification==="НЕ УКАЗАНА"))
  warnings.push("Не указаны точные модификации ПР — введённые числа DI/DO не подтверждены каталогом.");
 warnings.push("Проверить типы каналов: сухой контакт, вход ~230 В, транзистор/реле. Аналоговые DI и транзисторные DO нельзя автоматически считать заменой нужных релейных каналов.");
 if(devices.length>1){
  warnings.push("Суммарная ёмкость нескольких ПР не означает доступность каждого сигнала: требуется индивидуальное размещение зон, локальных I/O и карта Modbus.");
  warnings.push("Проверить разрыв связи, время устаревания сетевых данных, переход в безопасное состояние, взаимные блокировки общей двери и одновременные перезапуски.");
 }
 if(remaining.di<0||remaining.do<0)warnings.push("Не хватает физических каналов. Нужна другая модификация, ПРМ или дополнительные устройства.");
 return {
  schema:"airlock-hardware-estimate/0.1",
  status:"CAPACITY_ONLY_NOT_PIN_MAPPING_OR_DEPLOYABLE_FBD",
  devices,link,required,capacity,remaining,
  aggregateCapacitySufficient:remaining.di>=0&&remaining.do>=0,
  needsNetworkMapping:devices.length>1,
  warnings
 };
}
return {families,modules,build};
})();
