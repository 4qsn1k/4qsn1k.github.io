"use strict";
/* Airlock engineer's offline I/O sheet for a confirmed physical door graph.
 * This is a CAPACITY / CHANNEL SLOT proposal, NOT terminal numbers, a
 * wiring schematic, an Owen Logic device-map, or a controller program.
 *
 * Completely independent from native .owle assembly / Codex work.
 */
const {select,PRS,PRM}=require("./hardware-auto-selector.js");
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const same=(a,b)=>[...a].sort().join("|")===[...b].sort().join("|");
const digits=n=>String(n).padStart(2,"0");
const req=(v,name)=>{assert(typeof v==="string"&&v.length>0,"MISSING_"+name);return v};
const key=(prefix,id)=>prefix+"_"+String(id).replace(/[^a-zA-Z0-9_]/g,"_");
const bool=(x,k)=>{assert(typeof x==="boolean","BAD_"+k);return x};
function validateGraph(candidate){
 assert(candidate?.schema==="airlock-cad-candidate/1","UNSUPPORTED_CANDIDATE_SCHEMA");
 assert(candidate.outputSafety==="NOT_FOR_NATIVE_OWLE_GENERATION_OR_PLC",
  "REQUIRES_NONDEPLOYABLE_CANDIDATE");
 const rooms=candidate.physicalSpaces,doors=candidate.physicalDoors,zones=candidate.interlockZones;
 assert(Array.isArray(rooms)&&rooms.length>=1&&Array.isArray(doors)&&doors.length>=2&&
  Array.isArray(zones),"ROOM_DOOR_ZONE_COUNTS");
 const roomSet=new Set(rooms.map(r=>req(r.id,"ROOM_ID")));
 assert(roomSet.size===rooms.length,"DUPLICATE_ROOMS");
 const doorSet=new Set(doors.map(d=>req(d.id,"DOOR_ID")));
 assert(doorSet.size===doors.length,"DUPLICATE_PHYSICAL_DOORS");
 const excluded=new Set((candidate.excludedSpaces||[]).map(e=>req(e.id,"EXCLUDED_SPACE")));
 assert([...excluded].every(r=>!roomSet.has(r)),"EXCLUDED_ROOM_IN_ACTIVE_GRAPH");
 const externalSet=new Set((candidate.externalSpaces||[]).map(e=>req(e.id,"EXTERNAL_SPACE")));
 assert([...externalSet].every(r=>!roomSet.has(r)),"EXTERNAL_ROOM_IN_ACTIVE_GRAPH");
 assert(zones.length===rooms.length,"ROOM_ZONE_COUNT_MISMATCH");
 for(const door of doors){
  assert(door.a!==door.b&&
   [door.a,door.b].every(p=>roomSet.has(p)||externalSet.has(p)),"INVALID_DOOR_ENDPOINT_"+door.id);
  assert([door.a,door.b].some(p=>roomSet.has(p)),"DOOR_WITHOUT_CONTROLLED_ROOM_"+door.id);
  assert(door.hardwareTerminal===null&&door.reedInput===null,
   "SITE_WIRING_ALREADY_PRESENT_REQUIRES_REVIEW");
 }
 const zonesByRoom=new Map(zones.map(z=>[z.roomId,z]));
 assert(zonesByRoom.size===rooms.length,"DUPLICATE_ZONE_ROOM");
 assert(candidate.timedBlockingRequirement?.requiresOperatorClarification===false&&
  candidate.timedBlockingRequirement?.holdSeconds===10,"TIMED_POLICY_UNCONFIRMED");
 for(const room of rooms){
  const zone=zonesByRoom.get(room.id);
  assert(zone&&zone.timingMode==="timed-hold"&&zone.timedBlockHoldSec===10,
   "TIMED_ZONE_MISSING_"+room.id);
  const incident=doors.filter(d=>d.a===room.id||d.b===room.id).map(d=>d.id);
  assert(same(incident,zone.doorIds)&&zone.doorIds.length>=2,
   "INCIDENT_ZONE_MEMBERSHIP_MISMATCH_"+room.id);
 }
 const cardDoor=candidate.accessControlTopology?.cardReaderDoorId;
 assert(doorSet.has(cardDoor)&&candidate.accessControlTopology?.noReadersOnOtherDoors===true,
  "SINGLE_CARD_DOOR_NOT_CONFIRMED");
 assert(doors.filter(d=>d.readerRequired).length===1&&
   doors.find(d=>d.id===cardDoor)?.readerRequired===true,"SINGLE_READER_MAPPING_REQUIRED");
 assert(candidate.accessControlTopology.cardReaderController==="BOLID_S2000_2",
  "UNSUPPORTED_CARD_CONTROLLER");
 assert((candidate.controllerAssignments||[]).length===0,"EXISTING_CONTROLLER_MAPPING_REQUIRES_REVIEW");
 assert((candidate.inputAssignments||[]).length===0&&(candidate.outputAssignments||[]).length===0,
  "EXISTING_IO_MAPPING_REQUIRES_REVIEW");
 return {rooms,doors,zones,cardDoor,externalSet};
}
function slotBank(primary,type){
 const pr=PRS.find(p=>p.id===primary.controller);
 assert(pr,"UNKNOWN_PRIMARY_CONTROLLER");
 const numbers=[{unit:pr.id,count:type==="DI"?pr.di:pr.relayDo}];
 for(let i=0;i<primary.modules.length;i++){
  const prm=PRM.find(p=>p.id===primary.modules[i]);
  assert(prm,"UNKNOWN_PERSISTED_MODULE");
  numbers.push({unit:prm.id+"#"+(i+1),count:type==="DI"?prm.di:prm.relayDo});
 }
 const output=[];
 for(const u of numbers)for(let i=1;i<=u.count;i++)
  output.push({unit:u.unit,channel:type+digits(i),verifiedTerminal:null});
 return output;
}
function build(candidate,opts={}){
 const {rooms,doors,cardDoor}=validateGraph(candidate);
 const known=new Set([
  "normalAccessInterface","perLocalDoorButtons","includeCommonAlarmRelay",
  "readerRelayFeedbackDi","lampMode","reserveDi","reserveDo","networkMode"
 ]);
 assert(Object.keys(opts).every(k=>known.has(k)),"UNKNOWN_PRELIMINARY_SETTING");
 assert(opts.normalAccessInterface==="lock-permit","EXPLICIT_NO_BUSY_LOCK_GATE_REQUIRED");
 const perLocalDoorButtons=opts.perLocalDoorButtons??1;
 assert([1,2].includes(perLocalDoorButtons),"LOCAL_BUTTON_COUNT_MUST_BE_ONE_OR_TWO");
 const extraAlarm=bool(opts.includeCommonAlarmRelay??false,"COMMON_ALARM");
 const readerFeedback=bool(opts.readerRelayFeedbackDi??false,"BOLID_RELAY_FEEDBACK");
 const lampMode=opts.lampMode??"door";
 assert(["door","room"].includes(lampMode),"INVALID_LAMP_MODE");
 const reserveDi=opts.reserveDi??2,reserveDo=opts.reserveDo??2;
 const networkMode=opts.networkMode??"rs485-modbus-rtu";
 assert(Number.isInteger(reserveDi)&&reserveDi>=0&&reserveDi<=128&&
  Number.isInteger(reserveDo)&&reserveDo>=0&&reserveDo<=128,"INVALID_RESERVE");
 const inputs=[],outputs=[];
 const add=(list,id,description,meta={})=>{
  assert(!list.some(x=>x.id===id),"DUPLICATE_LOGICAL_SIGNAL_"+id);
  list.push({id,kind:list===inputs?"DI":"RELAY_DO",description,
   tentativeChannel:null,physicalTerminal:null,...meta});
 };
 // One PHYSICAL reed per physical door, regardless of its two incident zones.
 for(const d of doors){
  add(inputs,key("CLOSED",d.id),"Геркон: дверь закрыта",{doorId:d.id,
   assertion:"CLOSED_WHEN_SIGNAL_1_UNVERIFIED",source:"PHYSICAL_REED",
   incidentRooms:[d.a,d.b].filter(x=>rooms.some(r=>r.id===x))});
 }
 // Card authorisation is Bolid K1 in its OWN dry-contact grant circuit,
 // not a phantom reader input on the Owen controller.
 const localDoors=doors.filter(d=>d.id!==cardDoor);
 for(const d of localDoors){
  for(let side=0;side<perLocalDoorButtons;side++){
   add(inputs,key("REQ",d.id)+(perLocalDoorButtons===2?"_SIDE_"+(side+1):""),
    "Запрос от местной кнопки",{doorId:d.id,source:"LOCAL_BUTTON",
     side:perLocalDoorButtons===2?"SIDE_"+(side+1):"SIDE_UNCONFIRMED"});
  }
 }
 add(inputs,"FIRE_NORMAL","Сигнал АПС норма (информационный DI; аварийное отпирание отдельно)",
  {source:"FIRE_NORMAL_UNVERIFIED",safety:"NOT_THE_INDEPENDENT_EGRESS_CIRCUIT"});
 add(inputs,"RESET_FAULT","Сервисный сброс аварии",{source:"OPERATOR_RESET_BUTTON_UNCONFIRMED"});
 if(readerFeedback)add(inputs,"BOLID_K1_MONITOR","Дополнительная обратная связь K1 С2000-2",
  {source:"OPTIONAL_ISOLATED_RELAY_MONITOR",safety:"DOES_NOT_REPLACE_K1_AUTHORIZATION"});
 for(const d of doors){
  add(outputs,key("NORMAL_PERMIT",d.id),"Разрешение штатного отпирания",
   {doorId:d.id,source:d.id===cardDoor?"PLC_PERMIT_AND_BOLID_K1_EXTERNAL":
    "LOCAL_BUTTON_AND_PLC_PERMIT",emergencyRelease:"SEPARATE_APPROVED_HARDWARE"});
 }
 const lightSet=lampMode==="door"?doors.map(d=>({id:d.id,doorId:d.id})):
  rooms.map(r=>({id:r.id,roomId:r.id}));
 for(const entity of lightSet){
  const {id,...location}=entity;
  add(outputs,key("LAMP_GREEN",id),"Реле светофора (красный/зелёный через переключающий контакт)",
   {...location,source:"LOGICAL_GREEN_PERMIT_ONLY",
    inactiveLamp:"RED_ONLY_IF_LAMP_POWER_AVAILABLE"});
 }
 add(outputs,"BUZZER_COMMON","Общий зуммер: длительное открытие / предупреждение",
  {source:"SHARED_BUZZER",alarmDurationSeconds:"UNVERIFIED_SITE_PARAMETER"});
 if(extraAlarm)add(outputs,"ANY_ALARM_RELAY","Отдельный выход аварии",
  {source:"OPTIONAL_ALARM_DO"});
 const planned=select(doors.length,{
  readers:1,busyChannels:0,
  extraInputs:localDoors.length*perLocalDoorButtons+Number(readerFeedback),
  lampChannelsTotal:lightSet.length,extraOutputs:Number(extraAlarm),
  buzzerChannels:1,reserveDi,reserveDo,networkMode
 });
 assert(planned.required.di===inputs.length&&planned.required.relayDo===outputs.length,
  "SELECTOR_IO_DRIFT");
 const primary=planned.primary;
 const assigned={inputs:[],outputs:[]};
 let spare={inputs:[],outputs:[]};
 if(primary){
  const physicalDi=slotBank(primary,"DI"),physicalDo=slotBank(primary,"DO");
  assert(physicalDi.length===primary.totalDi&&physicalDo.length===primary.totalDo,
   "CAPACITY_NOT_EQUAL_TO_SLOT_BANK");
  assert(physicalDi.length>=inputs.length&&physicalDo.length>=outputs.length,
   "EQUIPMENT_UNDERSIZED");
  inputs.forEach((s,i)=>{s.tentativeChannel=physicalDi[i];});
  outputs.forEach((s,i)=>{s.tentativeChannel=physicalDo[i];});
  assigned.inputs=inputs.filter(s=>s.tentativeChannel!==null);
  assigned.outputs=outputs.filter(s=>s.tentativeChannel!==null);
  spare={inputs:physicalDi.slice(inputs.length),outputs:physicalDo.slice(outputs.length)};
 }
 return {
  schema:"airlock-cad-io-preflight/1",
  status:"PRELIMINARY_ONLY_TERMINALS_UNVERIFIED_NO_PLC_IO",
  candidateId:candidate.id,
  policy:{
   physicalScudReaders:1,physicalBolidBusyDo:0,
   normalAccessInterface:"K1_SCUD_AUTHORIZED_AND_SEPARATE_PLC_LOCK_PERMIT",
   localButtonsPerDoor:perLocalDoorButtons,
   readerRelayFeedbackDi:readerFeedback,
   lampMode,hasSeparateCommonAlarmRelay:extraAlarm,
   holdSeconds:10,openDoorAlarmSeconds:"SITE_SETTING_UNCONFIRMED"
  },
  totals:{physicalDoors:doors.length,controlledRooms:rooms.length,
   localButtonChannels:localDoors.length*perLocalDoorButtons,
   physicalReedChannels:doors.length,
   requiredDi:inputs.length,requiredRelayDo:outputs.length,
   reserveDi,reserveDo,
   requiredWithReserveDi:inputs.length+reserveDi,
   requiredWithReserveDo:outputs.length+reserveDo},
  inputs,outputs,
  proposedHardware:primary?{
   controller:primary.controller,modules:[...primary.modules],
   availableDi:primary.totalDi,availableRelayDo:primary.totalDo,
   spareDi:spare.inputs.length,spareRelayDo:spare.outputs.length,
   reservedDi:reserveDi,reservedRelayDo:reserveDo,
   catalogChecked:false,terminalNumbersVerified:false,
   slotMapping:"ABSTRACT_UNIT_CHANNEL_ONLY_NOT_MANUFACTURER_TERMINAL"
  }:null,
  alternatives:planned.alternatives.map(x=>({
   controller:x.controller,modules:x.modules,availableDi:x.totalDi,
   availableRelayDo:x.totalDo,reservesMet:x.reservesMet
  })),
  networkAlternative:planned.networkAlternative,
  warnings:[
   "Buttons per local door is a SCENARIO, not a confirmed on-site button count or direction. One reed cannot determine travel direction.",
   "Source fixture contains a LEGACY busyContactToBolid flag; later operator decision overrides it for this lock-permit scenario. Physical BUSY output is ZERO.",
   "K1 of S2000-2 is part of external normal access authorisation. No implicit Owen DI is consumed unless optional isolated K1 monitoring is selected.",
   "Tentative channels PR102:DI01/DO01 etc are abstract capacity slots, NOT verified device terminal labels, screw numbers or Owen Logic physical mappings.",
   "An opened door must not grant another lock. Before actual control, implement zone request arbitration, opening feedback, timeout, fail-safe state and 10s reset in native OWLE.",
   "No approved emergency escape/fire release is represented here. Ordinary PLC authorization must NEVER be the only means of egress.",
   "A single normal lock actuator relay per door does NOT implement directional permission; early return toward dirtier area remains unconfirmed.",
   "One lamp DO per red/green pair assumes external correctly rated changeover relay; green must not mean physically unlocked.",
   "Full-scale one-controller option is based on channel CAPACITY only, not native .owle compile, power budget, separation or RS-485 test.",
   "For several PRs, a positive aggregate channel count is not proof of safe door/zone partitioning or network watchdog."
  ],
  safety:{independentFireEgressApproved:false,lockTypeAndPolarityApproved:false,
   relayWiringVerified:false,nativeOwenLogicCompiled:false,
   physicalEquipmentProgrammed:false}
 };
}
module.exports={build,validateGraph};
