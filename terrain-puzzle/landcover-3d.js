/* Landscape preview geometry: true mapped water/roads, symbolic forest trees.
 * Coordinates and heights share the terrain generator's UTM projection.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TerrainLandscape=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
function normal(a,b,c){
 const p=b.map((x,i)=>x-a[i]),q=c.map((x,i)=>x-a[i]),n=[
 p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]];
 const h=Math.hypot(...n)||1;return n.map(x=>x/h);
}
function addTriangle(output,a,b,c,color){
 const n=normal(a,b,c);
 for(const q of [a,b,c])output.push(...q,...color,...n);
}
function projected(pt,p){
 const [x,y]=p.projectionContext.toLocal(pt.lat,pt.lon);
 return [x,y];
}
function scalePoint(x,y,z,p){
 const W=p.cols*p.pitch;
 return [(x-p.minx)/p.coverage*W-W/2,(y-p.miny)/p.coverage*W-W/2,z];
}
function zAt(dem,range,p,x,y,offset=.6){
 return 3+(dem.height(x,y)-range.min)*1000/p.s.scale*p.s.exaggeration+offset;
}
function ribbons(output,feature,p,dem,range,color,widthMm){
 let count=0,prev=null;
 const pts=feature.coords;
 const stride=Math.max(1,Math.ceil(pts.length/1300));
 for(let i=0;i<pts.length;i+=stride){
  let v=projected(pts[i],p);
  if(!prev){prev=v;continue;}
  const mid=[(prev[0]+v[0])/2,(prev[1]+v[1])/2];
  if(mid[0]<p.minx||mid[0]>p.maxx||mid[1]<p.miny||mid[1]>p.maxy){prev=v;continue;}
  const dx=v[0]-prev[0],dy=v[1]-prev[1],len=Math.hypot(dx,dy);
  if(len<0.01){prev=v;continue;}
  const realWidth=widthMm*p.s.scale/1000,ax=-dy/len*realWidth/2,ay=dx/len*realWidth/2;
  const [l,r,s,t]=[[prev[0]+ax,prev[1]+ay],[prev[0]-ax,prev[1]-ay],
   [v[0]+ax,v[1]+ay],[v[0]-ax,v[1]-ay]];
  const to3D=q=>scalePoint(q[0],q[1],zAt(dem,range,p,q[0],q[1],.9),p);
  const a=to3D(l),b=to3D(r),c=to3D(s),d=to3D(t);
  addTriangle(output,a,b,c,color);addTriangle(output,b,d,c,color);
  prev=v;if(++count>8000)break;
 }
}
function filledWater(output,feature,p,dem,range,color){
 const ring=feature.coords.map(pt=>projected(pt,p));
 if(ring.length<4)return;
 const lx=Math.max(p.minx,Math.min(...ring.map(x=>x[0]))),
  ly=Math.max(p.miny,Math.min(...ring.map(x=>x[1]))),
  rx=Math.min(p.maxx,Math.max(...ring.map(x=>x[0]))),
  ry=Math.min(p.maxy,Math.max(...ring.map(x=>x[1])));
 const cell=Math.max(p.coverage/180,4*p.s.scale/1000),maxGrid=5000;
 let n=0;
 for(let y=ly;y<ry;y+=cell)for(let x=lx;x<rx;x+=cell){
   const cx=x+cell/2,cy=y+cell/2;
   if(!TerrainLandcover.containsPolygon(cx,cy,ring))continue;
   const corners=[[x,y],[x+cell,y],[x,y+cell],[x+cell,y+cell]].map(q=>
      scalePoint(q[0],q[1],zAt(dem,range,p,q[0],q[1],.7),p));
   addTriangle(output,corners[0],corners[1],corners[3],color);
   addTriangle(output,corners[0],corners[3],corners[2],color);
   if(++n>maxGrid)return;
 }
}
function build(p,dem,range,features,trees,flags={forest:true,river:true,road:true}){
 const wood=[],water=[],road=[];
 if(flags.forest)for(const t of trees){
   const h=dem.height(t.x,t.y);
   const z=3+(h-range.min)*1000/p.s.scale*p.s.exaggeration+.3;
   // The standard species models are always physically symbolic, not real measured crowns.
   const xy=scalePoint(t.x,t.y,0,p),m=TerrainLandcover.treeMesh(xy[0],xy[1],z,t.size,t.type);
   const col=t.type==='spruce'?[.12,.42,.31]:t.type==='pine'?[.29,.52,.30]:
     t.type==='birch'?[.56,.77,.36]:t.type==='generic-deciduous'?[.39,.66,.40]:[.42,.57,.32];
   for(const f of m.faces){
     addTriangle(wood,m.positions.slice(f[0]*3,f[0]*3+3),
       m.positions.slice(f[1]*3,f[1]*3+3),m.positions.slice(f[2]*3,f[2]*3+3),col);
   }
 }
 if(flags.river)for(const f of features){
  if(f.kind==='river')ribbons(water,f,p,dem,range,[.10,.57,.92],f.tags.waterway==='stream'?1.2:3.5);
  if(f.kind==='water')filledWater(water,f,p,dem,range,[.10,.61,.92]);
 }
 if(flags.road)for(const f of features)if(f.kind==='road')
   ribbons(road,f,p,dem,range,[.68,.48,.30],f.tags.highway==='path'?1.0:1.9);
 return {forest:wood,water,road};
}
return {build,addTriangle,projected};
});