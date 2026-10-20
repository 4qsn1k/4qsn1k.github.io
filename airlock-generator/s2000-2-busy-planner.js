"use strict";
/* S2000-2 external BUSY scoping for access-reader channels.
 * Grounded in Bolid S2000-2 REp v2.75 (2025), sections 1.16.5, 1.17,
 * 1.19.3, 2.1, 2.5. NO device control / firmware changes / UProg writes.
 *
 * A physical controller has ONE common BUSY input/output with
 * per-reader "Принимать BUSY" settings. An input BUSY blocks reader
 * access AND the associated EXIT button, so this must not be treated
 * as a fire-safe emergency release.
 */
const MANUAL="https://bolid.ru/files/373/566/s2000_2_ret_v.2.75_aug_25.pdf";
const bool=(x,key)=>{if(typeof x!=="boolean")throw Error("BAD_BOOLEAN_"+key);return x};
const required=(x,key)=>{
 if(typeof x!=="string"||!x.trim())throw Error("BAD_"+key);
 return x.trim();
};
function assess(device){
 if(!device||typeof device!=="object")throw Error("DEVICE_REQUIRED");
 const id=required(device.id,"DEVICE_ID"),mode=required(device.mode,"MODE");
 if(!["two-independent-doors","one-door-two-directions","single-two-door-mantrap"].includes(mode))
  throw Error("UNSUPPORTED_MODE");
 const channels=device.channels;
 if(!Array.isArray(channels)||channels.length!==2)throw Error("EXACTLY_TWO_CHANNELS_REQUIRED");
 const seen=new Set(),normalized=[];
 for(const entry of channels){
  const channelId=required(entry.id,"CHANNEL_ID");
  if(seen.has(channelId))throw Error("DUPLICATE_CHANNEL_ID");
  seen.add(channelId);
  const doorId=required(entry.doorId,"DOOR_ID");
  const hasCardReader=bool(entry.hasCardReader,"CARD_READER");
  const hasExitButton=bool(entry.hasExitButton,"EXIT_BUTTON");
  const receiveBusy=bool(entry.receiveBusy,"RECEIVE_BUSY");
  const issueBusy=bool(entry.issueBusy,"ISSUE_BUSY");
  const domain=entry.blockingDomain==null?null:required(entry.blockingDomain,"BLOCKING_DOMAIN");
  if(!receiveBusy&&domain!==null)throw Error("BLOCKING_DOMAIN_WITHOUT_RECEIVE_BUSY");
  if(receiveBusy&&domain===null)throw Error("BLOCKING_DOMAIN_REQUIRED_FOR_BUSY");
  normalized.push({id:channelId,doorId,hasCardReader,hasExitButton,
   receiveBusy,issueBusy,blockingDomain:domain});
 }
 if(mode==="two-independent-doors"&&normalized[0].doorId===normalized[1].doorId)
  throw Error("TWO_DOORS_MUST_BE_DISTINCT");
 if(mode==="one-door-two-directions"&&normalized[0].doorId!==normalized[1].doorId)
  throw Error("TWO_DIRECTIONS_MUST_BE_SAME_DOOR");
 const domains=[...new Set(normalized.filter(c=>c.receiveBusy).map(c=>c.blockingDomain))];
 const conflict=domains.length>1;
 const holdChannels=normalized.filter(c=>c.receiveBusy);
 const exitButtonsAffected=holdChannels.filter(c=>c.hasExitButton).map(c=>c.id);
 const outcomes=normalized.map(c=>({
  channelId:c.id,doorId:c.doorId,
  cardAccessBlockedOnBusy:c.receiveBusy&&c.hasCardReader,
  exitButtonBlockedOnBusy:c.receiveBusy&&c.hasExitButton,
  externalBusyDomain:c.blockingDomain,
  noEffectFromBusy:!c.receiveBusy
 }));
 const recommendations=conflict?[
  "Нельзя независимо запрещать два канала разными сигналами через ОДНУ клемму BUSY.",
  "Рассмотреть два отдельных контроллера/независимых BUSY-цепи для полного запрета доступа, либо документированную схему с технологическими ШС Z1/Z2 только для разрешения считывания по картам.",
  "ШС1/ШС2 с параметром 'Разрешение считывания по ШС' НЕ эквивалентны BUSY: выходные кнопки и команды доступа не блокируются этим механизмом.",
  "Для программных команд доступа по RS-485 нужна отдельная оценка задержки, потери сети, обратной связи и местного выхода."
 ]:[
  "Клемма BUSY одна на С2000-2; параметр 'Принимать BUSY' настраивается отдельно для каждого считывателя в UProg.",
  "Если BUSY должен влиять лишь на канал 1, у канала 2 'Принимать BUSY' должен быть выключен и его независимость проверена на стенде.",
  "Если оба канала принимают BUSY, оба реагируют на один и тот же физический уровень; это ОДНА общая зона блокировки."
 ];
 return {
  schema:"airlock-s2000-2-busy-scope/1",id,mode,
  status:conflict?"CONFLICT_INDEPENDENT_DOMAINS_SHARE_ONE_BUSY":
   domains.length?"SHARED_BUSY_FEASIBLE_PENDING_HARDWARE_QA":"NO_EXTERNAL_BUSY_REQUESTED",
  channels:normalized,
  physicalBusyTerminalsOnDevice:1,
  distinctRequestedExternalBlockDomains:domains,
  plannedExternalPlcBusyRelayOutputs:conflict?null:domains.length?1:0,
  affected:outcomes,
  exitButtonsAffectedByBusy:exitButtonsAffected,
  emergencyEgressProven:false,
  manufacturerDocumentation:MANUAL,
  limitations:[
   "COMMON_BUSY_TERMINAL_PER_CONTROLLER; RECEIVE_BUSY_SELECTIVE_PER_READER",
   "ACTIVE_BUSY_BLOCKS_CARD, EXIT_BUTTON_AND_REMOTE_ACCESS_COMMANDS_ON_RECEIVING_CHANNEL",
   "NO_ASSUMED_INDEPENDENT_BLOCKING_FOR_TWO_UNRELATED_GROUPS",
   "MANTRAP_MODE_TWO_DOORS_ONE_ACCESS_POINT_ONLY; NOT_ARBITRARY_ROOM_GRAPH",
   "TECHNICAL_LOOP_Z1_Z2_CARD_ONLY_READER_GATING_NOT_EQUIVALENT_TO_BUSY",
   "LOCK_RELEASE_AND_FIRE_EGRESS_REQUIRE_INDEPENDENT_HARDWARE_APPROVAL",
   "PHYSICAL_READER_AND_BUTTON_CONFIGURATION_NOT_VERIFIED_ON_SITE"
  ],
  recommendations
 };
}
function assessSystem(devices){
 if(!Array.isArray(devices)||!devices.length)throw Error("DEVICES_REQUIRED");
 const results=devices.map(assess);
 const ids=results.map(r=>r.id);
 if(new Set(ids).size!==ids.length)throw Error("DUPLICATE_ACCESS_CONTROLLER");
 const conflict=results.some(r=>r.status==="CONFLICT_INDEPENDENT_DOMAINS_SHARE_ONE_BUSY");
 return {
  schema:"airlock-s2000-2-busy-system/1",
  status:conflict?"NOT_FEASIBLE_USING_ONLY_BUSY":"CAPACITY_ONLY_NOT_APPROVED_FOR_SITE",
  controllers:results,
  physicalBusyTerminalCount:results.length,
  plannedIsolatedPlcBusyOutputs:conflict?null:results.reduce(
   (sum,r)=>sum+r.plannedExternalPlcBusyRelayOutputs,0),
  source:MANUAL,
  safety:"No automatically safe release or egress approval. Independent BUSY wiring must not be shorted together accidentally."
 };
}
if(typeof module!=="undefined"&&module.exports)module.exports={assess,assessSystem,MANUAL};
