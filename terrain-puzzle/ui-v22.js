/* Terrain Puzzle v2.2 — task-oriented interface, no duplicate main controls.
 * All settings remain accessible through optional professional sections.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const aside=document.querySelector('aside'),sections=[...aside.querySelectorAll(':scope > section')];
if(sections.length<6)throw Error('Cannot identify Terrain Puzzle UI sections');
const [location,model,project,nature,exportSection,paper]=sections;
const description=document.createElement('div');
description.className='quickSteps';
description.innerHTML='<strong>Четыре действия</strong>'+
 '<p>① Выдели участок на карте и размер плиток.</p>'+
 '<p>② Настрой высоту и плавность рельефа.</p>'+
 '<p>③ Нажми «Загрузить лес и реки».</p>'+
 '<p>④ Проверь объёмный макет и скачай STL.</p>';
aside.insertBefore(description,location);
function title(section,text){
 const e=section.querySelector('.heading');if(e)e.textContent=text;
}
title(location,'1 · Участок');
title(model,'2 · Размер и рельеф');
title(nature,'3 · Леса, реки, дороги');
title(exportSection,'4 · Скачать 3D-модель');
title(project,'Маршруты и проекты');
title(paper,'PDF A0 и карты для окраски');
const advanced=document.createElement('details');
advanced.id='advancedSidebar';
const summary=document.createElement('summary');summary.textContent='Дополнительно: маршруты, PDF A0, сохранение проекта';
advanced.append(summary);
advanced.append(project,paper);aside.append(advanced);
function moveModelExtra(id,where){
 const control=$(id),item=control?.closest('.field')||control?.closest('.optionAvailability')||control;
 if(item&&item.parentElement!==where)where.appendChild(item);
}
const expert=document.createElement('details');expert.className='expertModel';
expert.innerHTML='<summary>Точные параметры: DEM, сглаживание, ограничения</summary>';
for(const id of ['source','smooth_m','tile_size','demQuality','autoScale','scaleEstimate','optionAvailability','qualityWarning'])
 moveModelExtra(id,expert);
model.append(expert);
const forestExtras=document.createElement('details');forestExtras.className='expertModel';
forestExtras.innerHTML='<summary>Деревья для печати, файлы OSM и настройки плотности</summary>';
const forestBlock=$('forestSpacing')?.closest('.cols2');
if(forestBlock)forestExtras.append(forestBlock);
const buttons=$('exportOSM')?.closest('.tools');
if(buttons)forestExtras.append(buttons);
nature.append(forestExtras);
const precision=document.createElement('details');precision.className='precisionDetails';
precision.innerHTML='<summary>Точное перемещение</summary>';
const grid=document.querySelector('.gridEditorToolbar');
for(const el of [document.querySelector('.gridNudge'),$('nudgeStep')]){
 if(el)precision.append(el);
}
if(grid)grid.append(precision);
const viewerExtras=document.createElement('details');viewerExtras.className='viewerExtras';
viewerExtras.innerHTML='<summary>Отображение</summary>';
for(const el of [$('viewerBorders')?.closest('label'),$('viewerWire')?.closest('label')]){
 if(el)viewerExtras.append(el);
}
$('viewerToolbar')?.append(viewerExtras);
const force=$('loadOSM');
if(force)force.textContent='Загрузить реальные леса и реки';
const show=$('osmShow3d');
if(show)show.textContent='Посмотреть лес и реку в 3D';
$('forestExport')?.setAttribute('title','Для печати деревьев отдельно от пазлов выбери STL. Координаты установки сохраняются в ZIP.');
$('mesh_step')?.setAttribute('title','Меньше шаг — поверхность плавнее. Но источник высот не станет точнее.');
$('puzzle')?.setAttribute('title','Соединительные выступы и впадины между деталями.');
$('gridFitScreen')?.setAttribute('title','Растянуть выделение до видимого участка карты. Не меняет предельный размер одной детали.');
// Default 2mm instead of 4mm reduces visible faceting in terrain mesh.
// Only change for fresh project defaults; JSON project restore always overrides.
if($('mesh_step')?.value==='4')$('mesh_step').value='2';
$('mesh_step')?.dispatchEvent(new Event('change',{bubbles:true}));
const mapAction=document.createElement('button');
mapAction.type='button';mapAction.className='ghost';mapAction.id='osmToolbarButton';
mapAction.textContent='🌲 Загрузить природу';
mapAction.title='Получить реальные OSM-контуры лесов, рек и дорог выбранного участка';
mapAction.addEventListener('click',()=>{
 force.click();
 if(mapAction.dataset.state!=='busy'){
  mapAction.dataset.state='busy';
  mapAction.textContent='🌲 Загрузка…';
  const status=$('landcoverStatus');
  const ob=new MutationObserver(()=>{
    if(!force.disabled){
      mapAction.dataset.state='ready';
      mapAction.textContent='🌲 Обновить природу';
      ob.disconnect();
    }
  });
  ob.observe(force,{attributes:true,attributeFilter:['disabled']});
 }
});
document.querySelector('.mapSwitch')?.insertAdjacentElement('afterend',mapAction);
const smooth=$('mesh_step');
if(smooth){
 const label=smooth.closest('.field')?.querySelector('label');
 if(label)label.textContent='Плавность 3D-рельефа';
 const info=document.createElement('p');info.className='hint';
 info.textContent='1–2 мм — поверхность гладкая; 4–8 мм — быстрее, но заметны грани. Точность исходных высот не меняется.';
 smooth.closest('.field')?.appendChild(info);
}
$('tab3d')?.addEventListener('click',()=>{const h=$('gridHelp');if(h)h.style.display='none';});
$('tabMap')?.addEventListener('click',()=>{const h=$('gridHelp');if(h)h.style.display='';});
const dem=$('demQuality');
if(dem)dem.setAttribute('title','Источник DEM — числовые высоты местности, не слой леса или рек OSM.');
// User must see an explicit explanation before/after data extraction.
const counts=$('landcoverCounts');
if(counts&&!counts.textContent.trim())counts.textContent='Пока нет данных. Нажми «Загрузить реальные леса и реки».';
$('exportOSM').disabled=true;
if(show)show.disabled=true;
})();
