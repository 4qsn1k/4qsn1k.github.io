/* Generate a self-contained OFFLINE interactive FBD simulator UI.
 * Uses actual compiled JS gate netlist evaluator; NO browser network requests.
 * No connection to hardware, serial, Modbus, GPIO or native Owen files.
 */
"use strict";
const fs=require("node:fs"),path=require("node:path");
function render(plan){
 const engine=fs.readFileSync(path.join(__dirname,"..","native-timed-fbd-plan.js"),"utf8");
 const hardwareEngine=fs.readFileSync(path.join(__dirname,"..","hardware-auto-selector.js"),"utf8");
 if(engine.includes("</script")||hardwareEngine.includes("</script"))throw Error("UNSAFE_SCRIPT_TERMINATOR");
 const raw=JSON.stringify(plan).replaceAll("<","\\u003c");
 return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Airlock Generator · FBD стенд CNC – 1252</title>
<style>
:root{color-scheme:dark;--bg:#0b1420;--card:#142235;--card2:#192a40;--line:#364a5c;--text:#ebf1f7;--muted:#a5b5c5;--good:#56d5a3;--bad:#ffb17a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
.container{max-width:1240px;margin:auto;padding:20px}h1{margin:0;font-size:23px}h2{font-size:17px;margin:0 0 11px}small,.muted{color:var(--muted)}
header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px}
main{display:grid;grid-template-columns:minmax(300px,1fr) minmax(400px,1.3fr);gap:16px}
section,.toolbar,.note{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:15px}
main section{min-width:0}.full{grid-column:1/-1}
.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
button,select,input{border:1px solid #536c7e;background:#243c53;color:var(--text);border-radius:8px;padding:7px 11px;cursor:pointer;font:inherit}
button:hover,select:hover,input:hover{background:#365875}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--good)}
button.active{background:#165b47;border-color:#30a881}
button.urgent{border-color:#bf744d}
.pill{border:1px solid var(--line);padding:2px 8px;border-radius:20px;background:#1a2a3c}
.ok{color:var(--good)}.warn{color:var(--bad)}
.door{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 5px;border-bottom:1px solid #2d3e4d}
.door:last-child{border-bottom:0}.doorname{font-weight:600;max-width:175px;overflow-wrap:anywhere}
.doorstates{font-size:12px;display:flex;gap:8px;flex-wrap:wrap}
.door button{min-width:88px}
.allzones{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px}
.zone{background:var(--card2);border:1px solid var(--line);border-radius:9px;padding:9px}
.zone b{display:block}.progress{height:6px;background:#394b5b;border-radius:5px;overflow:hidden;margin-top:6px}.progress span{display:block;height:100%;background:var(--good);transition:width .12s}
.netlist{display:grid;grid-template-columns:repeat(auto-fit,minmax(126px,1fr));gap:10px}
.block{position:relative;min-height:82px;max-width:200px;border:2px solid #61768b;border-radius:8px;background:#1a293a;padding:9px}
.block.on{border-color:var(--good);background:#0e4039}.block.off{border-color:#a4664d;background:#31262b}
.block .btitle{font-size:12px;font-weight:700;word-break:break-word}.block .btype{font-size:11px;color:#b8c7d6}.block .bstate{font-size:18px;font-weight:800;float:right}
.block .wires{font-size:11px;color:var(--muted);overflow-wrap:anywhere}
label{display:inline-flex;gap:5px;align-items:center}.gridflow{display:grid;grid-template-columns:repeat(5,minmax(76px,1fr));gap:5px;align-items:stretch}
.flowblock{min-height:76px;background:#24384d;border:1px solid #74899e;border-radius:8px;padding:7px;text-align:center;position:relative}
.flowblock.active{background:#114a3d;border-color:var(--good)}.flowblock .value{font-size:24px;font-weight:800}
.flowblock:after{content:"→";position:absolute;right:-9px;top:23px;font-weight:bold;color:#92a6b6;z-index:2}
.flowblock:last-child:after{content:""}
.route{display:flex;justify-content:center;gap:15px;align-items:center;flex-wrap:wrap;margin:11px 0}.route span{display:inline-block;padding:6px 13px;border:1px solid #4a7080;border-radius:7px;background:#1e3546}
.route .arrow{border:0;background:none;color:#9dbad0;padding:0}.diagram caption{display:block;color:var(--muted)}
.note{margin-top:16px;color:#d8bd97;border-color:#815e3a}
@media(max-width:840px){main{grid-template-columns:1fr}.full{grid-column:1}.gridflow{grid-template-columns:repeat(5,minmax(48px,1fr))}.flowblock{font-size:11px;padding:3px}}
</style></head><body><div class="container">
<header><div><h1>Airlock Generator · FBD-стенд</h1><small>Виртуальная схема 1257–1252 · 6 таймеров TON · 7 герконов · без ST</small></div><span class="pill">Только программная симуляция, без ПР100</span></header>
<div class="toolbar">
<span>Виртуальное время <strong id="clock">0,0 с</strong></span>
<button type="button" data-step="100">+0,1 с</button>
<button type="button" data-step="1000">+1 с</button>
<button type="button" data-step="5000">+5 с</button>
<button type="button" data-step="10000">+10 с</button>
<button type="button" id="reset">Сброс</button>
<label>АПС <select id="fire"><option value="1">Норма</option><option value="0">Пожар (логический тест)</option></select></label>
<strong id="bolid"></strong>
</div>
<main>
<section class="full diagram"><h2>Пути прохода</h2>
<div class="route"><span>CNC / СКУД</span><span class="arrow">→</span><span>1257</span>
<span class="arrow">↘  ↙</span><span>1256 / 1255</span>
<span class="arrow">→</span><span>1254 / 1253</span><span class="arrow">→</span><span>1252</span></div>
<small>Общая дверь учитывается одним герконом; каждая смежная группа имеет собственный таймер.</small></section>
<section><h2>Герконы и состояния дверей</h2><div id="doors"></div></section>
<section><h2>Состояния всех шести шлюзов</h2><div id="zones" class="allzones"></div>
<p class="muted">TON = 1 только после 10 секунд непрерывного закрытия всех дверей группы.</p></section>
<section class="full"><h2>Визуальная FBD-цепь выбранного шлюза</h2>
<label>Шлюз <select id="zone"></select></label>
<div id="flow" class="gridflow" style="margin-top:12px"></div>
<p class="muted">AND(все двери закрыты) → AND(АПС в норме) → TON 10 с → NOT(готовность) → логическая BUSY</p>
</section>
<section class="full"><h2>Сигналы отдельных FBD-блоков</h2>
<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px"><label>Фильтр <select id="filter"><option value="selected">Выбранный шлюз</option><option value="all">Все 85 элементов</option></select></label><span class="muted">Цвет показывает фактическое логическое состояние выхода блока</span></div>
<div id="blocks" class="netlist"></div></section>
<section class="full"><h2>Автоподбор ПР и ПРМ по числу каналов</h2>
<div class="toolbar" style="margin-bottom:10px">
<label>Двери <input id="sizing-doors" type="number" min="2" max="100" value="7" style="width:70px"></label>
<label>Выходы светофоров <input id="sizing-lamps" type="number" min="0" max="100" value="7" style="width:70px"></label>
<label>Дополнительные DI <input id="sizing-extra-di" type="number" min="0" max="100" value="0" style="width:70px"></label>
<label>Резерв DI <input id="sizing-reserve-di" type="number" min="0" max="30" value="2" style="width:70px"></label>
<label>Резерв DO <input id="sizing-reserve-do" type="number" min="0" max="30" value="2" style="width:70px"></label>
<label>Связь <select id="sizing-network"><option value="rs485-modbus-rtu">RS-485</option><option value="ethernet-modbus-tcp">Ethernet</option></select></label>
</div>
<div id="hardware-result" class="allzones" aria-live="polite"></div>
<p class="muted">Принято: один геркон и один выход замка на дверь; выход светофора выбирается по проекту; один зуммер и один BUSY на CNC; входы АПС и сброса. Для кнопок выхода увеличь дополнительные DI. При распределении по нескольким ПР потребуется отдельное размещение клемм и проверка Modbus/отказов.</p>
</section>
</main>
<div class="note"><strong>Ограничения:</strong> кнопки не управляют настоящими замками, светофорами, АПС или С2000-2.
Не моделируются электрическая полярность замков, безопасное отпирание, связь RS-485, фильтр дребезга и отказ оборудования.
Это эталонная программная симуляция FBD-соединений, не компиляция Owen Logic.</div>
</div>
<script>${engine}</script>
<script>const HardwareSelector=(()=>{
${hardwareEngine}
return {select,requirements,PRS,PRM};
})();</script>
<script>
"use strict";
const PLAN=${raw};
let test=simulator(PLAN), snap=test.step({},0), selected=PLAN.groups[0].zoneId;
const byId=id=>document.getElementById(id);
const yn=b=>b?"1":"0";
const sig=id=>Boolean(snap.signals[id]);
const zoneStem=z=>"Z_"+z.replace(/[^A-Za-z0-9_]/g,"_");
const roomNum=z=>z.replace("Z_R","");
function stateBadge(on,yes,no){return "<span class='"+(on?"ok":"warn")+"'>"+(on?yes:no)+"</span>"}
function redraw(){
 byId("clock").textContent=(snap.timeMs/1000).toFixed(1).replace(".",",")+" с";
 byId("bolid").innerHTML="Bolid BUSY: "+stateBadge(snap.bolidBusy,"1 (запрет)","0");
 byId("fire").value=snap.FireNormal?"1":"0";
 byId("doors").innerHTML=PLAN.doors.map(d=>{
  const open=!snap.Closed[d.doorId];
  return "<div class='door'><div><div class='doorname'>"+d.doorId.replaceAll("_","–")+"</div><div class='doorstates'>"+
   stateBadge(!open,!open?"ЗАКРЫТА":"","ОТКРЫТА")+" <span>Блокировка: "+yn(snap.inhibit[d.doorId])+"</span> <span>GREEN: "+yn(snap.green[d.doorId])+"</span></div></div>"+
   "<button type='button' data-door='"+d.doorId+"' class='"+(open?"urgent":"")+"'>"+(open?"Закрыть":"Открыть")+"</button></div>"
 }).join("");
 byId("zones").innerHTML=PLAN.groups.map(g=>{
  const elapsed=snap.tonElapsedMs[g.tonId]||0;
  const ready=sig(g.tonId+".Q");const part=g.doorIds.some(d=>!snap.Closed[d]);
  return "<div class='zone'><b>Помещение "+roomNum(g.zoneId)+"</b>"+stateBadge(ready,"ГОТОВО",part?"ДВЕРЬ ОТКРЫТА":"ВЫДЕРЖКА")+
   "<div>TON: "+(elapsed/1000).toFixed(1)+" / 10,0 с</div><div>BUSY: "+yn(snap.roomBusy[g.roomId])+"</div>"+
   "<div class='progress'><span style='width:"+(Math.min(100,elapsed/100))+"%'></span></div></div>"
 }).join("");
 const stem=zoneStem(selected);
 const group=PLAN.groups.find(g=>g.zoneId===selected);
 const stages=[
  [stem+"_ALL_CLOSED","AND", "Все "+group.doorIds.length+" двери"],
  [stem+"_TON_ENABLE","AND","АПС норма"],
  [stem+"_TON_10S","TON","Таймер 10 c"],
  [stem+"_NOT_READY","NOT","Не готов"],
  [stem+"_LOGICAL_BUSY","AND","Логическая BUSY"]
 ];
 byId("flow").innerHTML=stages.map(([id,kind,desc])=>{
  const isOn=sig(id+".Q"),elapsed=snap.tonElapsedMs[id]||0;
  return "<div class='flowblock "+(isOn?"active":"")+"' title='"+id+"'><b>"+kind+"</b>"+
   "<div class='value'>"+yn(isOn)+"</div><small>"+desc+"</small>"+
   (kind==="TON"?"<div><small>"+(elapsed/1000).toFixed(1)+" c</small></div>":"")+"</div>"
 }).join("");
 const filter=byId("filter").value;
 const groupIds=new Set(stages.map(x=>x[0]));
 const members=new Set(group.doorIds);
 const wanted=filter==="all"?PLAN.nodes:PLAN.nodes.filter(n=>
  groupIds.has(n.id)|| n.id==="IN_FIRE_NORMAL" ||
  (n.kind==="INPUT"&&members.has(n.doorId)) ||
  (n.zoneId===selected) ||
  (n.doorId&&members.has(n.doorId)&&n.kind==="OUTPUT"));
 byId("blocks").innerHTML=wanted.map(n=>{
  const output=n.kind==="OUTPUT"?"IN":"Q";
  const v=sig(n.id+"."+output),title=n.id.replaceAll("_","·");
  const sources=PLAN.edges.filter(e=>e.to.startsWith(n.id+".")).map(e=>e.from);
  return "<div class='block "+(v?"on":"off")+"'><div class='bstate'>"+yn(v)+"</div>"+
   "<div class='btype'>"+n.kind+"</div><div class='btitle' title='"+n.id+"'>"+title+"</div>"+
   (sources.length?"<div class='wires'>← "+sources.join(", ")+"</div>":"")+"</div>"
 }).join("");
}
function refreshHardware(){
 const int=id=>Number(byId(id).value);
 const target=byId("hardware-result");
 try{
  const result=HardwareSelector.select(int("sizing-doors"),{
   lampChannelsTotal:int("sizing-lamps"),
   extraInputs:int("sizing-extra-di"),
   reserveDi:int("sizing-reserve-di"),
   reserveDo:int("sizing-reserve-do"),
   networkMode:byId("sizing-network").value
  });
  const required=result.required;
  const card=(title,body)=>"<div class='zone'><b>"+title+"</b>"+body+"</div>";
  let html=card("Расчёт входов и выходов",
   "<div>DI: <strong>"+required.di+"</strong> (включая "+required.breakdown.reedInputs+
   " герконов, АПС и сброс)</div><div>DO: <strong>"+required.relayDo+
   "</strong> (замки "+required.breakdown.locks+", светофоры "+
   required.breakdown.lamps+", BUSY "+required.breakdown.busy+
   ", зуммер "+required.breakdown.buzzer+")</div><div>Резерв: "+required.reserve.di+" DI / "+
   required.reserve.relayDo+" DO</div>");
  if(result.primary){
   const p=result.primary;
   html+=card("Рекомендуемая конфигурация",
    "<div class='ok'><strong>"+p.controller+"</strong></div>"+
    "<div>ПРМ: "+(p.modules.join(", ")||"не нужны")+"</div>"+
    "<div>Итого: "+p.totalDi+" DI / "+p.totalDo+" DO</div>"+
    "<div>Свободно: "+p.spareDi+" DI / "+p.spareDo+" DO</div>"+
    "<div>RS-485: "+p.rs485Ports+"; Ethernet: "+(p.ethernet?"да":"нет")+"</div>"+
    "<div>"+(p.reservesMet?"Резерв обеспечен":"Недостаточный заданный резерв")+"</div>");
   html+=card("Альтернативы",
    result.alternatives.slice(0,3).map(a=>"<div style='padding-bottom:5px;border-bottom:1px solid #345'><strong>"+
    a.controller+"</strong><div>"+(a.modules.join(", ")||"без ПРМ")+
    " · "+a.totalDi+" DI / "+a.totalDo+" DO</div></div>").join(""));
  }else if(result.networkAlternative){
   const a=result.networkAlternative;
   html+=card("Распределённая архитектура — только оценка",
    "<strong>"+a.count+" × "+a.controller+"</strong>"+
    "<div>Всего "+a.aggregateDi+" DI / "+a.aggregateDo+" DO</div>"+
    "<div class='warn'>Нужно распределить двери по ПР, проверить линии RS-485, мастер/ведомые, задержки и потерю связи. Совокупной ёмкости недостаточно для утверждения проекта.</div>");
  }else{
   html+=card("Недостаточно известных конфигураций",
    "<div class='warn'>Нужна индивидуальная схема ПР, ПРМ и распределения по сети.</div>");
  }
  target.innerHTML=html;
 }catch(e){target.textContent="Ошибка параметров расчёта: "+e.message}
}
let lastDoorCount=PLAN.doors.length;
for(const id of ["sizing-doors","sizing-lamps","sizing-extra-di",
 "sizing-reserve-di","sizing-reserve-do","sizing-network"])
 byId(id).addEventListener("change",()=>{
  if(id==="sizing-doors"){
   const next=Number(byId("sizing-doors").value);
   if(Number(byId("sizing-lamps").value)===lastDoorCount)
    byId("sizing-lamps").value=String(next);
   lastDoorCount=next;
  }
  refreshHardware();
 });
for(const group of PLAN.groups){
 const o=document.createElement("option");o.value=group.zoneId;o.textContent=roomNum(group.zoneId);byId("zone").appendChild(o);
}
byId("zone").value=selected;
byId("zone").addEventListener("change",e=>{selected=e.target.value;redraw()});
byId("filter").addEventListener("change",redraw);
byId("reset").addEventListener("click",()=>{test=simulator(PLAN);snap=test.step({},0);redraw()});
byId("fire").addEventListener("change",e=>{snap=test.step({FireNormal:e.target.value==="1"},100);redraw()});
document.querySelectorAll("[data-step]").forEach(b=>b.addEventListener("click",()=>{
 snap=test.step({},Number(b.dataset.step));redraw()
}));
byId("doors").addEventListener("click",e=>{
 const b=e.target.closest("button[data-door]");if(!b)return;
 const id=b.dataset.door;const change={};change[id]=!snap.Closed[id];
 snap=test.step({Closed:change},100);redraw();
});
refreshHardware();
redraw();
</script></body></html>`;
}
if(require.main===module){
 const candidate=require(path.resolve(process.argv[2]||""));
 const output=path.resolve(process.argv[3]||"");
 if(fs.existsSync(output)||path.extname(output).toLowerCase()!==".html")
  throw Error("VIEWER_MUST_BE_NEW_HTML_FILE");
 const f=require("../native-timed-fbd-plan.js");
 const plan=f.build(candidate);
 const html=render(plan);
 fs.writeFileSync(output,html,{flag:"wx"});
 console.log("FBD_VISUAL_STAND_CREATED "+output+" bytes="+Buffer.byteLength(html));
}
module.exports={render};
