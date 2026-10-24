'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../geometry.js');
function plan(n,puzzle=true){return {cols:n,rows:n,pitch:184,tab:puzzle?8:0,minx:0,miny:0,maxx:n*184,maxy:n*184,coverage:n*184,s:{scale:1000,mesh_step:8,exaggeration:1}};}
const source={height:(x,y)=>-40+20*Math.sin(x/90)+10*Math.cos(y/70)};
function checkSTL(bytes){
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=d.getUint32(80,true),edges=new Map(),triangles=new Set();let volume=0;
 const bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
 assert.equal(bytes.length,84+50*count);
 for(let f=0;f<count;f++){
  const at=84+50*f,vs=Array.from({length:3},(_,j)=>Array.from({length:3},(_,k)=>d.getFloat32(at+12+j*12+k*4,true)));
  for(const v of vs)for(let k=0;k<3;k++){assert.ok(Number.isFinite(v[k]));bounds[k][0]=Math.min(bounds[k][0],v[k]);bounds[k][1]=Math.max(bounds[k][1],v[k]);}
  const keys=vs.map(v=>v.join(',')),signature=[...keys].sort().join('|');assert.ok(!triangles.has(signature));triangles.add(signature);
  for(let j=0;j<3;j++){const a=keys[j],b=keys[(j+1)%3],key=[a,b].sort().join('|');const e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}
  const [a,b,c]=vs,u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]);
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);assert.ok(length>1e-8);
  for(let k=0;k<3;k++)assert.ok(Math.abs(d.getFloat32(at+k*4,true)-normal[k]/length)<1e-6);
  volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
 }
 for(const [count,direction] of edges.values()){assert.equal(count,2);assert.equal(direction,0);}
 assert.ok(volume>0);assert.equal(bounds[2][0],0);assert.ok(bounds[2][1]>=3);
 for(const [lo,hi] of bounds.slice(0,2))assert.ok(hi-lo<=200.001);
}
for(const n of [1,2,3,6])for(const puzzle of [false,true])test(`${n}x${n}, puzzle=${puzzle}: STL topology, normals, dimensions, volume, repeatability`,()=>{
 const p=plan(n,puzzle),frame=G.createHeightFrame(p,source);
 for(let r=0;r<n;r++)for(let c=0;c<n;c++){
  const bytes=G.makeSTL(p,frame,frame,r,c);checkSTL(bytes);assert.deepEqual(bytes,G.makeSTL(p,frame,frame,r,c));
 }
});
for(const n of [2,6])test(`${n}x${n}: identical world coordinates and heights at every shared seam before gap`,()=>{
 const p=plan(n),frame=G.createHeightFrame(p,source),meshes=Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>G.buildTileMesh(p,frame,frame,r,c,{gap:0})));
 const world=(m,k)=>[m.positions[k*3]+m.xorigin,m.positions[k*3+1]+m.yorigin,m.positions[k*3+2]];
 for(let r=0;r<n;r++)for(let c=0;c<n;c++){
  const m=meshes[r][c],s=m.count,w=s+1;
  for(let i=0;i<=s;i++){
   if(c+1<n){const a=world(m,i*w+s),b=world(meshes[r][c+1],i*w);a.forEach((v,k)=>assert.ok(Math.abs(v-b[k])<1e-10));}
   if(r+1<n){const a=world(m,i),b=world(meshes[r+1][c],s*w+i);a.forEach((v,k)=>assert.ok(Math.abs(v-b[k])<1e-10));}
  }
 }
});
test('frame visits all output-grid samples, retains narrow extrema and rejects NoData',()=>{
 const p=plan(1);let calls=0;
 const f=G.createHeightFrame(p,{height:(x,y)=>{calls++;return x===8&&y===8?-123:10;}});
 assert.equal(calls,24**2);assert.equal(f.min,-123);assert.equal(f.max,10);assert.equal(f.height(8,8),-123);
 assert.throws(()=>G.createHeightFrame(p,{height:()=>NaN}),/NoData/);
});
test('LOD vertices use the same height frame, deformation and datum as export',()=>{
 const p=plan(2),f=G.createHeightFrame(p,source),m=G.buildTileMesh(p,f,f,0,1,{segments:7});
 for(let k=0;k<m.topVertexCount;k++){
  const x=m.positions[k*3],y=m.positions[k*3+1];assert.equal(m.positions[k*3+2],3+f.height(m.xorigin+x,m.yorigin+y)-f.min);
 }
 assert.throws(()=>G.buildTileMesh(p,f,f,0,0,{segments:0}),/segment/);
});

for(const [name,height] of [
 ['flat',()=>100],['linear slope',(x,y)=>x*.01+y*.02-300],
 ['high contrast peak',(x,y)=>x===96&&y===96?10000:0],
 ['seam ridge',(x,y)=>200*Math.exp(-(((x-184)/8)**2))],
 ['negative anomaly',(x,y)=>x===96&&y===96?-10000:100]
])test(`field ${name}: all warped vertices bounded; order independent`,()=>{
 const p=plan(3),f=G.createHeightFrame(p,{height});
 const forward=[];
 for(let r=0;r<3;r++)for(let c=0;c<3;c++){
  const m=G.buildTileMesh(p,f,f,r,c);
  for(let i=0;i<m.topVertexCount;i++){const z=m.positions[i*3+2];assert.ok(z>=3-1e-9);assert.ok(z<=3+f.max-f.min+1e-9);}
  forward.push(G.makeSTL(p,f,f,r,c));
 }
 for(let r=2;r>=0;r--)for(let c=2;c>=0;c--)assert.deepEqual(forward[r*3+c],G.makeSTL(p,f,f,r,c));
});
test('nominal gap separates assembled shared profiles in both orientations',()=>{
 const p=plan(2),f=G.createHeightFrame(p,source),a=G.buildTileMesh(p,f,f,0,0),b=G.buildTileMesh(p,f,f,0,1),c=G.buildTileMesh(p,f,f,1,0),n=a.count,w=n+1;
 for(let i=0;i<=n;i++){
  const right=b.positions[i*w*3]+184-a.positions[(i*w+n)*3];assert.ok(Math.abs(right-.2)<1e-10);
  const down=a.positions[i*3+1]+184-c.positions[(n*w+i)*3+1];assert.ok(Math.abs(down-.2)<1e-10);
 }
});
test('invalid samples are never written into STL and a stale datum is rejected',()=>{
 const p=plan(1);
 for(const h of [NaN,Infinity,-Infinity,null,undefined])assert.throws(()=>G.makeSTL(p,{height:()=>h},{min:0},0,0),/NoData/);
 assert.throws(()=>G.makeSTL(p,{height:()=>-10},{min:0},0,0),/минимума/);
});
