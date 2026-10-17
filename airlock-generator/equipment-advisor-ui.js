/* Read-only, project-specific BOM shortlist. No buying, PLC provisioning or wiring. */
(()=>{
"use strict";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const section=document.createElement("section");section.className="panel";
section.style.marginTop="16px";
section.innerHTML=[
 '<h2>Рекомендации по оборудованию</h2>',
 '<p class="muted">Подбор по количеству помещений, герконов, блокировок, светофоров и вентиляции. ',
 'Предложение предварительное: не является монтажной схемой, спецификацией закупки или проверкой реальных клемм.</p>',
 '<div class="checks"><label><input type="checkbox" id="adviceEthernet"> Обязателен встроенный Ethernet / Modbus TCP</label></div>',
 '<div class="grid2">',
 '<div><label for="adviceReserveDi">Резерв DI</label><input id="adviceReserveDi" type="number" min="0" max="64" value="2"></div>',
 '<div><label for="adviceReserveDo">Резерв релейных DO</label><input id="adviceReserveDo" type="number" min="0" max="64" value="2"></div>',
 '</div>',
 '<div id="equipmentRecommendations" role="status" aria-live="polite"></div>',
 '<button type="button" id="adviceExport">Скачать рекомендации JSON</button>',
 '<p class="muted">Вводить корректные номиналы, типы контактов и модели питания в итоговую спецификацию должен проектировщик. ',
 'При нескольких ПР проверяются сетевые отказы, аппаратное отпирание и доступность кабельных трасс.</p>'
].join("");
const anchor=document.getElementById("distributedResult").closest("section");
anchor.insertAdjacentElement("afterend",section);
const el=id=>document.getElementById(id);
const settings=()=>{
 if(!model.hardware)model.hardware={
  primary:{family:"PR100",modification:"ПР100-24.1208.03.1",baseDi:8,baseDo:8,modules:[]},
  secondary:[],signaling:"room",link:"none"
 };
 if(!model.hardware.advice){
  model.hardware.advice={requireEthernet:model.hardware.link==="ethernet-modbus-tcp",
   reserveDi:2,reserveDo:2};
 }
 return model.hardware.advice;
};
function count(v){
 const n=Number(v);
 return Number.isInteger(n)?Math.max(0,Math.min(64,n)):2;
}
function syncInputs(){
 const s=settings();
 el("adviceEthernet").checked=!!s.requireEthernet;
 el("adviceReserveDi").value=s.reserveDi;
 el("adviceReserveDo").value=s.reserveDo;
}
let current=null;
function renderAdvice(){
 try{
  const cfg=settings(),wiring=AirlockProjectWiring.build(model);
  const h=model.hardware||{};
  current=AirlockEquipmentAdvisor.check(wiring,{
   ...cfg,currentHardware:h,signaling:h.signaling||"room",hasRemoteControllers:!!h.secondary?.length
  });
  const d=current,need=d.required;
  const summary='<p><strong>По схеме требуется:</strong> '+need.di+' DI, '+need.relayDo+
    ' релейных DO; помещение(й): '+need.rooms+', дверей: '+need.doors+
    ', светофоров: '+need.lampPairs+', запросов вентиляции: '+
    need.ventilationRequests+'. Желаемый резерв: '+d.reserve.di+' DI / '+
    d.reserve.relayDo+' DO.</p>';
  const item=x=>'<div style="border:1px solid #c5d3dd;border-radius:8px;padding:10px;margin:10px 0">'+
    '<strong>'+esc(x.controller)+'</strong> '+
    (x.modules.length?' + '+x.modules.map(esc).join(' + '):'— без ПРМ')+
    '<p>Всего: '+x.resources.di+' DI / '+x.resources.relayDo+' релейных DO. '+
    'Свободно после назначения: '+x.resources.freeDi+' DI / '+x.resources.freeDo+
    ' DO. '+(x.meetsReserve?'Запас соблюдён.':'Запрошенный запас не обеспечен.')+'</p>'+
    '<p class="muted">'+esc(x.explanation)+'</p>'+
    (x.warnings.length?'<p class="muted">'+x.warnings.map(esc).join(' · ')+'</p>':'')+
    '<p><a href="'+esc(x.source)+'" target="_blank" rel="noopener noreferrer">Характеристики ОВЕН</a>'+
    x.moduleSources.map((url,i)=>' · <a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+
      esc(x.modules[i])+'</a>').join('')+'</p></div>';
  const selectedEquipment=d.current;
  const upgrade=selectedEquipment?'<h3>Что добавить к выбранному ПР</h3>'+
    '<p>'+esc(selectedEquipment.note)+'</p>'+
    (selectedEquipment.capacity?'<p>Сейчас доступно: '+selectedEquipment.capacity.di+' DI, '+
      selectedEquipment.capacity.relayDo+' DO. Свободно без запаса: '+selectedEquipment.capacity.freeDi+
      ' DI / '+selectedEquipment.capacity.freeDo+' DO.</p>':'')+
    (selectedEquipment.additions.length?'<ul>'+selectedEquipment.additions.map(x=>
      '<li><strong>Добавить '+esc(x.modules.join(" + "))+'</strong>: после расширения '+
      x.capacity.di+' DI / '+x.capacity.relayDo+' DO; резерв '+
      x.capacity.freeDi+' DI / '+x.capacity.freeDo+' DO'+
      (x.meetsReserve?' (достаточный)':' (ниже заданного)')+'. '+
      x.sources.map((url,i)=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+
       esc(x.modules[i])+'</a>').join(', ')+'</li>').join('')+'</ul>':''):"";
  const chosen=d.recommended?
    '<h3>Основной вариант</h3>'+item(d.recommended):
    '<p><strong>Одиночного ПР в проверенном наборе не хватает.</strong> '+
    'Потребуется дополнительное оборудование или разделение зон на несколько ПР.</p>';
  const alternatives=d.alternatives.length?'<h3>Альтернативы</h3>'+
    d.alternatives.map(item).join(''):"";
  const bill='<h3>Что предусмотреть дополнительно</h3><ul>'+
    d.accessories.map(x=>'<li><strong>'+esc(x.name)+'</strong>'+
    (x.quantity!==null?' — '+x.quantity+' шт.':' — количество по расчёту')+
    '. '+esc(x.details)+'</li>').join('')+'</ul>';
  el("equipmentRecommendations").innerHTML=summary+upgrade+chosen+alternatives+bill+
    '<p class="muted">'+d.constraints.map(esc).join(' · ')+'</p>';
  el("adviceExport").disabled=false;
 }catch(e){
  current=null;
  el("equipmentRecommendations").textContent="Не удалось подобрать оборудование: "+e.message;
  el("adviceExport").disabled=true;
 }
}
el("adviceEthernet").onchange=e=>{settings().requireEthernet=e.target.checked;renderAdvice()};
for(const [input,k] of [["adviceReserveDi","reserveDi"],["adviceReserveDo","reserveDo"]]){
 el(input).onchange=e=>{settings()[k]=count(e.target.value);e.target.value=settings()[k];renderAdvice()};
}
el("adviceExport").onclick=()=>{
 if(!current)return;
 const blob=new Blob([JSON.stringify(current,null,2)+"\n"],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="airlock-equipment-recommendations.json";
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
};
const oldRender=render;
render=function(){oldRender();syncInputs();renderAdvice()};
const importElement=document.getElementById("fileJSON"),oldImport=importElement.onchange;
importElement.onchange=async e=>{await oldImport(e);syncInputs();renderAdvice()};
for(const controlId of ["hardwareSignaling","hardwareLink"]){
 document.getElementById(controlId).addEventListener("change",()=>setTimeout(renderAdvice,0));
}
document.getElementById("hardwareDevices").closest("section").addEventListener("change",()=>{
 setTimeout(renderAdvice,0)
});
syncInputs();renderAdvice();
})();
