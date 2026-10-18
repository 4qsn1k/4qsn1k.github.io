/* Airlock portable SCADA project package. Local only. No PLC connections.
 * One project model feeds generator, demo and read-only SCADA.
 */
const AirlockProjectPackage=(()=>{
"use strict";
const SCHEMA="airlock-scada-project/1";
const id=x=>String(x);
const managed=r=>["mutual","purge"].includes(r.interlockMode||(r.interlockEnabled?"purge":"none"));
function validate(input){
 const m=input?.schema===SCHEMA?input.model:input;
 const errors=[];
 if(!m||typeof m!=="object"||!Array.isArray(m.rooms)||!Array.isArray(m.doors)){
  throw Error("Ожидается модель с rooms[] и doors[] либо пакет "+SCHEMA);
 }
 if(m.rooms.length>120||m.doors.length>500)errors.push("Превышен лимит демонстрационного интерфейса");
 if(m.rooms.length===0)errors.push("Не добавлены помещения");
 const roomIds=new Set(),doorIds=new Set(),ends=new Set();
 for(const r of m.rooms){
  if(r==null||r.id==null||!id(r.id).trim()){errors.push("Помещение без ID");continue}
  const key=id(r.id);
  if(roomIds.has(key))errors.push("Дублируется помещение "+key);
  roomIds.add(key);
  if(![r.x,r.y,r.w,r.h].every(v=>Number.isFinite(Number(v)))||Number(r.w)<=0||Number(r.h)<=0)
   errors.push("Некорректная геометрия помещения "+key);
 }
 for(const d of m.doors){
  if(d==null||d.id==null||!id(d.id).trim()){errors.push("Дверь без ID");continue}
  const key=id(d.id),a=id(d.a),b=id(d.b);
  if(doorIds.has(key))errors.push("Дублируется дверь "+key);
  doorIds.add(key);
  if(a===b||!roomIds.has(a)||!roomIds.has(b))errors.push("Неверные помещения двери "+key);
  const pair=[a,b].sort().join("\u0000");
  if(ends.has(pair))errors.push("Между помещениями "+a+"/"+b+" больше одной двери (требует отдельного идентификатора связи)");
  ends.add(pair);
 }
 for(const r of m.rooms.filter(managed)){
  const count=m.doors.filter(d=>id(d.a)===id(r.id)||id(d.b)===id(r.id)).length;
  if(count<2)errors.push("Для симуляции помещения "+id(r.id)+" требуется минимум 2 двери");
 }
 if(errors.length)throw Error(errors.join("; "));
 return JSON.parse(JSON.stringify({
   ...m,
   rooms:m.rooms.map(r=>({...r,id:id(r.id)})),
   doors:m.doors.map(d=>({...d,id:id(d.id),a:id(d.a),b:id(d.b)})),
   rules:m.rules||[],exemptions:m.exemptions||[],
   defaultOpenDoorAlarmSec:m.defaultOpenDoorAlarmSec||30
 }));
}
function build(raw){
 const model=validate(raw);
 const rooms=model.rooms.filter(managed);
 const doors=model.doors.filter(d=>rooms.some(r=>r.id===d.a||r.id===d.b));
 const shared=doors.filter(d=>rooms.filter(r=>r.id===d.a||r.id===d.b).length>1);
 return {
  schema:SCHEMA,
  label:model.name||"Проект шлюзов",
  generatedAt:new Date().toISOString(),
  model,
  topology:{roomCount:model.rooms.length,doorCount:model.doors.length,controlledRoomIds:rooms.map(r=>r.id),
   controlledDoorIds:doors.map(d=>d.id),sharedDoorIds:shared.map(d=>d.id)},
  modes:{simulation:"reference_js_only",monitor:"read_only_telemetry_future"},
  safety:"No PLC access, program upload, physical locks, fire release, or certified commissioning"
 };
}
function load(raw){return build(raw).model}
return {SCHEMA,validate,build,load};
})();
