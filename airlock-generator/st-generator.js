/* ST generator for autonomous room module in Owen Logic. Simulation first. */
const AirlockStGenerator=(()=>{
"use strict";
const sym=id=>"D_"+String(id).replace(/[^a-zA-Z0-9_]/g,"_");
const doorsFor=(m,id)=>m.doors.filter(d=>String(d.a)===String(id)||String(d.b)===String(id))
 .sort((a,b)=>a.id.localeCompare(b.id,"en",{numeric:true}));
function validate(m,id){
 const errors=[],warnings=[];
 const r=m.rooms.find(x=>String(x.id)===String(id));
 if(!r)return {errors:["Не найдено помещение "+id],warnings};
 const mode=r.interlockMode||(r.interlockEnabled?"purge":"none");
 const ds=doorsFor(m,id);
 if(mode==="purge" && r.ventilationControlMode!==undefined &&
    !["independent","integrated"].includes(r.ventilationControlMode))
    errors.push("Неизвестный режим вентиляции");
 if(mode!=="purge"&&mode!=="mutual")errors.push("Нужен режим 'Шлюз' или 'Взаимоблокировка'");
 if(ds.length<2)errors.push("Требуются минимум две двери");
 if(ds.length>24)errors.push("Более 24 дверей: раздели на несколько контроллеров");
 if(new Set(ds.map(d=>sym(d.id))).size!==ds.length)errors.push("Совпадают ST-имена двух дверей");
 warnings.push("ST-переменные являются виртуальными сигналами, а не клеммами ПР");
 warnings.push("Пожарное отпирание должно работать независимо от логики ПР");
 warnings.push("Для общей двери запреты других комнат объединяются ИЛИ в FBD");
 if(m.rules?.length)warnings.push("Дополнительные межзонные правила этим модулем не реализованы");
 return {errors,warnings};
}
const csv=rows=>"\uFEFF"+rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\r\n")+"\r\n";
function build(m,id){
 const v=validate(m,id);if(v.errors.length)throw Error(v.errors.join("; "));
 const r=m.rooms.find(x=>String(x.id)===String(id));
 const ds=doorsFor(m,id), mode=r.interlockMode||(r.interlockEnabled?"purge":"none");
 const ventilationControlMode=mode==="purge"?(r.ventilationControlMode||"independent"):"none";
 const ventilationIntegrated=ventilationControlMode==="integrated";
 const purge=Math.round(Number(r.purgeSec)||30), timeout=Math.round(Number(m.defaultOpenDoorAlarmSec)||30);
 if(purge<1||purge>3600||timeout<1||timeout>3600)throw Error("Таймер должен быть в диапазоне 1..3600 с");
 const fb="FB_Room_N"+String(id).replace(/[^a-zA-Z0-9_]/g,"_");
 const st=[
 "// TEST ONLY: generated logical interlock, no physical I/O binding.",
 "// Fire release and egress require separate hardware circuit.",
 "FUNCTION_BLOCK "+fb,"",
 "VAR_INPUT",
 "  FireNormal : BOOL;",
 "  ResetFault : BOOL;",
 ...ds.map(d=>"  I_"+sym(d.id)+"_Closed : BOOL;"),
 "END_VAR","",
 "VAR_OUTPUT",
 "  O_Ready : BOOL;",
 "  O_Red : BOOL;",
 "  O_Green : BOOL;",
 "  O_Fault : BOOL;",
 "  O_Fire : BOOL;",
 "  O_Alarm : BOOL;",
 "  O_State : UDINT;",
 ...ds.map(d=>"  O_"+sym(d.id)+"_Block : BOOL;"),
 ...ds.map(d=>"  O_"+sym(d.id)+"_Overtime : BOOL;"),
 ...(ventilationIntegrated?["  O_VentilationRequest : BOOL;"]:[]),
 "END_VAR","",
 "VAR",
 "  State : UDINT := 0;",
 "  AnyOpen : BOOL;",
 "  AllClosed : BOOL;",
 "  OpenCount : UDINT;",
 "  FaultLatch : BOOL := FALSE;",
 ...ds.map(d=>"  Close_"+sym(d.id)+" : SYS.TON;"),
 ...ds.map(d=>"  Open_"+sym(d.id)+" : SYS.TON;"),
 ...(mode==="purge"?["  PurgeTimer : SYS.TON;"]:[]),
 "END_VAR","",
 "// Door opening is immediate; closing is confirmed after 80ms.",
 "OpenCount := 0;",
 ...ds.map(d=>"IF NOT I_"+sym(d.id)+"_Closed THEN OpenCount := OpenCount + 1; END_IF;"),
 "AnyOpen := (OpenCount > 0);",
 ...ds.map(d=>"Close_"+sym(d.id)+"(I := I_"+sym(d.id)+"_Closed, T := T#80ms);"),
 "AllClosed := "+ds.map(d=>"Close_"+sym(d.id)+".Q").join(" AND ")+";",
 ...ds.map(d=>"Open_"+sym(d.id)+"(I := NOT I_"+sym(d.id)+"_Closed AND FireNormal, T := T#"+timeout+"s);"),
 ...(mode==="purge"?["PurgeTimer(I := (State = 30) AND AllClosed AND FireNormal AND NOT FaultLatch, T := T#"+purge+"s);"]:[]),
 "","IF OpenCount > 1 THEN FaultLatch := TRUE; END_IF;",
 "IF ResetFault AND AllClosed AND FireNormal THEN",
 "  FaultLatch := FALSE;",
 "  State := 0;",
 "END_IF;","",
 "IF NOT FireNormal THEN",
 "  State := 99;",
 "ELSIF FaultLatch THEN",
 "  State := 90;",
 "ELSE",
 "  CASE State OF",
 "    0:",
 "      IF AnyOpen THEN State := 20;",
 ...(mode==="purge"?["      ELSIF AllClosed THEN State := 30;"]:["      ELSIF AllClosed THEN State := 10;"]),
 "      END_IF;",
 "    10:",
 "      IF AnyOpen THEN State := 20; END_IF;",
 "    20:",
 ...(mode==="purge"?["      IF AllClosed THEN State := 30; END_IF;"]:["      IF AllClosed THEN State := 10; END_IF;"]),
 ...(mode==="purge"?[
 "    30:",
 "      IF AnyOpen THEN State := 20;",
 "      ELSIF PurgeTimer.Q THEN State := 10;",
 "      END_IF;"]:[]),
 "    90: State := 0;",
 "    99: State := 0;",
 "    ELSE State := 0;",
 "  END_CASE;",
 "END_IF;","",
 "O_Ready := FireNormal AND (State = 10) AND NOT FaultLatch;",
 "O_Green := O_Ready;",
 "O_Red := FireNormal AND NOT O_Ready;",
 "O_Fault := FaultLatch;",
 "O_Fire := NOT FireNormal;",
 "O_State := State;",
 ...ds.map(d=>"O_"+sym(d.id)+"_Overtime := Open_"+sym(d.id)+".Q;"),
 "O_Alarm := "+ds.map(d=>"O_"+sym(d.id)+"_Overtime").join(" OR ")+";",
 ...(ventilationIntegrated?[
   "// A LOGICAL request to the external ventilation controller, not a direct fan output.",
   "// No completion feedback yet: the door dwell timer does not prove air exchange.",
   "O_VentilationRequest := (State = 30) AND AllClosed AND FireNormal AND NOT FaultLatch;"
 ]:[]),
 ...ds.map(d=>"O_"+sym(d.id)+"_Block := FireNormal AND (NOT O_Ready) AND ((State <> 20) OR I_"+sym(d.id)+"_Closed);"),
 "","END_FUNCTION_BLOCK",""
 ];
 const io=[
 {signal:"FireNormal",direction:"input",note:"1=пожарная система в норме"},
 {signal:"ResetFault",direction:"input",note:"Ручной сброс после проверки закрытия"},
 ...ds.map(d=>({signal:"I_"+sym(d.id)+"_Closed",direction:"input",doorId:d.id,note:"Геркон; 1=закрыто"})),
 ...["O_Ready","O_Red","O_Green","O_Fault","O_Fire","O_Alarm","O_State"].map(x=>({signal:x,direction:"output",note:"Логическое состояние"})),
 ...ds.map(d=>({signal:"O_"+sym(d.id)+"_Block",direction:"output",doorId:d.id,note:"Логический запрет, НЕ прямая команда замка"})),
 ...ds.map(d=>({signal:"O_"+sym(d.id)+"_Overtime",direction:"output",doorId:d.id,note:"Тревога длительного открытия"})),
 ...(ventilationIntegrated?[{signal:"O_VentilationRequest",direction:"output",
   note:"Логический запрос вентиляции при закрытых дверях на время выдержки; НЕ прямое питание двигателя"}]:[])
 ].map(row=>({...row,controllerId:null,terminal:null}));
 const manual=[
 "# Симуляция "+fb+" в Owen Logic",
 "",
 "1. Создай новый проект с ПР100 М02. Действующий проект оставь без изменений.",
 "2. Создай пользовательский функциональный блок на ST.",
 "3. Вставь текст из файла "+fb+".st и проверь ошибки.",
 "4. Перейди на схему FBD и перенеси блок из библиотеки на холст.",
 "5. Соедини его входы с симуляционными значениями. Не подключай реальные реле.",
 "6. Открой Сервис → Режим симулятора.",
 "7. Установи FireNormal=1, ResetFault=0 и все I_*_Closed=1.",
 "8. Проверь по очереди одну открытую дверь, другую закрытую и переход в режим "+mode+".",
 "9. Проверь открытие двух дверей одновременно (FAULT) и ResetFault при подтверждённом закрытии.",
 "10. При FireNormal=0 команды блокировки должны быть нулевыми. Аппаратное отпирание проектируется отдельно.",
 ...(ventilationIntegrated?[
   "11. Для интегрированной вентиляции доступен только логический O_VentilationRequest: TRUE пока State=30, все двери закрыты и АПС в норме.",
   "12. Выход не назначен клемме и не предназначен для прямого подключения двигателя.",
   "13. Подтверждение фактического завершения продувки пока не реализовано. Технологическое разрешение после таймера требует отдельного согласования."
 ]:[
   "11. Продувка автономная: отдельная система со своими герконами. ПР100 не выдаёт запрос на вентиляцию."
 ]),
 "",
 "Пока не назначены клеммы. Межзонные правила и OR-запреты требуют отдельной схемы FBD.",
 "Фактическая компиляция в Owen Logic не подтверждена.",
 ""
 ].join("\n");
 return {
  roomId:String(id),blockName:fb,mode,ventilationControlMode,doorIds:ds.map(d=>d.id),st:st.join("\n"),io,
  ioCsv:csv([["Signal","Direction","Door","Controller","Terminal","Description"],
   ...io.map(x=>[x.signal,x.direction,x.doorId||"",x.controllerId||"",x.terminal||"",x.note])]),
  manual,warnings:[...v.warnings,...(mode==="purge"?[ventilationIntegrated?
   "Режим вентиляции: совместный. O_VentilationRequest — только логический запрос, не управление силовой цепью. Нет обратной связи о выполненной продувке.":
   "Режим вентиляции: автономный. ПР100 не даёт сигнал запуска вентиляции; внешняя система использует собственные герконы."]:[])]
 };
}
return {validate,build,sym};
})();
