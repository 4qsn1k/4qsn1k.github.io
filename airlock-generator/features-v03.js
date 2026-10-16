/* Pressure cascade and interlock-mode controls. Schematic simulation only. */
(() => {
const clean=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mode=r=>AirlockEngine.roomMode(r);
const section=document.createElement("section");
section.className="panel";
section.style.marginTop="16px";
section.innerHTML='<h2>Каскад давления</h2>'+
'<p class="muted">Расчётные уставки, не показания датчиков. Давление задано относительно одной точки отсчёта.</p>'+
'<div class="grid2"><div><label>Минимальный ΔP для разных классов, Па</label>'+
'<input id="defaultDelta" type="number" min="0" max="200" step="0.5" value="10"></div>'+
'<div style="align-self:end"><label><input id="showGradient" type="checkbox" checked style="width:auto">Показывать ΔP на плане</label></div></div>'+
'<div id="pressureReport" style="overflow-x:auto;margin-top:12px"></div>'+
'<p class="muted">Направления и допуски требуют проверки проекта вентиляции. Результат не подтверждает фактический перепад воздуха.</p>';
$("plan").closest("section").insertAdjacentElement("afterend",section);
$("defaultDelta").value=model.pressureDefaults?.minGradeDiffPa??10;
$("defaultDelta").onchange=e=>{
  model.pressureDefaults=model.pressureDefaults||{};
  model.pressureDefaults.minGradeDiffPa=Math.max(0,Number(e.target.value)||0);
  draw();renderPressure();
};
$("showGradient").onchange=()=>draw();
function renderPressure(){
  const list=PressureCascade.analyze(model);
  $("pressureReport").innerHTML='<p><strong>Дверей '+list.length+', предупреждений '+list.filter(x=>x.status==="warning").length+
   ', без уставок '+list.filter(x=>x.status==="unset").length+'</strong></p>'+
  '<table><thead><tr><th>Дверь</th><th>P₁/P₂</th><th>Перепад</th><th>Проверка</th></tr></thead><tbody>'+
  list.map(r=>'<tr><td>'+clean(r.id)+'</td><td>'+clean((r.pa??"—")+"/"+(r.pb??"—"))+
    ' Па</td><td>'+clean(r.status==="unset"?"—":"Δ"+r.delta+" Па "+(r.from?r.from+"→"+r.to:"="))+
    '</td><td>'+clean(r.status==="unset"?"Не задано":r.warnings.length?"⚠ "+r.warnings.join("; "):"Расчёт ОК")+'</td></tr>').join("")+
  '</tbody></table>';
}
const oldDraw=draw;
draw=function(){
  oldDraw();
  if(!$("showGradient").checked)return;
  for(const d of model.doors){
    const p=PressureCascade.analyzeDoor(model,d,model.pressureDefaults||{});
    if(p.status==="unset"||p.status==="invalid")continue;
    const xy=position(d);
    const label=svgEl("text",{
      x:xy.axis==="horizontal"?xy.x:xy.x-12,
      y:xy.axis==="horizontal"?xy.y+30:xy.y+45,
      "text-anchor":"middle","font-size":11,"font-weight":700,
      fill:p.status==="warning"?"#b03025":"#1a698b","pointer-events":"none"
    },$("plan"));
    label.textContent="Δ"+p.delta+" Па "+(p.from?p.from+"→"+p.to:"=");
  }
};
const oldProps=renderProperties;
renderProperties=function(){
  oldProps();
  if(!selected)return;
  if(selected.type==="room"){
    const r=room(selected.id);if(!r)return;
    $("interlock")?.closest("label")?.remove();
    $("purge").insertAdjacentHTML("beforebegin",
      '<label>Режим дверей</label><select id="roomMode">'+
      '<option value="none">Обычный — без взаимоблокировки</option>'+
      '<option value="mutual">Взаимная — на время открытия</option>'+
      '<option value="purge">Шлюз — с продувкой</option></select>');
    $("roomMode").value=mode(r);
    $("roomMode").onchange=e=>{r.interlockMode=e.target.value;r.interlockEnabled=e.target.value!=="none";active=[];render()};
    $("purge").disabled=mode(r)!=="purge";
    $("pressure").insertAdjacentHTML("afterend",
      '<label>Быстрый выбор Па</label><select id="pressurePreset">'+
      '<option value="">Не задано</option>'+
      [10,15,20,25,30,35,40,45].map(n=>'<option value="'+n+'">'+n+' Па</option>').join("")+'</select>'+
      '<div class="grid2"><div><label>Допуск ±Па</label><input id="pressureTolerance" type="number" min="0" step="0.5" value="'+clean(r.pressureTolerancePa??2)+'"></div>'+
      '<div><label>Назначение каскада</label><select id="pressurePurpose">'+
      '<option value="protect">Защита чистоты</option><option value="containment">Изоляция вещества</option></select></div></div>');
    $("pressurePreset").value=r.pressurePa==null?"":String(r.pressurePa);
    $("pressurePreset").onchange=e=>{r.pressurePa=e.target.value===""?null:Number(e.target.value);$("pressure").value=r.pressurePa??"";draw();renderPressure()};
    $("pressureTolerance").onchange=e=>{r.pressureTolerancePa=Math.max(0,Number(e.target.value)||0);draw();renderPressure()};
    $("pressurePurpose").value=r.pressurePurpose||"protect";
    $("pressurePurpose").onchange=e=>{r.pressurePurpose=e.target.value;draw();renderPressure()};
    $("pressure").addEventListener("change",()=>{$("pressurePreset").value=r.pressurePa==null?"":String(r.pressurePa);renderPressure()});
    $("cleanClass").addEventListener("change",renderPressure);
  }else{
    const d=model.doors.find(x=>x.id===selected.id);if(!d)return;
    $("output").insertAdjacentHTML("afterend",
      '<label>Ожидаемый поток воздуха</label><select id="expectedFlow">'+
      '<option value="auto">Авто по классу (защита)</option>'+
      '<option value="a_to_b">'+clean(d.a)+' → '+clean(d.b)+'</option>'+
      '<option value="b_to_a">'+clean(d.b)+' → '+clean(d.a)+'</option>'+
      '<option value="none">Не проверять направление</option></select>'+
      '<label>Минимальный ΔP, Па (пусто — по классам)</label>'+
      '<input id="minDiff" type="number" min="0" step="0.5" value="'+clean(d.minPressureDiffPa??"")+'">');
    $("expectedFlow").value=d.expectedFlow||"auto";
    $("expectedFlow").onchange=e=>{d.expectedFlow=e.target.value;draw();renderPressure()};
    $("minDiff").onchange=e=>{d.minPressureDiffPa=e.target.value===""?null:Math.max(0,Number(e.target.value));draw();renderPressure()};
  }
};
const oldRender=render;
render=function(){oldRender();renderPressure()};
$("closePass").onclick=()=>{
  const from=$("fromRoom").value,to=$("toRoom").value;
  const s=[...active].reverse().find(x=>x.type==="passage"&&x.phase==="open"&&x.from===from&&x.to===to);
  if(!s)return alert("Для этого направления нет открытой двери");
  const timed=AirlockEngine.purgeRooms(model,s);
  if(timed.length){
    s.phase="purge";s.purgeFrom=now;
    s.purgeSec=Math.max(...timed.map(id=>Number(room(id).purgeSec)||30));
  }else{
    active=active.filter(x=>x.id!==s.id);
  }
  render();
};
$("markOccupancy").onclick=()=>{
  if(fire)return alert("В пожарном режиме штатный цикл не запускается");
  const id=$("occupiedRoom").value,r=room(id);
  if(mode(r)!=="purge")return alert("Занятость с таймером доступна только для режима «Шлюз»");
  if(active.some(s=>s.type==="occupancy"&&s.roomId===id))return alert("Помещение уже занято");
  active.push({id:sessionNo++,type:"occupancy",roomId:id,phase:"occupied",openedAt:now,purgeSec:Math.max(1,r.purgeSec)});
  render();
};
const oldAdd=$("addRoom").onclick;
$("addRoom").onclick=()=>{
  const prior=new Set(model.rooms.map(r=>r.id));
  oldAdd();
  for(const r of model.rooms)if(!prior.has(r.id)){
    r.interlockMode="none";r.pressureTolerancePa=2;r.pressurePurpose="protect";
    render();
  }
};
const oldImport=$("fileJSON").onchange;
$("fileJSON").onchange=async event=>{
  await oldImport(event);
  for(const r of model.rooms){
    r.interlockMode=r.interlockMode||(r.interlockEnabled?"purge":"none");
    if(r.pressureTolerancePa==null)r.pressureTolerancePa=2;
    if(!r.pressurePurpose)r.pressurePurpose="protect";
  }
  model.pressureDefaults=model.pressureDefaults||{minGradeDiffPa:10};
  $("defaultDelta").value=model.pressureDefaults.minGradeDiffPa;
  render();
};
render();
})();
