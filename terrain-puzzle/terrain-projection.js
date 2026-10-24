/* WGS84 -> local metre coordinates using fixed UTM zone across one map project.
 * Compatible with both browser proj4 UMD and Node CommonJS.
 * No antimeridian support; polar areas >=84N / <=80S excluded.
 */
(function(root,factory){
'use strict';
const p4=typeof require==='function'&&typeof module==='object'&&module.exports?
 require('./vendor/proj4.js'):(root?.proj4);
const api=factory(p4);
if(root)root.TerrainProjection=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null,function(proj4){
'use strict';
if(typeof proj4!=='function')throw Error('Proj4 library unavailable');
const cache=new Map();
function get(centerLat,centerLon){
 if(!Number.isFinite(centerLat)||!Number.isFinite(centerLon)||centerLat>=84||centerLat<=-80||Math.abs(centerLon)>180)
  throw RangeError('UTM supports 80°S to 84°N; choose a different region');
 const zone=Math.max(1,Math.min(60,Math.floor((centerLon+180)/6)+1)),
   southern=centerLat<0,
   crs='+proj=utm +zone='+zone+(southern?' +south':'')+' +datum=WGS84 +units=m +no_defs +type=crs',
   key=zone+':'+(southern?'S':'N')+':'+centerLat.toFixed(9)+':'+centerLon.toFixed(9);
 if(cache.has(key))return cache.get(key);
 const geo='EPSG:4326',center=proj4(geo,crs,[centerLon,centerLat]);
 function toLocal(lat,lon){
  const pt=proj4(geo,crs,[lon,lat]);
  return [pt[0]-center[0],pt[1]-center[1]];
 }
 function toGeographic(x,y){
  const p=proj4(crs,geo,[center[0]+x,center[1]+y]);
  return [p[1],p[0]];
 }
 const context={zone,hemisphere:southern?'S':'N',epsg:(southern?32700:32600)+zone,
  crs,center,toLocal,toGeographic,projection:'UTM WGS84 EPSG:'+((southern?32700:32600)+zone)};
 if(cache.size>=24)cache.delete(cache.keys().next().value);
 cache.set(key,context);return context;
}
return {get};
});