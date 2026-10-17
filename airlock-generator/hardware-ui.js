/* UI-only capacity worksheet. Persists user-editable hardware into exported model JSON.
 * Never assigns physical terminals or sends data to PLC.
 */
(()=>{
"use strict";
const families=Object.keys(AirlockHardwarePlanner.families);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const list=(items,current)=>items.map(([v,label])=>
  '<option value="'+esc(v)+'"'+(String(current)===String(v)?' selected':'')+'>'+esc(label)+'</option>').join("");
const famOptions=family=>list(families.map(x=>[x,x]),family);
const moduleOptions=value=>list([["","Без ПРМ"],["PRM-1","ПРМ-1 (+8 DI, +8 DO)"],
  ["PRM-5","ПРМ-5 (+16 DO)"]],value);
const defaultDevice=()=>({family:"PR100",modification:"ПР100-24.1208.03.1 М02",
  baseDi:12,baseDo:8,modules:[]});
const hardware=()=>{
 if(!model.hardware)model.hardware={primary:defaultDevice(),secondary:[],link:"none",signaling:"room",rs485AvailableOnAll:false};
 return model.hardware;
};
const p=document.createElement("section");p.className="panel";p.style.marginTop="16px";
p.innerHTML='<h2>Оборудование ПР и расширения</h2>'+
 '<p class="muted">Выбери конкретную модификацию и количество физических DI/DO. '+
 'У ПР100 нет ПРМ, у ПР102/200/103/205 — до двух. Дополнительные ПР требуют Modbus и отдельных программ.</p>'+
 '<div id="hardwareDevices"></div>'+
 '<div class="toolbar"><button id="hardwareAdd">+ Второй ПР</button></div>'+
 '<div class="grid2"><div><label for="hardwareLink">Связь ПР</label><select id="hardwareLink">'+
 list([["none","Нет"],["rs485-modbus-rtu","RS-485 / Modbus RTU"],
 ["ethernet-modbus-tcp","Ethernet / Modbus TCP"]],"none")+'</select></div>'+
 '<div><label for="hardwareSignaling">Светофоры</label><select id="hardwareSignaling">'+
 list([["room","По помещениям"],["door","По дверям"]],"room")+'</select></div></div>'+
 '<label style="display:flex;align-items:center;gap:8px"><input id="hardwareRS485" type="checkbox" style="width:auto"> RS-485 установлен на каждом выбранном ПР (проверено)</label>'+
 '<div id="hardwareSummary" role="status" aria-live="polite"></div>'+
 '<p class="muted">Это расчёт резервов I/O. Не является клеммной схемой или подтверждением работы связи, аварийного отпирания и физической блокировки.</p>';
const previous=document.getElementById("wiringSummary").closest("section");
previous.insertAdjacentElement("afterend",p);
const $h=id=>document.getElementById(id);
const modulesFor=d=>{
 const max=AirlockHardwarePlanner.families[d.family].maxPrm;
 const a=Array.isArray(d.modules)?d.modules:[];
 d.modules=a.slice(0,max);
 return [0,1].map(i=>
  '<div><label>ПРМ слот '+(i+1)+'</label><select data-slot="'+i+'"'+(i>=max?' disabled':'')+'>'+
  moduleOptions(d.modules[i]||"")+'</select></div>').join("");
};
function renderHardware(){
 const cfg=hardware();
 const items=[cfg.primary,...(cfg.secondary||[])];
 $h("hardwareDevices").innerHTML=items.map((d,i)=>
   '<div class="section" data-device="'+i+'">'+
   '<h3>'+ (i?'ПР №'+(i+1):'Основной ПР')+'</h3>'+
   '<div class="grid2"><div><label>Семейство</label><select data-field="family">'+famOptions(d.family)+'</select></div>'+
   '<div><label>Точная модификация</label><input data-field="modification" value="'+esc(d.modification)+'" placeholder="Например: 24.1610.03.1.0"></div>'+
   '<div><label>DI на ПР</label><input type="number" min="0" max="512" data-field="baseDi" value="'+Number(d.baseDi||0)+'"></div>'+
   '<div><label>DO на ПР</label><input type="number" min="0" max="512" data-field="baseDo" value="'+Number(d.baseDo||0)+'"></div>'+
   modulesFor(d)+'</div>'+
   (i?'<button data-remove="'+i+'" style="margin-top:8px">Убрать ПР №'+(i+1)+'</button>':'')+
   '</div>').join("");
 $h("hardwareLink").value=cfg.link||"none";
 $h("hardwareSignaling").value=cfg.signaling||"room";
 $h("hardwareRS485").checked=!!cfg.rs485AvailableOnAll;
 $h("hardwareDevices").querySelectorAll("[data-device]").forEach(el=>{
  const index=Number(el.dataset.device),d=items[index];
  el.querySelectorAll("[data-field]").forEach(input=>{
   input.onchange=()=>{
    const k=input.dataset.field;
    if(k==="family"){
     d.family=input.value;d.modification="";d.baseDi=0;d.baseDo=0;d.modules=[];
     cfg.rs485AvailableOnAll=false;
     renderHardware();
    }else if(k==="baseDi"||k==="baseDo"){
     d[k]=Math.max(0,Math.min(512,Math.floor(Number(input.value)||0)));showCapacity();
    }else{d[k]=input.value;showCapacity();}
   };
  });
  el.querySelectorAll("[data-slot]").forEach(select=>{
   select.onchange=()=>{
    const all=[...el.querySelectorAll("[data-slot]")].map(x=>x.value);
    d.modules=all.filter(Boolean);showCapacity();
   };
  });
 });
 $h("hardwareDevices").querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{
  cfg.secondary.splice(Number(b.dataset.remove)-1,1);renderHardware();
 });
 showCapacity();
}
function showCapacity(){
 const cfg=hardware();
 try{
  const s=AirlockHardwarePlanner.build(AirlockProjectWiring.build(model),cfg);
  const safe=s.aggregateCapacitySufficient;
  $h("hardwareSummary").innerHTML=
   '<p><strong>Требуется:</strong> '+s.required.di+' DI / '+s.required.do+' DO. '+
   '<strong>Выбрано:</strong> '+s.capacity.di+' DI / '+s.capacity.do+' DO. '+
   '<strong>'+ (safe?'По сумме хватает каналов':'Недостаточно каналов')+'</strong>.</p>'+
   '<p>Остаток: '+s.remaining.di+' DI, '+s.remaining.do+' DO. Подключённых ПР: '+s.devices.length+
   '.</p><p class="muted">'+s.warnings.map(esc).join(' · ')+'</p>';
 }catch(e){$h("hardwareSummary").textContent="Проверка конфигурации: "+e.message;}
}
$h("hardwareAdd").onclick=()=>{
 const cfg=hardware();
 cfg.secondary=cfg.secondary||[];
 cfg.secondary.push({family:"PR103",modification:"",baseDi:0,baseDo:0,modules:[]});
 cfg.link="none";renderHardware();
};
$h("hardwareLink").onchange=e=>{hardware().link=e.target.value;showCapacity()};
$h("hardwareSignaling").onchange=e=>{hardware().signaling=e.target.value;showCapacity()};
$h("hardwareRS485").onchange=e=>{hardware().rs485AvailableOnAll=e.target.checked;showCapacity()};
const prevRender=render;
render=function(){prevRender();renderHardware()};
const importElement=document.getElementById("fileJSON");
const prevImport=importElement.onchange;
importElement.onchange=async e=>{await prevImport(e);renderHardware()};
hardware();renderHardware();
})();
