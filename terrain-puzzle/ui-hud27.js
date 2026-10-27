/* Terrain Puzzle v2.7 — map heads-up display and real stage progress.
 * The source of truth is the existing plan summary and status messages.
 * No geometry or DEM network logic is changed.
 */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const area=document.querySelector('.maparea');
 const stats=area?.querySelector('.stats'),status=$('status');
 if(!area||!stats||!status)return;
 const ns='http://www.w3.org/2000/svg';
 function svg(tag,attributes){
  const node=document.createElementNS(ns,tag);
  for(const [k,v] of Object.entries(attributes||{}))node.setAttribute(k,String(v));
  return node;
 }
 function element(tag,klass,content=''){
  const node=document.createElement(tag);node.className=klass;
  if(content)node.textContent=content;
  return node;
 }
 const hud=element('div','tp-hud');
 const summary=element('div','tp-area-card');
 const kicker=element('span','tp-hud-kicker','Выбранный участок');
 const value=element('strong','tp-hud-value','—');
 const secondary=element('span','tp-hud-sub','Задай границы на карте');
 summary.append(kicker,value,secondary);
 const progress=element('div','tp-progress-card');
 progress.hidden=true;area.classList.remove('tp-progress-active');
 const circle=element('div','tp-ring');
 const graphic=svg('svg',{viewBox:'0 0 92 92',width:'92',height:'92','aria-hidden':'true'});
 const background=svg('circle',{cx:46,cy:46,r:37,fill:'none',stroke:'rgba(159,186,201,0.20)','stroke-width':8});
 const foreground=svg('circle',{cx:46,cy:46,r:37,fill:'none',stroke:'#50dec1','stroke-width':8,'stroke-linecap':'round',transform:'rotate(-90 46 46)'});
 const circumference=2*Math.PI*37;
 foreground.style.strokeDasharray=String(circumference);
 foreground.style.strokeDashoffset=String(circumference);
 graphic.append(background,foreground);
 const digits=element('div','tp-ring-digits','0%');
 circle.append(graphic,digits);
 const stage=element('div','tp-progress-stage','Загрузка высот');
 const detail=element('div','tp-progress-note','');
 const words=element('div','tp-progress-words');words.append(stage,detail);
 progress.append(circle,words);
 progress.setAttribute('role','progressbar');
 progress.setAttribute('aria-label','Ход обработки рельефа');
 progress.setAttribute('aria-valuemin','0');
 progress.setAttribute('aria-valuemax','100');
 hud.append(summary,progress);
 // Keep HUD outside Leaflet and WebGL surfaces to avoid stolen pointer events.
 area.append(hud);
 let lastText='',lastStage='',active=false,hideTask=0;
 function updateSummary(){
  const selected=$('selected')?.textContent?.trim()||'—';
  const coverage=$('coverage')?.textContent?.trim()||'—';
  const tiles=$('tiles')?.textContent?.trim()||'—';
  const dims=$('dimensions')?.textContent?.trim()||'—';
  value.textContent=selected;
  if(selected==='—'){
   secondary.textContent='Укажи две точки или выдели область';
   summary.classList.add('tp-area-empty');
  }else{
   secondary.textContent='Охват '+coverage+' · '+tiles+' плиток · '+dims;
   summary.classList.remove('tp-area-empty');
  }
 }
 function show(stageName,percent,note,indeterminate=false){
  window.clearTimeout(hideTask);
  active=true;progress.hidden=false;area.classList.add('tp-progress-active');
  progress.dataset.state=indeterminate?'pending':'active';
  progress.classList.toggle('tp-progress-wait',indeterminate);
  stage.textContent=stageName;
  detail.textContent=note||'';
  digits.textContent=indeterminate?'···':String(percent)+'%';
  if(indeterminate){
   progress.removeAttribute('aria-valuenow');
   foreground.style.strokeDashoffset=String(circumference*.68);
  }else{
   const value=Math.max(0,Math.min(100,Math.round(percent)));
   progress.setAttribute('aria-valuenow',String(value));
   foreground.style.strokeDashoffset=String(circumference*(1-value/100));
  }
  progress.setAttribute('aria-valuetext',indeterminate?stageName:stageName+': '+Math.round(percent)+'%');
  lastStage=stageName;
 }
 function finalize(ok,description){
  if(!active)return;
  progress.dataset.state=ok?'success':'error';
  progress.classList.remove('tp-progress-wait');
  stage.textContent=ok?'Готово':'Ошибка';
  detail.textContent=description||'';
  digits.textContent=ok?'✓':'!';
  foreground.style.strokeDashoffset=ok?'0':String(circumference*.68);
  foreground.style.stroke=ok?'#5ae2b7':'#ffa478';
  if(ok)progress.setAttribute('aria-valuenow','100');
  else progress.removeAttribute('aria-valuenow');
  window.clearTimeout(hideTask);
  hideTask=window.setTimeout(()=>{progress.hidden=true;active=false;area.classList.remove('tp-progress-active');},ok?5000:10000);
 }
 function onStatus(){
  const text=status.textContent?.trim()||'';
  if(!text||text===lastText)return;
  lastText=text;
  let hit=text.match(/Общее поле высот:\s*(\d{1,3})\s*%/i);
  if(hit){foreground.style.stroke='#50dec1';show('Обработка высот',Number(hit[1]),'Расчёт поверхности рельефа');return;}
  hit=text.match(/Высоты\s+(.+?):\s*(\d+)\s*\/\s*(\d+)\s*файл/i);
  if(hit){foreground.style.stroke='#50dec1';show('Загрузка высот',hit[3]>0?100*Number(hit[2])/Number(hit[3]):0,'DEM '+hit[1]+' · '+hit[2]+' из '+hit[3]+' файлов');return;}
  hit=text.match(/Генерация STL:\s*(\d+)\s*из\s*(\d+)/i);
  if(hit){foreground.style.stroke='#50dec1';show('Файлы STL',hit[2]>0?Number(hit[1])/Number(hit[2])*100:0,hit[1]+' из '+hit[2]+' деталей');return;}
  if(/Создание цветного 3MF|Формирование ZIP/i.test(text)){
   foreground.style.stroke='#50dec1';show('Формирование архива',0,'Сборка файлов проекта',true);return;
  }
  if(/Загружаю цифровую модель высот|Получаю реальные высоты|проверяю данные высот/i.test(text)){
   foreground.style.stroke='#50dec1';show('Подготовка высот',0,'Загрузка и проверка данных',true);return;
  }
  if(/Не удалось|Ошибка|Нет доступного DEM|превыш|недоступно/i.test(text)&&status.classList.contains('error')){
   finalize(false,text.slice(0,85));return;
  }
  if(active&&(/3D-макет:|ZIP готов|готов.+STL|Сформировано|Скачивание|Готово\. Архив|готово.*ZIP/i.test(text))){
   finalize(true,'Рельеф подготовлен');return;
  }
 }
 function positionHUD(){
  const bar=area.querySelector('.toolbar');
  const toolbarBottom=bar?bar.offsetTop+bar.offsetHeight:0;
  // Position below toolbar; in 3D keep clear of its own camera controls.
  const viewer=area.classList.contains('previewMode')?document.getElementById('viewerToolbar'):null;
  const viewerHeight=viewer?.offsetHeight||0;
  area.style.setProperty('--tp-hud-top',toolbarBottom+Math.max(14,viewerHeight+20)+'px');
 }
 const layoutObserver=new ResizeObserver(positionHUD);
 const toolbar=area.querySelector('.toolbar');
 if(toolbar)layoutObserver.observe(toolbar);
 const viewerControls=document.getElementById('viewerToolbar');
 if(viewerControls)layoutObserver.observe(viewerControls);
 const modesObserver=new MutationObserver(positionHUD);
 modesObserver.observe(area,{attributes:true,attributeFilter:['class']});
 window.addEventListener('resize',positionHUD);
 positionHUD();
 const observer=new MutationObserver(()=>{updateSummary();onStatus();});
 observer.observe(stats,{subtree:true,characterData:true,childList:true});
 observer.observe(status,{subtree:true,characterData:true,childList:true,attributes:true,attributeFilter:['class']});
 // Keyboard and screen-reader status remain available in original status bar.
 updateSummary();onStatus();
 window.TerrainHUD={update:updateSummary,state:()=>({active,stage:lastStage,percent:progress.getAttribute('aria-valuenow'),text:detail.textContent})};
})();