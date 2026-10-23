/* Terrain Puzzle browser engine v1.1 — no remote compute server required.
   DEM: Mapzen Terrarium (AWS), terrain map: OpenStreetMap/Esri.
   Tiles fit the chosen maximum side, with matching sinusoidal puzzle joints. */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const RD = Math.PI / 180, EARTH = 6378137;
  let map, overlay, markers = [], clickNumber = 0, currentPlan = null, timer, activeLayer;
  const cache = new Map();
  function say(message, kind = '') { $('status').textContent = message; $('status').className = 'status ' + kind; }
  function inputs() {
    const v = id => +$(id).value;
    return { lat1:v('lat1'), lon1:v('lon1'), lat2:v('lat2'), lon2:v('lon2'),
      scale:v('scale'), tile_size:v('tile_size'), exaggeration:v('exaggeration'),
      mesh_step:v('mesh_step'), smooth_m:v('smooth_m'), puzzle:$('puzzle').checked, source:$('source').value, max_tiles:196 };
  }
  function pointXY(lat, lon, centerLat, centerLon) {
    return [(lon-centerLon)*RD*EARTH*Math.cos(centerLat*RD), (lat-centerLat)*RD*EARTH];
  }
  function pointLL(x,y,p) {
    return [p.lat0+y/EARTH/RD, p.lon0+x/(EARTH*Math.cos(p.lat0*RD))/RD];
  }
  function plan(s) {
    const a = [s.lat1,s.lon1,s.lat2,s.lon2,s.scale,s.tile_size,s.exaggeration,s.mesh_step];
    if(a.some(x=>!Number.isFinite(x)))throw Error('Введите числовые координаты и параметры.');
    if(Math.max(Math.abs(s.lat1),Math.abs(s.lat2))>85 || Math.max(Math.abs(s.lon1),Math.abs(s.lon2))>180)
      throw Error('Широта должна быть ±85°, долгота ±180°.');
    if(Math.abs(s.lat1-s.lat2)>5 || Math.abs(s.lon1-s.lon2)>5)throw Error('Участок ограничен 5° по широте и долготе.');
    if(s.scale<1000||s.scale>2000000||s.tile_size<70||s.tile_size>210||s.mesh_step<.35||s.mesh_step>10||s.exaggeration<.25||s.exaggeration>10||s.smooth_m<0||s.smooth_m>150)
      throw Error('Проверь масштаб, максимальный размер детали, шаг сетки и высоты.');
    const lat0=(s.lat1+s.lat2)/2,lon0=(s.lon1+s.lon2)/2;
    const p1=pointXY(s.lat1,s.lon1,lat0,lon0), p2=pointXY(s.lat2,s.lon2,lat0,lon0);
    const selected=Math.max(Math.abs(p2[0]-p1[0]),Math.abs(p2[1]-p1[1]));
    if(selected<50)throw Error('Между точками должно быть не менее 50 метров.');
    const tab=s.puzzle?8:0,pitch=s.tile_size-2*tab;
    const n=Math.max(1,Math.ceil(selected/(pitch*s.scale/1000)-1e-10));
    if(n*n>s.max_tiles)throw Error('Нужно '+n+'×'+n+'='+n*n+' плиток. Лимит '+s.max_tiles+'. Нажми «Автоматический масштаб» или уменьши участок.');
    const approxFaces=n*n*(4*Math.ceil(pitch/s.mesh_step)**2 + 4*Math.ceil(pitch/s.mesh_step));
    if(approxFaces>6000000)throw Error('При этом масштабе получится около '+(approxFaces/1e6).toFixed(1)+' млн треугольников. Увеличь шаг сетки или масштаб. Предел 6 млн.');
    const coverage=n*pitch*s.scale/1000, cx=(p1[0]+p2[0])/2, cy=(p1[1]+p2[1])/2;
    const p={ s, lat0, lon0, cols:n,rows:n,total:n*n,pitch,tab,coverage,selected,
      minx:cx-coverage/2,miny:cy-coverage/2,maxx:cx+coverage/2,maxy:cy+coverage/2 };
    p.corners=[[p.minx,p.miny],[p.maxx,p.miny],[p.maxx,p.maxy],[p.minx,p.maxy]].map(q=>pointLL(q[0],q[1],p));
    p.grid_lines=[];
    for(let i=0;i<=n;i++){const q=i/n;
      p.grid_lines.push([pointLL(p.minx+q*coverage,p.miny,p),pointLL(p.minx+q*coverage,p.maxy,p)]);
      p.grid_lines.push([pointLL(p.minx,p.miny+q*coverage,p),pointLL(p.maxx,p.miny+q*coverage,p)]);
    }
    return p;
  }
  function drawSelection(p) {
    currentPlan=p;
    $('selected').textContent=(p.selected/1000).toFixed(2)+' км';
    $('coverage').textContent=(p.coverage/1000).toFixed(2)+' км';
    $('tiles').textContent=p.cols+' × '+p.cols+' = '+p.total;
    $('dimensions').textContent=Math.round(p.cols*p.pitch)+' мм';
    if(!map)return;
    overlay.clearLayers();markers.forEach(x=>x.remove());markers=[];
    L.polygon(p.corners,{color:'#00e3b7',weight:3,fillColor:'#5ed8b4',fillOpacity:.17}).addTo(overlay);
    p.grid_lines.forEach(line=>L.polyline(line,{color:'#1f6075',weight:1.5,opacity:.85}).addTo(overlay));
    [[p.s.lat1,p.s.lon1],[p.s.lat2,p.s.lon2]].forEach((pt,i)=>{
      const m=L.circleMarker(pt,{radius:8,color:'#152f3b',weight:3,fillColor:i?'#ffad78':'#65e5c7',fillOpacity:1})
        .addTo(map).bindTooltip(i?'Точка B':'Точка A',{permanent:true,direction:'top'});
      markers.push(m);
    });
  }
  function recalc() {
    try {
      const p=plan(inputs());drawSelection(p);
      say('Готово: '+p.cols+'×'+p.cols+' плиток. Файлы STL будут созданы в браузере.','good');
      return p;
    } catch(err) {
      currentPlan=null;['selected','coverage','tiles','dimensions'].forEach(k=>$(k).textContent='—');
      if(overlay)overlay.clearLayers(); say(err.message,'error'); return null;
    }
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(recalc,220);}
  function initMap() {
    if(typeof L==='undefined'){say('Не удалось загрузить встроенную библиотеку карты. Обнови страницу.','error');return;}
    map=L.map('map',{zoomControl:true}).setView([53.96,58.35],11);
    const layers={
      'Карта OSM':L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {maxZoom:19,attribution:'© OpenStreetMap contributors'}),
      'Спутник Esri':L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {maxZoom:18,attribution:'Imagery © Esri'}),
      'Топография OpenTopoMap':L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        {maxZoom:17,attribution:'© OpenTopoMap / OpenStreetMap'})
    };
    activeLayer=layers['Карта OSM'].addTo(map);
    let failed=0, loaded=0;
    activeLayer.on('tileerror',()=>{
      if(++failed===7 && loaded===0){
        say('Сервер OpenStreetMap недоступен. Переключаюсь на спутниковую карту Esri.','error');
        map.removeLayer(activeLayer);activeLayer=layers['Спутник Esri'].addTo(map);
      }
    });
    activeLayer.on('tileload',()=>{loaded++;});
    layers['Спутник Esri'].on('tileerror',()=>say('Не загрузились изображения карты. Проверь доступ к OpenStreetMap/Esri. Координаты можно ввести вручную.','error'));
    L.control.layers(layers,null,{position:'topright',collapsed:false}).addTo(map);
    overlay=L.layerGroup().addTo(map);
    map.on('click',ev=>{
      if(window.TerrainGridEditor?.getState()?.active)return;
      const i=clickNumber%2===0?1:2;clickNumber++;
      $('lat'+i).value=ev.latlng.lat.toFixed(6);$('lon'+i).value=ev.latlng.lng.toFixed(6);recalc();
    });
    window.addEventListener('resize',()=>map.invalidateSize());
    setTimeout(()=>map.invalidateSize(),300);
  }
  const toPixel=(lon,lat,z)=>{
    const phi=Math.max(-85.051128,Math.min(85.051128,lat))*RD, size=256*2**z;
    return [(lon+180)/360*size,(1-Math.asinh(Math.tan(phi))/Math.PI)/2*size];
  };
  function tileBounds(p,z) {
    const q=p.corners.map(x=>toPixel(x[1],x[0],z));
    return [Math.floor(Math.min(...q.map(x=>x[0]))/256),Math.floor(Math.max(...q.map(x=>x[0]))/256),
      Math.floor(Math.min(...q.map(x=>x[1]))/256),Math.floor(Math.max(...q.map(x=>x[1]))/256)];
  }
  function chooseZoom(p) {
    for(let z=13;z>=5;z--){const [a,b,c,d]=tileBounds(p,z);if((b-a+1)*(d-c+1)<=72)return z;}
    throw Error('Слишком большой участок для загрузки цифровых высот.');
  }
  function smoothHeight(fn,p) {
    const m=p.s.smooth_m;
    if(!(m>0))return fn;
    const insideX=x=>Math.min(p.maxx,Math.max(p.minx,x));
    const insideY=y=>Math.min(p.maxy,Math.max(p.miny,y));
    return (x,y)=>(4*fn(x,y)+fn(insideX(x+m),y)+fn(insideX(x-m),y)+fn(x,insideY(y+m))+fn(x,insideY(y-m)))/8;
  }
  async function demData(p) {
    if(p.s.source==='demo')return { demo:true,min:0,max:1200,height:(x,y)=>450+520*Math.exp(-(((x-500)/1100)**2)-(((y+1000)/1500)**2))
      +290*Math.exp(-(((x+1700)/2000)**2)-(((y-500)/1700)**2))+75*Math.sin(x/500)*Math.cos(y/450)
      -200*Math.exp(-(((y-220*Math.sin(x/600))/230)**2)) };
    const z=chooseZoom(p), [minx,maxx,miny,maxy]=tileBounds(p,z), images=new Map();
    let done=0,total=(maxx-minx+1)*(maxy-miny+1);
    const tasks=[];
    for(let ty=miny;ty<=maxy;ty++)for(let tx=minx;tx<=maxx;tx++)tasks.push([tx,ty]);
    // Bounded parallel downloads keep browser memory and source traffic under control.
    let cursor=0; const workers=Array.from({length:Math.min(5,tasks.length)},async()=>{
      while(cursor<tasks.length){
        const [tx,ty]=tasks[cursor++],key=z+'/'+tx+'/'+ty;
        if(!cache.has(key)){
          const url='https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'+key+'.png';
          const response=await fetch(url,{mode:'cors'});
          if(!response.ok)throw Error('Ошибка загрузки высот: HTTP '+response.status+' ('+key+')');
          const bmp=await createImageBitmap(await response.blob());
          const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bmp,0,0);
          cache.set(key,ctx.getImageData(0,0,256,256).data);bmp.close();
        }
        images.set(tx+','+ty,cache.get(key));done++;
        say('Загрузка реальных высот: '+done+' / '+total+' файлов…');
      }
    });
    try{await Promise.all(workers);}catch(err){throw Error('Не удалось получить высоты. '+err.message+' Проверь интернет или выбери демо.');}
    const sample=(x,y)=>{
      const [lat,lon]=pointLL(x,y,p), [xx,yy]=toPixel(lon,lat,z);
      function px(ix,iy) {
        const tx=Math.floor(ix/256),ty=Math.floor(iy/256),img=images.get(tx+','+ty);
        if(!img)throw Error('Нет высот на границе участка. Измени координаты на несколько метров.');
        const q=((iy-ty*256)*256+(ix-tx*256))*4;
        return img[q]*256+img[q+1]+img[q+2]/256-32768;
      }
      let ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy;
      // Avoid requesting neighbor raster at the exact outer border.
      const left=Math.max(minx*256,Math.min((maxx+1)*256-2,ix));
      const top=Math.max(miny*256,Math.min((maxy+1)*256-2,iy));
      if(ix!==left)fx=0;if(iy!==top)fy=0;
      ix=left;iy=top;
      return (1-fy)*((1-fx)*px(ix,iy)+fx*px(ix+1,iy))
        +fy*((1-fx)*px(ix,iy+1)+fx*px(ix+1,iy+1));
    };
    return {demo:false,zoom:z,pixelResolution:Math.cos(p.lat0*RD)*2*Math.PI*EARTH/(256*2**z),height:smoothHeight(sample,p)};
  }
  function getRange(p,dem) {
    let min=Infinity,max=-Infinity;
    for(let j=0;j<=80;j++)for(let i=0;i<=80;i++){
      const h=dem.height(p.minx+p.coverage*i/80,p.miny+p.coverage*j/80);
      min=Math.min(min,h);max=Math.max(max,h);
    }
    return {min,max};
  }
  const seam=(side,r,c,n)=>{
    if(side==='bottom'&&r<n-1)return (r+c)%2===0?1:-1;
    if(side==='right'&&c<n-1)return (r+c)%2===0?1:-1;
    if(side==='top'&&r>0)return (r-1+c)%2===0?-1:1;
    if(side==='left'&&c>0)return (r+c-1)%2===0?-1:1;
    return 0;
  };
  function warped(u,v,p,row,col) {
    const pitch=p.pitch,n=p.cols,d=p.tab;
    function bump(t) {
      const a=(t-(pitch/2-13))/26;
      return a<=0||a>=1?0:Math.sin(Math.PI*a)**2;
    }
    const sx= u/pitch,sy=v/pitch;
    const left=-seam('left',row,col,n)*d*bump(v)+(col>0?.1:0);
    const right=seam('right',row,col,n)*d*bump(v)-(col<n-1?.1:0);
    const bottom=-seam('bottom',row,col,n)*d*bump(u)+(row<n-1?.1:0);
    const top=seam('top',row,col,n)*d*bump(u)-(row>0?.1:0);
    return [u+left*(1-sx)+right*sx,v+bottom*(1-sy)+top*sy];
  }
  function makeSTL(p,dem,range,row,col) {
    const count=Math.ceil(p.pitch/p.s.mesh_step), m=count+1,nv=m*m;
    const vertices=new Float32Array(nv*3),k=p.s.scale/1000,ampl=(1000/p.s.scale)*p.s.exaggeration;
    const xorigin=p.minx+col*p.pitch*k, yorigin=p.maxy-(row+1)*p.pitch*k;
    for(let j=0;j<m;j++)for(let i=0;i<m;i++){
      const [x,y]=warped(i*p.pitch/count,j*p.pitch/count,p,row,col);
      const id=3*(j*m+i);
      vertices[id]=x;
      vertices[id+1]=y;
      vertices[id+2]=3+Math.max(0,dem.height(xorigin+x*k,yorigin+y*k)-range.min)*ampl;
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
    const faces=[];
    for(const t of top)faces.push([t[0],t[1],t[2],true],[t[2],t[1],t[0],false]);
    for(const [a,b] of border)faces.push([a,a,b,false,'wall'],[b,a,b,false,'wall2']);
    const array=new ArrayBuffer(84+faces.length*50),view=new DataView(array);
    const label=new TextEncoder().encode('Terrain Puzzle STL - '+(row+1)+' '+(col+1));
    new Uint8Array(array,0,label.length).set(label);view.setUint32(80,faces.length,true);
    const location=(i,topface)=>[vertices[i*3],vertices[i*3+1],topface?vertices[i*3+2]:0];
    let at=84;
    function triangle(a,b,c) {
      const ax=b[0]-a[0],ay=b[1]-a[1],az=b[2]-a[2];
      const bx=c[0]-a[0],by=c[1]-a[1],bz=c[2]-a[2];
      let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
      const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
      for(const q of [nx,ny,nz,...a,...b,...c]){view.setFloat32(at,q,true);at+=4;}
      view.setUint16(at,0,true);at+=2;
    }
    for(const f of faces){
      if(f.length===4) {
        triangle(location(f[0],f[3]),location(f[1],f[3]),location(f[2],f[3]));
      }else if(f[4]==='wall') {
        triangle(location(f[0],true),location(f[1],false),location(f[2],true));
      }else{
        triangle(location(f[0],true),location(f[1],false),location(f[2],false));
      }
    }
    return new Uint8Array(array);
  }
  function assemblyImage(p,dem,range){
    const canvas=document.createElement('canvas'),sz=540;canvas.width=sz;canvas.height=sz;
    const ctx=canvas.getContext('2d'),img=ctx.createImageData(sz,sz),heights=new Float32Array(sz*sz);
    for(let j=0;j<sz;j++)for(let i=0;i<sz;i++)
      heights[j*sz+i]=dem.height(p.minx+p.coverage*(i+.5)/sz,p.maxy-p.coverage*(j+.5)/sz);
    const delta=Math.max(1,range.max-range.min);
    for(let j=0;j<sz;j++)for(let i=0;i<sz;i++){
      const idx=j*sz+i;
      const h=Math.max(0,Math.min(1,(heights[idx]-range.min)/delta));
      const dx=heights[j*sz+Math.min(sz-1,i+1)]-heights[j*sz+Math.max(0,i-1)];
      const dy=heights[Math.min(sz-1,j+1)*sz+i]-heights[Math.max(0,j-1)*sz+i];
      const shade=Math.max(.44,Math.min(1.2,.84-(dx+dy)*.03));
      img.data[4*idx]=Math.min(255,(73+h*163)*shade);
      img.data[4*idx+1]=Math.min(255,(136+h*89)*shade);
      img.data[4*idx+2]=Math.min(255,(90+h*85)*shade);
      img.data[4*idx+3]=255;
    }
    ctx.putImageData(img,0,0);
    ctx.lineWidth=2;ctx.strokeStyle='#172a34';
    for(let t=1;t<p.cols;t++){const u=t*sz/p.cols;ctx.beginPath();ctx.moveTo(u,0);ctx.lineTo(u,sz);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,u);ctx.lineTo(sz,u);ctx.stroke();}
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold '+Math.max(12,Math.round(sz/(p.cols*5)))+'px Arial';
    for(let r=0;r<p.cols;r++)for(let c=0;c<p.cols;c++){
      const t=String.fromCharCode(65+r)+(c+1);
      ctx.lineWidth=4;ctx.strokeStyle='#101b26';ctx.fillStyle='#ffffff';
      ctx.strokeText(t,(c+.5)*sz/p.cols,(r+.5)*sz/p.cols);
      ctx.fillText(t,(c+.5)*sz/p.cols,(r+.5)*sz/p.cols);
    }
    return new Promise(resolve=>canvas.toBlob(blob=>blob.arrayBuffer().then(buf=>resolve(new Uint8Array(buf))),'image/png'));
  }
  // ZIP (method 0, stored). No CDN libraries; files are directly readable by Windows and slicers.
  const encoder=new TextEncoder(),table=new Uint32Array(256);
  for(let i=0;i<256;i++){let c=i;for(let b=0;b<8;b++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[i]=c>>>0;}
  function checksum(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=table[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function zip(files){
    const locals=[],centrals=[];let offset=0;
    for(const [filename,data] of files){
      const name=encoder.encode(filename),crc=checksum(data);
      const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
      l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);
      l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);
      l.setUint16(26,name.length,true);local.set(name,30);
      const central=new Uint8Array(46+name.length),v=new DataView(central.buffer);
      v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);
      v.setUint16(8,0x800,true);v.setUint32(16,crc,true);
      v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);
      v.setUint16(28,name.length,true);v.setUint32(42,offset,true);
      central.set(name,46);locals.push(local,data);centrals.push(central);
      offset+=local.length+data.length;
    }
    const cdSize=centrals.reduce((v,b)=>v+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
    v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);
    v.setUint32(12,cdSize,true);v.setUint32(16,offset,true);
    return new Blob([...locals,...centrals,end],{type:'application/zip'});
  }
  async function generate() {
    const btn=$('go');btn.disabled=true;btn.textContent='Формирование ZIP…';
    try{
      const p=plan(inputs()); drawSelection(p);
      say('Получаю реальные высоты и рассчитываю модель…');
      const dem=await demData(p),range=getRange(p,dem);
      const maxHeight=3+(range.max-range.min)*1000/p.s.scale*p.s.exaggeration;
      if(maxHeight>210)throw Error('Высота модели '+maxHeight.toFixed(1)+' мм больше 210 мм. Уменьши высоты × или масштаб.');
      const files=[],metadata={
        app:'Terrain Puzzle Generator',version:'1.1.0',generated:new Date().toISOString(),
        settings:p.s,plan:{corners:p.corners,selected_m:p.selected,coverage_m:p.coverage,cols:p.cols,total:p.total,
          tile_pitch_mm:p.pitch,printed_size_mm:p.cols*p.pitch},
        min_elevation_m:range.min,max_elevation_m:range.max,approx_max_height_mm:maxHeight,
        dem_zoom:dem.zoom??null,source:p.s.source==='demo'?'SYNTHETIC TEST DATA':'Mapzen Terrarium DEM',tiles:[]
      };
      for(let r=0;r<p.cols;r++)for(let c=0;c<p.cols;c++){
        say('Генерация STL: '+(r*p.cols+c+1)+' из '+p.total+'…');
        const id=String.fromCharCode(65+r)+String(c+1).padStart(2,'0');
        const binary=makeSTL(p,dem,range,r,c);
        const filename='STL/'+id+'_row'+(r+1)+'_col'+(c+1)+'.stl';
        files.push([filename,binary]);
        metadata.tiles.push({id,filename,triangles:(binary.length-84)/50});
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      files.push(['ASSEMBLY_PLAN.png',await assemblyImage(p,dem,range)]);
      files.push(['project.json',encoder.encode(JSON.stringify(metadata,null,2))]);
      files.push(['README_RU.txt',encoder.encode('Terrain Puzzle Generator 1.1\n'+
        'Ряд A — север (верх схемы). Установи все детали плоской стороной на стол.\n'+
        'Масштаб 1:'+p.s.scale+'; высоты ×'+p.s.exaggeration+'; шаг '+p.s.mesh_step+' мм.\n'+
        'Плиток '+p.cols+'×'+p.cols+'. Макс. сторона '+p.s.tile_size+' мм (включая выступы).\n'+
        'Основание 3 мм, номинальный зазор между деталями 0,2 мм.\n'+
        'Источник: '+metadata.source+'. Точность определяется исходными DEM.\n')]);
      const blob=zip(files),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='Terrain_Puzzle_'+p.cols+'x'+p.cols+'_'+p.s.scale+'.zip';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      say('Готово. Архив '+(blob.size/1048576).toFixed(1)+' МБ; '+p.total+' STL; схема сборки включена.','good');
    }catch(err){console.error(err);say('Ошибка: '+err.message,'error');}
    finally{btn.disabled=false;btn.textContent='Сформировать STL + схему сборки ↓';}
  }
  for(const id of ['lat1','lat2','lon1','lon2','scale','tile_size','exaggeration','mesh_step','smooth_m','puzzle','source'])
    $(id).addEventListener('change',schedule);
  for(const id of ['lat1','lat2','lon1','lon2'])$(id).addEventListener('input',schedule);
  $('clear').onclick=()=>{clickNumber=0;say('Нажми на карте точку A, затем противоположный угол B.');};
  $('fit').onclick=()=>{if(map&&currentPlan)map.fitBounds(L.latLngBounds(currentPlan.corners).pad(.12));};
  $('go').onclick=generate;
  initMap();recalc();
  window.terrainPuzzleDebug={plan:()=>plan(inputs()),makeSTL,zip,demData,getRange,pointLL,pointXY,inputs,drawSelection,recalc,say,map:()=>map,overlay:()=>overlay};
})();
