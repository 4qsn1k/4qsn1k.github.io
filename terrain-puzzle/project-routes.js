/* Terrain Puzzle — standalone project persistence and GPX/KML/GeoJSON route overlays. */
(function(){
'use strict';
const $=id=>document.getElementById(id),api=window.terrainPuzzleDebug;
let route=null,layer=null,lastFile='';
const IDs=['lat1','lon1','lat2','lon2','scale','tile_size','exaggeration','mesh_step','smooth_m',
 'puzzle','export3mf','source','printerLimit','gridCount','paper_scale','paper_format','paper_orientation','paper_dpi','contour_interval','forestSpacing','forestExport','layerForest','layerRivers','layerRoads','layer3DTrees','riverWidth','previewTopo','topoDetail'];
function safePoint(lat,lon,ele){
 lat=Number(lat);lon=Number(lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)
   throw Error('GPX содержит недопустимую координату');
 return {lat,lon,ele:ele===undefined||ele===null?null:Number(ele)};
}
function parseGeoJSON(j){
 const collection=j.type==='FeatureCollection'?j.features:j.type==='Feature'?[j]:[{geometry:j,properties:{}}];
 const paths=[];
 for(const feature of collection){
  const g=feature.geometry;if(!g)continue;
  if(g.type==='LineString')paths.push(g.coordinates);
  if(g.type==='MultiLineString')paths.push(...g.coordinates);
 }
 if(!paths.length)throw Error('Не найдена линия маршрута (LineString)');
 return paths.flatMap((part,i)=>part.map(x=>safePoint(x[1],x[0],x.length>2?x[2]:null)));
}
function parseXML(data,format){
 const dom=new DOMParser().parseFromString(data,'application/xml');
 if(dom.querySelector('parsererror'))throw Error('Файл XML повреждён');
 const byLocal=(n)=>[...dom.getElementsByTagName('*')].filter(x=>x.localName===n);
 let coordinates=[];
 if(format==='gpx'){
  const pts=byLocal('trkpt').concat(byLocal('rtept'));
  coordinates=pts.map(pt=>{
   const elev=[...pt.children].find(x=>x.localName==='ele');
   return safePoint(pt.getAttribute('lat'),pt.getAttribute('lon'),elev?elev.textContent:null);
  });
 }else {
  for(const line of byLocal('LineString')){
   const el=[...line.children].find(x=>x.localName==='coordinates');
   if(!el)continue;
   const coords=el.textContent.trim().split(/\s+/).map(x=>x.split(','));
   coordinates.push(...coords.map(x=>safePoint(x[1],x[0],x[2])));
  }
 }
 return coordinates;
}
function validate(points){
 if(!Array.isArray(points)||points.length<2)throw Error('Маршрут должен содержать минимум две точки');
 if(points.length>100000)throw Error('Слишком большой маршрут: максимум 100 000 GPS-точек');
 return points.filter((x,i)=>i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/6000))===0)
 .map(x=>safePoint(x.lat,x.lon,x.ele));
}
function parse(text,name){
 const ext=name.toLowerCase().split('.').pop();
 const points=ext==='geojson'||ext==='json'?parseGeoJSON(JSON.parse(text)):parseXML(text,ext);
 return {name:name.slice(0,120),points:validate(points)};
}
function draw(){
 if(layer){layer.remove();layer=null;}
 if(!route)return;
 const map=api.map();if(!map)return;
 layer=L.polyline(route.points.map(p=>[p.lat,p.lon]),{
  color:'#ff5f43',weight:4,opacity:1,dashArray:'10 6',interactive:true
 }).addTo(map).bindTooltip('GPS-маршрут · '+route.name,{sticky:true});
 $('routeStatus').textContent=route.name+' · '+route.points.length+' точек. Линия отображается в карте и 3D.';
 if(window.TerrainViewer?.refreshRoute)window.TerrainViewer.refreshRoute();
}
function clear(){
 route=null;draw();$('routeStatus').textContent='Маршрут не загружен.';
 if(window.TerrainViewer?.refreshRoute)window.TerrainViewer.refreshRoute();
}
const controls=document.querySelector('#projectControls');
function bytes(blob,name){
 const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),20000);
}
function snapshot(){
 const settings={};
 for(const id of IDs){
  const e=$(id);if(e)settings[id]=e.type==='checkbox'?e.checked:e.value;
 }
 return {format:'TerrainPuzzleProject',version:2,created:new Date().toISOString(),
         settings,route,landcover:window.TerrainOSMLayers?.snapshot()||null,description:'WGS84 coordinates and print settings; no elevation data embedded'};
}
function applyState(doc){
 if(!doc||doc.format!=='TerrainPuzzleProject'||doc.version>2||!doc.settings)
   throw Error('Неверный формат проекта Terrain Puzzle');
 window.TerrainGridEditor?.disable();
 for(const [id,val] of Object.entries(doc.settings)){
  if(!IDs.includes(id))continue;
  const e=$(id);if(!e)continue;
  if(e.type==='checkbox'){e.checked=Boolean(val);continue;}
  if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===String(val))){
   if(id==='scale'&&Number(val)>=1000&&Number(val)<=2000000)e.add(new Option('1:'+Math.round(Number(val)),String(val)));
   else continue;
  }
  e.value=String(val);
 }
 route=doc.route?{name:String(doc.route.name||'Маршрут'),points:validate(doc.route.points)}:null;
 if(doc.landcover&&window.TerrainOSMLayers)window.TerrainOSMLayers.restore(doc.landcover);
 const p=api.recalc();if(!p)throw Error('Настройки проекта не проходят проверку');
 window.TerrainGridEditor?.enable();
 if(doc.settings.gridCount)$('gridCount').value=String(doc.settings.gridCount);
 draw();
 for(const id of ['source','paper_format','mesh_step','riverWidth','previewTopo','topoDetail'])$(id).dispatchEvent(new Event('change',{bubbles:true}));
 api.say('Проект загружен: '+p.total+' деталей.','good');
}
$('saveProject').onclick=()=>bytes(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),'terrain_puzzle_project.json');
$('openProject').onclick=()=>$('projectFile').click();
$('projectFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{if(file.size>4000000)throw Error('Файл проекта слишком большой');applyState(JSON.parse(await file.text()));}
 catch(err){api.say('Ошибка проекта: '+err.message,'error');}
 e.target.value='';
});
$('loadRoute').onclick=()=>$('routeFile').click();
$('routeFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>9000000)throw Error('Маршрут больше 9 МБ');
  const next=parse(await file.text(),file.name);route=next;draw();
  api.say('GPX/GeoJSON/KML: '+route.points.length+' точек, маршрут загружен.','good');
 }catch(err){api.say('Ошибка GPS: '+err.message,'error');}
 e.target.value='';
});
$('removeRoute').onclick=clear;
window.TerrainProject={
 snapshot,applyState,parse,getRoute:()=>route?.points||[],getRouteInfo:()=>route,
 toGeoJSON:()=>route?JSON.stringify({type:'Feature',properties:{name:route.name},geometry:{
  type:'LineString',coordinates:route.points.map(p=>p.ele==null?[p.lon,p.lat]:[p.lon,p.lat,p.ele])
 }},null,2):null,
 clear
};
})();