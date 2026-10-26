/* Bounded topographic raster atlas for 3D display only.
 * Tiles are fetched on demand (at most 12), never bulk-downloaded.
 * In physical models PDF export uses the dedicated, separately licensed renderer.
 */
(function(root,factory){
  const api=factory();
  if(root)root.TerrainTopoAtlas=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
const DEG=Math.PI/180,MAX=85.05112878,atlasCache=new Map();
function slippy(lat,lon,z){
 const n=Math.pow(2,z)*256,phi=Math.max(-MAX,Math.min(MAX,lat))*DEG;
 return [(lon+180)/360*n,(1-Math.asinh(Math.tan(phi))/Math.PI)*n/2];
}
function choice(p,limit=12){
 const c=p.corners;
 for(let z=15;z>=5;z--){
  const corners=c.map(q=>slippy(q[0],q[1],z));
  const x0=Math.floor(Math.min(...corners.map(q=>q[0]))/256),
   x1=Math.floor(Math.max(...corners.map(q=>q[0]))/256),
   y0=Math.floor(Math.min(...corners.map(q=>q[1]))/256),
   y1=Math.floor(Math.max(...corners.map(q=>q[1]))/256);
  const tiles=(x1-x0+1)*(y1-y0+1);
  if(tiles<=limit)return {z,x0,x1,y0,y1,tiles};
 }
 throw Error('Preview area too large for 12 map tiles');
}
async function fetchOne(z,x,y,signal){
 const uri='https://'+(['a','b','c'][(x+y)%3])+'.tile.opentopomap.org/'+z+'/'+x+'/'+y+'.png';
 const response=await fetch(uri,{signal,mode:'cors'});
 if(!response.ok)throw Error('Topo '+response.status);
 const blob=await response.blob();
 if(blob.size<100)throw Error('Empty topographic tile');
 return await createImageBitmap(blob);
}
async function load(p,{maxTiles=12,onStatus=()=>{}}={}){
 const q=choice(p,maxTiles);
 const cols=q.x1-q.x0+1,rows=q.y1-q.y0+1;
 const key=[q.z,q.x0,q.x1,q.y0,q.y1].join('/');
 const cached=atlasCache.get(key);
 const canvas=document.createElement('canvas');
 canvas.width=cols*256;canvas.height=rows*256;
 const ctx=canvas.getContext('2d',{alpha:false});
 ctx.fillStyle='#ddd8ba';ctx.fillRect(0,0,canvas.width,canvas.height);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),35000);
 let ok=0,failed=0;const errors=[];
 if(cached){
  ctx.drawImage(cached.canvas,0,0);ok=cached.loaded;failed=cached.failed;
 }else try{
  const queue=[];
  for(let y=q.y0;y<=q.y1;y++)for(let x=q.x0;x<=q.x1;x++)queue.push({x,y});
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{
   while(cursor<queue.length){
    const o=queue[cursor++];
    try{
      const bmp=await fetchOne(q.z,o.x,o.y,controller.signal);
      ctx.drawImage(bmp,(o.x-q.x0)*256,(o.y-q.y0)*256,256,256);
      bmp.close();ok++;
    }catch(e){failed++;errors.push(String(e.message||e));}
    onStatus(ok,queue.length);
   }
  }));
 }finally{clearTimeout(timeout);}
 if(!cached&&ok){
  atlasCache.set(key,{canvas,loaded:ok,failed});
  if(atlasCache.size>8)atlasCache.delete(atlasCache.keys().next().value);
 }
 if(cached)clearTimeout(timeout);
 if(!ok)throw Error('Топографические плитки недоступны: '+errors.slice(0,2).join(' / '));
 const originX=q.x0*256,originY=q.y0*256;
 // Projected model XY corners, EPSG 3857 raster UV; project only 4 corners.
 const c=[[p.minx,p.miny],[p.maxx,p.miny],[p.minx,p.maxy]];
 const ll=c.map(pt=>p.projectionContext.toGeographic(...pt));
 const px=ll.map(pt=>slippy(pt[0],pt[1],q.z));
 const xy=(pt)=>[(pt[0]-originX)/canvas.width,1-(pt[1]-originY)/canvas.height];
 const a=xy(px[0]),b=xy(px[1]),c1=xy(px[2]);
 const du=[b[0]-a[0],b[1]-a[1]],dv=[c1[0]-a[0],c1[1]-a[1]];
 return {
   canvas,z:q.z,loaded:ok,failed,count:q.tiles,attribution:'© OpenTopoMap contributors, © OpenStreetMap contributors',
   uv(x,y){const u=(x-p.minx)/p.coverage,v=(y-p.miny)/p.coverage;
     return [a[0]+du[0]*u+dv[0]*v,a[1]+du[1]*u+dv[1]*v];}
 };
}
return {load,slippy,choice};
});
