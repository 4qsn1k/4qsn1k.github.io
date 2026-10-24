/* Print-ready tiled PDF: A0 @ 300 DPI without a giant browser canvas. All units are physical PDF points. */
(function(){
'use strict';
const $=id=>document.getElementById(id),E=new TextEncoder(),MAX_PIXELS=190000000,MAX_PAGES=32,TILE=1024;
const formats={A4:[210,297],A3:[297,420],A2:[420,594],A1:[594,841],A0:[841,1189]};
let lastDem=null;
const safe=txt=>String(txt).replace(/[^\x20-\x7e]/g,' ').replace(/[\\()]/g,'\\$&');
function config(){
 const p=window.terrainPuzzleDebug.plan();
 const format=$('paper_format').value,dpi=+$('paper_dpi').value,scale=+$('paper_scale').value;
 const orientation=$('paper_orientation').value;
 const dims=formats[format];if(!dims)throw Error('Неизвестный размер листа.');
 function compute(w,h){
  const pad=10, printableW=w-2*pad,printableH=h-2*pad,perX=printableW*scale/1000,perY=printableH*scale/1000,
  cols=Math.ceil(p.coverage/perX-1e-9),rows=Math.ceil(p.coverage/perY-1e-9);
  const pagePixels=Math.round(w*dpi/25.4)*Math.round(h*dpi/25.4);
  return {p,format,dpi,scale,w,h,pad,printableW,printableH,perX,perY,cols,rows,
    pages:cols*rows,pixels:pagePixels*cols*rows,pagePixels};
 }
 let a=compute(...dims),b=compute(dims[1],dims[0]);
 if(orientation==='landscape')a=b;
 else if(orientation==='auto'&&(b.pages<a.pages||(b.pages===a.pages&&b.cols<a.cols)))a=b;
 a.valid=a.pages>0&&a.pages<=MAX_PAGES&&a.pixels<=MAX_PIXELS;
 a.reason=a.pages>MAX_PAGES?'Нужно '+a.pages+' листов. Максимум '+MAX_PAGES+'. Увеличь масштаб 1:N или формат.':
 a.pixels>MAX_PIXELS?'Требуется '+(a.pixels/1e6).toFixed(0)+' мегапикселей. Предел '+(MAX_PIXELS/1e6).toFixed(0)+' МП на один экспорт. Увеличь масштаб, уменьши DPI или раздели заказ.':'';
 return a;
}
function estimate(){
 let c;
 try{c=config();}catch(e){$('paperEstimate').textContent=e.message;return;}
 const x=$('paperEstimate'),elev=lastDem;
 const dpiApprox=elev?.pixelResolution?Math.round(25.4*c.scale/1000/elev.pixelResolution):null;
 x.innerHTML='<strong>'+c.format+' '+c.w+'×'+c.h+' мм · '+c.dpi+' DPI</strong>'+
 '<div>Листов: '+c.cols+'×'+c.rows+' = '+c.pages+'; исходный растр печати: '+Math.round(c.w*c.dpi/25.4)+'×'+Math.round(c.h*c.dpi/25.4)+' пикселей на лист.</div>'+
 '<div>Всего: '+(c.pixels/1e6).toFixed(1)+' МП; создание PDF частями по '+TILE+'×'+TILE+' пикселей, без увеличения снимка экрана.</div>'+
 (dpiApprox?'<div>Шаг DEM на бумаге ≈ '+dpiApprox+' DPI детализации высот. Он ниже указанного DPI печати. Мелкие географические объекты не восстановятся.</div>':
 '<div>300 DPI сохраняет плавную печать цвета. Детализация местности зависит от данных DEM.</div>')+
 (c.reason?'<div class="blockReason">'+c.reason+'</div>':
 '<div>Формат и разрешение доступны. Печатай PDF в размере 100%, без подгонки.</div>');
 $('exportPaperMap').disabled=!c.valid;
 return c;
}
// Disable parameters that would exceed budget, but never disable a selected invalid option silently.
function selectOptions(){
 const selectors=['paper_scale','paper_dpi','paper_format','paper_orientation'];
 for(const id of selectors){
  const select=$(id),old=select.value;
  for(const opt of [...select.options]){
   if(!opt.dataset.originalLabel)opt.dataset.originalLabel=opt.textContent.replace(' · недоступно','');
   const prev=select.value;select.value=opt.value;
   let c;try{c=config();}catch(e){}
   select.value=prev;
   const why=c?.reason||'';
   opt.disabled=Boolean(why);
   opt.title=why||'Доступно';
   opt.textContent=opt.dataset.originalLabel+(why?' · недоступно':'');
  }
  select.value=old;
 }
 estimate();
}
function array(input){return input instanceof Uint8Array?input:E.encode(input);}
function pdf(doc){
 const pts=mm=>mm*72/25.4,objects=[null],pages=[];
 const add=x=>{objects.push(x);return objects.length-1;};
 const catalog=add(''),pageRoot=add('');
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 for(const page of doc){
  const resources=[],cmd=[];
  const W=pts(page.w),H=pts(page.h),pad=pts(page.pad),scale=72/page.dpi;
  // Images are placed at physical pixel sizes. A0 / A1 do not use screenshot enlargement.
  for(let j=0;j<page.images.length;j++){
   const t=page.images[j],name='I'+j,id=add({dict:'<< /Type /XObject /Subtype /Image /Width '+t.w+' /Height '+t.h+
     ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+t.jpeg.length+' >>',data:t.jpeg});
   resources.push('/'+name+' '+id+' 0 R');
   const x=pad+t.x*scale,y=H-pad-(t.y+t.h)*scale;
   cmd.push('q '+(t.w*scale).toFixed(5)+' 0 0 '+(t.h*scale).toFixed(5)+' '+x.toFixed(5)+' '+y.toFixed(5)+' cm /'+name+' Do Q');
  }
  const boxW=pts(page.w-2*page.pad),boxH=pts(page.h-2*page.pad);
  cmd.push('q 0.3 w 0.18 0.28 0.3 RG '+pad.toFixed(3)+' '+pad.toFixed(3)+' '+boxW.toFixed(3)+' '+boxH.toFixed(3)+' re S Q');
  cmd.push('BT /F1 7 Tf '+pad.toFixed(3)+' '+(H-pad/2).toFixed(3)+' Td ('+safe('TERRAIN PUZZLE  |  '+page.label)+') Tj ET');
  const hasOSM=window.TerrainOSMLayers?.getFeatures()?.length>0;
  const foot='100% PRINT SIZE | Mapzen DEM | '+(hasOSM?'(c) OpenStreetMap contributors (ODbL) | ':'')+'RGB';
  cmd.push('BT /F1 7 Tf '+pad.toFixed(3)+' '+(pad/2).toFixed(3)+' Td ('+safe(foot)+') Tj ET');
  const content=E.encode(cmd.join('\n')+'\n');
  const stream=add({dict:'<< /Length '+content.length+' >>',data:content});
  const pageId=add('<< /Type /Page /Parent '+pageRoot+' 0 R /MediaBox [0 0 '+W.toFixed(5)+' '+H.toFixed(5)+']'+
    ' /Resources << /Font << /F1 '+font+' 0 R >> /XObject << '+resources.join(' ')+' >> >> /Contents '+stream+' 0 R >>');
  pages.push(pageId);
 }
 objects[catalog]='<< /Type /Catalog /Pages '+pageRoot+' 0 R >>';
 objects[pageRoot]='<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map(x=>x+' 0 R').join(' ')+'] >>';
 const chunks=[],offsets=[0];let count=0;
 const append=data=>{const a=array(data);chunks.push(a);count+=a.length;};
 append('%PDF-1.4\n%terrain\n');
 for(let i=1;i<objects.length;i++){
  offsets[i]=count;append(i+' 0 obj\n');
  const o=objects[i];
  if(typeof o==='string')append(o+'\nendobj\n');
  else{append(o.dict+'\nstream\n');append(o.data);append('\nendstream\nendobj\n');}
 }
 const index=count;
 append('xref\n0 '+objects.length+'\n0000000000 65535 f \n');
 for(let i=1;i<objects.length;i++)append(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 append('trailer\n<< /Size '+objects.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+index+'\n%%EOF\n');
 return new Blob(chunks,{type:'application/pdf'});
}
async function jpeg(canvas){
 return new Promise((resolve,reject)=>canvas.toBlob(async b=>{
  if(!b){reject(Error('Не удалось кодировать JPEG'));return;}
  resolve(new Uint8Array(await b.arrayBuffer()));
 },'image/jpeg',.94));
}
function save(blob,name){
 const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);
}
async function downloadPaper(p,dem,range,report){
 const c=config();if(!c.valid)throw Error(c.reason);
 const interval=+$('contour_interval').value;
 const pages=[];
 const printablePixelsX=Math.round(c.printableW*c.dpi/25.4),printablePixelsY=Math.round(c.printableH*c.dpi/25.4);
 const tileCols=Math.ceil(printablePixelsX/TILE),tileRows=Math.ceil(printablePixelsY/TILE);
 const total=c.pages*tileCols*tileRows;let completed=0;
 lastDem=dem;selectOptions();
 for(let r=0;r<c.rows;r++)for(let col=0;col<c.cols;col++){
  const page={w:c.w,h:c.h,pad:c.pad,dpi:c.dpi,
    label:c.format+' - page '+(r+1)+','+(col+1)+' / '+c.rows+'x'+c.cols+' - 1:'+c.scale,images:[]};
  const mapX=p.minx+col*c.perX,mapY=p.maxy-r*c.perY;
  for(let ty=0;ty<printablePixelsY;ty+=TILE)for(let tx=0;tx<printablePixelsX;tx+=TILE){
   const pw=Math.min(TILE,printablePixelsX-tx),ph=Math.min(TILE,printablePixelsY-ty);
   const dx=c.perX*pw/printablePixelsX,dy=c.perY*ph/printablePixelsY;
   const x=mapX+c.perX*tx/printablePixelsX,y=mapY-c.perY*ty/printablePixelsY;
   const raster=window.TerrainMaps.topographic(p,dem,range,x,y,dx,dy,pw,ph,interval);
   page.images.push({x:tx,y:ty,w:pw,h:ph,jpeg:await jpeg(raster)});
   completed++;
   report('Подготовка высококачественного PDF: '+completed+' / '+total+' частей ('+Math.round(completed*100/total)+'%). Листы: '+c.pages+'.');
   await new Promise(ok=>setTimeout(ok,0));
  }
  pages.push(page);
 }
 const blob=pdf(pages);
 save(blob,'Terrain_Print_'+c.format+'_'+c.dpi+'dpi_1-'+c.scale+'_'+c.cols+'x'+c.rows+'.pdf');
 report('PDF готов: '+c.format+' '+c.dpi+' DPI, '+c.pages+' листов, '+(blob.size/1048576).toFixed(1)+' МБ. В типографии укажи масштаб печати 100%.');
 return blob;
}
window.TerrainMaps.downloadPaper=downloadPaper;
window.TerrainPrintV15={config,estimate,selectOptions,pdf};
for(const id of ['paper_format','paper_dpi','paper_scale','paper_orientation','lat1','lat2','lon1','lon2','scale','tile_size'])
 $(id)?.addEventListener('change',selectOptions);
window.addEventListener('terrain:gridchange',selectOptions);
window.addEventListener('terrain:elevations',e=>{lastDem=e.detail?.dem||null;selectOptions();});
window.addEventListener('terrain:invalidate',()=>{lastDem=null;selectOptions();});
selectOptions();
})();
