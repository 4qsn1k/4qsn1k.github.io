/* Distributed I/O worksheet. Logical channels ONLY; not a PLC pinout, Modbus
 * register configuration, physical interlock, or deployable Owen Logic project.
 */
const AirlockDistributedPlanner=(()=>{
"use strict";
const sym=id=>"D_"+String(id).replace(/[^A-Za-z0-9_]/g,"_");
const owner=(table,id,devices,label)=>{
 const x=table?.[String(id)];
 if(!x||!devices.some(d=>d.id===x))throw Error(label+" "+id+": назначь существующий ПР");
 return x;
};
function channels(device,kind,hardwarePlanner){
 const slots=[];
 const add=(prefix,n)=>{for(let i=1;i<=n;i++)slots.push({
  slot:device.id+"."+prefix+"."+kind+i,
  kind,deviceId:device.id,provisional:true,physicalTerminal:null
 })};
 add("BASE",kind==="DI"?device.baseDi:device.baseDo);
 device.modules.forEach((name,index)=>{
  const module=hardwarePlanner.modules[name];
  add("PRM"+(index+1),module[kind.toLowerCase()]);
 });
 return slots;
}
function build(model,wiring,hardware,hardwarePlanner,topology){
 if(!model||!wiring||!hardwarePlanner||!topology)throw Error("Недостаточно данных");
 const estimate=hardwarePlanner.build(wiring,hardware);
 const devices=estimate.devices;
 const ids=new Set(devices.map(d=>d.id));
 const zones=wiring.activeRoomIds.map(String);
 const doors=wiring.blockRequests.map(x=>String(x.doorId));
 const roomOwners={},doorInputOwners={},doorOutputOwners={};
 for(const roomId of zones)roomOwners[roomId]=owner(topology.roomOwners,roomId,devices,"Помещение");
 for(const doorId of doors){
  doorInputOwners[doorId]=owner(topology.doorInputOwners,doorId,devices,"DI двери");
  doorOutputOwners[doorId]=owner(topology.doorOutputOwners,doorId,devices,"DO двери");
 }
 const alarmOwner=topology.alarmOwner||devices[0].id;
 if(!ids.has(alarmOwner))throw Error("Неизвестный ПР для общей тревоги");
 const available=Object.fromEntries(devices.map(d=>[d.id,{
  DI:channels(d,"DI",hardwarePlanner),DO:channels(d,"DO",hardwarePlanner)
 }]));
 const cursor=Object.fromEntries(devices.map(d=>[d.id,{DI:0,DO:0}]));
 const allocations={DI:[],DO:[]},transfers=new Map();
 function allocate(kind,signal,controller,note){
  if(allocations[kind].some(x=>x.signal===signal))throw Error("Дублирование "+kind+" "+signal);
  const i=cursor[controller][kind]++;
  const channel=available[controller][kind][i];
  if(!channel)throw Error("Недостаточно "+kind+" на "+controller+": "+signal+
    " (общая сумма DI/DO может быть достаточной)");
  const value={signal,controller,...channel,note,verifiedHardware:false};
  allocations[kind].push(value);
  return value;
 }
 const roomControllers=[...new Set(Object.values(roomOwners))].sort();
 // Common inputs cannot silently be assumed to exist over a network.
 // Allocate a distinct, independently wired logical FireNormal/ResetFault DI
 // on each controller hosting an FB. Site wiring must be approved separately.
 for(const plc of roomControllers){
  for(const signal of ["FireNormal","ResetFault"])
   allocate("DI",signal+"@"+plc,plc,"Separate local DI; physical wiring not verified");
 }
 for(const doorId of doors){
  allocate("DI","CLOSED_"+sym(doorId),doorInputOwners[doorId],
    "One physical reed input. Other controllers receive a monitored copy");
 }
 function publish(signal,from,to,consumer){
  if(from===to)return;
  const key=from+"|"+to+"|"+signal;
  if(!transfers.has(key))transfers.set(key,{
   signal,from,to,consumers:[],
   channelKind:"BOOL_MONITORED_DRAFT",address:null,
   requireFresh:true,whenStale:"DENY_LOGICAL_GREEN_AND_RAISE_DIAGNOSTIC",
   emergencyEgress:"INDEPENDENT_HARDWARE"
  });
  transfers.get(key).consumers.push(consumer);
 }
 // Reeds and the FB hosting that room may live on different controllers.
 for(const input of wiring.inputs.filter(x=>x.doorId)){
  const src=doorInputOwners[String(input.doorId)];
  for(const fb of input.controllers){
   const roomId=String(fb.replace("FB_Room_N",""));
   publish("CLOSED_"+sym(input.doorId),src,roomOwners[roomId],fb+"."+input.id);
  }
 }
 // Each final lock-request is produced locally from all participating zones.
 for(const request of wiring.blockRequests){
  const d=String(request.doorId),dest=doorOutputOwners[d];
  allocate("DO",request.result,dest,"Final logical request; NOT direct lock command");
  for(const s of request.sources){
   const name=s.split(".")[0],roomId=name.replace("FB_Room_N","");
   publish(s,roomOwners[roomId],dest,request.result);
  }
 }
 const useDoorTraffic=hardware.signaling==="door";
 const traffic=useDoorTraffic?wiring.trafficLightOptions.perDoor:
  wiring.trafficLightOptions.roomGroups;
 for(const item of traffic){
  const destination=useDoorTraffic?doorOutputOwners[String(item.doorId)]:
   roomOwners[String(item.id.replace(/^ROOM_(.*?)_SIGNAL_RELAY$/,"$1"))];
  allocate("DO",item.id,destination,
    "One changeover DO with NC red, NO green; no physical terminal assignment");
  if(useDoorTraffic){
   for(const id of item.roomIds){
    publish("FB_Room_N"+id+".O_Ready",roomOwners[String(id)],
      destination,item.id);
   }
  }
 }
 for(const request of wiring.ventilationControl.requests){
  const destination=roomOwners[String(request.roomId)];
  allocate("DO",request.id,destination,
   "Virtual ventilation request only; not fan power; no completion feedback");
 }
 allocate("DO","ANY_ALARM",alarmOwner,"Logical OR; not certified fire alarm");
 for(const roomId of zones){
  publish("FB_Room_N"+roomId+".O_Alarm",roomOwners[roomId],alarmOwner,"ANY_ALARM");
 }
 const networkSignals=[...transfers.values()].sort((a,b)=>
   (a.from+"|"+a.to+"|"+a.signal).localeCompare(b.from+"|"+b.to+"|"+b.signal));
 const remoteLinks=networkSignals.length;
 if(remoteLinks && devices.length<2)throw Error("Внутренняя ошибка топологии");
 if(remoteLinks && !["rs485-modbus-rtu","ethernet-modbus-tcp"].includes(estimate.link))
  throw Error("Дистанционные сигналы требуют подтверждённой сети");
 // Draft publisher/consumer register indices, NOT addresses on Owen PLCs.
 const nextByPublisher={};
 for(const item of networkSignals){
  const i=nextByPublisher[item.from]||0;
  item.proposedPublisherWordIndex=i;
  item.proposedModbusAddress=null;
  nextByPublisher[item.from]=i+1;
 }
 return {
  schema:"airlock-distributed-placement/0.1",
  status:"DRAFT_PLACEMENT_NO_PHYSICAL_TERMINALS_NO_MODBUS_REGISTERS",
  controllers:devices,topology:{roomOwners,doorInputOwners,doorOutputOwners,alarmOwner},
  allocations,
  network:{protocol:estimate.link,signals:networkSignals,
   proposedWordIndicesAreNotModbusAddresses:true,
   heartbeatRequired:remoteLinks>0,
   timeoutMs:null,timeoutSelectionRequired:remoteLinks>0,
   dataFreshnessValidationNotImplemented:true,
   noPermissionOnStale:true},
  capacity:devices.map(d=>({
   id:d.id,
   usedDi:cursor[d.id].DI,totalDi:available[d.id].DI.length,
   usedDo:cursor[d.id].DO,totalDo:available[d.id].DO.length
  })),
  warnings:[
   "DO и DI пронумерованы по предварительным слотам BASE/PRM: это НЕ заводские клеммы.",
   "Порядок каналов и типы электрических входов/выходов требуют паспорта точной модификации.",
   "Modbus-слоты здесь не имеют адресов. Нужны утверждённые регистры, роли Master/Slave, watchdog и тайм-аут.",
   "Общие входы АПС и ResetFault требуют независимой проверки проводки на каждом ПР.",
   "Потеря сетевой свежести должна ЗАПРЕЩАТЬ логический зелёный; физическое отпирание по АПС независимо.",
   "Схема не является программой управления дверьми; алгоритм не проверен в нативном Owen Logic."
  ]
 };
}
function logicalDoorPermit({closed,fireNormal,allRoomReady,finalBlock,
 networkFresh,localFault}){
 // Unknown and stale values cannot grant positive authorisation.
 return closed===true&&fireNormal===true&&allRoomReady===true&&
   finalBlock===false&&networkFresh===true&&localFault===false;
}
return {build,logicalDoorPermit};
})();
