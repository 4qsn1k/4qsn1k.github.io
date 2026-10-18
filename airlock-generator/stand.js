/* Interactive educational stand. No WebSocket/PLC commands. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const NS="http://www.w3.org/2000/svg";
const LABELS={10:"ГОТОВО",20:"ДВЕРЬ ОТКРЫТА",30:"ПРОДУВКА",90:"АВАРИЯ",99:"ПОЖАР",0:"ИНИЦИАЛИЗАЦИЯ"};
let model,lab,selectedDoor="1-4",mode="room",playing=false,interval=null,scenarioId="";
const logView=()=>lab.state();
const svgEl=(name,attrs,parent)=>{
 const el=document.createElementNS(NS,name);
 for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
 parent.append(el);
 return el;
};
function formatTime(ms){
 const all=Math.round(ms/100),minutes=Math.floor(all/600);
 return String(minutes).padStart(2,"0")+":"+String(Math.floor(all/10)%60).padStart(2,"0")+"."+String(all%10);
}
function stateClass(state){
 return state===10?"ready":state===30?"purge":state===20?"open":state===99?"fire":"fault";
}
function sendStep(ms){lab.step(ms);render();}
function setPlayback(value){
 playing=!!value;
 if(interval){clearInterval(interval);interval=null}
 $("playPause").textContent=playing?"Ⅱ Пауза":"▶ Запустить";
 if(playing)interval=setInterval(()=>sendStep(100),100);
}
function action(fn){
 try{fn();$("scenarioHint").classList.remove("error");render();}
 catch(e){$("scenarioHint").textContent="Ошибка: "+e.message;$("scenarioHint").classList.add("error");}
}
function position(door){
 const a=model.rooms.find(r=>r.id===door.a),b=model.rooms.find(r=>r.id===door.b);
 if(!a||!b)return {x:door.x,y:door.y,axis:door.axis};
 const ix=Math.max(a.x,b.x),jx=Math.min(a.x+a.w,b.x+b.w);
 const iy=Math.max(a.y,b.y),jy=Math.min(a.y+a.h,b.y+b.h);
 if(jx-ix>22&&Math.abs(a.y+a.h-b.y)<12)return{x:(ix+jx)/2,y:b.y,axis:"horizontal"};
 if(jx-ix>22&&Math.abs(b.y+b.h-a.y)<12)return{x:(ix+jx)/2,y:a.y,axis:"horizontal"};
 if(jy-iy>22&&Math.abs(a.x+a.w-b.x)<12)return{x:b.x,y:(iy+jy)/2,axis:"vertical"};
 if(jy-iy>22&&Math.abs(b.x+b.w-a.x)<12)return{x:a.x,y:(iy+jy)/2,axis:"vertical"};
 return{x:door.x,y:door.y,axis:door.axis};
}
function mapInit(){
 const svg=$("siteMap");
 svg.replaceChildren();
 const defs=svgEl("defs",{},svg);
 const pattern=svgEl("pattern",{id:"dots",width:15,height:15,patternUnits:"userSpaceOnUse"},defs);
 svgEl("circle",{cx:1,cy:1,r:.7,fill:"#355568"},pattern);
 svgEl("rect",{x:90,y:-10,width:735,height:630,class:"grid-bg"},svg);
 for(const r of model.rooms){
  const controlled=["1","4"].includes(String(r.id));
  const g=svgEl("g",{class:"room-map"+(controlled?" controlled":""),"data-room":r.id,"data-state":"INIT"},svg);
  svgEl("rect",{x:r.x,y:r.y,width:r.w,height:r.h,rx:5},g);
  const center=r.x+r.w/2;
  const name=svgEl("text",{x:center,y:r.y+r.h/2-8,"text-anchor":"middle",class:"room-id"},g);
  name.textContent=(controlled?"N":"")+" "+r.id;
  const caption=svgEl("text",{x:center,y:r.y+r.h/2+13,"text-anchor":"middle",class:"room-caption"},g);
  caption.textContent=controlled?("ШЛЮЗ / "+(r.interlockMode==="purge"?"ПРОДУВКА":"ВЗАИМНЫЙ")):"Соседняя зона";
  const extra=svgEl("text",{x:center,y:r.y+r.h/2+31,"text-anchor":"middle",class:"room-meta"},g);
  extra.textContent=(r.cleanClass?"Класс "+r.cleanClass+" · ":"")+(r.pressurePa==null?"":r.pressurePa+" Па");
  const state=svgEl("title",{},g);state.textContent="Помещение "+r.id;
 }
 for(const d of model.doors.filter(x=>lab.controlledDoorIds.includes(String(x.id)))){
  const p=position(d),horizontal=p.axis==="horizontal";
  const g=svgEl("g",{class:"map-door","data-door":d.id,role:"button",tabindex:"0","aria-label":"Переключить виртуальный геркон двери "+d.id,"aria-pressed":String(d.id===selectedDoor)},svg);
  svgEl("rect",{
   x:p.x-(horizontal?31:10),y:p.y-(horizontal?10:31),
   width:horizontal?62:20,height:horizontal?20:62,rx:4
  },g);
  const t=svgEl("text",{x:p.x,y:p.y+4,"text-anchor":"middle"},g);t.textContent=d.id;
  svgEl("title",{},g).textContent="Геркон двери "+d.id+"; нажмите для открытия/закрытия";
  const activate=()=>{selectedDoor=d.id;$("relayDoor").value=d.id;scenarioId="";action(()=>lab.door(d.id));};
  g.addEventListener("click",activate);
  g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate();}});
 }
}
function renderMap(s){
 const map=$("siteMap");
 for(const g of map.querySelectorAll(".room-map")){
  const id=g.getAttribute("data-room");
  const r=s.rooms[id];
  g.setAttribute("data-state",r?AirlockStandCore.MODES[r.state]:"INIT");
 }
 for(const g of map.querySelectorAll(".map-door")){
  const id=g.getAttribute("data-door"),relay=lab.contactForDoor(id);
  g.dataset.light=relay.greenLit?"green":relay.redLit?"red":"off";
  g.dataset.open=String(!relay.reedClosed);
  g.setAttribute("aria-pressed",String(id===selectedDoor));
 }
}
function renderDoorStrip(s){
 const root=$("doorStrip");root.replaceChildren();
 for(const id of lab.controlledDoorIds){
  const signal=lab.contactForDoor(id);
  const btn=document.createElement("button");
  btn.type="button";btn.className="door-tile"+(id===selectedDoor?" active":"")+(!signal.reedClosed?" open":"");
  btn.setAttribute("aria-label","Дверь "+id+": "+(signal.reedClosed?"закрыта":"открыта")+". Нажмите для переключения геркона");
  const info=document.createElement("span");
  const name=document.createElement("strong");name.textContent=id;
  const sub=document.createElement("small");sub.textContent=signal.reedClosed?"геркон закрыт":"геркон открыт";
  info.append(name,sub);
  const lights=document.createElement("span");lights.className="mini-lamps";
  const red=document.createElement("i");red.className="r"+(signal.redLit?" on":"");
  const green=document.createElement("i");green.className="g"+(signal.greenLit?" on":"");
  lights.append(red,green);btn.append(info,lights);
  btn.onclick=()=>{selectedDoor=id;$("relayDoor").value=id;scenarioId="";action(()=>lab.door(id));};
  root.append(btn);
 }
}
function renderZone(id,s){
 const room=s.rooms[id];
 const root=document.createElement("article");root.className="zone";
 const top=document.createElement("div");top.className="zone-top";
 const name=document.createElement("strong");name.textContent="N"+id;
 const tag=document.createElement("span");tag.className="state-tag "+stateClass(room.state);
 tag.textContent=LABELS[room.state]||"СТАРТ";
 top.append(name,tag);root.append(top);
 const text=document.createElement("p");
 text.textContent=id==="1"?"Выдержка 30 c после закрытия":"Независимая зона без выдержки";
 root.append(text);
 const sub=document.createElement("div");sub.className="zone-sub";
 const label=document.createElement("span");label.textContent="O_Ready: "+(room.state===10?"1":"0");
 const output=document.createElement("strong");output.textContent=room.fault?"O_Fault = 1":"O_State = "+room.state;
 sub.append(label,output);root.append(sub);
 const bar=document.createElement("div");bar.className="progress";
 const span=document.createElement("span");
 const percent=room.state===30?Math.max(0,(30-(room.purgeRemainingSec||0))/30*100):room.state===10?100:0;
 span.style.width=percent+"%";
 bar.append(span);root.append(bar);
 return root;
}
function renderLogic(s){
 $("virtualTime").textContent=formatTime(s.timeMs);
 $("zoneGrid").replaceChildren(renderZone("1",s),renderZone("4",s));
 const claims=s.requestSources["1-4"]||[];
 const n1=claims.find(x=>x.roomId==="1")?.requested||false;
 const n4=claims.find(x=>x.roomId==="4")?.requested||false;
 $("n1Claim").textContent=n1?1:0;
 $("n4Claim").textContent=n4?1:0;
 $("sharedClaim").textContent=s.blocked["1-4"]?1:0;
 $("sharedResult").classList.toggle("blocked",!!s.blocked["1-4"]);
 const msg=s.fire?
   "ПОЖАР: программные запреты сняты; реальная цепь эвакуации НЕ моделируется.":
   s.fault?"Авария: устраните конфликт герконов, закройте двери и подайте ResetFault.":
   s.blocked["1-4"]?"Общая дверь 1–4 запрещена хотя бы одной зоной. Готовность одной зоны недостаточна.":
   !s.inputs.Closed["1-4"]?"Общая дверь открыта: не путайте отсутствие собственного запроса с разрешением зелёного.":
   "Обе зоны разрешают общий проход. Условный зелёный возможен при закрытом герконе.";
 if($("summaryLine").textContent!==msg)$("summaryLine").textContent=msg;
 $("fireNormal").checked=s.inputs.FireNormal;
 $("lampPower").checked=lab.state().lampsPowered;
}
function renderRelay(){
 const x=lab.contactForDoor(selectedDoor);
 $("relayBlade").setAttribute("y2",x.contact==="NO"?"112":"36");
 $("redLamp").classList.toggle("on",x.redLit);
 $("greenLamp").classList.toggle("on",x.greenLit);
 $("coilSignal").textContent=x.coilEnergized?"1 / NO":"0 / NC";
 $("reedSignal").textContent=x.reedClosed?"ЗАКРЫТ":"ОТКРЫТ";
 $("permitSignal").textContent=x.command?"ДА":"НЕТ";
 $("relayNote").textContent=x.caveat+". Один DO подаёт команду катушке перекидного реле; положение NC/NO — контакт, а не два независимых выхода.";
}
function budget(){
 const p=lab.plan.planningCounts;
 const roomMode=mode==="room";
 const lamps=roomMode?p.roomTrafficRelays:p.doorTrafficRelays;
 const total=roomMode?p.estimatedDOWithRoomSignals:p.estimatedDOWithDoorSignals;
 $("budgetTotal").textContent=total;
 $("budgetRoom").classList.toggle("active",roomMode);
 $("budgetDoor").classList.toggle("active",!roomMode);
 $("budgetBreakdown").textContent=p.logicalBlockingRequests+" запроса блокировки + "+lamps+
   " DO светофоров ("+(roomMode?"по помещениям":"по дверям")+") + "+
   p.aggregatedAlarmChannels+" тревога + "+p.integratedVentilationRequests+" вентиляция = "+total+
   ". Это оценка отдельных сигналов, не клеммная ведомость.";
}
function renderJournal(){
 const items=lab.state().logs.slice(0,12);
 const root=$("eventLog");root.replaceChildren();
 for(const row of items){
  const li=document.createElement("li");
  const t=document.createElement("time");t.textContent=formatTime(row.at);
  const label=document.createElement("span");label.textContent=row.action;
  li.append(t,label);root.append(li);
 }
}
function render(){
 const s=lab.state().snapshot;
 renderMap(s);renderDoorStrip(s);renderLogic(s);renderRelay();budget();renderJournal();
 for(const b of $("scenarioButtons").querySelectorAll("button"))b.classList.toggle("active",b.dataset.id===scenarioId);
}
function download(name,content){
 const blob=new Blob([JSON.stringify(content,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bind(){
 for(const id of lab.controlledDoorIds){
  const opt=document.createElement("option");opt.value=id;opt.textContent="Дверь "+id;
  $("relayDoor").append(opt);
 }
 $("relayDoor").value=selectedDoor;
 $("relayDoor").onchange=e=>{selectedDoor=e.target.value;render();};
 for(const [id,item] of Object.entries(lab.scenarios)){
  const btn=document.createElement("button");btn.type="button";btn.dataset.id=id;
  btn.textContent=id;btn.title=item.title;btn.setAttribute("aria-label","Сценарий "+id+": "+item.title);
  btn.onclick=()=>{setPlayback(false);scenarioId=id;action(()=>lab.scenario(id));$("scenarioHint").textContent=item.title+". "+item.description;};
  $("scenarioButtons").append(btn);
 }
 $("playPause").onclick=()=>setPlayback(!playing);
 $("oneSec").onclick=()=>{setPlayback(false);action(()=>sendStep(1000));};
 $("tenSec").onclick=()=>{setPlayback(false);action(()=>sendStep(10000));};
 $("thirtySec").onclick=()=>{setPlayback(false);action(()=>sendStep(30000));};
 $("newCycle").onclick=()=>{setPlayback(false);scenarioId="";action(()=>lab.reset());$("scenarioHint").textContent="Новый цикл. Все виртуальные герконы закрыты.";};
 $("fireNormal").onchange=e=>{scenarioId="";const wanted=!!e.target.checked;
   action(()=>{if(lab.state().snapshot.inputs.FireNormal!==wanted)lab.fire();});};
 $("lampPower").onchange=e=>action(()=>lab.setSupply(e.target.checked));
 $("resetFault").onclick=()=>{scenarioId="";action(()=>lab.resetFault());};
 $("budgetRoom").onclick=()=>{mode="room";render();};
 $("budgetDoor").onclick=()=>{mode="door";render();};
 $("exportLog").onclick=()=>download("airlock-n1-n4-demo.json",{
  source:"JavaScript reference only; not Owen Logic / PLC telemetry",
  createdAt:new Date().toISOString(),testModel:"N1+N4",
  state:lab.state(),selectedDoor,relay:lab.contactForDoor(selectedDoor)
 });
 document.addEventListener("visibilitychange",()=>{if(document.hidden)setPlayback(false);});
}
async function boot(){
 try{
  const embedded=$("standModel");
  if(embedded){model=JSON.parse(embedded.textContent);}
  else{
   const response=await fetch("./model.json",{cache:"no-store"});
   if(!response.ok)throw Error("model.json HTTP "+response.status);
   model=await response.json();
  }
  lab=AirlockStandCore.create(model,AirlockStTestbench,AirlockProjectWiring,AirlockInterzoneTestbench);
  mapInit();bind();render();
 }catch(e){
  $("summaryLine").textContent="Не удалось открыть модель: "+e.message+". Проверьте встроенную модель или загрузку JSON.";
  $("playPause").disabled=true;
 }
}
boot();
})();
