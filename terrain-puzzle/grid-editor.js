/* Terrain Puzzle 1.3 — drag-to-resize/drag-to-move printable grid.
   A grid covers exactly N×N physical pitch-size prints. Resizing changes
   the ground scale, never stretches STL parts beyond the printer limit. */
(function(){
'use strict';
const $=id=>document.getElementById(id),api=window.terrainPuzzleDebug;
const map=api.map(),base=api.overlay(),earth=6378137,rad=Math.PI/180;
if(!map||!window.L){console.error('Grid editor: Leaflet map unavailable');return;}
const group=L.layerGroup().addTo(map);
const cornersSigns=[[-1,-1],[1,-1],[1,1],[-1,1]];
const elCount=$('gridCount'),btn=$('gridToggle'),btnView=$('gridFitScreen'),help=$('gridHelp');
let active=false,editing=false,state=null,polygon=null,segments=[],handles=[],centerHandle=null,polygonMove=null,lastInfo='';
function mToLL(x,y,at){
 const lat=at.lat+y/earth/rad,lon=at.lng+x/(earth*Math.cos(at.lat*rad))/rad;
 return L.latLng(lat,lon);
}
function llToM(pt,at) {
 return [(pt.lng-at.lng)*rad*earth*Math.cos(at.lat*rad),(pt.lat-at.lat)*rad*earth];
}
function corners(st=state) {
 const h=st.size/2;
 return cornersSigns.map(([sx,sy])=>mToLL(sx*h,sy*h,st.center));
}
function parts(st=state){return st.count*st.count;}
function pitch(){
 const x=api.inputs();return x.tile_size-(x.puzzle?16:0);
}
function limits(n){
 const s=api.inputs(),partPitch=pitch(),step=s.mesh_step;
 const triangles=n*n*(4*Math.ceil(partPitch/step)**2+4*Math.ceil(partPitch/step));
 if(triangles>6000000)
   throw Error('Сетка '+n+'×'+n+' со шагом '+step+' мм превышает 6 млн треугольников. Выбери шаг крупнее.');
 if(n*n>196)throw Error('Допускается не более 196 деталей.');
 return {min:n*partPitch*1,max:n*partPitch*2000,triangles,partPitch};
}
function clampSize(size,n){
 const l=limits(n);return Math.max(l.min,Math.min(l.max,size));
}
function clearGraphics(){
 group.clearLayers();polygon=null;segments=[];handles=[];centerHandle=null;
}
function statusDraft(){
 const s=state,sc=s.size*1000/(s.count*pitch());
 help.textContent='Сетка '+s.count+'×'+s.count+' · участок '+(s.size/1000).toFixed(2)+' км · макет '+Math.round(s.count*pitch())+'×'+Math.round(s.count*pitch())+' мм · масштаб 1:'+Math.round(sc).toLocaleString('ru-RU')+'. Тяни угол или центр.';
}
function redraw(ignoreHandle=-1){
 if(!state)return;
 const c=corners(),N=state.count;
 if(polygon)polygon.setLatLngs(c); else {
   polygon=L.polygon(c,{color:'#27ecc8',weight:3,opacity:1,fillOpacity:.12,fillColor:'#52e0bc',
    interactive:true,bubblingMouseEvents:false}).addTo(group);
   // Whole-square pointer dragging is handled by a capture listener below.
 }
 const built=[];
 for(let i=1;i<N;i++){
   const t=i/N,A=lerp(c[0],c[1],t),B=lerp(c[3],c[2],t),
   C=lerp(c[0],c[3],t),D=lerp(c[1],c[2],t);
   built.push([A,B],[C,D]);
 }
 while(segments.length>built.length){group.removeLayer(segments.pop());}
 built.forEach((pair,i)=>{
   if(segments[i])segments[i].setLatLngs(pair);
   else segments[i]=L.polyline(pair,{color:'#e7fff8',weight:1.7,opacity:.95,interactive:false}).addTo(group);
 });
 for(let i=0;i<4;i++){
   if(!handles[i]){
     const icon=L.divIcon({className:'',html:'<div class="grid-corner" title="Растянуть квадрат"></div>',iconSize:[23,23],iconAnchor:[11.5,11.5]});
     const m=L.marker(c[i],{icon,draggable:true,autoPan:false,zIndexOffset:1200}).addTo(group);
     m.on('dragstart',()=>{editing=true;}); // Drag causes a corner to resize the square; opposite corner stays fixed.
     m.on('drag',e=>resizeCorner(i,e.target.getLatLng()));
     m.on('dragend',()=>{editing=false;commit();});
     handles[i]=m;
   }
   if(ignoreHandle!==i)handles[i].setLatLng(c[i]);
 }
 if(!centerHandle){
   const icon=L.divIcon({className:'',html:'<div class="grid-move" title="Переместить сетку">✥</div>',iconSize:[31,31],iconAnchor:[15.5,15.5]});
   centerHandle=L.marker(state.center,{icon,draggable:true,autoPan:false,zIndexOffset:1100}).addTo(group);
   centerHandle.on('dragstart',()=>{editing=true;});
   centerHandle.on('drag',e=>{state.center=e.target.getLatLng();redraw(-2);});
   centerHandle.on('dragend',()=>{editing=false;commit();});
 }
 if(ignoreHandle!==-2)centerHandle.setLatLng(state.center);
 statusDraft();
}
function lerp(a,b,t){return L.latLng(a.lat+(b.lat-a.lat)*t,a.lng+(b.lng-a.lng)*t);}
function resizeCorner(idx,target){
 // Opposite corner must stay on the map as a fixed anchor.
 const c=corners(),anchor=c[(idx+2)%4],sgn=cornersSigns[idx];
 const [x,y]=llToM(target,anchor);
 let desired=Math.max(50,sgn[0]*x,sgn[1]*y);
 // Do not accept out-of-limit sizes; keep previous valid geometry and report.
 try{desired=clampSize(desired,state.count);}
 catch(e){api.say(e.message,'error');return;}
 state.size=desired;
 state.center=mToLL(sgn[0]*desired/2,sgn[1]*desired/2,anchor);
 redraw(idx);
}
function startPolygonMove(e){
 if(!active||editing||e.originalEvent.button!==0)return;
 L.DomEvent.stop(e.originalEvent);
 editing=true;
 const at=e.latlng,start=state.center;
 map.dragging.disable();
 const move=ev=>{
   const xy=llToM(ev.latlng,at);
   state.center=mToLL(xy[0],xy[1],start);
   redraw();
 };
 const finish=()=>{
   map.off('mousemove',move);map.off('mouseup',finish);
   document.removeEventListener('mouseup',finish);
   map.dragging.enable();
   editing=false;commit();
 };
 polygonMove={move,finish};
 map.on('mousemove',move);map.on('mouseup',finish);
 document.addEventListener('mouseup',finish,{once:true});
}
function bestScale(val){
 const select=$('scale'); const existing=[...select.options].find(o=>Math.abs(+o.value-val)<.000001);
 if(existing){select.value=existing.value;return;}
 for(const option of [...select.options])if(option.dataset.gridGenerated==='yes')option.remove();
 const option=new Option('1:'+val.toLocaleString('ru-RU',{maximumFractionDigits:1})+' · по сетке',String(val));
 option.dataset.gridGenerated='yes';select.add(option);select.value=option.value;
}
function commit(){
 if(!state||!active)return false;
 try{
   const n=state.count,s=api.inputs(),p=pitch();limits(n);
   if(Math.abs(state.center.lat)>84.9)throw Error('Географическая широта близка к пределу 85°.');
   const desiredScale=state.size*1000/(n*p);
   if(desiredScale<1000||desiredScale>2000000)
     throw Error('Размер участка вне доступного диапазона масштаба 1:1000–1:2000000.');
   const c=corners();
   // SW/NE: preserve square extent, same local metric projection as STL plan.
   $('lat1').value=c[0].lat.toFixed(9);$('lon1').value=c[0].lng.toFixed(9);
   $('lat2').value=c[2].lat.toFixed(9);$('lon2').value=c[2].lng.toFixed(9);
   bestScale(desiredScale*(1+1e-5)); // Keep requested N×N even with decimal lat/lon rounding.
   const result=api.recalc();
   if(!result||result.cols!==n)throw Error('Ошибка синхронизации границ: '+(result?result.cols+' плиток вместо '+n:'некорректные координаты'));
   // Keep the dragged extent stable. The tiny export-scale safety margin must not grow on each move.
   state.size=result.selected;
   state.center=L.latLng(result.lat0,result.lon0);
   redraw();
   window.terrainPuzzleEnhanced?.quality();
   window.dispatchEvent(new Event('terrain:invalidate'));
   window.dispatchEvent(new Event('terrain:gridchange'));
   api.say('Сетка '+n+'×'+n+' установлена. Масштаб 1:'+Math.round(desiredScale).toLocaleString('ru-RU')+'. Можно выгружать STL и карты.','good');
   return true;
 }catch(err){api.say('Сетка: '+err.message,'error');return false;}
}
function turnOn(){
 let p;
 try{
   p=api.plan();
   const n=Number(elCount.value)||2; limits(n);
   state={center:L.latLng(p.lat0,p.lon0),size:p.coverage,count:n};
   active=true;map.removeLayer(base);group.addTo(map);
   clearGraphics();redraw();
   if(!commit())throw Error('Недопустимые параметры сетки. Измени число плиток или шаг сетки.');
   btn.classList.add('activeGrid');btn.textContent='✥ Сетка: включена';
   map.fitBounds(L.latLngBounds(corners()).pad(.20));
   return true;
 }catch(err){active=false;map.addLayer(base);group.remove();btn.classList.remove('activeGrid');btn.textContent='✥ Сетка: выключена';api.say(err.message,'error');return false;}
}
function turnOff(){
 if(polygonMove)polygonMove.finish();
 active=false;group.remove();map.addLayer(base);
 btn.classList.remove('activeGrid');btn.textContent='✥ Сетка: выключена';
 help.textContent='Нажми «Сетка: выключена», чтобы изменить участок перетаскиванием.';
 api.recalc();
}
btn.onclick=()=>active?turnOff():turnOn();
elCount.onchange=()=>{
 if(!active)return;
 const old=state.count,newCount=Number(elCount.value);
 try{
   limits(newCount);state.count=newCount;
   clearGraphics();redraw();
   if(!commit())throw Error('Не удалось применить новый размер сетки.');
 }catch(err){
   state.count=old;elCount.value=String(old);clearGraphics();redraw();api.say(err.message,'error');
 }
};
btnView.onclick=()=>{
 if(!active&&!turnOn())return;
 const b=map.getBounds();
 const south=b.getSouth()+.07*(b.getNorth()-b.getSouth()),
       north=b.getNorth()-.07*(b.getNorth()-b.getSouth());
 const west=b.getWest()+.07*(b.getEast()-b.getWest()),
       east=b.getEast()-.07*(b.getEast()-b.getWest());
 const mid=L.latLng((north+south)/2,(east+west)/2);
 const sx=Math.abs(llToM(L.latLng(mid.lat,east),mid)[0])*2;
 const sy=Math.abs(llToM(L.latLng(north,mid.lng),mid)[1])*2;
 try{
   state.center=mid;state.size=clampSize(Math.min(sx,sy),state.count);
   redraw();commit();
 }catch(err){api.say('Невозможно вписать сетку: '+err.message,'error');}
};
// Manual coordinate or scale changes can coexist: let user explicitly re-place an editable grid.
['scale','tile_size','puzzle','lat1','lat2','lon1','lon2'].forEach(id=>
 $(id).addEventListener('change',()=>{
   if(!active||editing)return;
   if(id==='lat1'||id==='lat2'||id==='lon1'||id==='lon2'){
     const p=api.plan();state.center=L.latLng(p.lat0,p.lon0);state.size=p.selected;
   } else if(id==='scale'||id==='tile_size'||id==='puzzle'){
     state.size=state.count*pitch()*api.inputs().scale/1000;
   }
   try{state.size=clampSize(state.size,state.count);redraw();commit();}
   catch(err){api.say(err.message,'error');}
 }));
// Drag anywhere inside the square to move the entire grid; map panning stays available outside.
const gridMapContainer=map.getContainer();
gridMapContainer.addEventListener('pointerdown',event=>{
 if(!active||editing||!state||event.button!==0)return;
 if(event.target.closest('.leaflet-marker-icon,.leaflet-control-container'))return;
 const anchor=map.mouseEventToLatLng(event);
 const [mx,my]=llToM(anchor,state.center);
 if(Math.abs(mx)>state.size/2||Math.abs(my)>state.size/2)return;
 event.preventDefault();event.stopImmediatePropagation();
 editing=true;map.dragging.disable();
 const original=state.center;
 try{gridMapContainer.setPointerCapture(event.pointerId);}catch(_){}
 function move(ev){
   const [dx,dy]=llToM(map.mouseEventToLatLng(ev),anchor);
   state.center=mToLL(dx,dy,original);
   redraw(-2);
 }
 function finish(ev){
   document.removeEventListener('pointermove',move);
   document.removeEventListener('pointerup',finish);
   document.removeEventListener('pointercancel',finish);
   try{gridMapContainer.releasePointerCapture(event.pointerId);}catch(_){}
   map.dragging.enable();editing=false;
   if(ev?.type==='pointercancel'){state.center=original;redraw();return;}
   if(!commit()){state.center=original;redraw();}
 }
 document.addEventListener('pointermove',move);
 document.addEventListener('pointerup',finish);
 document.addEventListener('pointercancel',finish);
},true);
// Fine alignment: move the entire grid by an exact ground distance.
document.querySelectorAll('[data-nudge]').forEach(button=>button.addEventListener('click',()=>{
 if(!active&&!turnOn())return;
 const metres=Number($('nudgeStep').value)||50,dir=button.dataset.nudge;
 const dx=dir==='east'?metres:dir==='west'?-metres:0;
 const dy=dir==='north'?metres:dir==='south'?-metres:0;
 const previous=state.center;
 state.center=mToLL(dx,dy,state.center);
 redraw();
 if(!commit()){state.center=previous;redraw();}
}));
// Publish a small QA surface; the data source/selection model remains in terrain.js.
window.TerrainGridEditor={getState:()=>state?{center:[state.center.lat,state.center.lng],sideMeters:state.size,count:state.count,active}:null,
 setSquare(center,side,n){
   if(!active&&!turnOn())throw Error('Cannot enable grid');
   state.center=L.latLng(center[0],center[1]);state.count=n;elCount.value=String(n);
   state.size=clampSize(side,n);clearGraphics();redraw();return commit();
 },syncFromCurrentInputs(){
   if(!active||editing)return false;
   try{const p=api.plan();state.center=L.latLng(p.lat0,p.lon0);state.size=clampSize(p.selected,state.count);redraw();return commit();}
   catch(e){api.say('Сетка: '+e.message,'error');return false;}
 },enable:turnOn,disable:turnOff};
// Default grid overlay: preassembled 2×2 ready to drag.
turnOn();
})();
