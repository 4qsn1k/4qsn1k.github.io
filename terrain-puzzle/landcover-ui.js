/* OpenStreetMap layers, forest species legend, and optional printed tree sets. */
(function(){
'use strict';
const $=id=>document.getElementById(id),core=window.TerrainLandcover,api=window.terrainPuzzleDebug;
let features=[],layer=null,source='',loading=false;
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
  else if(f.area)shape=L.polygon(coords,opts).addTo(layer);
  else shape=L.polyline(coords,opts).addTo(layer);
  const name=String(f.tags?.name||f.label||f.kind).slice(0,130);
  shape.bindTooltip(name+(f.verified?' · определённая порода':'')+' · '+(f.source||'Геоданные'),{sticky:true});
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
  ' · Водоёмов: '+cnt('water')+' · Дорог: '+cnt('road')+
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
  'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|track|path|footway)$"]('+w+');',
  'node["natural"="tree"]('+w+');',
  'relation["natural"="water"]('+w+');'
 ].join('')+');out body geom;';
}
async function requestOSM(){
 if(loading)return;
 loading=true;$('loadOSM').disabled=true;
 try{
  const box=toBox(),q=query(box),hosts=[
   'https://overpass.kumi.systems/api/interpreter',
   'https://overpass.private.coffee/api/interpreter',
   'https://overpass-api.de/api/interpreter'
  ];
  let payload=null,lastError='';
  for(let i=0;i<hosts.length;i++){
   status('Загрузка OpenStreetMap: сервер '+(i+1)+' из '+hosts.length+'…');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   try{
     const response=await fetch(hosts[i],{method:'POST',body:new URLSearchParams({data:q}),
       headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:controller.signal});
     if(!response.ok)throw Error('HTTP '+response.status);
     const contentLength=Number(response.headers.get('Content-Length')||0);
     if(contentLength>10e6)throw Error('OSM ответ больше 10 МБ');
     const body=await response.text();
     if(body.length>10e6)throw Error('Слишком большой ответ OSM');
     payload=JSON.parse(body);break;
   }catch(e){lastError=String(e.message||e);}
   finally{clearTimeout(timer);}
  }
  if(!payload){
    // Read-only OSM map API, only for small, explicitly user-selected areas.
    const area=(box.east-box.west)*(box.north-box.south);
    if(area>.004)throw Error('Сервис Overpass недоступен. Для участка такого размера импортируй .osm XML или GeoJSON. '+lastError);
    status('Overpass недоступен. Пробую официальный OSM API для небольшого участка…');
    const u='https://api.openstreetmap.org/api/0.6/map?bbox='+[box.west,box.south,box.east,box.north].join(',');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(u,{signal:controller.signal});
      if(!response.ok)throw Error('OSM API HTTP '+response.status);
      const body=await response.text();
      if(body.length>8e6)throw Error('Слишком большой ответ');
      features=core.parseOSMXML(body);source='OSM Map API';
      redraw();status('Загружены реальные данные OSM API: '+features.length+' объектов.');return;
    }catch(err){
      throw Error('Серверы OSM недоступны ('+lastError+'). Импортируй .osm XML с openstreetmap.org/export или GeoJSON. '+err.message);
    }finally{clearTimeout(timer);}
  }
  features=core.parseOverpass(payload);source='OpenStreetMap (Overpass)';
  redraw();status('Загружено объектов: '+features.length+'. Источник: OpenStreetMap. Для пород деревьев использованы только подтверждённые теги.');
 }catch(e){status('OSM: '+e.message,true);}
 finally{loading=false;$('loadOSM').disabled=false;}
}
function setFeatures(next,label='GeoJSON'){
 features=next;source=label;redraw();
 status('Загружено '+features.length+' объектов ('+label+'). Лес с неизвестными породами показан условно.');
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
$('clearOSM').onclick=()=>{features=[];source='';redraw();status('Слои OSM очищены.');};
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
window.TerrainOSMLayers={getFeatures:()=>features,getTrees,snapshot,restore,setFeatures,redraw,query,toBox};
})();
