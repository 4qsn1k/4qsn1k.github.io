/* Real geographic objects, OSM provenance, and deterministic SYMBOLIC forest miniatures.
 * Overpass data describes mapped extents; species are NOT guessed from satellite pixels.
 * This module is pure JS and can be tested with node.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TerrainLandcover=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
function coord(c){
 const lat=Number(c.lat),lon=Number(c.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)throw Error('Invalid OSM geographic coordinate');
 return {lat,lon};
}
function forestSpecies(tags={}){
 const botanical=String(tags.species||tags.genus||tags.taxon||tags['species:en']||tags['species:ru']||'').toLowerCase();
 if(/\bpicea\b|ель|spruce/.test(botanical))return {type:'spruce',verified:true,label:'Ель'};
 if(/\bpinus\b|сосн|pine/.test(botanical))return {type:'pine',verified:true,label:'Сосна'};
 if(/\bbetula\b|бер[её]з|birch/.test(botanical))return {type:'birch',verified:true,label:'Берёза'};
 const leaf=String(tags.leaf_type||'').toLowerCase();
 if(leaf==='needleleaved')return {type:'conifer',verified:false,label:'Хвойный лес — порода не указана'};
 if(leaf==='broadleaved')return {type:'deciduous',verified:false,label:'Лиственный лес — порода не указана'};
 if(leaf==='mixed')return {type:'mixed',verified:false,label:'Смешанный лес — породы не указаны'};
 return {type:'unknown',verified:false,label:'Лес — порода не указана'};
}
function classify(tags={}){
 if(['forest','river','water','road','tree'].includes(tags.kind))return tags.kind;
 if(tags.natural==='tree')return 'tree';
 if(tags.natural==='wood'||tags.landuse==='forest')return 'forest';
 if(tags.waterway==='riverbank'||tags.natural==='water'||tags.water==='reservoir'||tags.landuse==='reservoir')return 'water';
 if(['river','stream','canal'].includes(tags.waterway))return 'river';
 if(typeof tags.highway==='string'&&!['proposed','construction'].includes(tags.highway))return 'road';
 return null;
}
// Build closed multipolygon rings from OSM relation ways. Member ways can be
// open segments and can point in either direction. Never invent missing links.
function closed(pts){
 return pts.length>=4&&pts[0].lat===pts.at(-1).lat&&pts[0].lon===pts.at(-1).lon;
}
function joinSegments(parts){
 const rings=[],pending=parts.filter(p=>p?.length>=2).map(p=>p.map(coord));
 const eq=(a,b)=>a.lat===b.lat&&a.lon===b.lon;
 while(pending.length){
  let ring=pending.pop();
  let advanced=true;
  while(!closed(ring)&&advanced){
   advanced=false;
   for(let i=0;i<pending.length;i++){
    const q=pending[i],first=ring[0],last=ring.at(-1);
    if(eq(last,q[0]))ring.push(...q.slice(1));
    else if(eq(last,q.at(-1)))ring.push(...q.slice(0,-1).reverse());
    else if(eq(first,q.at(-1)))ring.unshift(...q.slice(0,-1));
    else if(eq(first,q[0]))ring.unshift(...q.slice(1).reverse());
    else continue;
    pending.splice(i,1);advanced=true;break;
   }
  }
  if(closed(ring))rings.push(ring);
 }
 return rings;
}
function pointInPolygon(x,y,vertices){
 let inside=false;
 for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
  const a=vertices[i],b=vertices[j];
  if(((a[1]>y)!==(b[1]>y))&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
function assembleMultipolygon(members){
 const outer=joinSegments(members.filter(m=>m.role==='outer').map(m=>m.geometry));
 const inner=joinSegments(members.filter(m=>m.role==='inner').map(m=>m.geometry));
 return outer.map(ring=>({
  ring,holes:inner.filter(h=>pointInPolygon(h[0].lon,h[0].lat,ring.map(pt=>[pt.lon,pt.lat])))
 }));
}
function parseOverpass(payload,max=1400){
 if(!payload||!Array.isArray(payload.elements))throw Error('Overpass JSON response is invalid');
 const result=[]; const dedup=new Set();
 function collect(raw,kind,tags,points,area,holes=[]){
  if(!Array.isArray(points)||points.length<(area?4:1))return;
  let coords;
  try{coords=points.map(coord);}catch{return;}
  const k=String(raw);
  if(dedup.has(k))return;dedup.add(k);
  if(result.length>=max)throw Error('Слишком много объектов OSM. Уменьши участок (лимит '+max+').');
  const species=forestSpecies(tags);
  result.push({id:k,kind,coords,area,subtype:species.type,verified:species.verified,
    label:species.label,holes, tags:{name:tags.name||'',species:tags.species||'',genus:tags.genus||'',
      leaf_type:tags.leaf_type||'',waterway:tags.waterway||'',highway:tags.highway||'',width:tags.width||'',
      natural:tags.natural||'',landuse:tags.landuse||'',water:tags.water||''},source:'OpenStreetMap'});
 }
 for(const e of payload.elements){
  const t=e.tags||{},kind=classify(t);
  if(!kind)continue;
  if(e.type==='node'&&kind==='tree'){collect('node/'+e.id,kind,t,[{lat:e.lat,lon:e.lon}],false);continue;}
  if(e.type==='way'&&Array.isArray(e.geometry)){
    const points=e.geometry,closed=points.length>3&&points[0].lat===points.at(-1).lat&&points[0].lon===points.at(-1).lon;
    const area=kind==='forest'||kind==='water';
    if(!area||closed)collect('way/'+e.id,kind,t,points,area);
  }
  if(e.type==='relation'&&Array.isArray(e.members)&&(kind==='water'||kind==='forest')){
    for(const [index,polygon] of assembleMultipolygon(e.members).entries()){
      collect('relation/'+e.id+'/outer/'+index,kind,t,polygon.ring,true,polygon.holes);
    }
  }
 }
 return result;
}
function parseGeoJSON(input,max=1400){
 const obj=typeof input==='string'?JSON.parse(input):input;
 if(!obj||typeof obj!=='object')throw Error('Invalid GeoJSON');
 const features=obj.type==='FeatureCollection'?obj.features:obj.type==='Feature'?[obj]:[{geometry:obj,properties:{}}];
 if(!Array.isArray(features)||features.length>max)throw Error('Too many GeoJSON features');
 const result=[];let id=0;
 for(const f of features){
  const t=f.properties||f.tags||{},kind=classify(t);
  if(!kind||!f.geometry)continue;
  const g=f.geometry;
  const rings=g.type==='Polygon'?[g.coordinates?.[0]]:g.type==='MultiPolygon'?g.coordinates.map(p=>p[0]):g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:g.type==='Point'?[[g.coordinates]]:[];
  for(const ring of rings){
   if(!ring)continue;
   const coords=ring.map(x=>coord({lat:x[1],lon:x[0]})),area=kind==='forest'||kind==='water';
   if(area&&coords.length<4)continue;
   if(result.length>=max)throw Error('GeoJSON exceeds feature limit');
   const spec=forestSpecies(t);
   const polygonRings=g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates[rings.indexOf(ring)]:null;
   const holes=area&&polygonRings?polygonRings.slice(1).map(h=>h.map(x=>coord({lat:x[1],lon:x[0]}))):[];
   result.push({id:'geojson/'+id++,kind,coords,holes,area,subtype:spec.type,verified:spec.verified,label:spec.label,tags:t,source:t.source==='OpenStreetMap'?'OpenStreetMap':'GeoJSON'});
  }
 }
 return result;
}
function parseOSMXML(source){
 if(typeof DOMParser==='undefined')throw Error('OSM XML decoder works only in a browser');
 const doc=new DOMParser().parseFromString(source,'application/xml');
 if(doc.querySelector('parsererror')||doc.documentElement.localName!=='osm')throw Error('Invalid OSM XML');
 const nodes=new Map(),ways=new Map(),elements=[];
 const children=(el,name)=>[...el.children].filter(n=>n.localName===name);
 const tags=el=>Object.fromEntries(children(el,'tag').map(n=>[n.getAttribute('k'),n.getAttribute('v')]));
 for(const n of doc.querySelectorAll('node')){
   const o={type:'node',id:n.getAttribute('id'),lat:Number(n.getAttribute('lat')),
     lon:Number(n.getAttribute('lon')),tags:tags(n)};
   nodes.set(n.getAttribute('id'),o);
   if(classify(o.tags)==='tree')elements.push(o);
 }
 for(const w of doc.querySelectorAll('way')){
   const attr=tags(w),refs=children(w,'nd').map(n=>n.getAttribute('ref'));
   const geometry=refs.map(ref=>nodes.get(ref)).filter(Boolean).map(o=>({lat:o.lat,lon:o.lon}));
   const item={type:'way',id:w.getAttribute('id'),tags:attr,geometry,complete:geometry.length===refs.length};
   ways.set(w.getAttribute('id'),item);
   if(classify(attr))elements.push(item);
 }
 for(const rel of doc.querySelectorAll('relation')){
   const attr=tags(rel),kind=classify(attr);
   if(!['water','forest'].includes(kind))continue;
   const members=children(rel,'member').filter(m=>m.getAttribute('type')==='way')
    .map(m=>({role:m.getAttribute('role')||'outer',ref:m.getAttribute('ref')}))
    .map(m=>({...m,geometry:ways.get(m.ref)?.complete?ways.get(m.ref).geometry:[]}));
   elements.push({type:'relation',id:rel.getAttribute('id'),tags:attr,members});
 }
 return parseOverpass({elements});
}
function toGeoJSON(features){
 return {type:'FeatureCollection',features:features.map(f=>({type:'Feature',
  properties:{...f.tags,kind:f.kind,subtype:f.subtype,verified:f.verified,source:f.source},
  geometry:{type:f.area?'Polygon':f.kind==='tree'?'Point':'LineString',
    coordinates:f.area?[f.coords.map(p=>[p.lon,p.lat]),...(f.holes||[]).map(r=>r.map(p=>[p.lon,p.lat]))]:f.kind==='tree'?[f.coords[0].lon,f.coords[0].lat]:f.coords.map(p=>[p.lon,p.lat])}}))};
}
function containsPolygon(x,y,vertices){
 let inside=false;
 for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
  const a=vertices[i],b=vertices[j];
  if(((a[1]>y)!==(b[1]>y)) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
function random(seed){
 // Stable integer mixing on projected-grid integer indices; no hidden global RNG.
 let x=seed|0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;
 return (x>>>0)/4294967296;
}
function treeType(feature,ix,iy){
 if(['spruce','pine','birch'].includes(feature.subtype))return feature.subtype;
 if(feature.subtype==='conifer')return random(ix*11939+iy*233)>0.5?'spruce':'pine';
 if(feature.subtype==='deciduous')return 'generic-deciduous';
 if(feature.subtype==='mixed')return random(ix*1747+iy*761)>0.5?'spruce':'generic-deciduous';
 return 'generic'; // No botanical inference without tags.
}
function placements(features,p,spacingMm=13,max=1200){
 if(!Number.isFinite(spacingMm)||spacingMm<5||spacingMm>100)throw Error('Spacing must be 5..100 mm');
 if(!Number.isInteger(max)||max<1||max>5000)throw Error('Maximum trees must be 1..5000');
 const field=windowOrProjection(p),step=spacingMm*p.s.scale/1000;
 const woods=features.filter(f=>f.kind==='forest'&&f.area);
 const single=features.filter(f=>f.kind==='tree'&&f.coords.length===1);
 const positioned=[];
 const projected=woods.map(f=>({f,ring:f.coords.map(pt=>field.toLocal(pt.lat,pt.lon))}));
 const x0=p.minx,y0=p.miny,x1=p.maxx,y1=p.maxy;
 const firstX=Math.floor(x0/step),lastX=Math.ceil(x1/step),firstY=Math.floor(y0/step),lastY=Math.ceil(y1/step);
 if((lastX-firstX+1)*(lastY-firstY+1)>100000)throw Error('Слишком мелкая плотность леса: увеличь расстояние между деревьями');
 function place(x,y,f,ix,iy,isMapped){
  const mmx=(x-p.minx)*1000/p.s.scale,mmy=(y-p.miny)*1000/p.s.scale;
  // Trees away from physical puzzle boundary and from adjacent tiles' connectors.
  const localX=mmx%p.pitch,localY=mmy%p.pitch;
  const margin=3.2;
  if(mmx<margin||mmy<margin||mmx>p.cols*p.pitch-margin||mmy>p.rows*p.pitch-margin
    ||localX<margin||localY<margin||localX>p.pitch-margin||localY>p.pitch-margin)return;
  const t=treeType(f,ix,iy);
  positioned.push({x,y,mmx,mmy,type:t,reportedSpecies:!!(f.verified),
   source:f.source,forestId:f.id,size:8+random(ix*3571+iy*9397)*6,
   row:p.rows-1-Math.floor(mmy/p.pitch),col:Math.floor(mmx/p.pitch),mapped:isMapped});
 }
 for(let iy=firstY;iy<=lastY;iy++)for(let ix=firstX;ix<=lastX;ix++){
  const px=(ix+0.22+0.56*random(ix*937+iy*4001))*step,
  py=(iy+0.22+0.56*random(ix*4931+iy*1697))*step;
  if(px<x0||px>x1||py<y0||py>y1)continue;
  for(const shape of projected)if(containsPolygon(px,py,shape.ring)){
    place(px,py,shape.f,ix,iy,false);break;
  }
 }
 for(const f of single){
  const pos=field.toLocal(f.coords[0].lat,f.coords[0].lon);
  if(pos[0]>=x0&&pos[0]<=x1&&pos[1]>=y0&&pos[1]<=y1)
   place(pos[0],pos[1],f,Math.round(pos[0]),Math.round(pos[1]),true);
 }
 if(positioned.length>max){
  const stride=positioned.length/max;return Array.from({length:max},(_,i)=>positioned[Math.floor(i*stride)]);
 }
 return positioned;
}
function windowOrProjection(p){
 if(p.projectionContext?.toLocal)return p.projectionContext;
 if(typeof globalThis!=='undefined'&&globalThis.TerrainProjection)
  return globalThis.TerrainProjection.get(p.lat0,p.lon0);
 throw Error('UTM projection unavailable');
}
// Closed lathed mesh with trunk and crown, z measured in physical millimetres.
// Forest foliage and trunks are ONE closed shell. Tree geometry is SYMBOLIC.
function treeMesh(x,y,z,h,type){
 const segments=8;
 const trunk=type==='birch'||type==='generic-deciduous'?0.65:0.85,
 crown=type==='spruce'?1.9:type==='pine'?2.5:type==='birch'?2.1:2.2;
 let profile;
 if(type==='spruce'||type==='conifer')profile=[[0,0],[trunk,0],[trunk,.3*h],[crown,.28*h],[crown*.76,.52*h],[crown*.62,.6*h],[crown*.44,.78*h],[.05,h]];
 else if(type==='pine')profile=[[0,0],[trunk,0],[trunk,.62*h],[crown*.72,.62*h],[crown,.79*h],[crown*.64,.96*h],[.05,h]];
 else profile=[[0,0],[trunk,0],[trunk,.48*h],[crown*.60,.5*h],[crown,.73*h],[crown*.85,.88*h],[crown*.48,h*.98],[0,h]];
 // rings include 0-radius poles, made as one vertex each to avoid degenerate faces
 const positions=[],rings=[],faces=[];
 for(const [radius,dz] of profile){
  const ids=[];
  if(radius===0||radius<.06){ids.push(positions.length/3);positions.push(x,y,z+dz);}
  else for(let k=0;k<segments;k++){
    const a=2*Math.PI*k/segments;
    ids.push(positions.length/3);positions.push(x+radius*Math.cos(a),y+radius*Math.sin(a),z+dz);
  }
  rings.push(ids);
 }
 for(let i=0;i<rings.length-1;i++){
  const a=rings[i],b=rings[i+1];
  if(a.length===1&&b.length>1)for(let k=0;k<segments;k++)faces.push([a[0],b[(k+1)%segments],b[k]]);
  else if(a.length>1&&b.length===1)for(let k=0;k<segments;k++)faces.push([a[k],a[(k+1)%segments],b[0]]);
  else if(a.length===8&&b.length===8)for(let k=0;k<segments;k++){
    const j=(k+1)%segments;faces.push([a[k],a[j],b[j]],[a[k],b[j],b[k]]);
  }
 }
 return {positions,faces};
}
function meshSTL(meshes,title='Terrain forest trees'){
 const faces=meshes.reduce((s,m)=>s+m.faces.length,0);
 if(faces>80000)throw Error('Слишком много деревьев для одного STL. Уменьши плотность леса');
 const output=new ArrayBuffer(84+faces*50),v=new DataView(output);
 new Uint8Array(output,0,Math.min(80,title.length)).set(new TextEncoder().encode(title.slice(0,80)));
 v.setUint32(80,faces,true);let at=84;
 for(const m of meshes)for(const [i,j,k] of m.faces){
  const p=n=>m.positions.slice(n*3,n*3+3),a=p(i),b=p(j),c=p(k);
  const u=b.map((x,t)=>x-a[t]),w=c.map((x,t)=>x-a[t]);
  const nor=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
  const len=Math.hypot(...nor)||1;
  for(const f of [...nor.map(x=>x/len),...a,...b,...c]){v.setFloat32(at,f,true);at+=4;}
  v.setUint16(at,0,true);at+=2;
 }
 return new Uint8Array(output);
}
return {forestSpecies,classify,parseOverpass,parseOSMXML,parseGeoJSON,toGeoJSON,containsPolygon,placements,treeMesh,meshSTL,assembleMultipolygon,joinSegments};
});