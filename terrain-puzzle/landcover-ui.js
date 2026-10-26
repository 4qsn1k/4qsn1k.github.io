/* OpenStreetMap layers, forest species legend, and optional printed tree sets. */
(function(){
'use strict';
const $=id=>document.getElementById(id),core=window.TerrainLandcover,api=window.terrainPuzzleDebug;
let features=[],layer=null,source='',loading=false,version=0;
const map=api.map();
function status(s,err=false){const e=$('landcoverStatus');e.textContent=s;e.style.color=err?'#f5ba92':'#9ae1cd';}
function enabled(kind){
 const sel={forest:'layerForest',tree:'layerForest',river:'layerRivers',water:'layerRivers',road:'layerRoads'};
 return $(sel[kind])?.checked??false;
}
function style(f){
 if(f.kind==='forest')return {color:f.subtype==='conifer'||f.subtype==='spruce'||f.subtype==='pine'?'#1b7659':
   f.subtype==='deciduous'||f.subtype==='birch'?'#93c85a':'#469a6b',weight:1,fillOpacity:.28};
 if(f.kind==='water')return {color:'#1d9ce1',fillColor:'#3aafea',weight:1,fillOpacity:.56};
 if(f.kind==='river')return {color:'#28adf0',weight:3,opacity:1};
 if(f.kind==='road')return {color:'#c58a59',weight:2,opacity:.92,dashArray:'7 4'};
 return {color:'#366',weight:1};
}
function redraw(){
 if(layer)layer.remove();
 layer=L.layerGroup().addTo(map);
 for(const f of features){
  if(!enabled(f.kind))continue;
  const coords=f.coords.map(c=>[c.lat,c.lon]),opts=style(f);
  let shape;
  if(f.kind==='tree')shape=L.circleMarker(coords[0],{radius:3,color:'#24764e',fillOpacity:.9}).addTo(layer);
  else if(f.area)shape=L.polygon([coords,...(f.holes||[]).map(r=>r.map(c=>[c.lat,c.lon]))],opts).addTo(layer);
  else shape=L.polyline(coords,opts).addTo(layer);
  const name=String(f.tags?.name||f.label||f.kind).slice(0,130);
  const caption=document.createElement('span');
  caption.textContent=name+(f.verified?' · определённая порода':'')+' · '+(f.source||'Геоданные');
  shape.bindTooltip(caption,{sticky:true});
 }
 window.TerrainViewer?.refreshLandcover?.();
 updateStats();
}
function updateStats(){
 const cnt=key=>features.filter(f=>f.kind===key).length;
 const known=features.filter(f=>(f.kind==='forest'||f.kind==='tree')&&f.verified).length;
 const unknown=features.filter(f=>(f.kind==='forest'||f.kind==='tree')&&!f.verified).length;
 const b=$('landcoverCounts');
 b.textContent='Лесных контуров: '+cnt('forest')+' · Рек и ручьёв: '+cnt('river')+
  ' · Водоёмов: '+cnt('water')+' (водохранилищ: '+features.filter(f=>f.kind==='water'&&
    (f.tags.water==='reservoir'||f.tags.landuse==='reservoir')).length+') · Дорог: '+cnt('road')+
  ' · Отдельных деревьев: '+cnt('tree')+'. Порода известна в '+known+' объектах; неизвестна в '+unknown+'.';
}
function toBox(){
 const p=api.plan(),latitudes=p.corners.map(c=>c[0]),longitudes=p.corners.map(c=>c[1]);
 const south=Math.min(...latitudes),north=Math.max(...latitudes),west=Math.min(...longitudes),east=Math.max(...longitudes);
 if(north-south>.18||east-west>.20)throw Error('Слишком большой участок для одного запроса OSM. Ограничение: 0,18° × 0,20°. Выдели меньшую область или импортируй GeoJSON.');
 return {south,west,north,east};
}
function query(box){
 const w=[box.south,box.west,box.north,box.east].map(x=>x.toFixed(7)).join(',');
 return '[out:json][timeout:25];('+[
  'way["natural"="wood"]('+w+');',
  'way["landuse"="forest"]('+w+');',
  'way["waterway"~"^(river|stream|canal|riverbank)$"]('+w+');',
  'way["natural"="water"]('+w+');',
  'way["water"="reservoir"]('+w+');',
  'way["landuse"="reservoir"]('+w+');',
  'relation["natural"="water"]('+w+');',
  'relation["water"="reservoir"]('+w+');',
  'relation["landuse"="reservoir"]('+w+');',
  'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|track|path|footway)$"]('+w+');',
  'node["natural"="tree"]('+w+');',
 ].join('')+');out body geom;';
}
const dataStats={status:'idle',source:'',downloaded:0,expected:null,message:'Данные не загружены',bbox:null,checkedAt:''};
const maxArea=.004,maxDeltaLat=.18,maxDeltaLon=.20;
const round=n=>Number(n).toFixed(5);
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatBox=b=>round(b.south)+'…'+round(b.north)+'° N, '+round(b.west)+'…'+round(b.east)+'° E';
function mark(source,box,raw){
 dataStats.status='ready';dataStats.source=source;dataStats.bbox={...box};
 dataStats.downloaded=raw;dataStats.checkedAt=new Date().toLocaleTimeString('ru-RU');
 dataStats.message=features.length?'Объекты получены':'Ответ получен, но нужные объекты не найдены в OSM';
 const node=$('osmAudit');
 if(node){
  node.hidden=false;
  node.innerHTML='<strong>'+(features.length?'Получены реальные объекты':'Нет подходящих объектов')+'</strong>'+
  '<span>Источник: '+escapeHTML(source)+' · '+dataStats.checkedAt+'</span>'+
  '<span>Ответ: '+raw+' объектов · после отбора: '+features.length+'</span>'+
  '<span>Участок: '+formatBox(box)+'</span>'+
  '<span>Чтобы увидеть лес в объёме, нажми «Посмотреть в 3D».</span>';
 }
 const summary=$('osmTopSummary');
 if(summary){summary.hidden=false;summary.textContent='OSM: '+features.length+' объектов · '+source;}
 const go=$('osmShow3d');if(go)go.disabled=!features.length;
 const download=$('exportOSM');if(download)download.disabled=!features.length;
}
function errorReport(message,box){
 dataStats.status='error';dataStats.message=message;dataStats.bbox=box||null;
 const node=$('osmAudit');if(node){
  node.hidden=false;
  node.textContent='Данные НЕ загружены. '+message+
   (box?' Выделение: '+formatBox(box):'')+' Для ручного импорта используй «Импорт OSM / GeoJSON».';
 }
 status('Загрузка не выполнена: '+message,true);
 const badge=$('osmTopSummary');if(badge){badge.hidden=false;badge.textContent='OSM: ошибка загрузки';}
}
function readBBox(){
 const box=toBox();
 if(box.north-box.south>maxDeltaLat||box.east-box.west>maxDeltaLon)throw Error('Участок слишком большой');
 return box;
}
const providers=[
 {id:'Overpass Private.coffee',url:'https://overpass.private.coffee/api/interpreter'},
 {id:'Overpass FOSSGIS',url:'https://overpass-api.de/api/interpreter'},
 {id:'Overpass VK Maps',url:'https://maps.mail.ru/osm/tools/overpass/api/interpreter'}
];
async function requestWithTimeout(url,timeout,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{...options,signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  const length=Number(response.headers.get('Content-Length')||0);
  if(length>16000000)throw Error('Ответ больше 16 МБ');
  const raw=await response.text();
  if(raw.length>16000000)throw Error('Ответ больше 16 МБ');
  return raw;
 }finally{clearTimeout(timer);}
}
async function querySmallOSM(box){
 const url='https://api.openstreetmap.org/api/0.6/map?bbox='+
  [box.west,box.south,box.east,box.north].map(round).join(',');
 const raw=await requestWithTimeout(url,18000,{headers:{Accept:'application/xml,text/xml;q=0.9,*/*;q=0.8'}});
 const parsed=core.parseOSMXML(raw);
 // XML includes all nodes and ways. Only mapped forest/water/roads/tree are retained.
 return {features:parsed,raw:(raw.match(/<(?:node|way|relation)\b/g)||[]).length,
   source:'OpenStreetMap API'};
}
async function queryOverpass(box){
 const q=query(box);
 const attempts=providers.map(async service=>{
  const u=service.url+'?data='+encodeURIComponent(q);
  const raw=await requestWithTimeout(u,15000);
  const json=JSON.parse(raw);
  const parsed=core.parseOverpass(json);
  return {features:parsed,raw:json.elements.length,source:service.id};
 });
 try{return await Promise.any(attempts)}
 catch(e){throw Error('Серверы Overpass не ответили: '+(e.errors||[]).map(x=>String(x.message||x)).join('; ').slice(0,230));}
}
// A reservoir can be a large multipolygon whose complete member ways fall
// outside the small /api/0.6/map bbox. Do a targeted relation query separately.
// It must not delay showing the normal OSM result or overwrite a newer request.
async function recoverLargeWater(box,requestVersion){
 const w=[box.south,box.west,box.north,box.east].map(v=>v.toFixed(7)).join(',');
 const q='[out:json][timeout:15];('+
  'relation["natural"="water"]('+w+');'+
  'relation["water"="reservoir"]('+w+');'+
  'relation["landuse"="reservoir"]('+w+');'+
  'way["natural"="water"]('+w+');'+
  'way["water"="reservoir"]('+w+');'+
  'way["landuse"="reservoir"]('+w+');'+
  ');out body geom;';
 const hosts=['https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'];
 for(const host of hosts){
  try{
   const body=await requestWithTimeout(host+'?data='+encodeURIComponent(q),9000);
   const payload=JSON.parse(body);
   const polygons=core.parseOverpass(payload).filter(f=>f.kind==='water'&&f.area);
   if(requestVersion!==version)return;
   const ids=new Set(features.map(f=>f.id));
   let added=0;
   for(const f of polygons)if(!ids.has(f.id)){features.push(f);ids.add(f.id);added++;}
   if(added){
    source=source+' + Overpass водоёмы';redraw();
    mark(source,box,dataStats.downloaded+payload.elements.length);
    status('Добавлено '+added+' реальных водных полигонов из составных границ OSM. Всего объектов: '+features.length+'.');
   }else{
    status('Основные объекты загружены. Дополнительных замкнутых береговых контуров в OSM не найдено. Большое водохранилище можно импортировать как полный GeoJSON.');
   }
   return;
  }catch(e){if(requestVersion!==version)return;}
 }
 if(requestVersion===version)status('Основные данные OSM загружены. Полный береговой контур водохранилища не получен из Overpass. Для него используй импорт GeoJSON.');
}
async function requestOSM(){
 if(loading)return;
 loading=true;$('loadOSM').disabled=true;
 const current=++version;
 let box=null;
 const started=performance.now();
 try{
  box=readBBox();
  const area=(box.east-box.west)*(box.north-box.south);
  status('Получаю лес, воду и дороги для '+formatBox(box)+'…');
  let result=null,failures=[];
  // Primary: read-only official OSM API for modest areas. Unlike common Overpass
  // instances it can return quickly, and is accessible to the browser over CORS.
  if(area<=maxArea){
   try{result=await querySmallOSM(box);}catch(e){failures.push('OSM API: '+e.message);}
  }
  if(!result){
   status('Пробую Overpass, проверяю резервные серверы…');
   try{result=await queryOverpass(box);}catch(e){failures.push(e.message);}
  }
  if(!result)throw Error(failures.join(' | ')||'Серверы геоданных недоступны');
  features=result.features;source=result.source;
  redraw();
  mark(result.source,box,result.raw);
  const sec=((performance.now()-started)/1000).toFixed(1);
  status('Готово за '+sec+' с: '+features.length+' объектов. '+result.source+'. '+(features.length?'Они показаны на карте.':'В этом участке в OSM нет нужных объектов.'));
  if(result.source==='OpenStreetMap API'&&!features.some(f=>f.kind==='water')){
   // Async follow-up: no UI blocking and no fabricated water geometry.
   void recoverLargeWater(box,current);
  }
 }catch(e){errorReport(e.message,box);}
 finally{loading=false;$('loadOSM').disabled=false;}
}

function setFeatures(next,label='GeoJSON'){
 ++version;features=next;source=label;redraw();
 status('Импортировано '+features.length+' объектов ('+label+'). Лес с неизвестными породами показан условно.');
 mark(label,toBox(),features.length);
}
function saveGeoJSON(){
 const data=JSON.stringify(core.toGeoJSON(features),null,2),blob=new Blob([data],{type:'application/geo+json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='terrain_osm_layers.geojson';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('loadOSM').onclick=requestOSM;
$('importOSM').onclick=()=>$('osmFile').click();
$('osmFile').addEventListener('change',async e=>{
 const f=e.target.files?.[0];if(!f)return;
 try{if(f.size>10e6)throw Error('Файл ограничен 10 МБ');
  const body=await f.text();
  setFeatures(/\.(osm|xml)$/i.test(f.name)?core.parseOSMXML(body):core.parseGeoJSON(body),f.name);}
 catch(err){status('Ошибка GeoJSON: '+err.message,true);}
 finally{e.target.value='';}
});
$('exportOSM').onclick=saveGeoJSON;
$('clearOSM').onclick=()=>{++version;features=[];source='';redraw();status('Слои OSM очищены.');dataStats.status='idle';dataStats.bbox=null;
 $('osmTopSummary').hidden=true;$('osmAudit').hidden=true;
 $('osmShow3d').disabled=true;$('exportOSM').disabled=true;};
for(const id of ['layerForest','layerRivers','layerRoads','layer3DTrees'])
 $(id).addEventListener('change',redraw);
$('forestSpacing').addEventListener('change',()=>window.TerrainViewer?.refreshLandcover?.());
function getTrees(p,force=false){
 if(!features.length||(!force&&!$('layer3DTrees').checked))return [];
 return core.placements(features,p,Number($('forestSpacing').value),1000);
}
function snapshot(){return {source,features};}
function restore(data){
 if(!data||!Array.isArray(data.features))return;
 setFeatures(data.features.slice(0,1400),String(data.source||'Проект'));
}
$('osmShow3d')?.addEventListener('click',()=>{
 document.getElementById('tab3d')?.click();
});
window.addEventListener('terrain:gridchange',()=>{
 version++;
 if(dataStats.status==='ready'&&dataStats.bbox){
  try{
   const cur=toBox();
   const moved=Object.keys(cur).some(k=>Math.abs(cur[k]-dataStats.bbox[k])>0.001);
   if(moved){
    const e=$('osmTopSummary');
    if(e)e.textContent='OSM: данные предыдущего участка · обновить';
    const a=$('osmAudit');
    if(a)a.innerHTML='<strong>Участок изменён</strong><span>Показаны старые объекты. Нажми «Загрузить OSM», чтобы обновить слой.</span>';
   }
  }catch{}
 }
});
window.TerrainOSMLayers={getFeatures:()=>features,getTrees,snapshot,restore,setFeatures,redraw,query,toBox,
 getAudit:()=>({...dataStats,counts:{features:features.length,forest:features.filter(f=>f.kind==='forest').length,river:features.filter(f=>f.kind==='river'||f.kind==='water').length}}),load:requestOSM};
})();
