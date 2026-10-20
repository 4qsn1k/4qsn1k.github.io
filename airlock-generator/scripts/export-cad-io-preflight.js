#!/usr/bin/env node
"use strict";
/* Deterministic export of provisional I/O plan. No native .owle,
 * actual terminal assignment, network connection or real device access.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {build}=require("../cad-io-preflight.js");
const digest=buf=>crypto.createHash("sha256").update(buf).digest("hex");
const csvQuote=x=>{
 let s=String(x??"");
 if(/^[=+@-]/.test(s))s="'"+s; // spreadsheet CSV formula injection hardening
 return '"'+s.replaceAll('"','""')+'"';
};
const csv=rows=>"\uFEFF"+rows.map(row=>row.map(csvQuote).join(";")).join("\r\n")+"\r\n";
const json=x=>JSON.stringify(x,null,2)+"\n";
const mkTable=(list,type)=>list.map(x=>({
 type,id:x.id,scope:x.doorId||x.roomId||"",
 source:x.source,channel:x.tentativeChannel?
  x.tentativeChannel.unit+":"+x.tentativeChannel.channel:"НЕ НАЗНАЧЕН",
 terminal:"НЕ ПОДТВЕРЖДЕНА",description:x.description
}));
function renderReport(p){
 const t=p.totals,h=p.proposedHardware;
 const chosen=h?(h.controller+(h.modules.length?" + "+h.modules.join(" + "):"")):
  "ОДНОКОНТРОЛЛЕРНОЕ РЕШЕНИЕ НЕ НАЙДЕНО";
 const rows=items=>items.map(x=>"| `"+x.id+"` | "+
  (x.doorId||x.roomId||"—")+" | "+
  (x.tentativeChannel?
   ("`"+x.tentativeChannel.unit+":"+x.tentativeChannel.channel+"`"):"—")+
  " | *Не назначена* |").join("\n");
 return [
  "# Ведомость I/O — Airlock CNC → 1257 → 1252",
  "",
  "**Статус: ТОЛЬКО ПРЕДВАРИТЕЛЬНЫЙ РАСЧЁТ.** Не электрическая схема, не",
  "подключение к клеммам, не заводская карта адресов и не программа ПР.",
  "",
  "## Сценарий",
  "",
  "- Реальных дверей: **"+t.physicalDoors+"**; шлюзовых помещений: **"+t.controlledRooms+"**.",
  "- Местных кнопок на дверь вне СКУД: **"+p.policy.localButtonsPerDoor+"** (гипотеза для расчёта).",
  "- Карту читает только С2000-2 на CNC → 1257; его K1 — внешнее",
  "  штатное разрешение, физический выход BUSY от ПР: **0**.",
  "- Выходы ПР управляют только штатным разрешением замка.",
  "  Аварийное освобождение не считается или не проектируется этим документом.",
  "- Светофоры: "+(p.policy.lampMode==="door"?"по каждой двери":"по каждому помещению")+
    "; отдельное реле общей аварии: "+(p.policy.hasSeparateCommonAlarmRelay?"есть":"нет")+".",
  "- Сигнал FireNormal учтён как DI, но **не является** независимым",
  "  аппаратным освобождением аварийного выхода.",
  "",
  "## Расчёт и вариант оборудования",
  "",
  "| Параметр | Требуется | С резервом | Ёмкость выбранной конфигурации |",
  "| --- | ---: | ---: | ---: |",
  "| DI (герконы, кнопки, АПС, сброс) | "+t.requiredDi+" | "+
   t.requiredWithReserveDi+" | "+(h?.availableDi??"нет")+" |",
  "| Релейные DO (замки, светофоры, зуммер) | "+t.requiredRelayDo+
   " | "+t.requiredWithReserveDo+" | "+(h?.availableRelayDo??"нет")+" |",
  "",
  "**Рекомендовано по арифметике каналов:** "+chosen+".",
  "",
  "Предварительные свободные каналы сверх рабочей нагрузки: "+
   (h?(`DI ${h.spareDi}, DO ${h.spareRelayDo}`):"не рассчитаны")+".",
  "Из них запрошенный конструктором резерв: DI "+t.reserveDi+", DO "+t.reserveDo+".",
  "",
  "## Логические входы",
  "",
  "| Сигнал | Дверь/зона | Предварительный слот, НЕ клемма | Реальная клемма |",
  "| --- | --- | --- | --- |",
  rows(p.inputs),"",
  "## Логические выходы",
  "",
  "| Сигнал | Дверь/зона | Предварительный слот, НЕ клемма | Реальная клемма |",
  "| --- | --- | --- | --- |",
  rows(p.outputs),"",
  "## Что обязательно проверить до монтажа",
  "",
  ...p.warnings.map((w,i)=>(i+1)+". "+w),
  "",
  "**Не загружать в ПР по этой ведомости.** Согласовать точную",
  "модификацию, электросхему замков и пожарное/аварийное освобождение.",
  ""
 ].join("\n");
}
function parseArgs(args){
 if(args.length<2)throw Error("USAGE <candidate.json> <NEW_OUTPUT_DIR> [--buttons=1|2] [--alarm] [--room-lamps] [--k1-feedback]");
 const [source,target,...flags]=args;
 const opts={normalAccessInterface:"lock-permit"};
 const seen=new Set();
 for(const flag of flags){
  const type=flag.split("=")[0];
  if(seen.has(type))throw Error("DUPLICATE_FLAG_"+type);
  seen.add(type);
  if(flag==="--buttons=1")opts.perLocalDoorButtons=1;
  else if(flag==="--buttons=2")opts.perLocalDoorButtons=2;
  else if(flag==="--alarm")opts.includeCommonAlarmRelay=true;
  else if(flag==="--room-lamps")opts.lampMode="room";
  else if(flag==="--k1-feedback")opts.readerRelayFeedbackDi=true;
  else throw Error("UNKNOWN_FLAG_"+flag);
 }
 return {source:path.resolve(source),target:path.resolve(target),opts};
}
function exportPlan(args){
 const {source,target,opts}=parseArgs(args);
 if(!fs.existsSync(source)||!fs.statSync(source).isFile())throw Error("CANDIDATE_FILE_MISSING");
 if(fs.statSync(source).size>1024*1024)throw Error("CANDIDATE_TOO_LARGE");
 if(fs.existsSync(target))throw Error("NO_OVERWRITE_EXISTING_DIRECTORY");
 if(path.extname(target).toLowerCase()===".owle")throw Error("NOT_AN_OWLE_GENERATOR");
 const original=fs.readFileSync(source),c=JSON.parse(original.toString("utf8").replace(/^\uFEFF/,""));
 const p=build(c,opts);
 const records=[
  ["Тип","ID","Сфера","Источник","Слот (НЕ клемма)","Клемма","Описание"],
  ...mkTable(p.inputs,"DI").map(x=>Object.values(x)),
  ...mkTable(p.outputs,"RELAY_DO").map(x=>Object.values(x))
 ];
 const files={
  "IO-PREFLIGHT.json":json(p),
  "IO-PLAN-RU.md":renderReport(p)+"\n",
  "IO-CHANNELS.csv":csv(records)
 };
 const manifest={
  schema:"airlock-cad-io-export/1",sourceFile:path.basename(source),
  sourceSha256:digest(original),
  filesSha256:Object.fromEntries(Object.entries(files).map(([name,text])=>[name,digest(Buffer.from(text))])),
  counts:{di:p.totals.requiredDi,relayDo:p.totals.requiredRelayDo,
   doors:p.totals.physicalDoors,rooms:p.totals.controlledRooms},
  hardwareWriteCount:0,nativeOwleGenerated:false,verifiedTerminalCount:0
 };
 files["MANIFEST-SHA256.json"]=json(manifest);
 fs.mkdirSync(target,{recursive:false});
 try {
  for(const [name,text] of Object.entries(files))fs.writeFileSync(path.join(target,name),text,{flag:"wx"});
 }catch(error){fs.rmSync(target,{recursive:true,force:true});throw error;}
 return {target,...manifest};
}
if(require.main===module){
 try{console.log("IO_PREFLIGHT_EXPORT_PASS",JSON.stringify(exportPlan(process.argv.slice(2))))}
 catch(e){console.error("IO_PREFLIGHT_EXPORT_REFUSED",e.message);process.exitCode=1}
}
module.exports={parseArgs,renderReport,exportPlan};
