/* Standalone interactive WebGL renderer for DEM terrain previews. */
(function(){
'use strict';
const $=id=>document.getElementById(id),canvas=$('previewCanvas');
let gl,prog,surface,lines,wire,yaw=-.85,tilt=.58,zoom=1.65,span=200,midz=0;
let panX=0,panY=0,panZ=0,bordersOn=true,wireOn=false,modelH=20;
const vs='attribute vec3 pos;attribute vec3 col;attribute vec3 nor;uniform mat4 mvp;varying vec3 c;varying float light;void main(){gl_Position=mvp*vec4(pos,1.);c=col;light=clamp(dot(normalize(nor),normalize(vec3(-.38,-.62,.87))),.40,1.);}',
fs='precision mediump float;varying vec3 c;varying float light;void main(){gl_FragColor=vec4(c*light,1.);}';
function init(){
 if(gl)return;
 gl=canvas.getContext('webgl',{antialias:true,alpha:false});
 if(!gl)throw Error('Нет WebGL. Разреши аппаратное ускорение браузера.');
 function sh(type,s){const q=gl.createShader(type);gl.shaderSource(q,s);gl.compileShader(q);if(!gl.getShaderParameter(q,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(q));return q;}
 prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,vs));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);
 if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));
 gl.useProgram(prog);gl.enable(gl.DEPTH_TEST);gl.clearColor(.065,.10,.14,1);
}
function normal(a){const h=Math.hypot(...a)||1;return a.map(x=>x/h);}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function lookAt(eye,center){
 const z=normal(eye.map((e,i)=>e-center[i])),x=normal(cross([0,0,1],z)),y=cross(z,x);
 return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function perspective(aspect,far){
 const f=1/Math.tan(.78/2),n=.5,d=1/(n-far);
 return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+n)*d,-1,0,0,2*far*n*d,0]);
}
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function color(t){
 t=Math.max(0,Math.min(1,t));
 const palette=[[0,[.18,.43,.35]],[.22,[.35,.59,.37]],[.48,[.66,.72,.43]],[.70,[.75,.60,.39]],[.88,[.66,.47,.36]],[1,[.85,.84,.76]]];
 for(let i=1;i<palette.length;i++)if(t<=palette[i][0]){
   const [v,a]=palette[i-1],[w,b]=palette[i],u=(t-v)/(w-v);
   return a.map((x,j)=>x+(b[j]-x)*u);
 }
 return palette[palette.length-1][1];
}
function upload(vertices,indices){
 const v=gl.createBuffer(),i=gl.createBuffer();
 gl.bindBuffer(gl.ARRAY_BUFFER,v);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
 gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,i);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
 return{v,i,count:indices.length};
}
function drawPart(part,mode){
 if(!part)return;
 gl.bindBuffer(gl.ARRAY_BUFFER,part.v);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,part.i);
 for(const [name,offset] of [['pos',0],['col',12],['nor',24]]){
  const loc=gl.getAttribLocation(prog,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,offset);
 }
 gl.drawElements(mode,part.count,gl.UNSIGNED_SHORT,0);
}
function draw(){
 if(!gl||!surface)return;
 const dpi=Math.min(2,devicePixelRatio||1),w=Math.max(280,canvas.clientWidth),h=Math.max(220,canvas.clientHeight);
 if(canvas.width!==Math.round(w*dpi)||canvas.height!==Math.round(h*dpi)){canvas.width=Math.round(w*dpi);canvas.height=Math.round(h*dpi);}
 gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const r=Math.max(span*zoom,modelH*1.35),eye=[panX+r*Math.cos(yaw)*Math.cos(tilt),panY+r*Math.sin(yaw)*Math.cos(tilt),midz+panZ+r*Math.sin(tilt)];
 gl.uniformMatrix4fv(gl.getUniformLocation(prog,'mvp'),false,mul(perspective(canvas.width/canvas.height,Math.max(span*80,r*10)),lookAt(eye,[panX,panY,midz+panZ])));
 drawPart(surface,gl.TRIANGLES);
 if(bordersOn)drawPart(lines,gl.LINES);
 if(wireOn)drawPart(wire,gl.LINES);
}
function render(p,dem,range){
 init();
 if(surface){gl.deleteBuffer(surface.v);gl.deleteBuffer(surface.i);}
 if(lines){gl.deleteBuffer(lines.v);gl.deleteBuffer(lines.i);}
 if(wire){gl.deleteBuffer(wire.v);gl.deleteBuffer(wire.i);}
 const segments=125,n=segments+1,W=p.cols*p.pitch,gain=1000/p.s.scale*p.s.exaggeration;
 const z=new Float32Array(n*n),v=[],idx=[],maxHeight=Math.max(1,(range.max-range.min)*gain);
 const sample=(u,t)=>3+Math.max(0,dem.height(p.minx+p.coverage*u,p.maxy-p.coverage*t)-range.min)*gain;
 const id=(i,j)=>j*n+i;
 for(let j=0;j<n;j++)for(let i=0;i<n;i++)z[id(i,j)]=sample(i/segments,j/segments);
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const k=id(i,j),height=z[k],l=z[id(Math.max(0,i-1),j)],r=z[id(Math.min(segments,i+1),j)],
  a=z[id(i,Math.max(0,j-1))],b=z[id(i,Math.min(segments,j+1))];
  const no=normal([-(r-l),-(a-b),2*W/segments]);
  v.push((i/segments-.5)*W,(.5-j/segments)*W,height,...color((height-3)/maxHeight),...no);
 }
 for(let j=0;j<segments;j++)for(let i=0;i<segments;i++){
  const a=id(i,j),b=a+1,c=a+n,d=c+1;idx.push(a,c,d,a,d,b);
 }
 // perimeter walls to the base
 const edges=[Array.from({length:n},(_,i)=>id(i,0)),Array.from({length:n},(_,i)=>id(segments,i)),
 Array.from({length:n},(_,i)=>id(segments-i,segments)),Array.from({length:n},(_,i)=>id(0,segments-i))];
 for(const group of edges){
  const below=group.map(k=>{const j=k*9,q=v.length/9;v.push(v[j],v[j+1],0,.20,.28,.29,0,0,1);return q;});
  for(let i=0;i<group.length-1;i++)idx.push(group[i],below[i],below[i+1],group[i],below[i+1],group[i+1]);
 }
 surface=upload(v,idx);
 const meshLines=[],meshIds=[];
 for(let j=0;j<=segments;j+=4)for(let i=0;i<segments;i+=4){
   const t=id(i,j),u=id(Math.min(segments,i+4),j),start=meshLines.length/9;
   for(const k of [t,u]){
     const a=k*9;meshLines.push(v[a],v[a+1],v[a+2]+.25,.08,.09,.11,0,0,1);
   }
   meshIds.push(start,start+1);
 }
 for(let i=0;i<=segments;i+=4)for(let j=0;j<segments;j+=4){
   const t=id(i,j),u=id(i,Math.min(segments,j+4)),start=meshLines.length/9;
   for(const k of [t,u]){const a=k*9;meshLines.push(v[a],v[a+1],v[a+2]+.25,.08,.09,.11,0,0,1);}
   meshIds.push(start,start+1);
 }
 wire=upload(meshLines,meshIds);
 const lv=[];
 const add=(x,y,h)=>lv.push(x,y,h+.85,.03,.17,.20,0,0,1);
 for(let t=0;t<=p.cols;t++){
  const q=t/p.cols;
  for(let i=0;i<150;i++){
    const x=i/150,y=(i+1)/150;
    add((q-.5)*W,(.5-x)*W,sample(q,x));add((q-.5)*W,(.5-y)*W,sample(q,y));
    add((x-.5)*W,(.5-q)*W,sample(x,q));add((y-.5)*W,(.5-q)*W,sample(y,q));
  }
 }
 lines=upload(lv,Array.from({length:lv.length/9},(_,i)=>i));
 span=Math.max(W,3*(maxHeight+5));midz=Math.min(maxHeight,80)/2;modelH=maxHeight+3;
 fitView();
 const details=document.querySelector('#preview3d .overlayTip');
 if(details)details.textContent='Размер '+Math.round(W)+' × '+Math.round(W)+' × '+(maxHeight+3).toFixed(1)+' мм · '+p.cols+'×'+p.cols+' плиток · перетащи для поворота · колесо — масштаб';
 $('preview3d').dataset.shape=p.total;
}
// Camera controls: orbit, pan, pinch zoom, wheel, fit/top/isometric.
function fitView(){yaw=-.85;tilt=.68;panX=0;panY=0;panZ=0;zoom=1.45;draw();}
function isoView(){yaw=-Math.PI/4;tilt=.64;draw();}
function topView(){yaw=-Math.PI/2;tilt=1.566;draw();}
function zoomBy(factor){zoom=Math.max(.12,Math.min(10,zoom*factor));draw();}
const pointers=new Map();
let lastPointer=null,gesture=null;
function point(e){return {x:e.clientX,y:e.clientY};}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function panBy(dx,dy){
 // Screen movement follows the cursor in the current horizontal view.
 const pxScale=Math.max(1,span*zoom)*Math.tan(.78/2)*2/Math.max(200,canvas.clientHeight);
 panX+=(-Math.sin(yaw)*dx+Math.cos(yaw)*dy)*pxScale;
 panY+=(Math.cos(yaw)*dx+Math.sin(yaw)*dy)*pxScale;
 draw();
}
canvas.addEventListener('pointerdown',e=>{
 if(!surface)return;
 e.preventDefault();
 pointers.set(e.pointerId,point(e));
 canvas.setPointerCapture(e.pointerId);
 if(pointers.size===1){
  lastPointer={...point(e),mode:e.shiftKey||e.button===1||e.button===2?'pan':'rotate',
   // At the lower edge the model follows the movement of the hand.
   invert:e.offsetY>canvas.clientHeight/2?-1:1};
 }else if(pointers.size===2){
  const a=[...pointers.values()];
  gesture={dist:distance(a[0],a[1]),center:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}};
  lastPointer=null;
 }
});
canvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;
 e.preventDefault();
 pointers.set(e.pointerId,point(e));
 if(pointers.size>=2){
  const a=[...pointers.values()],d=distance(a[0],a[1]);
  const center={x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};
  if(gesture){
    if(d>4&&gesture.dist>4)zoomBy(gesture.dist/d);
    panBy(center.x-gesture.center.x,center.y-gesture.center.y);
  }
  gesture={dist:d,center};
  return;
 }
 if(!lastPointer)return;
 const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;
 if(lastPointer.mode==='pan')panBy(dx,dy);
 else{
   yaw+=dx*.008*lastPointer.invert;
   tilt=Math.max(.08,Math.min(1.57,tilt+dy*.007));
   draw();
 }
 lastPointer.x=e.clientX;lastPointer.y=e.clientY;
});
function endPointer(e){
 pointers.delete(e.pointerId);
 try{canvas.releasePointerCapture(e.pointerId);}catch(_){}
 if(pointers.size===1){const p=[...pointers.values()][0];lastPointer={...p,mode:'pan',invert:1};gesture=null;}
 else if(!pointers.size){lastPointer=null;gesture=null;}
}
canvas.addEventListener('pointerup',endPointer);
canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('dblclick',e=>{e.preventDefault();fitView();});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoomBy(Math.exp(e.deltaY*.0012));},{passive:false});
document.querySelectorAll('#viewerToolbar [data-view]').forEach(b=>b.addEventListener('click',()=>{
 const modes={fit:fitView,reset:fitView,iso:isoView,top:topView,plus:()=>zoomBy(.72),minus:()=>zoomBy(1.4)};
 modes[b.dataset.view]?.();
}));
$('viewerBorders')?.addEventListener('change',e=>{bordersOn=e.target.checked;draw();});
$('viewerWire')?.addEventListener('change',e=>{wireOn=e.target.checked;draw();});
window.addEventListener('resize',draw);
window.TerrainViewer={render,resize:draw,fit:fitView,top:topView,iso:isoView,zoomBy,
 state:()=>({yaw,tilt,zoom,panX,panY,panZ,bordersOn,wireOn})};
})();
