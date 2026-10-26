/* Standalone interactive WebGL renderer for DEM terrain previews. */
(function(){
'use strict';
const $=id=>document.getElementById(id),canvas=$('previewCanvas');
let gl,prog,surface,lines,wire,routeLines=null,landscapeDraw=[],lastModel=null,yaw=-.85,tilt=.58,zoom=1.65,span=200,midz=0;
let panX=0,panY=0,panZ=0,bordersOn=true,wireOn=false,modelH=20;
let topo=null,topoTexture=null,topoEpoch=0,topoStatus='Не загружена';
const topoToggle=document.getElementById('previewTopo');
const labelsCanvas=document.getElementById('previewLabels');
let mapLabels=[];
function statusTopo(value){
 topoStatus=value;
 const label=document.getElementById('previewTopoStatus');
 if(label)label.textContent=value;
}
async function requestTopo(){
 if(!lastModel||!topoToggle?.checked)return;
 const epoch=++topoEpoch,p=lastModel.p;
 statusTopo('Загружаю топокарту…');
 try{
  const data=await window.TerrainTopoAtlas.load(p,{
   maxTiles:12,onStatus:(n,total)=>{if(epoch===topoEpoch)statusTopo('Топокарта '+n+'/'+total);}
  });
  if(epoch!==topoEpoch)return;
  topo=data;
  if(topoTexture)gl.deleteTexture(topoTexture);
  topoTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,topoTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,data.canvas);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  statusTopo('Топографическая карта · Z'+data.z+' · '+data.loaded+' плиток'+(data.failed?' ('+data.failed+' недоступно)':''));
  draw();
 }catch(error){
  if(epoch!==topoEpoch)return;
  topo=null;statusTopo('Топокарта недоступна: '+error.message+'. Использую окраску рельефа.');
  draw();
 }
}

let targetYaw=yaw,targetTilt=tilt,targetZoom=zoom,targetPanX=panX,targetPanY=panY;
let cameraFrame=0,cameraLast=0,velocityYaw=0,velocityTilt=0;
function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
function animateCamera(now){
 cameraFrame=0;
 const elapsed=Math.max(8,Math.min(56,now-(cameraLast||now-16)));
 cameraLast=now;
 const factor=1-Math.exp(-elapsed/78);
 yaw+=(targetYaw-yaw)*factor;tilt+=(targetTilt-tilt)*factor;
 zoom+=(targetZoom-zoom)*factor;
 panX+=(targetPanX-panX)*factor;panY+=(targetPanY-panY)*factor;
 draw();
 if(Math.abs(targetYaw-yaw)>.0003||Math.abs(targetTilt-tilt)>.0003||
 Math.abs(targetZoom-zoom)>.0003||Math.abs(targetPanX-panX)>.01||Math.abs(targetPanY-panY)>.01)
  cameraFrame=requestAnimationFrame(animateCamera);
 else{
  yaw=targetYaw;tilt=targetTilt;zoom=targetZoom;panX=targetPanX;panY=targetPanY;draw();
 }
}
function scheduleCamera(){if(!cameraFrame)cameraFrame=requestAnimationFrame(animateCamera);}

const vs='attribute vec3 pos;attribute vec3 col;attribute vec3 nor;uniform mat4 mvp;varying vec3 c;varying float light;varying vec2 xy;varying float up;void main(){gl_Position=mvp*vec4(pos,1.);c=col;xy=pos.xy;up=nor.z;light=clamp(dot(normalize(nor),normalize(vec3(-.38,-.62,.87))),.48,1.);}',
fs='precision mediump float;varying vec3 c;varying float light;varying vec2 xy;varying float up;uniform sampler2D topoMap;uniform float showTopo;uniform vec2 uvCenter;uniform vec2 uvX;uniform vec2 uvY;void main(){vec3 col=c;if(showTopo>.5&&up>.24){vec2 uv=uvCenter+xy.x*uvX+xy.y*uvY;vec3 tile=texture2D(topoMap,uv).rgb;col=mix(c,tile,.93);}gl_FragColor=vec4(col*light,1.);}';
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
 const mvp=mul(perspective(canvas.width/canvas.height,Math.max(span*80,r*10)),lookAt(eye,[panX,panY,midz+panZ]));
 gl.uniformMatrix4fv(gl.getUniformLocation(prog,'mvp'),false,mvp);
 if(topoTexture&&topoToggle?.checked&&topo&&lastModel){
  const p=lastModel.p,W=p.cols*p.pitch;
  const a=topo.uv(p.minx,p.miny),x=topo.uv(p.maxx,p.miny),y=topo.uv(p.minx,p.maxy);
  const u=[(x[0]-a[0])/W,(x[1]-a[1])/W],v=[(y[0]-a[0])/W,(y[1]-a[1])/W];
  gl.uniform2f(gl.getUniformLocation(prog,'uvCenter'),a[0]+(x[0]-a[0]+y[0]-a[0])/2,a[1]+(x[1]-a[1]+y[1]-a[1])/2);
  gl.uniform2f(gl.getUniformLocation(prog,'uvX'),...u);
  gl.uniform2f(gl.getUniformLocation(prog,'uvY'),...v);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,topoTexture);
  gl.uniform1i(gl.getUniformLocation(prog,'topoMap'),0);
  gl.uniform1f(gl.getUniformLocation(prog,'showTopo'),1);
 }else gl.uniform1f(gl.getUniformLocation(prog,'showTopo'),0);
 for(const part of surface)drawPart(part,gl.TRIANGLES);
 gl.uniform1f(gl.getUniformLocation(prog,'showTopo'),0);
 if(bordersOn)drawPart(lines,gl.LINES);
 if(wireOn)drawPart(wire,gl.LINES);
 if(routeLines)drawPart(routeLines,gl.LINES);
 for(const group of landscapeDraw)drawPart(group,gl.TRIANGLES);
 drawLabels(mvp,canvas.width,canvas.height);
}
function refreshRoute(){
 if(routeLines&&gl){gl.deleteBuffer(routeLines.v);gl.deleteBuffer(routeLines.i);}
 routeLines=null;
 if(!lastModel||!gl||!window.TerrainProject)return;
 const {p,dem,range}=lastModel;
 const samples=window.TerrainProject.getRoute();
 if(samples.length<2)return;
 const coordinates=[],ids=[],W=p.cols*p.pitch,gain=1000/p.s.scale*p.s.exaggeration;
 let previous=null;
 const stride=Math.max(1,Math.ceil(samples.length/15000));
 for(let k=0;k<samples.length;k+=stride){
   const o=samples[k];
   const xy=window.terrainPuzzleDebug.pointXY(o.lat,o.lon,p.lat0,p.lon0);
   if(xy[0]<p.minx||xy[0]>p.maxx||xy[1]<p.miny||xy[1]>p.maxy){previous=null;continue;}
   const z=3+(dem.height(xy[0],xy[1])-range.min)*gain+1.2;
   const pt=[(xy[0]-p.minx)/p.coverage*W-W/2,(xy[1]-p.miny)/p.coverage*W-W/2,z];
   if(previous){
     for(const q of [previous,pt]){
       const i=coordinates.length/9;
       coordinates.push(...q,.98,.14,.07,0,0,1);ids.push(i);
     }
   }
   previous=pt;
 }
 if(ids.length)routeLines=upload(coordinates,ids);
 draw();
}
function drawLabels(m,pxW,pxH){
 if(!labelsCanvas)return;
 if(labelsCanvas.width!==pxW)labelsCanvas.width=pxW;
 if(labelsCanvas.height!==pxH)labelsCanvas.height=pxH;
 const ctx=labelsCanvas.getContext('2d');ctx.clearRect(0,0,pxW,pxH);
 if(!mapLabels.length||!lastModel)return;
 const size=Math.max(12,Math.min(17,pxW/95));ctx.font='600 '+size+'px system-ui,Arial';
 ctx.textBaseline='middle';
 const positions=[];
 for(const item of mapLabels){
  const [x,y,z]=item.point;
  const clip=[
   m[0]*x+m[4]*y+m[8]*z+m[12],
   m[1]*x+m[5]*y+m[9]*z+m[13],
   m[3]*x+m[7]*y+m[11]*z+m[15]
  ];
  if(clip[2]<=0)continue;
  const sx=(clip[0]/clip[2]+1)*pxW/2,sy=(1-clip[1]/clip[2])*pxH/2;
  if(sx<65||sx>pxW-65||sy<30||sy>pxH-30)continue;
  const width=Math.min(270,ctx.measureText(item.label).width+24);
  if(positions.some(p=>Math.abs(p.x-sx)<(p.w+width)/2+12&&Math.abs(p.y-sy)<27))continue;
  positions.push({x:sx,y:sy,w:width});
  ctx.fillStyle='rgba(10,25,36,.88)';
  ctx.beginPath();ctx.roundRect(sx-width/2,sy-12,width,24,6);ctx.fill();
  ctx.strokeStyle='rgba(233,246,238,.75)';ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle=item.color;ctx.fillRect(sx-width/2+4,sy-7,4,14);
  ctx.fillStyle='#f6fcf8';ctx.fillText(item.label,sx-width/2+13,sy,Math.max(40,width-17));
  if(positions.length>=14)break;
 }
}
function refreshLabels(){
 mapLabels=[];
 if(!lastModel||!window.TerrainOSMLayers)return;
 const {p,dem,range}=lastModel,W=p.cols*p.pitch,gain=1000/p.s.scale*p.s.exaggeration;
 const seen=new Set(),features=window.TerrainOSMLayers.getFeatures();
 for(const f of features){
  if(!f.coords?.length)continue;
  if(!((f.kind==='river'||f.kind==='water')&&document.getElementById('layerRivers')?.checked||
        f.kind==='forest'&&document.getElementById('layerForest')?.checked||
        f.kind==='road'&&document.getElementById('layerRoads')?.checked))continue;
  const type=f.kind==='water'||f.kind==='river'?'Река':f.kind==='forest'?'Лес':'Дорога';
  const label=f.tags?.name?type+' · '+String(f.tags.name).slice(0,28):type;
  if(seen.has(label))continue;
  // OSM ways can extend many kilometres beyond the selected area. A midpoint
  // of the full way is often outside the model even if the river crosses it.
  const candidates=f.coords.map(q=>{
    const xy=p.projectionContext.toLocal(q.lat,q.lon);return {q,x:xy[0],y:xy[1]};
  }).filter(o=>o.x>=p.minx&&o.x<=p.maxx&&o.y>=p.miny&&o.y<=p.maxy);
  if(!candidates.length)continue;
  seen.add(label);
  const visible=candidates[Math.floor(candidates.length/2)];
  const x=visible.x,y=visible.y;
  const z=3+(dem.height(x,y)-range.min)*gain+6;
  mapLabels.push({label,point:[(x-p.minx)/p.coverage*W-W/2,(y-p.miny)/p.coverage*W-W/2,z],
    color:type==='Река'?'#5ac9ff':type==='Лес'?'#78df83':'#efb67c'});
 }
 mapLabels.sort((a,b)=>a.label.startsWith('Река')?-1:b.label.startsWith('Река')?1:0);
}
function refreshLandcover(){
 if(gl)for(const part of landscapeDraw){gl.deleteBuffer(part.v);gl.deleteBuffer(part.i);}
 landscapeDraw=[];
 if(!lastModel||!gl||!window.TerrainOSMLayers||!window.TerrainLandscape)return;
 refreshLabels();
 const waterways=window.TerrainOSMLayers.getFeatures().filter(f=>f.kind==='river');
 const waters=window.TerrainOSMLayers.getFeatures().filter(f=>f.kind==='water');
 const legend=document.getElementById('previewLegend');
 if(legend){
  const visual=document.getElementById('riverWidth')?.value||'60';
  const text=legend.querySelector('span');
  if(text)text.lastChild.textContent=waters.length?
    'Вода: '+waters.length+' полигонов берегов, '+waterways.length+' линий':
    'Водотоки: '+waterways.length+' линий · ширина '+visual+' м условная';
 }
 const {p,dem,range}=lastModel,api=window.TerrainOSMLayers,
   features=api.getFeatures(),trees=api.getTrees(p);
 if(!features.length){draw();return;}
 const colored=window.TerrainLandscape.build(p,dem,range,features,trees,{
   forest:document.getElementById('layerForest').checked&&document.getElementById('layer3DTrees').checked,
   river:document.getElementById('layerRivers').checked,
   road:document.getElementById('layerRoads').checked,
   riverWidthMeters:Number(document.getElementById('riverWidth')?.value||60)
 });
 for(const buffer of [colored.forest,colored.water,colored.road]){
  // WebGL1 UNSIGNED_SHORT indices: <= 64k vertices per draw call, triangle aligned.
  const limit=60000;
  for(let from=0;from<buffer.length;from+=limit*9){
   const chunk=buffer.slice(from,from+limit*9),n=chunk.length/9;
   if(n>0)landscapeDraw.push(upload(chunk,Array.from({length:n},(_,i)=>i)));
  }
 }
 draw();
}
function render(p,dem,range){
 init();
 if(surface)for(const part of surface){gl.deleteBuffer(part.v);gl.deleteBuffer(part.i);}
 if(lines){gl.deleteBuffer(lines.v);gl.deleteBuffer(lines.i);}
 if(wire){gl.deleteBuffer(wire.v);gl.deleteBuffer(wire.i);}
 if(routeLines){gl.deleteBuffer(routeLines.v);gl.deleteBuffer(routeLines.i);routeLines=null;}
 for(const part of landscapeDraw){gl.deleteBuffer(part.v);gl.deleteBuffer(part.i);}landscapeDraw=[];
 const W=p.cols*p.pitch,gain=1000/p.s.scale*p.s.exaggeration;
 const maxHeight=Math.max(1,(range.max-range.min)*gain);
 // LOD changes sampling density only; tile warping, datum and topology share STL core.
 const segments=Math.max(2,Math.min(Math.ceil(p.pitch/p.s.mesh_step),Math.floor(220/p.cols)));
 const lv=[],wv=[];
 surface=[];
 const addLine=(target,a,b)=>{
   for(const q of [a,b])target.push(q[0],q[1],q[2]+.25,.03,.17,.20,0,0,1);
 };
 for(let row=0;row<p.rows;row++)for(let col=0;col<p.cols;col++){
   const mesh=window.TerrainGeometry.buildTileMesh(p,dem,range,row,col,{segments});
   const v=[],idx=[],n=segments+1,positions=mesh.positions;
   const point=k=>[positions[k*3]+col*p.pitch-W/2,positions[k*3+1]+(p.rows-row-1)*p.pitch-W/2,positions[k*3+2]];
   // Smooth vertex normals on the terrain surface. Keep base/walls sharp.
   // Exported STL geometry is unchanged; only preview lighting is interpolated.
   const topCount=mesh.topVertexCount,topNormal=new Float64Array(topCount*3);
   for(const f of mesh.faces){
     if(f[0]>=topCount||f[1]>=topCount||f[2]>=topCount)continue;
     const a=point(f[0]),b=point(f[1]),c=point(f[2]);
     const n=cross(b.map((x,i)=>x-a[i]),c.map((x,i)=>x-a[i]));
     for(const vertex of f)for(let axis=0;axis<3;axis++)topNormal[vertex*3+axis]+=n[axis];
   }
   for(const face of mesh.faces){
     const pts=face.map(point),a=pts[0],b=pts[1],c=pts[2];
     const flat=normal(cross(b.map((x,i)=>x-a[i]),c.map((x,i)=>x-a[i])));
     for(let q=0;q<3;q++){
       const position=pts[q],index=face[q];
       const no=index<topCount?normal(Array.from(topNormal.subarray(index*3,index*3+3))):flat;
       idx.push(v.length/9);
       v.push(...position,...color((position[2]-3)/maxHeight),...no);
     }
   }
   // Keep each draw's indices within Uint16, including at high single-tile LOD.
   const limit=65535;
   for(let offset=0;offset<idx.length;offset+=limit){
     const size=Math.min(limit,idx.length-offset);
     surface.push(upload(v.slice(offset*9,(offset+size)*9),Array.from({length:size},(_,i)=>i)));
   }
   for(let j=0;j<=segments;j++)for(let i=0;i<=segments;i++){
     const k=j*n+i;
     if(i<segments){if(j===0||j===segments)addLine(lv,point(k),point(k+1));else if(j%4===0)addLine(wv,point(k),point(k+1));}
     if(j<segments){if(i===0||i===segments)addLine(lv,point(k),point(k+n));else if(i%4===0)addLine(wv,point(k),point(k+n));}
   }
 }
 wire=upload(wv,Array.from({length:wv.length/9},(_,i)=>i));
 lines=upload(lv,Array.from({length:lv.length/9},(_,i)=>i));
 span=Math.max(W,3*(maxHeight+5));midz=Math.min(maxHeight,80)/2;modelH=maxHeight+3;
 fitView();
 const details=document.querySelector('#preview3d .overlayTip');
 if(details)details.textContent='Размер '+Math.round(W)+' × '+Math.round(W)+' × '+(maxHeight+3).toFixed(1)+' мм · '+p.cols+'×'+p.cols+' плиток · перетащи для поворота · колесо — масштаб';
 lastModel={p,dem,range};refreshRoute();refreshLandcover();topo=null;requestTopo();
 $('preview3d').dataset.shape=p.total;
}
// Camera controls: orbit, pan, pinch zoom, wheel, fit/top/isometric.
function fitView(){
 targetYaw=yaw=-.85;targetTilt=tilt=.68;targetPanX=panX=0;targetPanY=panY=0;
 panZ=0;targetZoom=zoom=1.45;draw();
}
function isoView(){targetYaw=-Math.PI/4;targetTilt=.64;scheduleCamera();}
function topView(){targetYaw=-Math.PI/2;targetTilt=1.566;scheduleCamera();}
function zoomBy(factor){targetZoom=clamp(targetZoom*factor,.12,10);scheduleCamera();}
const pointers=new Map();
let lastPointer=null,gesture=null;
function point(e){return {x:e.clientX,y:e.clientY};}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function panBy(dx,dy){
 // Screen movement follows the cursor in the current horizontal view.
 const pxScale=Math.max(1,span*zoom)*Math.tan(.78/2)*2/Math.max(200,canvas.clientHeight);
 targetPanX+=(-Math.sin(yaw)*dx+Math.cos(yaw)*dy)*pxScale;
 targetPanY+=(Math.cos(yaw)*dx+Math.sin(yaw)*dy)*pxScale;
 scheduleCamera();
}
canvas.addEventListener('pointerdown',e=>{
 if(!surface)return;
 e.preventDefault();
 pointers.set(e.pointerId,point(e));
 canvas.setPointerCapture(e.pointerId);
 if(pointers.size===1){
  velocityYaw=0;velocityTilt=0;
  lastPointer={...point(e),time:performance.now(),
   mode:e.shiftKey||e.button===1||e.button===2?'pan':'rotate',
   // Preserve lower-half drag inversion requested by the user.
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
   const dt=clamp(performance.now()-(lastPointer.time||performance.now()-16),9,60);
   const dYaw=dx*.006*lastPointer.invert,dTilt=dy*.005;
   targetYaw+=dYaw;targetTilt=clamp(targetTilt+dTilt,.07,1.55);
   velocityYaw=velocityYaw*.45+dYaw*(16/dt)*.55;
   velocityTilt=velocityTilt*.45+dTilt*(16/dt)*.55;
   scheduleCamera();
 }
 lastPointer.x=e.clientX;lastPointer.y=e.clientY;lastPointer.time=performance.now();
});
function endPointer(e){
 pointers.delete(e.pointerId);
 try{canvas.releasePointerCapture(e.pointerId);}catch(_){}
 if(pointers.size===1){const p=[...pointers.values()][0];lastPointer={...p,mode:'pan',invert:1};gesture=null;}
 else if(!pointers.size){
   if(lastPointer?.mode==='rotate'){
     targetYaw+=clamp(velocityYaw*4,-.33,.33);
     targetTilt=clamp(targetTilt+clamp(velocityTilt*3,-.17,.17),.07,1.55);
     scheduleCamera();
   }
   lastPointer=null;gesture=null;velocityYaw=0;velocityTilt=0;
 }
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
document.getElementById('riverWidth')?.addEventListener('change',refreshLandcover);
topoToggle?.addEventListener('change',()=>{
 if(topoToggle.checked){if(!topo)requestTopo();else draw();}
 else{++topoEpoch;draw();}
});
window.TerrainViewer={render,resize:draw,fit:fitView,top:topView,iso:isoView,zoomBy,refreshRoute,refreshLandcover,
 state:()=>({yaw,tilt,zoom,targetYaw,targetTilt,targetZoom,panX,panY,panZ,bordersOn,wireOn,smoothing:cameraFrame!==0})};
})();
