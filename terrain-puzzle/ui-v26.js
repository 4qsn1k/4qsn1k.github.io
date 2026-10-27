/* Terrain Puzzle 2.6: user-task navigation and uncluttered 3D workbench.
 * Existing form controls, buttons, event listeners, APIs and file formats stay intact.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const main=document.querySelector('main'),aside=document.querySelector('main > aside');
const mapArea=document.querySelector('.maparea'),header=document.querySelector('body > header');
if(!main||!aside||!mapArea||!header)return;
document.body.classList.add('tp-v26');
const originals=[...aside.children].filter(e=>e.tagName==='SECTION');
const advanced=$('advancedSidebar');
const embedded=advanced?[...advanced.querySelectorAll(':scope > section')]:[];
if(originals.length!==4||embedded.length!==2){console.warn('Terrain Puzzle UI: unsupported section structure');return;}
const [location,model,nature,exportSection]=originals;
const [projects,paper]=embedded;
const paneInfo=[
 {id:'place',symbol:'⌖',title:'Участок',subtitle:'Границы и положение сетки',section:location,
  intro:'Укажи две точки или вставь ссылку на карту. Перемещай рамку прямо на карте.',
  next:'Рельеф',nextId:'model'},
 {id:'model',symbol:'▥',title:'Рельеф',subtitle:'Размеры, масштаб и качество STL',section:model,
  intro:'Задай физический размер детали, масштаб, высоту и плавность поверхности.',
  next:'Природа',nextId:'nature'},
 {id:'nature',symbol:'♧',title:'Природа',subtitle:'Леса, реки, водохранилища',section:nature,
  intro:'Загрузи географические объекты OSM. Результат и ошибки показаны ниже.',
  next:'3D-модель',nextId:'export'},
 {id:'export',symbol:'⬡',title:'3D и STL',subtitle:'Просмотр и экспорт модели',section:exportSection,
  intro:'Проверь макет. Скачать STL можно без обязательной загрузки природы.',
  next:'Карта PDF',nextId:'paper'},
 {id:'paper',symbol:'▤',title:'Карта PDF',subtitle:'Карта для типографии до A0',section:paper,
  intro:'Задай размер бумаги и разрешение. Печатный масштаб не влияет на STL.',
  next:'Проект',nextId:'projects'},
 {id:'projects',symbol:'◫',title:'Проект',subtitle:'Сохранение и GPS-маршрут',section:projects,
  intro:'Сохрани параметры и геоданные в JSON. Добавь собственный GPS-маршрут.',
  next:'Участок',nextId:'place'}
];
function el(tag,props={},text=''){
 const x=document.createElement(tag);
 for(const [key,val] of Object.entries(props)){
  if(key==='className')x.className=val;
  else if(key==='title')x.title=val;
  else x.setAttribute(key,val);
 }
 if(text)x.textContent=text;
 return x;
}
const rail=el('nav',{className:'tp-rail','aria-label':'Этапы создания макета'});
const settingsHead=el('div',{className:'tp-settings-head'});
const titles=el('div',{className:'tp-head-titles'}),heading=el('div',{className:'tp-heading'},'Участок'),subtitle=el('div',{className:'tp-small'},'Выбери область');
titles.append(heading,subtitle);
const closePanel=el('button',{className:'tp-close',type:'button','aria-label':'Скрыть настройки'},'×');
settingsHead.append(titles,closePanel);
const scroller=el('div',{className:'tp-pane-scroll'});
const drawer=el('div',{className:'tp-header-tools'});
const guide=el('span',{className:'tp-guide'},'Выдели участок → рельеф → 3D → экспорт');
const sidebarToggle=el('button',{type:'button','aria-label':'Показать или скрыть настройки',title:'Показать / скрыть настройки'},'◧ Панель');
const help=el('button',{type:'button',title:'Помощь по кнопкам и режимам'},'? Справка');
sidebarToggle.addEventListener('click',()=>{
 document.body.classList.toggle('tp-side-collapsed');
 sidebarToggle.setAttribute('aria-expanded',String(!document.body.classList.contains('tp-side-collapsed')));
 resizeViews();
});
closePanel.addEventListener('click',()=>{document.body.classList.add('tp-side-collapsed');resizeViews();});
help.addEventListener('click',()=>$('helpToggle')?.click());
sidebarToggle.setAttribute('aria-expanded','true');
drawer.append(guide,sidebarToggle,help);header.append(drawer);
const rails=new Map();
function resizeViews(){
 requestAnimationFrame(()=>setTimeout(()=>{
  window.terrainPuzzleDebug?.map?.()?.invalidateSize?.();
  window.TerrainViewer?.resize?.();
 },80));
}
function appendCTA(section,info){
 const foot=el('div',{className:'tp-flow-next'});
 const button=el('button',{type:'button'},info.next+' →');
 button.addEventListener('click',()=>{
  selectPane(info.nextId);
  if(info.nextId==='export')$('tab3d')?.click();
  else if(info.nextId==='place')$('tabMap')?.click();
 });
 foot.append(button);section.append(foot);
}
for(const info of paneInfo){
 const btn=el('button',{type:'button','aria-controls':'tp-'+info.id,'aria-label':info.title,
  title:info.subtitle,'data-step':info.id});
 btn.append(el('span',{className:'tp-symbol','aria-hidden':'true'},info.symbol),
  el('span',{},info.title));
 btn.addEventListener('click',()=>{
  selectPane(info.id);
  if(info.id==='place')$('tabMap')?.click();
  if(document.body.classList.contains('tp-side-collapsed'))
   document.body.classList.remove('tp-side-collapsed');
 });
 rail.append(btn);rails.set(info.id,btn);
 info.section.id='tp-'+info.id;
 info.section.classList.add('tp-panel');
 const intro=el('div',{className:'tp-panel-intro'},info.intro);
 info.section.insertBefore(intro,info.section.firstChild);
 appendCTA(info.section,info);
 scroller.append(info.section);
}
const rule=el('div',{className:'tp-rule','aria-hidden':'true'});
rail.append(rule);
aside.replaceChildren(settingsHead,scroller);
main.insertBefore(rail,aside);
let currentPane='place';
function selectPane(id){
 const info=paneInfo.find(x=>x.id===id);
 if(!info)return;
 currentPane=id;
 for(const item of paneInfo){
  item.section.classList.toggle('tp-active',item.id===id);
  const button=rails.get(item.id);
  button.classList.toggle('tp-current',item.id===id);
  button.setAttribute('aria-current',item.id===id?'step':'false');
 }
 heading.textContent=info.title;subtitle.textContent=info.subtitle;
 scroller.scrollTop=0;
 try{sessionStorage.setItem('tp-v26-active-panel',id)}catch{}
 resizeViews();
}
// Common actions are visible in the relevant panel; unusual actions stay where they are.
const exportQuick=el('div',{className:'tp-mini-steps'});
const viewNow=el('button',{type:'button',title:'Открыть объёмную модель в рабочей области'},'◈ Посмотреть 3D');
viewNow.addEventListener('click',()=>$('tab3d')?.click());
const homeView=el('button',{type:'button',title:'Показать модель целиком'},'▣ Весь макет');
homeView.addEventListener('click',()=>{$('tab3d')?.click();window.TerrainViewer?.fit?.();});
exportQuick.append(viewNow,homeView);
exportSection.querySelector('.heading')?.insertAdjacentElement('afterend',exportQuick);
const currentSummary=el('div',{className:'tp-view-steps'},'Просмотр: вращение мышью · колесо — масштаб · Shift+мышь — сдвиг.');
exportQuick.after(currentSummary);
const viewer=$('viewerToolbar');
if(viewer){
 const extra=el('details',{className:'tp-view-extra'});
 const title=el('summary',{},'⚙ Вид и слои');
 const inner=el('div',{className:'tp-view-extra-inner'});
 for(const id of ['previewTopo','topoDetail','viewScale','riverWidth']){
  const c=$(id);if(c?.closest('label'))inner.append(c.closest('label'));
 }
 const options=viewer.querySelector('.viewerExtras');
 if(options)inner.append(options);
 extra.append(title,inner);viewer.append(extra);
 viewer.querySelector('[data-view="reset"]')?.remove();
}
const report=$('osmTopSummary');
if(report){
 report.tabIndex=0;report.setAttribute('role','button');report.title='Открыть сведения о загрузке OSM';
 report.addEventListener('click',()=>selectPane('nature'));
 report.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectPane('nature');}});
}
const pointSection=location;
const quick=el('div',{className:'tp-mini-steps'});
const gridFit=el('button',{type:'button'},'⛶ Рамка по карте');
gridFit.title='Растянуть сетку до видимой области карты';
gridFit.addEventListener('click',()=>{
 $('tabMap')?.click();
 if(!$('gridToggle')?.classList.contains('activeGrid'))$('gridToggle')?.click();
 $('gridFitScreen')?.click();
});
const look=el('button',{type:'button'},'⌖ Показать участок');
look.addEventListener('click',()=>{$('tabMap')?.click();$('fit')?.click();});
quick.append(gridFit,look);
pointSection.querySelector('.topPaste')?.insertAdjacentElement('beforebegin',quick);
const modelButtons=el('div',{className:'tp-mini-steps'});
const scale=el('button',{type:'button'},'↗ Подобрать масштаб');
scale.title='Автоматически выбрать доступный масштаб по размеру участка';
scale.addEventListener('click',()=>$('autoScale')?.click());
const see=el('button',{type:'button'},'◈ 3D-проверка');
see.addEventListener('click',()=>$('tab3d')?.click());
modelButtons.append(scale,see);
model.querySelector('.heading')?.insertAdjacentElement('afterend',modelButtons);
// Ensure Map / Preview tab switches remain reachable, even when sidebar is collapsed.
$('tab3d')?.addEventListener('click',()=>{guide.textContent='3D: перетащи для поворота · колесо для масштаба';});
$('tabMap')?.addEventListener('click',()=>{guide.textContent='Карта: выдели участок · настрой размеры деталей';});
const first=new URLSearchParams(window.location.search).get('panel');
const saved=(()=>{try{return sessionStorage.getItem('tp-v26-active-panel')}catch{return null}})();
selectPane(paneInfo.some(x=>x.id===first)?first:paneInfo.some(x=>x.id===saved)?saved:'place');
if(window.innerWidth<=760&&!first){
 document.body.classList.add('tp-side-collapsed');
 sidebarToggle.setAttribute('aria-expanded','false');
}
const status=$('status');
if(status){status.setAttribute('role','status');status.setAttribute('aria-live','polite');}
document.addEventListener('keydown',e=>{
 if(e.altKey && /^[1-6]$/.test(e.key)){
  e.preventDefault();selectPane(paneInfo[Number(e.key)-1].id);
 }
});
window.TerrainUI26={selectPane,current:()=>currentPane,steps:paneInfo.map(({id,title})=>({id,title}))};
})();
