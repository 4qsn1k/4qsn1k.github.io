"use strict";
(()=>{
 const $=id=>document.getElementById(id),NS="http://www.w3.org/2000/svg";
 const STATES={ready:"ГОТОВО",busy:"ЗАНЯТО",open:"ОТКРЫТА",blocked:"ЗАПРЕТ",purge:"ПРОДУВКА",fault:"АВАРИЯ",fire:"ПОЖАР",unknown:"НЕТ ДАННЫХ"};
 let model=null,profile={schema:"airlock-scada-connection/1",controllers:[],bindings:[],pollMs:1500,staleMs:5000};
 let last=null,gateway=false,lastGoodAt=0,requestBusy=false;
 function error(text){$("warning").textContent=text;}
 function tag(state){const b=$("connectionState");b.className="tag "+state;b.textContent=state==="live"?"ПР НА СВЯЗИ":state==="partial"?"ЧАСТЬ ПР НЕ НА СВЯЗИ":"НЕТ СВЯЗИ";}
 function norm(v){return String(v).replace(/[^a-zA-Z0-9_-]+/g,"_")}
 function saveFile(obj,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)+"\n"],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function fromPackage(input){
  if(!input||typeof input!=="object")throw Error("Некорректный JSON проекта");
  const m=AirlockProjectPackage.validate(input.model||input);
  if(!m.rooms.length||!m.doors.length)throw Error("В проекте нет помещений/дверей");
  return m;
 }
 function updateModel(value){
  model=fromPackage(value);
  profile.model=model;
  $("projectName").textContent=model.name||"SCADA проекта шлюзов";
  $("stats").textContent=model.rooms.length+" помещений · "+model.doors.length+" дверей";
  const choices=new Set(signalNames());
  profile.bindings=profile.bindings.filter(b=>choices.has(b.signal));
  updateSelectors();render();
 }
 function signalNames(){
  if(!model)return[];
  const result=["SYSTEM.FireNormal"];
  for(const r of model.rooms)result.push("ROOM_"+norm(r.id)+".State");
  for(const d of model.doors)
   for(const field of ["Closed","BlockRequested","GreenPermit"])result.push("DOOR_"+norm(d.id)+"."+field);
  for(const c of profile.controllers){
   for(let n=1;n<=8;n++){result.push("PLC_"+c.id+".DI"+n,"PLC_"+c.id+".Q"+n);}
  }
  return result;
 }
 function selectOptions(el,names){
  const selected=el.value;el.replaceChildren();
  for(const name of names){
   const opt=document.createElement("option");opt.value=name;opt.textContent=name;el.append(opt);
  }
  if(names.includes(selected))el.value=selected;
 }
 function updateSelectors(){
  selectOptions($("signalName"),signalNames());
  selectOptions($("signalController"),profile.controllers.map(c=>c.id));
  renderControllers();renderBindings();
 }
 function node(name,attrs,parent){
  const x=document.createElementNS(NS,name);
  for(const [key,value]of Object.entries(attrs))x.setAttribute(key,String(value));
  parent.append(x);return x;
 }
 function textSvg(parent,content,attrs){const x=node("text",attrs,parent);x.textContent=content;}
 function currentState(kind,id){
  if(!last||last.source!=="live"||Date.now()-(typeof last.timestamp==="number"?last.timestamp:Date.parse(last.timestamp))>profile.staleMs)return"unknown";
  const v=last[kind]?.[String(id)]?.state;
  return STATES[v]?v:"unknown";
 }
 function render(){
  if(!model)return;
  const svg=$("plan");svg.replaceChildren();
  const rects=model.rooms.filter(r=>[r.x,r.y,r.w,r.h].every(n=>Number.isFinite(+n)));
  if(!rects.length)return;
  const left=Math.min(...rects.map(r=>+r.x))-35,top=Math.min(...rects.map(r=>+r.y))-35;
  const right=Math.max(...rects.map(r=>+r.x+ +r.w))+35,bottom=Math.max(...rects.map(r=>+r.y+ +r.h))+35;
  svg.setAttribute("viewBox",[left,top,Math.max(300,right-left),Math.max(300,bottom-top)].join(" "));
  for(const r of rects){
   const st=currentState("rooms",r.id);
   const g=node("g",{},svg);
   node("rect",{x:r.x,y:r.y,width:r.w,height:r.h,rx:4,class:"roombox status-"+st},g);
   textSvg(g,"№ "+r.id,{x:+r.x+12,y:+r.y+20,class:"roomstate"});
   textSvg(g,String(r.name||"Помещение "+r.id).slice(0,28),{x:+r.x+ +r.w/2,y:+r.y+ +r.h/2,class:"roomlabel","text-anchor":"middle"});
   textSvg(g,STATES[st],{x:+r.x+ +r.w/2,y:+r.y+ +r.h/2+24,class:"roomstate","text-anchor":"middle"});
  }
  for(const door of model.doors){
   const a=model.rooms.find(r=>String(r.id)===String(door.a)),b=model.rooms.find(r=>String(r.id)===String(door.b));
   if(!a||!b)continue;
   let x=+door.x,y=+door.y,axis=door.axis||"horizontal";
   const x0=Math.max(+a.x,+b.x),x1=Math.min(+a.x+ +a.w,+b.x+ +b.w);
   const y0=Math.max(+a.y,+b.y),y1=Math.min(+a.y+ +a.h,+b.y+ +b.h);
   if(x1-x0>15&&Math.abs(+a.y+ +a.h- +b.y)<12){x=(x0+x1)/2;y=+b.y;axis="horizontal";}
   else if(x1-x0>15&&Math.abs(+b.y+ +b.h- +a.y)<12){x=(x0+x1)/2;y=+a.y;axis="horizontal";}
   else if(y1-y0>15&&Math.abs(+a.x+ +a.w- +b.x)<12){x=+b.x;y=(y0+y1)/2;axis="vertical";}
   else if(y1-y0>15&&Math.abs(+b.x+ +b.w- +a.x)<12){x=+a.x;y=(y0+y1)/2;axis="vertical";}
   const st=currentState("doors",door.id),horizontal=axis==="horizontal",g=node("g",{},svg);
   node("rect",{x:x-(horizontal?31:10),y:y-(horizontal?10:31),width:horizontal?62:20,
     height:horizontal?20:62,rx:3,class:"doorrect status-"+st},g);
   textSvg(g,door.id,{x,y:y-(horizontal?14:34),"text-anchor":"middle",class:"roomstate"});
  }
  const rooms=$("roomRows"),doors=$("doorRows");rooms.replaceChildren();doors.replaceChildren();
  for(const r of model.rooms)row(rooms,r.name||"Помещение "+r.id,currentState("rooms",r.id));
  for(const d of model.doors)row(doors,"Дверь "+d.id,currentState("doors",d.id));
 }
 function row(parent,label,status){
  const line=document.createElement("div");line.className="row";
  const title=document.createElement("span");title.textContent=label;
  const value=document.createElement("strong"),dot=document.createElement("i");
  dot.className="dot "+status;value.append(dot,document.createTextNode(STATES[status]||"НЕТ ДАННЫХ"));
  line.append(title,value);parent.append(line);
 }
 function renderControllers(){
  const root=$("controllersList");root.replaceChildren();
  for(const c of profile.controllers){
   const rowEl=document.createElement("div");rowEl.className="row";
   const text=document.createElement("span");text.textContent=c.id+" · "+(c.redacted?"локальный профиль скрыт":c.protocol==="modbus-rtu"?c.comPort+" "+c.baudrate+" "+c.parity+"8"+c.stopbits:c.host+":"+c.port)+(c.redacted?"":" · Slave "+c.unitId);
   const remove=document.createElement("button");remove.type="button";remove.textContent="Удалить";
   remove.onclick=()=>{profile.controllers=profile.controllers.filter(x=>x.id!==c.id);
    profile.bindings=profile.bindings.filter(x=>x.controllerId!==c.id);updateSelectors();};
   rowEl.append(text,remove);root.append(rowEl);
  }
  if(!profile.controllers.length)root.textContent="ПР ещё не добавлен.";
 }
 function renderBindings(){
  const root=$("signalRows");root.replaceChildren();
  for(const b of profile.bindings){
   const el=document.createElement("div");el.className="row";
   const txt=document.createElement("span");txt.textContent=b.signal+" → "+b.controllerId+" · FC"+String(b.fc).padStart(2,"0")+" · "+b.address;
   const del=document.createElement("button");del.type="button";del.textContent="×";
   del.title="Удалить привязку";del.onclick=()=>{profile.bindings=profile.bindings.filter(x=>x.signal!==b.signal);renderBindings();};
   el.append(txt,del);root.append(el);
  }
  if(!profile.bindings.length)root.textContent="Регистр не назначен. До привязки сигналов реальные состояния неизвестны.";
 }
 function renderHealth(){
  const root=$("healthRows");root.replaceChildren();
  if(!gateway){root.textContent="Локальный шлюз не запущен в этом браузере.";return;}
  const controllers=last?.controllers||{};
  for(const [id,info]of Object.entries(controllers)){
   const div=document.createElement("div");div.className="row";
   const left=document.createElement("span");left.textContent=id;
   const right=document.createElement("strong");right.textContent=info.online?"ONLINE":"OFFLINE · "+(info.error||"ошибка");
   div.append(left,right);root.append(div);
   if(info.lastPollAt!=null){
    const meta=document.createElement("div");meta.className="row";
    const details=document.createElement("small");
    const last=info.lastSuccessAt?new Date(info.lastSuccessAt).toLocaleTimeString("ru-RU"):"ещё не было";
    details.textContent="Опрос: "+(Number.isFinite(info.durationMs)?info.durationMs+" мс":"—")+
     " · Возраст данных: "+(Number.isFinite(info.dataAgeMs)?Math.round(info.dataAgeMs)+" мс":"—")+
     " · Ошибок подряд: "+(info.consecutiveFailures??0)+" · Последний ответ: "+last;
    meta.append(details);root.append(meta);
   }
   const readings=Object.entries(info.raw||{});
   if(readings.length){
    const values=document.createElement("div");values.className="row";
    const span=document.createElement("span");
    span.textContent=readings.sort((a,b)=>a[0].localeCompare(b[0],"en",{numeric:true}))
     .map(([name,value])=>name+"="+value).join(" · ");
    values.append(span);root.append(values);
   }
  }
 }
 async function updateEvents(){
  const root=$("eventRows");
  if(!gateway){root.textContent="Локальный агент не подключён";return;}
  try{
   const response=await fetch("./api/events",{cache:"no-store"});
   if(!response.ok)throw Error("HTTP "+response.status);
   const data=await response.json();
   root.replaceChildren();
   for(const ev of (data.events||[])){
    const line=document.createElement("div");line.className="row";
    const time=document.createElement("small");
    time.textContent=new Date(ev.at).toLocaleTimeString("ru-RU");
    const description=document.createElement("span");
    description.textContent=ev.controllerId+": "+(ev.type==="SIGNAL_CHANGED"?
     ev.signal+" "+ev.from+" → "+ev.to:ev.type==="LINK_UP"?"Связь восстановлена":
     "Связь потеряна"+(ev.reason?" — "+ev.reason:""));
    line.append(time,description);root.append(line);
   }
   if(!root.children.length)root.textContent="Событий пока нет.";
  }catch(e){root.textContent="Журнал недоступен: "+e.message;}
 }
  async function poll(){
  if(!gateway||requestBusy)return;
  requestBusy=true;
  try{
   const req=await fetch("./api/status",{cache:"no-store"});
   if(!req.ok)throw Error("HTTP "+req.status);
   const frame=await req.json();
   if(!frame||!Number.isFinite(frame.timestamp)||Date.now()-frame.timestamp>profile.staleMs)throw Error("данные устарели");
   last=frame;lastGoodAt=Date.now();
   const ok=Object.values(frame.controllers||{}).filter(v=>v.online).length,total=Object.keys(frame.controllers||{}).length;
   tag(ok===0?"offline":ok===total?"live":"partial");
   $("updateTime").textContent=new Date(frame.timestamp).toLocaleTimeString("ru-RU");
   error(ok?"Получены данные "+ok+"/"+total+" контроллеров. Неизвестные состояния остаются серыми.":"Нет подтверждённого ответа от ПР — зелёный запрещён.");
  }catch(e){
   last=null;tag("offline");$("updateTime").textContent="Нет актуального пакета";error("Связь с локальным шлюзом потеряна: "+e.message);
  }finally{requestBusy=false;render();renderHealth();void updateEvents();}
 }
 function setup(){
  for(const btn of document.querySelectorAll("nav.tabs button")){
   btn.onclick=()=>{
    for(const a of document.querySelectorAll(".tabview"))a.classList.remove("active");
    for(const b of document.querySelectorAll("nav.tabs button"))b.classList.remove("active");
    btn.classList.add("active");$("tab-"+btn.dataset.tab).classList.add("active");
   };
  }
  $("importModel").onclick=()=>$("fileModel").click();
  $("fileModel").onchange=async e=>{
   try{
    const raw=JSON.parse(await e.target.files[0].text());
    if(raw.schema==="airlock-scada-connection/1"){profile={...profile,...raw};}
    updateModel(raw);
    error("Проект загружен. До запуска локального шлюза это НЕ телеметрия ПР.");
   }catch(ex){error("Не удалось загрузить проект: "+ex.message);}
   e.target.value="";
  };
  $("controllerProtocol").onchange=()=>{
   const serial=$("controllerProtocol").value==="modbus-rtu";
   document.querySelectorAll(".rtu-option").forEach(x=>x.hidden=!serial);
   document.querySelectorAll(".tcp-option").forEach(x=>x.hidden=serial);
   $("controllerHost").required=!serial;
   $("controllerPort").required=!serial;
  };
  $("addPr100Diagnostics").onclick=()=>{
   const controllerId=$("signalController").value;
   const c=profile.controllers.find(x=>x.id===controllerId);
   if(!c){error("Сначала добавьте ПР");return;}
   if(c.model!=="PR100"){error("Шаблон DI/Q предназначен для подтверждённой модификации ПР100");return;}
   const signals=[];
   for(let i=1;i<=8;i++){
    signals.push({signal:"PLC_"+c.id+".DI"+i,controllerId,fc:2,address:4095+i});
    signals.push({signal:"PLC_"+c.id+".Q"+i,controllerId,fc:1,address:i-1});
   }
   const set=new Set(signals.map(x=>x.signal));
   profile.bindings=profile.bindings.filter(x=>!set.has(x.signal)).concat(signals);
   renderBindings();
   error("Добавлены адреса DI/Q из проверенного опыта КПП 2. Сверьте карту конкретного ПР перед физическим тестом.");
  };
  $("controllerForm").onsubmit=e=>{
   e.preventDefault();
   if(!model){error("Сначала загрузите проект");return;}
   const protocol=$("controllerProtocol").value;
   const c={id:$("controllerId").value.trim(),model:$("controllerModel").value,protocol,
    unitId:Number($("controllerUnit").value),timeoutMs:Number($("controllerTimeout").value)};
   if(protocol==="modbus-rtu")Object.assign(c,{comPort:$("controllerCom").value.trim().toUpperCase(),
    baudrate:Number($("controllerBaud").value),parity:$("controllerParity").value,
    stopbits:Number($("controllerStop").value)});
   else Object.assign(c,{host:$("controllerHost").value.trim(),port:Number($("controllerPort").value)});
   if(!/^[a-zA-Z0-9_-]+$/.test(c.id)||!Number.isInteger(c.unitId)||c.unitId<1||c.unitId>247||
     !Number.isInteger(c.timeoutMs)||c.timeoutMs<200||c.timeoutMs>5000||
     (protocol==="modbus-tcp"&&(!/^[a-zA-Z0-9.:_-]+$/.test(c.host)||!Number.isInteger(c.port)||c.port<1||c.port>65535))||
     (protocol==="modbus-rtu"&&(!/^COM[1-9][0-9]{0,2}$|^\/dev\/tty(?:USB|ACM|S)[0-9]{1,3}$/i.test(c.comPort)||
      ![1200,2400,4800,9600,19200,38400,57600,115200].includes(c.baudrate)))) {
    error("Проверьте COM/IP, настройки линии, Unit ID и таймаут");return;
   }
   profile.controllers=profile.controllers.filter(x=>x.id!==c.id).concat(c);updateSelectors();
   error("Контроллер добавлен в ПРОФИЛЬ. Реальная связь проверяется только после запуска локального шлюза.");
  };
  $("signalForm").onsubmit=e=>{
   e.preventDefault();
   const signal=$("signalName").value,controllerId=$("signalController").value,
    fc=Number($("signalFc").value),address=Number($("signalAddress").value);
   if(!signal||!controllerId||![1,2,3,4].includes(fc)||!Number.isInteger(address)||address<0||address>65535){
    error("Не задан контроллер или некорректный адрес регистра");return;
   }
   profile.bindings=profile.bindings.filter(b=>b.signal!==signal).concat({signal,controllerId,fc,address});
   renderBindings();
  };
  $("downloadProfile").onclick=()=>{
   if(profile.controllers.some(c=>c.redacted)){error("Параметры подключения хранятся на агенте. Сохранение и восстановление — локально через profile-store.js.");return;}
   if(!model||!profile.controllers.length||!profile.bindings.length){
    error("Сначала добавьте ПР и хотя бы одну привязку. Пустой профиль не готов к опросу.");return;
   }
   saveFile(profile,"airlock-connection.json");
   error("Профиль сохранён в загрузки. Запустите локальный шлюз командой из инструкции. Файл не отправлен в GitHub.");
  };
 }
 async function boot(){
  setup();
  const draft=sessionStorage.getItem("airlock-scada-current");
  try{
   const initial=draft?JSON.parse(draft):JSON.parse($("exampleScadaModel").textContent);
   updateModel(initial);
   error(draft?"Проект из генератора загружен. Для телеметрии запустите локальный шлюз.":"ПОКАЗАН ОБРАЗЕЦ ПРОЕКТА. Нет связи с ПР; все состояния неизвестны.");
  }catch(e){error("Ошибка исходной схемы: "+e.message);}
  try{
   const res=await fetch("./api/project",{cache:"no-store"});
   if(!res.ok)throw Error("no local gateway");
   const cfg=await res.json();
   if(!cfg.model)throw Error("model not available");
   gateway=true;profile={...profile,model:cfg.model,controllers:cfg.controllers||[],
    bindings:cfg.bindings,pollMs:cfg.pollMs,staleMs:cfg.staleMs};
   updateModel(cfg.model);
   $("gatewayUrl").textContent="Локальный шлюз: "+window.location.origin;
   await poll();
  }catch{
   gateway=false;
   if(!model)error("Нет локального шлюза или пакета SCADA. Загрузите проект на вкладке «Контроллеры».");
  }
  setInterval(poll,2000);
 }
 boot();
})();
