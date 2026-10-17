/* v0.4 — room identity and nominal cleanliness markers; no pressure control */
(() => {
"use strict";
const types=[
 ["corridor","Коридор"],["cleanroom","Чистое помещение"],
 ["airlock","Сан-шлюз"],["technical","Техническое помещение"],
 ["general","Обычное помещение"],["other","Другое"]
];
const typeName=id=>types.find(t=>t[0]===id)?.[1]||"Помещение";
const typeOptions=id=>types.map(t=>'<option value="'+t[0]+'" '+(t[0]===id?"selected":"")+'>'+t[1]+'</option>').join("");
const modes=[["none","Без взаимоблокировки"],["mutual","Взаимоблокировка до закрытия"],["purge","Шлюз с продувкой"]];
const modeOptions=id=>modes.map(t=>'<option value="'+t[0]+'" '+(t[0]===id?"selected":"")+'>'+t[1]+'</option>').join("");
const ventilationModes=[["independent","Автономная система (свои герконы)"],
 ["integrated","Совместно со СКУД (запрос ПР100)"]];
const ventilationOptions=id=>ventilationModes.map(v=>
 '<option value="'+v[0]+'" '+(v[0]===id?"selected":"")+'>'+v[1]+'</option>').join("");
const roomMode=r=>AirlockEngine.roomMode(r);
function normalize(){
 for(const r of model.rooms){
  if(!r.roomType)r.roomType=roomMode(r)==="purge"?"airlock":r.cleanClass?"cleanroom":"general";
  if(!r.name)r.name="Помещение "+r.id;
  if(!r.interlockMode)r.interlockMode=r.interlockEnabled?"purge":"none";
  if(!["independent","integrated"].includes(r.ventilationControlMode))
   r.ventilationControlMode="independent";
 }
}
normalize();
const style=document.createElement("style");
style.textContent='#createRoomPanel{border:1px solid #a6c8da;border-radius:9px;padding:14px;margin:12px 0;background:#f5fbff}'+
 '#createRoomPanel[hidden]{display:none}'+
 '#createRoomPanel .create-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 12px}'+
 '#createRoomPanel .create-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}'+
 '#createRoomPanel .create-note{font-size:12px;color:#526778;margin:10px 0 0}'+
 '@media(max-width:700px){#createRoomPanel .create-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'+
 '@media(max-width:460px){#createRoomPanel .create-grid{grid-template-columns:1fr}}';
document.head.appendChild(style);
const panel=document.createElement("section");
panel.id="createRoomPanel";panel.hidden=true;
panel.innerHTML=[
 '<form id="createRoomForm"><h3 style="margin:0 0 8px">Новое помещение</h3><div class="create-grid">',
 '<div><label for="newRoomId">Номер помещения</label><input id="newRoomId" type="number" min="1" step="1" required></div>',
 '<div><label for="newRoomName">Название</label><input id="newRoomName" maxlength="70" placeholder="Например: Предшлюз" required></div>',
 '<div><label for="newRoomType">Тип помещения</label><select id="newRoomType">'+typeOptions("general")+'</select></div>',
 '<div><label for="newRoomClass">Класс чистоты</label><input id="newRoomClass" list="roomClassList" placeholder="CNC, D, C, B, A"></div>',
 '<div><label for="newRoomPressure">Условное давление, Па</label><input id="newRoomPressure" type="number" step="0.5" list="roomPressureList" placeholder="Например: 25"></div>',
 '<div><label for="newRoomMode">Режим дверей</label><select id="newRoomMode">'+modeOptions("none")+'</select></div>',
 '<div><label for="newRoomPurge">Выдержка после закрытия, с</label><input id="newRoomPurge" type="number" min="1" max="3600" value="30"></div>',
 '<div id="newRoomVentilationGroup" hidden><label for="newRoomVentilation">Управление продувкой</label><select id="newRoomVentilation">'+ventilationOptions("independent")+'</select></div>',
 '</div><datalist id="roomClassList"><option value="CNC"><option value="D"><option value="C"><option value="B"><option value="A"></datalist>',
 '<datalist id="roomPressureList">'+[10,15,20,25,30,35,40,45].map(n=>'<option value="'+n+'"></option>').join("")+'</datalist>',
 '<p class="create-note">Класс и Па — только подписи помещения. Они не управляют вентиляцией и не изменяют блокировки автоматически.</p>',
 '<div class="create-actions"><button type="submit" class="primary">Создать помещение</button><button type="button" id="cancelNewRoom">Отмена</button></div></form>'
].join("");
$("plan").insertAdjacentElement("beforebegin",panel);
const newNumber=()=>String(Math.max(0,...model.rooms.map(r=>Number(r.id)).filter(Number.isFinite))+1);
function showForm(){
 panel.hidden=false;
 $("newRoomId").value=newNumber();$("newRoomName").value="";
 $("newRoomType").value="general";$("newRoomClass").value="";
 $("newRoomPressure").value="";$("newRoomMode").value="none";
 $("newRoomPurge").value="30";$("newRoomPurge").disabled=true;
 $("newRoomVentilation").value="independent";$("newRoomVentilationGroup").hidden=true;
 $("newRoomName").focus();
}
$("addRoom").onclick=()=>panel.hidden?showForm():panel.hidden=true;
$("cancelNewRoom").onclick=()=>panel.hidden=true;
$("newRoomType").onchange=()=>{
 if($("newRoomType").value==="airlock" && $("newRoomMode").value==="none"){
  $("newRoomMode").value="purge";$("newRoomPurge").disabled=false;
  $("newRoomVentilationGroup").hidden=false;
 }
};
$("newRoomMode").onchange=()=>{
 const usePurge=$("newRoomMode").value==="purge";
 $("newRoomPurge").disabled=!usePurge;
 $("newRoomVentilationGroup").hidden=!usePurge;
};
$("createRoomForm").onsubmit=event=>{
 event.preventDefault();
 const id=$("newRoomId").value.trim(),name=$("newRoomName").value.trim();
 if(!/^[1-9][0-9]*$/.test(id)||!name){alert("Укажи номер и название помещения.");return}
 if(model.rooms.some(r=>String(r.id)===id)){alert("Помещение "+id+" уже существует.");return}
 const m=$("newRoomMode").value,p=$("newRoomPressure").value;
 const x=model.rooms.length?Math.max(...model.rooms.map(r=>r.x+r.w))+35:120;
 const y=model.rooms.length?Math.min(...model.rooms.map(r=>r.y)):20;
 model.rooms.push({
  id,name,roomType:$("newRoomType").value,cleanClass:$("newRoomClass").value.trim()||null,
  pressurePa:p===""?null:Number(p),interlockMode:m,interlockEnabled:m!=="none",
  purgeSec:Math.max(1,Number($("newRoomPurge").value)||30),
  ventilationControlMode:m==="purge"?$("newRoomVentilation").value:"independent",
  x,y,w:190,h:145
 });
 panel.hidden=true;select("room",id);
};
const originalDraw=draw;
draw=function(){
 originalDraw();
 for(const r of model.rooms){
  const group=[...$("plan").querySelectorAll("g.room")].find(g=>g.getAttribute("data-id")===String(r.id));
  if(!group)continue;
  const main=group.querySelector("text");
  if(main){
   const name=r.name||"Помещение "+r.id;
   const label=name.length>29?name.slice(0,28)+"…":name;
   main.setAttribute("font-size",String(Math.max(11,Math.min(26,r.w/Math.max(5,label.length*0.56)))));
   main.textContent=label;
   const tooltip=svgEl("title",{},group);tooltip.textContent="№ "+r.id+" · "+name;
  }
  const tag=svgEl("text",{x:r.x+12,y:r.y+20,"text-anchor":"start","font-size":12,
   "font-weight":700,fill:"#346579","pointer-events":"none"},group);
  tag.textContent="№ "+r.id;
  const kind=svgEl("text",{x:r.x+r.w/2,y:r.y+r.h/2-27,"text-anchor":"middle",
   "font-size":12,fill:"#586f7c","pointer-events":"none"},group);
  kind.textContent=typeName(r.roomType);
 }
};
const originalProperties=renderProperties;
renderProperties=function(){
 originalProperties();
 if(selected?.type!=="room")return;
 const r=room(selected.id);if(!r||!$("cleanClass"))return;
 $("cleanClass").closest(".grid2").insertAdjacentHTML("beforebegin",
  '<label for="roomType">Тип помещения</label><select id="roomType">'+typeOptions(r.roomType||"general")+'</select>');
 $("roomType").onchange=e=>{r.roomType=e.target.value;draw()};
 const checkbox=$("interlock");
 if(checkbox)checkbox.closest("label")?.remove();
 $("purge").previousElementSibling.insertAdjacentHTML("beforebegin",
  '<label for="roomMode">Режим дверей</label><select id="roomMode">'+modeOptions(roomMode(r))+'</select>');
 $("roomMode").onchange=e=>{r.interlockMode=e.target.value;r.interlockEnabled=e.target.value!=="none";active=[];render()};
 $("purge").disabled=roomMode(r)!=="purge";
 $("purge").insertAdjacentHTML("afterend",
  '<div id="roomVentilationGroup"'+(roomMode(r)==="purge"?'':' hidden')+'>'+
  '<label for="roomVentilation">Управление продувкой</label>'+
  '<select id="roomVentilation">'+ventilationOptions(r.ventilationControlMode||"independent")+'</select>'+
  '<p class="muted" style="font-size:12px;margin:5px 0">Автономная — внешняя система со своими герконами. '+
  'Совместная — ПР выдаёт логический запрос во время выдержки. Без обратной связи таймер не подтверждает фактическую продувку.</p></div>');
 $("roomVentilation").onchange=e=>{r.ventilationControlMode=e.target.value;render()};
 const pressure=$("pressure");
 pressure.setAttribute("list","editPressurePresets");
 pressure.setAttribute("step","0.5");
 pressure.setAttribute("placeholder","Например: 25");
 pressure.closest(".grid2").insertAdjacentHTML("afterend",
  '<datalist id="editPressurePresets">'+[10,15,20,25,30,35,40,45].map(n=>'<option value="'+n+'"></option>').join("")+'</datalist>'+
  '<p class="muted" style="font-size:12px;margin:5px 0">Класс и Па указаны только для сравнения зон. Нет расчёта перепадов и управления давлением.</p>');
 const label=pressure.closest("div").querySelector("label");
 if(label)label.textContent="Условное давление, Па";
};
const originalImport=$("fileJSON").onchange;
$("fileJSON").onchange=async e=>{await originalImport(e);normalize();render()};
$("closePass").onclick=()=>{
 const from=$("fromRoom").value,to=$("toRoom").value;
 const s=[...active].reverse().find(x=>x.type==="passage"&&x.phase==="open"&&x.from===from&&x.to===to);
 if(!s){alert("Нет открытой двери для этого направления.");return}
 const timed=AirlockEngine.purgeRooms(model,s);
 if(timed.length){
  s.phase="purge";s.purgeFrom=now;
  s.purgeSec=Math.max(...timed.map(id=>Number(room(id).purgeSec)||30));
 }else active=active.filter(x=>x.id!==s.id);
 render();
};
$("markOccupancy").onclick=()=>{
 if(fire)return alert("При пожаре цикл не запускается.");
 const id=$("occupiedRoom").value,r=room(id);
 if(roomMode(r)!=="purge")return alert("Занятость с продувкой доступна только в режиме «Шлюз».");
 if(active.some(s=>s.type==="occupancy"&&s.roomId===id))return alert("Помещение уже занято.");
 active.push({id:sessionNo++,type:"occupancy",roomId:id,phase:"occupied",
  openedAt:now,purgeSec:Math.max(1,Number(r.purgeSec)||30)});
 render();
};
render();
})();
