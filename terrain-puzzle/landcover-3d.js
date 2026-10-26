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
// A continuous river strip with shared cross-sections, not disconnected quads.
// If OSM mapped a water polygon it remains the primary shoreline source.
// Without mapped banks, riverWidthMeters is explicitly a display assumption.
function continuousRiver(output,feature,p,dem,range,riverWidthMeters=50){
 const pts=feature.coords.map(c=>projected(c,p)),line=[];
 const userWidth=Number(riverWidthMeters);
 const mappedWidth=Number(String(feature.tags.width||'').replace(',','.'));
 // The user requested deliberately *full-looking* water. The selected width
 // is a visualization minimum, not a hydrological flood extent.
 const width=Math.max(userWidth,Number.isFinite(mappedWidth)&&mappedWidth>=2&&mappedWidth<=300?mappedWidth:0);
 // The width selector is an illustrative river surface for ALL linear watercourses,
 // even when OSM classifies the way as stream. It is not a mapped floodplain.
 const half=width/2,step=Math.max(5,Math.min(18,width/3));
 for(let i=0;i<pts.length-1;i++){
  const a=pts[i],b=pts[i+1],distance=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(distance<.01)continue;
  const n=Math.max(1,Math.min(500,Math.ceil(distance/step)));
  for(let j=0;j<n;j++){const t=j/n;line.push([a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t]);}
 }
 if(pts.length>1)line.push(pts[pts.length-1]);
 if(line.length>2500)line.splice(0,line.length,...line.filter((x,i)=>i%Math.ceil(line.length/2400)===0));
 let last=null;
 for(let i=0;i<line.length;i++){
  const curr=line[i],a=line[Math.max(0,i-1)],b=line[Math.min(line.length-1,i+1)],
   dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy)||1,
   sx=-dy/d*half,sy=dx/d*half,
   left=[curr[0]+sx,curr[1]+sy],right=[curr[0]-sx,curr[1]-sy];
  const riverX=curr[0],riverY=curr[1];
  if(riverX<p.minx-half||riverX>p.maxx+half||riverY<p.miny-half||riverY>p.maxy+half){last=null;continue;}
  // A locally level bank-to-bank surface (visualization only, no flood simulation).
  // Guard against rendering below sampled land; make water clearly visible.
  // Preview overlay conforms to the DEM surface. It must not hover over slopes
  // or protrude beyond the selected area, even with a deliberately broad width.
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const leftClamped=[clamp(left[0],p.minx,p.maxx),clamp(left[1],p.miny,p.maxy)];
  const rightClamped=[clamp(right[0],p.minx,p.maxx),clamp(right[1],p.miny,p.maxy)];
  const l=scalePoint(...leftClamped,zAt(dem,range,p,...leftClamped,1.7),p);
  const r=scalePoint(...rightClamped,zAt(dem,range,p,...rightClamped,1.7),p);
  if(last){addTriangle(output,last.l,last.r,l,[.035,.47,.91]);
    addTriangle(output,last.r,r,l,[.035,.47,.91]);}
  last={l,r};
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
function build(p,dem,range,features,trees,flags={forest:true,river:true,road:true,riverWidthMeters:50}){
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
  if(f.kind==='river')continuousRiver(water,f,p,dem,range,flags.riverWidthMeters||50);
  if(f.kind==='water')filledWater(water,f,p,dem,range,[.10,.61,.92]);
 }
 if(flags.road)for(const f of features)if(f.kind==='road')
   ribbons(road,f,p,dem,range,[.68,.48,.30],f.tags.highway==='path'?1.0:1.9);
 return {forest:wood,water,road};
}
return {build,addTriangle,projected,continuousRiver};
});