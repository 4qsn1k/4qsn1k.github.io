/* Offline designer for provisional physical I/O placement and Modbus dependencies.
 * Does not produce runnable logic, vendor terminal IDs or actual register addresses.
 */
(()=>{
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const p=document.createElement("section");p.className="panel";p.style.marginTop="16px";
p.innerHTML='<h2>Размещение сигналов по контроллерам</h2>'+
 '<p class="muted">Назначь, где выполняется блок помещения, куда физически подключён геркон двери и на каком ПР выводится её итоговый запрос. Общая дверь использует один физический геркон; остальным ПР потребуется контролируемый сетевой сигнал.</p>'+
 '<div id="distributedAssignments"></div>'+
 '<div class="toolbar"><button id="distributedRefresh" type="button">Пересчитать размещение</button>'+
 '<button id="distributedExport" type="button">Скачать карту сигналов JSON</button></div>'+
 '<div id="distributedResult" role="status" aria-live="polite"></div>'+
 '<p class="muted">Назначения BASE.DI1 / PRM1.DO1 условные. Без подтверждения заводских клемм, карты регистров Modbus, watchdog, реакции на потерю связи и испытаний Owen Logic карта НЕ предназначена для монтажа.</p>';
const anchor=document.getElementById("hardwareSummary").closest("section");
anchor.insertAdjacentElement("afterend",p);
const id=name=>document.getElementById(name);
const hardware=()=>model.hardware;
const devices=()=>{
 const h=hardware();
 return h?Array.from({length:1+(h.secondary||[]).length},(_,i)=>"PLC"+(i+1)):[];
};
const initialTopo=()=>{
 const hw=hardware();
 if(!hw)return null;
 if(!hw.placements)hw.placements={
  roomOwners:{},doorInputOwners:{},doorOutputOwners:{},alarmOwner:"PLC1"
 };
 const topo=hw.placements;
 const rooms=AirlockProjectWiring.build(model).activeRoomIds.map(String);
 const doors=AirlockProjectWiring.build(model).blockRequests.map(x=>String(x.doorId));
 for(const roomId of rooms)if(!topo.roomOwners[roomId])topo.roomOwners[roomId]="PLC1";
 for(const doorId of doors){
  if(!topo.doorInputOwners[doorId])topo.doorInputOwners[doorId]="PLC1";
  if(!topo.doorOutputOwners[doorId])topo.doorOutputOwners[doorId]="PLC1";
 }
 return topo;
};
const opts=(current,values)=>values.map(v=>
 '<option value="'+esc(v)+'"'+(v===current?' selected':'')+'>'+esc(v)+'</option>').join("")+
 (current&&!values.includes(current)?'<option selected value="'+esc(current)+'">'+esc(current)+' (удалён/недоступен)</option>':'');
function renderAssignmentTable(){
 const d=devices(),topo=initialTopo();
 if(!topo){id("distributedAssignments").textContent="Сначала выбери основное оборудование.";return}
 const wiring=AirlockProjectWiring.build(model);
 const rows=wiring.activeRoomIds.map(roomId=>
  '<tr><td>Помещение '+esc(roomId)+'</td><td>Блок FB_Room_N'+esc(roomId)+
  '</td><td><select data-room-owner="'+esc(roomId)+'">'+opts(topo.roomOwners[String(roomId)],d)+'</select></td></tr>');
 id("distributedAssignments").innerHTML=
  '<h3>Функциональные блоки помещений</h3><table><thead><tr><th>Зона</th><th>Логика</th><th>ПР</th></tr></thead>'+
  '<tbody>'+rows.join("")+'</tbody></table>'+
  '<h3>Герконы и блокировки дверей</h3>'+
  '<table><thead><tr><th>Дверь</th><th>Геркон — DI</th><th>Блокировка — DO</th></tr></thead>'+
  '<tbody>'+wiring.blockRequests.map(req=>
   '<tr><td>'+esc(req.doorId)+(req.sources.length>1?' (общая)':'')+'</td>'+
   '<td><select data-door-input="'+esc(req.doorId)+'">'+opts(topo.doorInputOwners[String(req.doorId)],d)+'</select></td>'+
   '<td><select data-door-output="'+esc(req.doorId)+'">'+opts(topo.doorOutputOwners[String(req.doorId)],d)+'</select></td></tr>'
  ).join("")+'</tbody></table>'+
  '<label>Общий выход тревоги ANY_ALARM на ПР</label><select id="distributedAlarmOwner">'+
   opts(topo.alarmOwner,d)+'</select>';
 for(const control of id("distributedAssignments").querySelectorAll("select")){
  control.onchange=()=>{
   if(control.dataset.roomOwner)topo.roomOwners[control.dataset.roomOwner]=control.value;
   if(control.dataset.doorInput)topo.doorInputOwners[control.dataset.doorInput]=control.value;
   if(control.dataset.doorOutput)topo.doorOutputOwners[control.dataset.doorOutput]=control.value;
   showResult();
  };
 }
 id("distributedAlarmOwner").onchange=e=>{topo.alarmOwner=e.target.value;showResult()};
}
let lastResult=null;
function showResult(){
 try{
  lastResult=AirlockDistributedPlanner.build(model,AirlockProjectWiring.build(model),
   hardware(),AirlockHardwarePlanner,initialTopo());
  const r=lastResult;
  const count=r.network.signals.length;
  const body=r.capacity.map(x=>
   '<tr><td>'+esc(x.id)+'</td><td>'+x.usedDi+'/'+x.totalDi+'</td>'+
   '<td>'+x.usedDo+'/'+x.totalDo+'</td></tr>').join("");
  const rows=r.network.signals.map(x=>
   '<tr><td>'+esc(x.from)+'</td><td>'+esc(x.to)+'</td><td>'+esc(x.signal)+'</td>'+
   '<td>'+x.proposedPublisherWordIndex+' (условно)</td></tr>').join("");
  id("distributedResult").innerHTML=
   '<h3>Размещение I/O</h3><table><thead><tr><th>ПР</th><th>DI занято/всего</th>'+
   '<th>DO занято/всего</th></tr></thead><tbody>'+body+'</tbody></table>'+
   '<p><strong>Межконтроллерных сигналов:</strong> '+count+
   '. <strong>Связь:</strong> '+esc(r.network.protocol)+
   '. Адреса регистров не назначены, тайм-аут связи ещё не согласован.</p>'+
   (rows?'<div style="overflow-x:auto"><table><thead><tr><th>От</th><th>Кому</th>'+
    '<th>Данные</th><th>Слот</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'')+
   '<p class="muted">'+r.warnings.map(esc).join(' · ')+'</p>';
  id("distributedExport").disabled=false;
 }catch(e){
  lastResult=null;
  id("distributedResult").textContent="Не удалось распределить: "+e.message+
   ". Проверь число входов/выходов каждого ПР и размещение дверей.";
  id("distributedExport").disabled=true;
 }
}
id("distributedRefresh").onclick=()=>{renderAssignmentTable();showResult()};
id("distributedExport").onclick=()=>{
 if(!lastResult)return;
 const url=URL.createObjectURL(new Blob([JSON.stringify(lastResult,null,2)+"\n"],
  {type:"application/json"}));
 const a=document.createElement("a");a.href=url;a.download="airlock-draft-controller-placement.json";
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
};
const priorRender=render;
render=function(){priorRender();renderAssignmentTable();showResult()};
const controlPanel=document.getElementById("hardwareDevices").closest("section");
controlPanel.addEventListener("change",()=>setTimeout(()=>{
 renderAssignmentTable();showResult()
},0));
controlPanel.addEventListener("click",()=>setTimeout(()=>{
 renderAssignmentTable();showResult()
},0));
const importControl=document.getElementById("fileJSON"),oldImport=importControl.onchange;
importControl.onchange=async e=>{await oldImport(e);renderAssignmentTable();showResult()};
renderAssignmentTable();showResult();
})();
