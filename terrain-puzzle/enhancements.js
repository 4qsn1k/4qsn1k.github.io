/* Terrain Puzzle v1.2: ergonomic coordinate input, scale planning, map layers, viewer and print commands. */
(function(){
'use strict';
const $=id=>document.getElementById(id),api=window.terrainPuzzleDebug;
let mapType='osm',lastKey='',lastDEM=null,lastRange=null,loading=false;
const layers={
 osm:{url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',attr:'© OpenStreetMap contributors',maxZoom:19},
 topo:{url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',attr:'© OpenTopoMap / OpenStreetMap',maxZoom:17},
 sat:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attr:'© Esri',maxZoom:18}
};
let selectedLayer=null;
function parsed(s){
 s=s.trim();if(!s)throw Error('Вставь координаты или ссылку.');
 const nums=t=>t.replace(/\+/g,' ').match(/-?\d{1,3}(?:\.\d+)?/g)?.map(Number)||[];
 let arr=null;
 try{
  const u=new URL(s);const q=u.searchParams,hash=decodeURIComponent(u.hash);
  if(q.has('ll')){let n=nums(q.get('ll'));if(n.length>=2)arr=/google/i.test(u.hostname)?[n[0],n[1]]:[n[1],n[0]];}
  if(q.has('pt')){let n=nums(q.get('pt'));if(n.length>=2)arr=[n[1],n[0]];}
  if(q.has('whatshere[point]')){let n=nums(q.get('whatshere[point]'));if(n.length>=2)arr=[n[1],n[0]];}
  if(q.has('mlat')&&q.has('mlon'))arr=[+q.get('mlat'),+q.get('mlon')];
  for(const key of ['q','query','center'])if(!arr&&q.has(key)){let n=nums(q.get(key));if(n.length===2)arr=n;}
  const at=s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if(!arr&&at)arr=[+at[1],+at[2]];
  const ll=s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if(!arr&&ll)arr=[+ll[1],+ll[2]];
  const osm=hash.match(/map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  if(!arr&&osm)arr=[+osm[1],+osm[2]];
  if(!arr && /(?:maps\.app\.goo\.gl|goo\.gl|yandex\.ru\/maps\/-)/i.test(s))
   throw Error('Это короткая ссылка. Открой её в карте и скопируй полный адрес с координатами.');
 }catch(e){if(e.message.includes('короткая'))throw e;}
 if(!arr){
  const decimal=/[+-]?\d{1,3}(?:\.\d+)?/g;
  const n=s.match(decimal)?.map(Number)||[];
  if(n.length===2)arr=n;
 }
 if(!arr||!arr.every(Number.isFinite)||Math.abs(arr[0])>85||Math.abs(arr[1])>180)
  throw Error('Координаты не распознаны. Пример: 53.96000, 58.30000 (широта, долгота).');
 return arr;
}
function paste(index){
 try{
  const source=$('coordinatePaste').value;
  const [lat,lon]=parsed(source);
  $('lat'+index).value=lat.toFixed(6);$('lon'+index).value=lon.toFixed(6);
  resetTerrain();api.recalc();api.say('Точка '+(index===1?'A':'B')+' установлена: '+lat.toFixed(6)+', '+lon.toFixed(6),'good');
 }catch(e){api.say(e.message,'error');}
}
$('pasteA').onclick=()=>paste(1);$('pasteB').onclick=()=>paste(2);
$('pasteBoth').onclick=()=>{
 try{
  const items=$('coordinatePaste').value.split(/[;\n]+/).map(x=>x.trim()).filter(Boolean);
  if(items.length!==2)throw Error('Для двух точек вставь: широта, долгота; широта, долгота.');
  const a=parsed(items[0]),b=parsed(items[1]);
  [a,b].forEach((t,i)=>{$('lat'+(i+1)).value=t[0];$('lon'+(i+1)).value=t[1];});
  resetTerrain();api.recalc();api.say('Обе координаты установлены.','good');
 }catch(e){api.say(e.message,'error');}
};
$('autoScale').onclick=()=>{
 const s=api.inputs();
 const d=6378137*Math.PI/180,lat=(s.lat1+s.lat2)/2;
 const dist=Math.max(Math.abs(s.lat1-s.lat2)*d,Math.abs(s.lon1-s.lon2)*d*Math.cos(lat*Math.PI/180));
 const pitch=s.tile_size-(s.puzzle?16:0);
 const side=Math.ceil(pitch/s.mesh_step),facesPerTile=4*side*side+4*side;
 const target=Math.max(1,Math.min(6,Math.floor(Math.sqrt(6000000/facesPerTile))));
 const need=Math.ceil(dist*1000/(target*pitch));
 const current=+ $('scale').value;
 const choices=[5000,10000,15000,25000,50000,100000,200000,400000,600000,1000000,2000000];
 const final=choices.find(x=>x>=need)||2000000;
 if(![...$('scale').options].some(o=>+o.value===final))$('scale').add(new Option('1:'+final.toLocaleString('ru-RU'),final));
 $('scale').value=final;
 const result=api.recalc();
 if(!result){quality();return;}
 api.say('Масштаб 1:'+final.toLocaleString('ru-RU')+' — не более '+target+'×'+target+' деталей при выбранной точности.','good');
 resetTerrain();
};
function quality(){
 let p;try{p=api.plan();}catch(e){$('qualityWarning').textContent=e.message;return;}
 const count=Math.ceil(p.pitch/p.s.mesh_step);
 const tri= (4*count*count+4*count)*p.total;
 const mb=tri*50/1048576;
 $('qualityWarning').textContent='Оценка: '+(tri/1e6).toFixed(2)+' млн треугольников; '+Math.round(mb)+' МБ несжатых STL. '+'Шаг сетки '+p.s.mesh_step+' мм; данные высот не становятся точнее при сгущении сетки.';
}
function resetTerrain(){lastDEM=null;lastRange=null;lastKey='';quality();}
['lat1','lat2','lon1','lon2','scale','tile_size','exaggeration','mesh_step','smooth_m','puzzle'].forEach(id=>
 $(id).addEventListener('change',()=>{resetTerrain();}));
function mapLayer(code){
 if(!window.L||!api.map())return;
 const map=api.map();
 map.eachLayer(layer=>{if(layer instanceof L.TileLayer)map.removeLayer(layer);});
 const x=layers[code];selectedLayer=L.tileLayer(x.url,{attribution:x.attr,maxZoom:x.maxZoom});
 selectedLayer.on('tileerror',()=>api.say('Картографический слой недоступен. Выбери другой слой. Координаты и STL работают независимо от карты.','error'));
 selectedLayer.addTo(map);mapType=code;
 document.querySelectorAll('.mapSwitch button').forEach(el=>el.classList.toggle('active',el.dataset.layer===code));
}
document.querySelectorAll('.mapSwitch button').forEach(button=>button.onclick=()=>mapLayer(button.dataset.layer));
function tab(which){
 const map=which==='map';
 $('map').style.display=map?'block':'none';
 $('preview3d').style.display=map?'none':'block';
 $('tabMap').classList.toggle('active',map);$('tab3d').classList.toggle('active',!map);
 $('refreshPreview').style.display=map?'none':'inline-block';
 if(map)setTimeout(()=>api.map()?.invalidateSize(),60);
 else {window.TerrainViewer?.resize();let key='';try{let p=api.plan();key=JSON.stringify(p.corners)+p.s.source+'|'+p.s.smooth_m;}catch(e){api.say(e.message,'error');return;}if(!lastDEM||key!==lastKey)loadPreview();}
}
$('tabMap').onclick=()=>tab('map');$('tab3d').onclick=()=>tab('preview');
async function elevations(){
 const p=api.plan();
 const key=JSON.stringify(p.corners)+p.s.source+'|'+p.s.smooth_m;
 if(lastDEM&&key===lastKey)return{p,dem:lastDEM,range:lastRange};
 const dem=await api.demData(p),range=api.getRange(p,dem);
 lastDEM=dem;lastRange=range;lastKey=key;
 return {p,dem,range};
}
async function loadPreview(){
 if(loading)return;
 loading=true;$('refreshPreview').disabled=true;
 try{
  api.say('Загружаю цифровую модель высот для объёмного просмотра…');
  const o=await elevations();
  if($('preview3d').style.display==='none')return;
  window.TerrainViewer.render(o.p,o.dem,o.range);
  const side=Math.round(o.p.cols*o.p.pitch),height=3+(o.range.max-o.range.min)*1000/o.p.s.scale*o.p.s.exaggeration;
  api.say('3D-макет: '+side+'×'+side+'×'+height.toFixed(1)+' мм, '+o.p.total+' плиток. '+(height>210?'Высота больше 210 мм — уменьши усиление рельефа.':'Габарит по высоте допустимый.'),height>210?'error':'good');
 }catch(e){api.say('Не удалось построить 3D: '+e.message,'error');}
 finally{loading=false;$('refreshPreview').disabled=false;}
}
$('refreshPreview').onclick=loadPreview;
$('exportTileMaps').onclick=async()=>{
 const button=$('exportTileMaps');button.disabled=true;
 try{let o=await elevations();await window.TerrainMaps.downloadTiles(o.p,o.dem,o.range,api.zip,msg=>$('paperStatus').textContent=msg);}
 catch(e){$('paperStatus').textContent='Ошибка: '+e.message;}
 finally{button.disabled=false;}
};
$('exportPaperMap').onclick=async()=>{
 const button=$('exportPaperMap');button.disabled=true;
 try{let o=await elevations();await window.TerrainMaps.downloadPaper(o.p,o.dem,o.range,msg=>$('paperStatus').textContent=msg);}
 catch(e){$('paperStatus').textContent='Ошибка: '+e.message;}
 finally{button.disabled=false;}
};
quality();
window.terrainPuzzleEnhanced={parsed,quality,mapLayer,elevations};
})();
