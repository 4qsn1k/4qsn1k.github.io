/* Build read-only HTML status screen and an unassigned PLC signal catalogue.
   No PLC connections, no output commands, no automatic assumption of readiness. */
(() => {
 "use strict";
 const $id=id=>document.getElementById(id);
 const toolbar=$id("addRoom")?.closest(".toolbar");
 if(!toolbar)return;
 const makeButton=(id,label)=>{
  const b=document.createElement("button");b.id=id;b.type="button";b.textContent=label;
  toolbar.append(b);return b;
 };
 const preview=makeButton("previewHmi","Экран отдела");
 const exportHTML=makeButton("exportHmi","Скачать экран HTML");
 const exportSignals=makeButton("exportSignals","Карта сигналов ПР");
 const scadaOpen=makeButton("openProjectScada","SCADA проекта");
 const scadaExport=makeButton("exportProjectScada","Скачать проект SCADA");
 const info=document.createElement("p");
 info.className="muted";info.id="hmiHint";info.style.fontSize="12px";
 info.textContent="Экран — пока демонстрационный. Реальные статусы появятся после привязки адресов ПР и подключения шлюза телеметрии.";
 $id("plan").closest("section").append(info);

 const download=(name,contents,type)=>{
  const url=URL.createObjectURL(new Blob([contents],{type}));
  const a=document.createElement("a");
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
 };
 const normalizeId=x=>String(x).replace(/[^a-zA-Z0-9_-]+/g,"_");
 const signal=(name,kind,source,description)=>({
  signal:name,kind,source,address:null,controllerId:null,description
 });
 function buildSignalMap(current){
  const mapped={
   schema:"airlock-hmi-bindings/0.1",
   project:current.name||"Проект шлюзов",
   controllers:[],
   notes:[
    "Адреса и контроллеры пустые. До настройки реального ПР этот документ является только списком требуемых сигналов.",
    "Светофоры каждой зоны могут иметь несколько физических указателей и общие релейные выходы по согласованной схеме.",
    "Включение зеленого только при подтвержденном разрешении доступа, а не по отсутствию питания или BUSY.",
    "Монитор получает статусы только на чтение через отдельный шлюз телеметрии. Управление замками с экрана запрещено.",
    "Пожарное отпирание выполняется независимой аппаратной цепью."
   ],
   signals:[],
   lightGroups:[]
  };
  const sig=mapped.signals;
  sig.push(signal("SYSTEM.FireAlarm","input","aps","Сигнал пожарной тревоги; аппаратная эвакуационная цепь отдельная"));
  sig.push(signal("SYSTEM.PlcOnline","diagnostic","telemetry","Подтверждение связи и актуальности контроллера"));
  for(const r of current.rooms){
   const rid=normalizeId(r.id),mode=AirlockEngine.roomMode(r);
   sig.push(signal("ROOM_"+rid+".State","status","PLC","UNKNOWN | READY | BUSY | PURGE | FAULT | FIRE"));
   sig.push(signal("ROOM_"+rid+".TimerRemaining","status","PLC","Остаток выдержки, секунды, если используется"));
   if(mode==="none")continue;
   const fixtures=current.doors.filter(d=>d.a===r.id||d.b===r.id)
    .map(d=>({doorId:d.id,sideRoomId:r.id,position:"со стороны помещения"}));
   const green="TL_ROOM_"+rid+".Green",red="TL_ROOM_"+rid+".Red";
   sig.push(signal(green,"output","PLC_DO","Зелёный сигнал: только при READY и исправном контроле"));
   sig.push(signal(red,"output","PLC_DO","Красный сигнал: занято, открыта, продувка или запрет"));
   mapped.lightGroups.push({
    id:"TL_ROOM_"+rid,roomId:r.id,mode,fixtures,
    redOutputSignal:red,greenOutputSignal:green,
    wiring:"Оба цвета требуют подтвержденного проекта питания, реле и безопасных состояний"
   });
  }
  for(const d of current.doors){
   const key=normalizeId(d.id);
   sig.push(signal("DOOR_"+key+".Closed","input","PLC_DI","Подтверждение закрытия геркона (нормальная логика требует проверки)"));
   sig.push(signal("DOOR_"+key+".Open","status","PLC","Подтверждённый статус открытия"));
   sig.push(signal("DOOR_"+key+".BlockRequested","status","PLC","Логическая блокировка доступа"));
   sig.push(signal("DOOR_"+key+".LockFeedback","input","PLC_DI","Фактическое запирание при наличии контакта"));
   sig.push(signal("DOOR_"+key+".LockCommand","output","PLC_DO","Команда на замок, если им управляет ПР"));
   sig.push(signal("DOOR_"+key+".BusyCommand","output","PLC_DO","Сухой контакт BUSY к С2000-2 при использовании"));
  }
  return mapped;
 }
 // Public read-only project export; physical I/O addresses are deliberately null.
 window.airlockHmiExport=Object.freeze({buildSignalMap});
 const hmiText=async()=>{
  const response=await fetch("./monitor.html",{cache:"no-store"});
  if(!response.ok)throw Error("Не удалось загрузить шаблон экрана: HTTP "+response.status);
  const template=await response.text();
  const insert=JSON.stringify(model).replace(/</g,"\\u003c");
  const regex=/(<script id="modelData" type="application\/json">)[\s\S]*?(<\/script>)/;
  if(!regex.test(template))throw Error("В шаблоне отсутствует блок modelData");
  return template.replace(regex,(match,start,end)=>start+insert+end);
 };
 exportHTML.onclick=async()=>{
  exportHTML.disabled=true;
  try{
   const html=await hmiText();
   download("airlock-monitor.html",html,"text/html;charset=utf-8");
  }catch(e){alert("Экспорт не выполнен: "+e.message)}
  finally{exportHTML.disabled=false}
 };
 preview.onclick=async()=>{
  const w=window.open("about:blank","_blank");
  if(!w){alert("Разреши всплывающее окно для предварительного просмотра.");return}
  w.document.title="Загрузка экрана";
  try{
   const html=await hmiText();
   const url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));
   w.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){w.close();alert("Предпросмотр не выполнен: "+e.message)}
 };
 function currentPackage(){
  if(!window.AirlockProjectPackage)throw Error("Модуль проекта SCADA не загружен");
  const errors=AirlockEngine.validate(model);
  if(errors.length)throw Error(errors.join("; "));
  return AirlockProjectPackage.build(model);
 }
 scadaOpen.onclick=()=>{
  try{
   const pkg=currentPackage();
   sessionStorage.setItem("airlock-scada-current",JSON.stringify(pkg));
   const w=window.open("./scada.html","_blank");
   if(!w)alert("Разрешите открытие вкладки SCADA или откройте scada.html вручную.");
  }catch(e){alert("SCADA: "+e.message)}
 };
 scadaExport.onclick=()=>{
  try{download("airlock-project-scada.json",JSON.stringify(currentPackage(),null,2)+"\\n","application/json;charset=utf-8")}
  catch(e){alert("Экспорт SCADA: "+e.message)}
 };
  exportSignals.onclick=()=>{
  const errors=AirlockEngine.validate(model);
  if(errors.length){alert("Исправь ошибки схемы: "+errors.join("; "));return}
  const mapping=buildSignalMap(model);
  download("airlock-io-signals.json",JSON.stringify(mapping,null,2)+"\n","application/json;charset=utf-8");
 };
})();
