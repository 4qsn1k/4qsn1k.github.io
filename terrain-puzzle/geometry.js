/* Deterministic geometry; no DOM, network, or elevation provider dependencies. */
(function(root){
'use strict';
  // One immutable sampled field per project. Every tile and LOD uses this datum.
  function* heightFrameSteps(p,dem) {
    const count=Math.ceil(p.pitch/p.s.mesh_step)*p.cols, width=count+1;
    if(count<1||!Number.isInteger(count)||width*width>3200000)throw Error('Height frame exceeds memory budget');
    const values=new Float64Array(width*width);
    let min=Infinity,max=-Infinity;
    for(let j=0;j<width;j++){
    if(j%32===0)yield j/width;
    for(let i=0;i<width;i++){
      const h=dem.height(p.minx+p.coverage*i/count,p.miny+p.coverage*j/count);
      if(!Number.isFinite(h))throw Error('Invalid elevation / NoData in height frame');
      values[j*width+i]=h;min=Math.min(min,h);max=Math.max(max,h);
    }
    }
    const height=(x,y)=>{
      const u=Math.max(0,Math.min(count,(x-p.minx)/p.coverage*count));
      const v=Math.max(0,Math.min(count,(y-p.miny)/p.coverage*count));
      const i=Math.min(count-1,Math.floor(u)),j=Math.min(count-1,Math.floor(v)),a=u-i,b=v-j,k=j*width+i;
      return (1-b)*((1-a)*values[k]+a*values[k+1])+b*((1-a)*values[k+width]+a*values[k+width+1]);
    };
    // Bilinear weights are nonnegative: these extrema bound ALL deformed/LOD
    // coordinates, not just an 81x81 probe. No arbitrary elevation offset/margin.
    return Object.freeze({min,max,height,count,sampleCount:values.length,
      rangeMethod:'conservative-bilinear-frame',marginMeters:0});
  }
  function createHeightFrame(p,dem) {
    const steps=heightFrameSteps(p,dem);let result;
    do{result=steps.next();}while(!result.done);
    return result.value;
  }
  async function createHeightFrameAsync(p,dem,progress=()=>{}) {
    const steps=heightFrameSteps(p,dem);let result;
    while(!(result=steps.next()).done){progress(result.value);await new Promise(resolve=>setTimeout(resolve,0));}
    return result.value;
  }
  const seam=(side,r,c,n)=>{
    if(side==='bottom'&&r<n-1)return (r+c)%2===0?1:-1;
    if(side==='right'&&c<n-1)return (r+c)%2===0?1:-1;
    if(side==='top'&&r>0)return (r-1+c)%2===0?-1:1;
    if(side==='left'&&c>0)return (r+c-1)%2===0?-1:1;
    return 0;
  };
  function warped(u,v,p,row,col,gap=.2) {
    const pitch=p.pitch,n=p.cols,d=p.tab;
    function bump(t) {
      const a=(t-(pitch/2-13))/26;
      return a<=0||a>=1?0:Math.sin(Math.PI*a)**2;
    }
    const sx= u/pitch,sy=v/pitch;
    const left=-seam('left',row,col,n)*d*bump(v)+(col>0?gap/2:0);
    const right=seam('right',row,col,n)*d*bump(v)-(col<n-1?gap/2:0);
    const bottom=-seam('bottom',row,col,n)*d*bump(u)+(row<n-1?gap/2:0);
    const top=seam('top',row,col,n)*d*bump(u)-(row>0?gap/2:0);
    return [u+left*(1-sx)+right*sx,v+bottom*(1-sy)+top*sy];
  }
  function buildTileMesh(p,dem,range,row,col,options={}) {
    const count=(options.segments ?? Math.ceil(p.pitch/p.s.mesh_step)), m=count+1,nv=m*m;
    if(!Number.isInteger(count)||count<1)throw Error('Invalid mesh segment count');
    const vertices=new Float64Array(nv*3),k=p.s.scale/1000,ampl=(1000/p.s.scale)*p.s.exaggeration;
    const xorigin=p.minx+col*p.pitch*k, yorigin=p.maxy-(row+1)*p.pitch*k;
    for(let j=0;j<m;j++)for(let i=0;i<m;i++){
      const [x,y]=warped(i*p.pitch/count,j*p.pitch/count,p,row,col,options.gap ?? .2);
      const id=3*(j*m+i);
      vertices[id]=x;
      vertices[id+1]=y;
      const h=dem.height(xorigin+x*k,yorigin+y*k);
      if(!Number.isFinite(h)||!Number.isFinite(range.min))throw Error('Невалидная высота DEM (NoData). Проверь источник данных.');
      if(h<range.min-1e-9)throw Error('Высота ниже общего минимума. Пересчитай поле высот.');
      vertices[id+2]=3+(h-range.min)*ampl;
    }
    // All triangles are explicitly indexed; side faces follow the exact deformed perimeter.
    const top=[];
    for(let j=0;j<count;j++)for(let i=0;i<count;i++){
      const a=j*m+i,b=a+1,c=a+m,d=c+1;
      top.push([a,b,d],[a,d,c]);
    }
    const border=[];
    for(let i=0;i<count;i++)border.push([i,i+1]);
    for(let j=0;j<count;j++)border.push([j*m+count,(j+1)*m+count]);
    for(let i=count;i>0;i--)border.push([count*m+i,count*m+i-1]);
    for(let j=count;j>0;j--)border.push([j*m,(j-1)*m]);
    const positions=new Float64Array(nv*6);
    positions.set(vertices);
    for(let i=0;i<nv;i++){positions[(nv+i)*3]=vertices[i*3];positions[(nv+i)*3+1]=vertices[i*3+1];}
    const faces=[];
    for(const [a,b,c] of top)faces.push([a,b,c],[c+nv,b+nv,a+nv]);
    for(const [a,b] of border)faces.push([a,a+nv,b],[b,a+nv,b+nv]);
    return {positions,faces,count,topVertexCount:nv,xorigin,yorigin};
  }
  function makeSTL(p,dem,range,row,col) {
    const {positions,faces}=buildTileMesh(p,dem,range,row,col);
    const array=new ArrayBuffer(84+faces.length*50),view=new DataView(array);
    const label=new TextEncoder().encode('Terrain Puzzle STL - '+(row+1)+' '+(col+1));
    new Uint8Array(array,0,label.length).set(label);view.setUint32(80,faces.length,true);
    const location=i=>Array.from(positions.subarray(i*3,i*3+3),Math.fround);
    let at=84;
    function triangle(a,b,c) {
      const ax=b[0]-a[0],ay=b[1]-a[1],az=b[2]-a[2];
      const bx=c[0]-a[0],by=c[1]-a[1],bz=c[2]-a[2];
      let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
      const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
      for(const q of [nx,ny,nz,...a,...b,...c]){view.setFloat32(at,q,true);at+=4;}
      view.setUint16(at,0,true);at+=2;
    }
    for(const [a,b,c] of faces)triangle(location(a),location(b),location(c));
    return new Uint8Array(array);
  }
  function stlBounds(bytes) {
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
    for(let f=0;f<v.getUint32(80,true);f++)for(let j=0;j<3;j++)for(let k=0;k<3;k++){
      const x=v.getFloat32(84+f*50+12+j*12+k*4,true);
      if(!Number.isFinite(x))throw Error('Non-finite STL coordinate');
      bounds[k][0]=Math.min(bounds[k][0],x);bounds[k][1]=Math.max(bounds[k][1],x);
    }
    return bounds;
  }
  const api={createHeightFrame,createHeightFrameAsync,seam,warped,buildTileMesh,makeSTL,stlBounds};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TerrainGeometry=api;
})(typeof globalThis==='object'?globalThis:this);
