/* ST generator view and deterministic test bench. No PLC writes. */
(() => {
 "use strict";
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const note=document.createElement("section");
 note.className="panel";note.style.marginTop="16px";
 note.innerHTML=[
  "<h2>Генерация ST для Owen Logic</h2>",
  '<p class="muted">Создаётся автономный ST-блок для выбранного помещения. Герконы, пожар, светофор и запросы блокировок — логические входы/выходы. Клеммы пока не назначены. Соседние зоны и правила требуют объединения в FBD.</p>',
  '<div class="grid2">',
  '<div><label>Помещение с взаимоблокировкой</label><select id="stRoom"></select></div>',
  '<div><label>Состояние симулятора</label><p id="stStatus" style="font-weight:700;margin:7px 0">Не запущен</p></div>',
  '</div>',
  '<div class="toolbar" style="margin-top:10px">',
  '<button id="stDownload" class="primary">Скачать ST-код</button>',
  '<button id="stCsv">Скачать карту I/O CSV</button>',
  '<button id="stManual">Скачать инструкцию</button>',
  '<button id="stCopy">Копировать ST</button>',
  '</div>',
  '<details style="margin:12px 0"><summary>Просмотреть сгенерированный ST-код</summary>',
  '<pre id="stCode" style="max-height:380px;overflow:auto;white-space:pre;font-size:12px;background:#f1f5f8;padding:12px;border-radius:6px"></pre></details>',
  '<h3 style="margin-bottom:8px">Программный симулятор входов</h3>',
  '<p class="muted">Это тест логики JavaScript, повторяющий предложенные состояния и таймеры ST. Он не является встроенным симулятором Owen Logic.</p>',
  '<div id="stInputs"></div>',
  '<div class="toolbar" style="margin-top:12px">',
  '<button id="stStep100">+0,1 с</button><button id="stStep5">+5 с</button>',
  '<button id="stStep30">+30 с</button><button id="stReset">Сброс модели</button>',
  '</div>',
  '<div id="stOutput" style="overflow-x:auto"></div>',
  '<p id="stWarnings" class="muted"></p>',
 ].join("");
 const place=$("plan").closest("section");
 place.insertAdjacentElement("afterend",note);
 let compiled=null,bench=null,selectedId=null,selectedSignature=null;
 const signature=id=>{
   const r=model.rooms.find(r=>r.id===id);
   return JSON.stringify({id,mode:r?.interlockMode,purge:r?.purgeSec,alarm:model.defaultOpenDoorAlarmSec,
     doors:model.doors.filter(d=>d.a===id||d.b===id).map(d=>d.id).sort()});
 };
 const eligible=()=>model.rooms.filter(r=>["purge","mutual"].includes(AirlockEngine.roomMode(r))&&
   model.doors.filter(d=>d.a===r.id||d.b===r.id).length>=2);
 function file(name,content,type="text/plain;charset=utf-8"){
   const url=URL.createObjectURL(new Blob([content],{type}));
   const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),3000);
 }
 function build(id){
   try{
     compiled=AirlockStGenerator.build(model,id);
     bench=AirlockStTestbench.create(model,id);
     selectedId=id;selectedSignature=signature(id);$("stCode").textContent=compiled.st;
     $("stWarnings").textContent=compiled.warnings.join(" · ");
     $("stStatus").textContent="Модель подготовлена";
     $("stDownload").disabled=false;$("stCsv").disabled=false;$("stCopy").disabled=false;$("stManual").disabled=false;
     drawInputs();renderOutputs();
   }catch(err){
     bench=null;compiled=null;selectedSignature=null;$("stStatus").textContent="Ошибка: "+err.message;
     $("stCode").textContent="";$("stInputs").textContent="";$("stOutput").textContent="";
     $("stDownload").disabled=true;$("stCsv").disabled=true;$("stCopy").disabled=true;$("stManual").disabled=true;
   }
 }
 function selectRooms(){
   const current=$("stRoom").value||selectedId;
   const ids=eligible();
   $("stRoom").innerHTML=ids.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.id)+" · "+esc(r.name)+
      " ("+esc(AirlockEngine.roomMode(r))+")</option>").join("");
   if(!ids.length){$("stRoom").innerHTML='<option value="">Нет подходящих помещений</option>';build("");return}
   const id=ids.find(r=>r.id===current)?.id||ids[0].id;
   $("stRoom").value=id;
   // Rebuild only if topology/parameters change, not on every status render.
   if(id!==selectedId||signature(id)!==selectedSignature)build(id);
 }
 function drawInputs(){
   if(!bench)return;
   $("stInputs").innerHTML='<div class="checks">'+bench.doorIds.map(id=>
     '<label><input type="checkbox" class="stClosed" data-door="'+esc(id)+'" checked> Дверь '+esc(id)+' закрыта</label>'
   ).join("")+'</div>'+
   '<div class="checks" style="margin-top:10px">'+
   '<label><input type="checkbox" id="stFireNormal" checked> АПС в норме</label>'+
   '<label><input type="checkbox" id="stResetFault"> Сброс неисправности</label></div>';
 }
 function update(){
   if(!bench)return;
   const inputs={
     FireNormal:$("stFireNormal")?.checked??true,
     ResetFault:$("stResetFault")?.checked??false,
     Closed:Object.fromEntries([...document.querySelectorAll(".stClosed")].map(x=>[x.dataset.door,x.checked]))
   };
   return inputs;
 }
 function stateText(n){return ({0:"Инициализация",10:"ГОТОВО",20:"ДВЕРЬ ОТКРЫТА",30:"ПРОДУВКА",90:"НЕИСПРАВНОСТЬ",99:"ПОЖАР"})[n]||"—"}
 function renderOutputs(){
   if(!bench)return;
   const v=bench.snapshot();
   $("stStatus").textContent=stateText(v.state)+" · "+(v.timeMs/1000).toFixed(1)+" с";
   $("stOutput").innerHTML='<table><tr><th>Сигнал</th><th>Значение</th></tr>'+
    '<tr><td>Зелёный</td><td>'+(v.green?"ВКЛ":"ВЫКЛ")+'</td></tr>'+
    '<tr><td>Красный</td><td>'+(v.red?"ВКЛ":"ВЫКЛ")+'</td></tr>'+
    '<tr><td>Тревога</td><td>'+(v.alarm?"ДА":"НЕТ")+'</td></tr>'+
    '<tr><td>Ошибка двух дверей</td><td>'+(v.fault?"ДА":"НЕТ")+'</td></tr>'+
    (v.purgeRemainingSec!==null?'<tr><td>Продувка, осталось</td><td>'+v.purgeRemainingSec+' с</td></tr>':"")+
    Object.entries(v.blocked).map(([id,blocked])=>'<tr><td>Запрет двери '+esc(id)+'</td><td>'+(blocked?"ДА":"НЕТ")+'</td></tr>').join("")+
    '</table>';
 }
 function step(ms){
   if(!bench)return;
   bench.step(update(),ms);renderOutputs();
 }
 $("stRoom").onchange=e=>build(e.target.value);
 $("stStep100").onclick=()=>step(100);
 $("stStep5").onclick=()=>step(5000);
 $("stStep30").onclick=()=>step(30000);
 $("stReset").onclick=()=>build($("stRoom").value);
 $("stInputs").addEventListener("change",()=>step(20));
 $("stDownload").onclick=()=>compiled&&file(compiled.blockName+".st",compiled.st);
 $("stCsv").onclick=()=>compiled&&file(compiled.blockName+"-io-map.csv",compiled.ioCsv,"text/csv;charset=utf-8");
 $("stManual").onclick=()=>compiled&&file(compiled.blockName+"-simulation.md",compiled.manual);
 $("stCopy").onclick=()=>{
   if(!compiled)return;
   const text=compiled.st;
   if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>alert("Код скопирован")).catch(()=>alert("Разреши копирование или скачай ST."));
   else alert("Используй кнопку «Скачать ST-код»");
 };
 const originalRender=render;
 render=function(){
   originalRender();selectRooms();
 };
 selectRooms();
})();
