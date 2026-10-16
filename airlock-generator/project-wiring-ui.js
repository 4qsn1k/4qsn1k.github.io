/* Planning panel: common doors, shared reeds and candidate physical I/O budget.
 * Read-only; no assignments or PLC writes.
 */
(()=>{
 "use strict";
 const panel=document.createElement("section");
 panel.className="panel";panel.style.marginTop="16px";
 panel.innerHTML='<h2>Согласование межзонных блокировок и I/O</h2>'+
 '<p class="muted">Общая дверь может принадлежать нескольким шлюзам. Её итоговый запрет — ИЛИ запросов от всех соответствующих помещений. Один геркон используется всеми блоками, но должен иметь один физический вход.</p>'+
 '<div id="wiringSummary"></div><button id="exportWiring" class="primary">Скачать межзонную карту JSON</button>'+
 '<p class="muted">Выходные каналы ещё не распределены. Расчёт ниже — оценка числа отдельных сигналов, не готовая схема подключения.</p>';
 const prev=document.getElementById("stRoom").closest("section");prev.insertAdjacentElement("afterend",panel);
 function renderWiring(){
  const plan=AirlockProjectWiring.build(model);
  const n=plan.planningCounts,needed=n.logicalBlockingRequests+n.roomLightChannels+n.aggregatedAlarmChannels;
  const shared=plan.blockRequests.filter(p=>p.sources.length>1);
  document.getElementById("wiringSummary").innerHTML=
   '<p><strong>Контролируемых помещений:</strong> '+n.controlledRooms+
   '; <strong>уникальных герконов:</strong> '+n.uniqueReedInputs+
   '; <strong>общих входов:</strong> '+n.commonInputs+
   '; <strong>логических запретов:</strong> '+n.logicalBlockingRequests+
   '; <strong>цветовых линий:</strong> '+n.roomLightChannels+
   '; <strong>общий сигнал тревоги:</strong> '+n.aggregatedAlarmChannels+'.</p>'+
   '<p><strong>Если каждому запрету и цвету нужен отдельный контакт:</strong> ориентировочно '+
   needed+' выходов. У ПР100-24.1208.03.1 М02 — 8 релейных выходов. Требуется анализ, какие сигналы реализуются штатным BUSY, общими цепями или на других устройствах.</p>'+
   (shared.length?'<p>Общие двери (OR): '+shared.map(p=>p.doorId).join(", ")+'</p>':"");
 }
 document.getElementById("exportWiring").onclick=()=>{
  const p=AirlockProjectWiring.build(model);
  const blob=new Blob([JSON.stringify(p,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="interlock-wiring.json";document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
 };
 const oldRender=render;
 render=function(){oldRender();renderWiring()};
 renderWiring();
})();
