/* Uses the current constructor model and existing controller placement UI. */
(()=>{
"use strict";
const panel=document.createElement("section");panel.className="panel";panel.style.marginTop="16px";
panel.innerHTML='<h2>Полная схема FBD — план проекта</h2>'+
 '<p class="muted">Сформируй связи всех помещений и общих дверей по текущему размещению контроллеров. Для проверки новой схемы потребуется Owen Logic; клеммы и адреса регистров пока не назначены.</p>'+
 '<label for="fbdTimeout">Тайм-аут достоверности для автономного теста, мс (необязательно)</label>'+
 '<input id="fbdTimeout" type="number" min="100" max="600000" step="1" placeholder="Требует отдельного выбора">'+
 '<div class="toolbar"><button type="button" id="fbdBuild">Проверить FBD-план</button>'+
 '<button type="button" id="fbdJSON">Скачать FBD JSON</button>'+
 '<button type="button" id="fbdCSV">Скачать матрицу связей</button>'+
 '<button type="button" id="fbdQA">Скачать план испытаний</button></div>'+
 '<div id="fbdResult" role="status" aria-live="polite"></div>';
document.getElementById("distributedResult").closest("section").insertAdjacentElement("afterend",panel);
const el=id=>document.getElementById(id);
function build(){
 try{
  const raw=el("fbdTimeout").value;
  const plan=AirlockFbdGenerator.build(model,{timeoutMs:raw===""?null:Number(raw)});
  el("fbdResult").textContent="План проверен: помещений "+plan.blocks.length+", дверей "+plan.doors.length+
   ", связей "+plan.edges.length+". Требуется проверка в Owen Logic. Физические клеммы не назначены.";
  return plan;
 }catch(e){el("fbdResult").textContent="FBD-план не сформирован: "+e.message;return null}
}
function download(name,type,make){
 const plan=build();if(!plan)return;
 const url=URL.createObjectURL(new Blob([make(plan)],{type})),a=document.createElement("a");
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
el("fbdBuild").onclick=build;
el("fbdJSON").onclick=()=>download("airlock-fbd-plan.json","application/json",p=>JSON.stringify(p,null,2)+"\n");
el("fbdCSV").onclick=()=>download("connection-matrix.csv","text/csv;charset=utf-8",AirlockFbdGenerator.matrix);
el("fbdQA").onclick=()=>download("native-test-plan.md","text/markdown;charset=utf-8",AirlockFbdGenerator.nativeTestPlan);
const invalidate=()=>{el("fbdResult").textContent="Модель изменена. Пересчитайте FBD-план."};
el("fbdTimeout").oninput=invalidate;
for(const id of ["hardwareDevices","distributedAssignments"])
 document.getElementById(id).closest("section").addEventListener("change",invalidate);
const previous=render;render=function(){previous();invalidate()};
})();
