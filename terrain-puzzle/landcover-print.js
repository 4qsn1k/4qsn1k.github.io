/* Paint accurate OSM vector footprints over DEM-derived raster, at PDF's native DPI.
 * Roads and trees are mapped only when present in OSM; data may be incomplete.
 */
(function(){
'use strict';
const M=window.TerrainMaps;
if(!M)return;
const original=M.topographic;
function overlay(ctx,p,x,y,w,h,W,H){
 const api=window.TerrainOSMLayers;
 if(!api)return;
 const features=api.getFeatures();
 const project=p.projectionContext;
 function xy(ll){
  const [a,b]=project.toLocal(ll.lat,ll.lon);
  return [(a-x)/w*W,(y-b)/h*H];
 }
 const layers=[['forest','layerForest'],['water','layerRivers'],['river','layerRivers'],['road','layerRoads'],['tree','layerForest']];
 ctx.save();
 ctx.lineJoin='round';ctx.lineCap='round';
 for(const [kind,control] of layers){
  if(!document.getElementById(control)?.checked)continue;
  for(const f of features){
   if(f.kind!==kind)continue;
   const pts=f.coords.map(xy);
   if(pts.length<1)continue;
   const xs=pts.map(pt=>pt[0]),ys=pts.map(pt=>pt[1]);
   if(Math.max(...xs)<-6||Math.min(...xs)>W+6||Math.max(...ys)<-6||Math.min(...ys)>H+6)continue;
   ctx.beginPath();ctx.moveTo(...pts[0]);
   for(let i=1;i<pts.length;i++)ctx.lineTo(...pts[i]);
   if(f.area)ctx.closePath();
   if(kind==='forest'){
    ctx.fillStyle=f.subtype==='conifer'||f.subtype==='spruce'||f.subtype==='pine'?'rgba(26,106,74,0.28)':
      f.subtype==='deciduous'||f.subtype==='birch'?'rgba(146,198,88,0.28)':'rgba(50,133,77,0.22)';
    ctx.fill();ctx.strokeStyle='rgba(35,102,61,.50)';ctx.lineWidth=Math.max(1,W/1100);ctx.stroke();
   }else if(kind==='water'){
    ctx.fillStyle='rgba(24,149,230,0.67)';ctx.fill();ctx.strokeStyle='#167ec7';ctx.lineWidth=Math.max(1.2,W/900);ctx.stroke();
   }else if(kind==='river'){
    ctx.strokeStyle='#168ad4';ctx.lineWidth=Math.max(1.8,W/470);ctx.stroke();
   }else if(kind==='road'){
    ctx.strokeStyle='#a36b3d';ctx.lineWidth=Math.max(1.2,W/780);ctx.stroke();
   }else if(kind==='tree'){
    ctx.fillStyle='#1d7348';
    ctx.beginPath();ctx.arc(pts[0][0],pts[0][1],Math.max(1.4,W/1100),0,2*Math.PI);ctx.fill();
   }
  }
 }
 // GPX route is independent from OSM observations.
 const route=window.TerrainProject?.getRoute?.()||[];
 if(route.length>1){
  ctx.beginPath();
  for(let i=0;i<route.length;i++){
   const pt=xy(route[i]);
   if(i===0)ctx.moveTo(...pt);else ctx.lineTo(...pt);
  }
  ctx.strokeStyle='#e84c2d';ctx.lineWidth=Math.max(1.5,W/620);ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]);
 }
 ctx.restore();
}
M.topographic=function(p,dem,range,x,y,widthMeters,heightMeters,widthPx,heightPx,interval){
 const canvas=original(p,dem,range,x,y,widthMeters,heightMeters,widthPx,heightPx,interval);
 overlay(canvas.getContext('2d'),p,x,y,widthMeters,heightMeters,widthPx,heightPx);
 return canvas;
};
window.TerrainLandcoverPrint={overlay};
})();