/* SUP Routes — browser-only track library and geometry editor.
   Imported routes are local drafts, not synchronized with GitHub.
   Geometry editing is freehand. It does not snap points to river channels. */
(function(global){
"use strict";
const STORAGE="sup-route-editor-v1";
const SECTIONS=["chus","ugra","belaya"];
const id=x=>document.getElementById(x);
const rad=Math.PI/180;
function validPoint(p){return Array.isArray(p)&&p.length>=2&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]))&&Math.abs(Number(p[0]))<=180&&Math.abs(Number(p[1]))<=90;}
function clone(points){return points.map(p=>[+p[0],+p[1]]);}
function lengthMeters(a,b){const y=(a[1]+b[1])/2*rad,dx=(b[0]-a[0])*111320*Math.cos(y),dy=(b[1]-a[1])*111195;return Math.hypot(dx,dy);}
function lengthKm(points){let total=0;for(let i=1;i<points.length;i++)total+=lengthMeters(points[i-1],points[i])/1000;return total;}
function clean(points){if(!Array.isArray(points)||points.length<2||points.length>100000)throw Error("В треке должно быть от 2 до 100 000 точек.");const out=points.map(p=>[Number(p[0]),Number(p[1])]);if(out.some(p=>!validPoint(p)))throw Error("Некорректные координаты трека.");return out;}
function fromXml(text,type){
 const doc=new DOMParser().parseFromString(text,"application/xml");
 if(doc.getElementsByTagName("parsererror").length)throw Error("Файл XML повреждён.");
 const byTag=(el,tag)=>Array.from(el.getElementsByTagNameNS("*",tag));
 let paths=[];
 if(type==="gpx"){
  const trksegs=byTag(doc,"trkseg");
  for(const segment of trksegs){let path=byTag(segment,"trkpt").map(e=>[+e.getAttribute("lon"),+e.getAttribute("lat")]);if(path.length>=2)paths.push(path);}
  if(!paths.length)for(const rte of byTag(doc,"rte")){let path=byTag(rte,"rtept").map(e=>[+e.getAttribute("lon"),+e.getAttribute("lat")]);if(path.length>=2)paths.push(path);}
 }else{
  const lines=byTag(doc,"LineString");
  for(const line of lines)for(const tag of byTag(line,"coordinates")){
   const path=(tag.textContent||"").trim().split(/\s+/).map(t=>t.split(",").map(Number)).map(p=>[p[0],p[1]]);
   if(path.length>=2)paths.push(path);
  }
 }
 if(!paths.length)throw Error("В файле нет линии маршрута.");
 return pickLongest(paths);
}
function fromGeoJson(text){
 const data=JSON.parse(text), paths=[];
 function readGeometry(g){
  if(!g)return;
  if(g.type==="LineString")paths.push(g.coordinates);
  else if(g.type==="MultiLineString")paths.push(...g.coordinates);
  else if(g.type==="GeometryCollection")for(const sub of g.geometries||[])readGeometry(sub);
 }
 if(data.type==="FeatureCollection")for(const f of data.features||[])readGeometry(f.geometry);
 else if(data.type==="Feature")readGeometry(data.geometry);
 else readGeometry(data);
 if(!paths.length)throw Error("В GeoJSON нет линии маршрута.");
 return pickLongest(paths);
}
function pickLongest(paths){const list=paths.map(p=>{try{return clean(p);}catch(_){return null;}}).filter(Boolean);if(!list.length)throw Error("В файле нет корректного трека.");list.sort((a,b)=>lengthKm(b)-lengthKm(a));return {coords:list[0],skipped:list.length-1};}
function nearestSegment(coords,pos){
 const refY=pos[1]*rad,scaleX=111320*Math.cos(refY),scaleY=111195;
 let best={index:-1,dist:Infinity,t:0};
 for(let i=0;i<coords.length-1;i++){
  const a=coords[i],b=coords[i+1],ax=(a[0]-pos[0])*scaleX,ay=(a[1]-pos[1])*scaleY,bx=(b[0]-pos[0])*scaleX,by=(b[1]-pos[1])*scaleY,dx=bx-ax,dy=by-ay;
  const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/Math.max(.000001,dx*dx+dy*dy)));
  const dist=Math.hypot(ax+t*dx,ay+t*dy);
  if(dist<best.dist)best={index:i,dist,t};
 }
 return best;
}
function nearestVertex(coords,pos){
 let best={index:-1,dist:Infinity};
 for(let i=0;i<coords.length;i++){const d=lengthMeters(coords[i],pos);if(d<best.dist)best={index:i,dist:d};}
 return best;
}
class SUPRouteEditor{
 constructor(api){
  this.api=api;this.route="chus";this.enabled=false;this.mode="select";this.selectedIndex=-1;this.drag=null;this.suppressUntil=0;
  this.data={chus:[],ugra:[],belaya:[]};this.active={chus:null,ugra:null,belaya:null};this.history={};this.future={};this.pendingSave=false;this.notice="";
  this.restore();this.bind();
 }
 restore(){
  try{
   const x=JSON.parse(localStorage.getItem(STORAGE)||"{}");
   for(const r of SECTIONS){
    const records=Array.isArray(x.data?.[r])?x.data[r]:[];
    this.data[r]=records.slice(0,15).filter(t=>t&&typeof t.id==="string"&&typeof t.name==="string").map(t=>{try{return {id:t.id,name:t.name.slice(0,90),coords:clean(t.coords)};}catch(_){return null;}}).filter(Boolean);
    const active=x.active?.[r];this.active[r]=this.data[r].some(t=>t.id===active)?active:null;
   }
  }catch(err){this.notice="Сохранённая библиотека повреждена; загружены базовые маршруты.";}
 }
 persist(){
  try{localStorage.setItem(STORAGE,JSON.stringify({data:this.data,active:this.active}));this.pendingSave=false;id("editor-save-state").textContent="Копии сохранены локально в этом браузере. Скачайте GPX для резервной копии.";}
  catch(err){this.pendingSave=true;id("editor-save-state").textContent="Не удалось сохранить в браузере (возможно, нет места). Скачайте GPX до закрытия страницы.";this.message("Память браузера заполнена. Скачайте текущий GPX.");}
 }
 message(s){this.notice=s;id("edit-hint").textContent=s;}
 current(){return this.data[this.route].find(t=>t.id===this.active[this.route])||null;}
 updateSelect(){
  const select=id("track-select");select.replaceChildren();
  const original=new Option("Исходный маршрут (только чтение)","original");
  select.append(original);
  for(const record of this.data[this.route])select.append(new Option(record.name+" · "+record.coords.length+" т.",record.id));
  select.value=this.active[this.route]||"original";
 }
 onRouteSelected(name){
  if(!SECTIONS.includes(name))return;
  if(this.route!==name){this.enabled=false;this.mode="select";this.selectedIndex=-1;this.drag=null;}
  this.route=name;this.updateSelect();
  const item=this.current();this.api.activate(name,item?clone(item.coords):null);
  this.updateControls();
 }
 refreshExternal(){this.api.refresh();}
 commit(){
  this.persist();this.refreshExternal();this.updateControls();
 }
 saveSnapshot(){
  const cur=this.current();if(!cur)return;
  if(!this.history[cur.id])this.history[cur.id]=[];
  this.history[cur.id].push(clone(cur.coords));
  if(this.history[cur.id].length>25)this.history[cur.id].shift();
  this.future[cur.id]=[];
 }
 updateGeometry(live){
  const cur=this.current();if(!cur)return;
  this.api.activate(this.route,clone(cur.coords));
  if(live)this.api.redraw();else this.commit();
 }
 createCopy(name){
  if(this.data[this.route].length>=15){this.message("Не более 15 личных треков на реку. Скачайте GPX и удалите старые копии.");return null;}
  const base=this.api.getCurrentCoords();
  if(!base||base.length<2){this.message("Нет исходного маршрута для копирования.");return null;}
  const record={id:"route-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8),name:name||"Копия маршрута",coords:clone(base)};
  this.data[this.route].push(record);this.active[this.route]=record.id;this.selectedIndex=-1;this.history[record.id]=[];this.future[record.id]=[];
  this.updateGeometry(false);this.message("Создана личная копия. Исходный GPX сохранён.");
  return record;
 }
 activateChoice(choice){
  this.active[this.route]=choice==="original"?null:choice;
  this.enabled=false;this.mode="select";this.selectedIndex=-1;this.drag=null;
  this.persist();this.api.activate(this.route,this.current()?clone(this.current().coords):null);
  this.refreshExternal();this.updateControls();
  this.message(this.current()?"Выбран редактируемый трек «"+this.current().name+"».":"Показан исходный трек.");
 }
 async importFiles(fileList){
  const files=Array.from(fileList||[]);
  if(!files.length)return;
  let done=0,failed=[];
  for(const file of files){
   if(this.data[this.route].length>=15){failed.push(file.name+": достигнут предел 15 треков.");break;}
   if(file.size>10*1024*1024){failed.push(file.name+": файл больше 10 МБ.");continue;}
   try{
    const ext=(file.name.split(".").pop()||"").toLowerCase();
    const raw=await file.text(),type=ext==="kml"?"kml":ext==="geojson"||ext==="json"?"geojson":ext==="gpx"||ext==="xml"?"gpx":null;
    if(!type)throw Error("Нужен GPX, KML или GeoJSON.");
    const parsed=type==="geojson"?fromGeoJson(raw):fromXml(raw,type);
    const entry=this.createCopy(file.name.replace(/\.[^.]+$/,""));
    if(!entry){failed.push(file.name+": превышен предел.");continue;}
    entry.coords=parsed.coords;this.history[entry.id]=[];this.future[entry.id]=[];
    this.updateGeometry(false);done++;
    if(parsed.skipped)this.message(file.name+": взята самая длинная линия из "+(parsed.skipped+1)+". Остальные линии не импортированы.");
   }catch(err){failed.push(file.name+": "+err.message);}
  }
  this.updateSelect();this.updateControls();
  if(failed.length){this.message("Загружено: "+done+". Ошибки: "+failed.join(" | "));}
  else if(done)this.message("Загружено "+done+" трек(ов). Выбран последний. Включите редактор для изменения линии.");
  this.persist();
 }
 deleteCurrent(){
  const cur=this.current();
  if(!cur){this.message("Исходный маршрут нельзя удалить. Выберите личную копию.");return;}
  if(!confirm("Удалить личный трек «"+cur.name+"» из этого браузера? Скачайте GPX, если нужно сохранить."))return;
  this.data[this.route]=this.data[this.route].filter(t=>t.id!==cur.id);
  delete this.history[cur.id];delete this.future[cur.id];this.active[this.route]=null;
  this.enabled=false;this.mode="select";this.selectedIndex=-1;
  this.persist();this.api.activate(this.route,null);this.refreshExternal();this.updateControls();this.message("Личная копия удалена. Исходный маршрут не изменён.");
 }
 resetToOriginal(){this.activateChoice("original");}
 toggleEdit(){
  if(!this.enabled&&!this.current()){const copy=this.createCopy("Копия "+this.api.getRouteLabel(this.route));if(!copy)return;}
  this.enabled=!this.enabled;this.mode="select";this.selectedIndex=-1;
  this.updateSelect();this.updateControls();this.api.redraw();
  this.message(this.enabled?"Редактор включён. Нажмите на линию маршрута, чтобы выбрать вершину. Перетаскивайте выделенную точку мышью.":"Редактор выключен. Изменения сохранены локально.");
 }
 updateControls(){
  const cur=this.current(),on=this.enabled&&!!cur;
  id("btn-edit").textContent=this.enabled?"Завершить редактирование":"Редактировать";
  id("btn-edit").classList.toggle("active",this.enabled);
  id("btn-add-vertex").disabled=!on;
  id("btn-add-vertex").classList.toggle("active",on&&this.mode==="insert");
  id("btn-delete-vertex").disabled=!on||this.selectedIndex<0||cur.coords.length<=2;
  id("btn-undo").disabled=!on||!(this.history[cur?.id]?.length);
  id("btn-redo").disabled=!on||!(this.future[cur?.id]?.length);
  id("btn-track-delete").disabled=!cur;
  id("editor-state").textContent=!this.enabled?"Выключен":(this.mode==="insert"?"Добавление точек":"Редактирование");
  this.updateSelect();
 }
 toggleInsert(){
  if(!this.enabled)return;
  this.mode=this.mode==="insert"?"select":"insert";this.updateControls();
  this.message(this.mode==="insert"?"Нажмите на нужное место линии, чтобы вставить дополнительную вершину. Точка добавится между двумя ближайшими вершинами.":"Нажмите на линию, чтобы выбрать вершину.");
 }
 deleteVertex(){
  const cur=this.current();if(!this.enabled||!cur||this.selectedIndex<0||cur.coords.length<=2)return;
  this.saveSnapshot();cur.coords.splice(this.selectedIndex,1);this.selectedIndex=Math.min(this.selectedIndex,cur.coords.length-1);
  this.updateGeometry(false);this.message("Вершина удалена. Можно отменить изменение.");
 }
 undoRedo(isRedo){
  const cur=this.current();if(!this.enabled||!cur)return;
  const from=isRedo?this.future:this.history,to=isRedo?this.history:this.future,stack=from[cur.id]||[];
  if(!stack.length)return;
  (to[cur.id]??=[]).push(clone(cur.coords));cur.coords=stack.pop();this.selectedIndex=-1;
  this.updateGeometry(false);this.message(isRedo?"Повторено изменение.":"Отменено изменение.");
 }
 getClosestVertex(pos){return nearestVertex(this.current().coords,pos);}
 handleClick(e){
  if(!this.enabled)return false;
  if(Date.now()<this.suppressUntil){this.suppressUntil=0;return true;}
  const pos=[e.lngLat.lng,e.lngLat.lat],cur=this.current();
  if(!cur)return true;
  if(this.mode==="insert"){
   const near=nearestSegment(cur.coords,pos);
   if(near.index<0||near.dist>350){this.message("Для добавления вершины нажмите ближе к линии маршрута (не далее 350 м).");return true;}
   this.saveSnapshot();
   cur.coords.splice(near.index+1,0,pos);
   this.selectedIndex=near.index+1;
   this.mode="select";this.updateGeometry(false);this.message("Добавлена вершина № "+(this.selectedIndex+1)+". Перетащите её для точного положения.");return true;
  }
  const nearest=this.getClosestVertex(pos);
  const zoom=this.api.zoom()||12,limit=zoom<=9?2000:zoom<=12?500:160;
  if(nearest.dist>limit){this.message("Нажмите ближе к линии маршрута или увеличьте масштаб.");return true;}
  this.selectedIndex=nearest.index;this.updateControls();this.api.redraw();
  this.message("Вершина № "+(nearest.index+1)+" из "+cur.coords.length+". Перетащите маркер или нажмите «− Удалить точку».");return true;
 }
 onMouseDown(map,e){
  if(!this.enabled||this.mode!=="select"||!this.current())return false;
  const hits=map.queryRenderedFeatures(e.point,{layers:map.getLayer("sup-edit-points")?["sup-edit-points"]:[]});
  if(!hits.length)return false;
  const index=Number(hits[0].properties.index),cur=this.current();
  if(!Number.isInteger(index)||index<0||index>=cur.coords.length)return false;
  this.selectedIndex=index;this.drag={index,origin:clone(cur.coords),moved:false};
  if(map.dragPan)map.dragPan.disable();
  map.getCanvas().style.cursor="grabbing";
  this.updateControls();e.preventDefault?.();return true;
 }
 onMouseMove(map,e){
  if(!this.drag||!this.current())return false;
  const p=[e.lngLat.lng,e.lngLat.lat];
  if(!validPoint(p))return true;
  const cur=this.current();
  cur.coords[this.drag.index]=p;this.drag.moved=true;
  this.updateGeometry(true);return true;
 }
 onMouseUp(map){
  if(!this.drag)return false;
  const prev=this.drag.origin,moved=this.drag.moved,cur=this.current();
  this.drag=null;
  if(map.dragPan)map.dragPan.enable();
  map.getCanvas().style.cursor="crosshair";
  this.suppressUntil=Date.now()+300;
  if(moved&&cur){
   (this.history[cur.id]??=[]).push(prev);
   if(this.history[cur.id].length>25)this.history[cur.id].shift();
   this.future[cur.id]=[];
   this.updateGeometry(false);this.message("Вершина перенесена. Изменение сохранено. Доступна отмена.");
  }else this.api.redraw();
  return true;
 }
 renderMap(map){
  if(!map||!map.isStyleLoaded()||!map.getSource("sup-route"))return;
  const cur=this.current(),show=this.enabled&&!!cur;
  const features=[];
  if(show){
   let indices=new Set();
   for(let i=0;i<cur.coords.length;i+=Math.max(1,Math.floor(cur.coords.length/90)))indices.add(i);
   indices.add(0);indices.add(cur.coords.length-1);
   if(this.selectedIndex>=0)for(let i=Math.max(0,this.selectedIndex-18);i<=Math.min(cur.coords.length-1,this.selectedIndex+18);i++)indices.add(i);
   for(const i of indices)features.push({type:"Feature",geometry:{type:"Point",coordinates:cur.coords[i]},properties:{index:i,selected:i===this.selectedIndex?1:0}});
  }
  const fc={type:"FeatureCollection",features};
  if(map.getSource("sup-edit-vertices"))map.getSource("sup-edit-vertices").setData(fc);
  else{
   map.addSource("sup-edit-vertices",{type:"geojson",data:fc});
   map.addLayer({id:"sup-edit-points",type:"circle",source:"sup-edit-vertices",paint:{
     "circle-color":["case",["==",["get","selected"],1],"#ff884d","#fff5cf"],
     "circle-radius":["case",["==",["get","selected"],1],9,5],
     "circle-stroke-color":"#0c3240","circle-stroke-width":2
   }});
  }
 }
 bind(){
  id("track-select").addEventListener("change",e=>this.activateChoice(e.target.value));
  id("btn-track-delete").onclick=()=>this.deleteCurrent();
  id("btn-edit").onclick=()=>this.toggleEdit();
  id("btn-add-vertex").onclick=()=>this.toggleInsert();
  id("btn-delete-vertex").onclick=()=>this.deleteVertex();
  id("btn-undo").onclick=()=>this.undoRedo(false);
  id("btn-redo").onclick=()=>this.undoRedo(true);
  document.addEventListener("keydown",e=>{
   if(!this.enabled||!this.current()||["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
   if(e.key==="Escape"){if(this.mode==="insert"){this.mode="select";this.updateControls();this.message("Добавление вершины отменено.");}return;}
   if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();this.deleteVertex();return;}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();this.undoRedo(e.shiftKey);return;}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();this.undoRedo(true);}
  });
 }
}
global.SUPRouteEditor=SUPRouteEditor;
global.SUPRouteParsers={fromXml,fromGeoJson,nearestSegment,nearestVertex,lengthKm};
})(window);
