/* Print-safe topo coloring from the SAME elevation samples as STL. No map-tile screenshots. */
(function(){
'use strict';
const $=id=>document.getElementById(id),E=new TextEncoder();
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function blend(a,b,t){return a.map((v,i)=>v+(b[i]-v)*t);}
function shadeColor(h){
 const stops=[[0,[34,105,110]],[.18,[78,160,113]],[.38,[152,199,118]],
 [.53,[220,210,121]],[.69,[228,168,94]],[.84,[187,108,83]],[1,[231,222,206]]];
 for(let i=1;i<stops.length;i++)if(h<=stops[i][0]){
  const t=(h-stops[i-1][0])/(stops[i][0]-stops[i-1][0]);
  return blend(stops[i-1][1],stops[i][1],t);
 }return stops[stops.length-1][1];
}
const tick=()=>new Promise(r=>setTimeout(r,0));
function topographic(p,dem,range,x,y,widthMeters,heightMeters,widthPx,heightPx,interval){
 // DEM raster is prepared at a physically meaningful resolution and scaled smoothly.
 const canvas=document.createElement('canvas');canvas.width=widthPx;canvas.height=heightPx;
 const ctx=canvas.getContext('2d');
 const sw=Math.min(1000,widthPx),sh=Math.min(1000,heightPx);
 const sample=document.createElement('canvas');sample.width=sw;sample.height=sh;
 const sc=sample.getContext('2d',{willReadFrequently:true}),im=sc.createImageData(sw,sh);
 const hm=new Float32Array(sw*sh);
 const dx=widthMeters/sw,dy=heightMeters/sh;
 const full=range.max-range.min||1;
 for(let j=0;j<sh;j++)for(let i=0;i<sw;i++){
  const xx=x+(i+.5)*dx,yy=y-(j+.5)*dy,idx=j*sw+i;
  if(xx<p.minx||xx>p.maxx||yy<p.miny||yy>p.maxy){hm[idx]=NaN;continue;}
  hm[idx]=dem.height(xx,yy);
 }
 for(let j=0;j<sh;j++)for(let i=0;i<sw;i++){
  const idx=j*sw+i,k=idx*4,h=hm[idx];
  if(!Number.isFinite(h)){im.data[k]=251;im.data[k+1]=250;im.data[k+2]=247;im.data[k+3]=255;continue;}
  const c=shadeColor(clamp((h-range.min)/full));
  const l=Number.isFinite(hm[j*sw+Math.max(0,i-1)])?hm[j*sw+Math.max(0,i-1)]:h;
  const r=Number.isFinite(hm[j*sw+Math.min(sw-1,i+1)])?hm[j*sw+Math.min(sw-1,i+1)]:h;
  const u=Number.isFinite(hm[Math.max(0,j-1)*sw+i])?hm[Math.max(0,j-1)*sw+i]:h;
  const d=Number.isFinite(hm[Math.min(sh-1,j+1)*sw+i])?hm[Math.min(sh-1,j+1)*sw+i]:h;
  const slope=Math.hypot((r-l)/(2*dx),(d-u)/(2*dy));
  const hill=clamp(.87+((l-r)+(u-d))*.012,.58,1.17);
  const a=Math.floor(h/interval),near=Math.abs(h-(a*interval+interval/2));
  const nearContour=Math.min(h%interval,interval-(h%interval));
  const contourWidth=Math.min(interval*.12,Math.max(.3,slope*Math.max(dx,dy)*.4));
  const contour=nearContour<contourWidth;
  for(let t=0;t<3;t++)im.data[k+t]=clamp((contour?c[t]*.56:c[t]*hill),0,255);
  im.data[k+3]=255;
 }
 sc.putImageData(im,0,0);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(sample,0,0,widthPx,heightPx);
 return canvas;
}
function legend(ctx,W,H,label,range,interval){
 const scale=Math.max(1,W/2100),margin=18*scale;
 ctx.save();ctx.fillStyle='rgba(255,255,255,.86)';ctx.fillRect(0,0,W,44*scale);
 ctx.fillStyle='#1d2932';ctx.textAlign='left';ctx.font='bold '+(21*scale)+'px Arial,sans-serif';
 ctx.fillText(label,margin,30*scale);
 ctx.textAlign='right';ctx.font=(15*scale)+'px Arial,sans-serif';
 ctx.fillText('Высоты '+Math.round(range.min)+'–'+Math.round(range.max)+' м • горизонтали '+interval+' м',W-margin,30*scale);
 ctx.textAlign='left';
 const base=H-51*scale;
 ctx.fillStyle='rgba(255,255,255,.90)';ctx.fillRect(0,base,W,H-base);
 for(let i=0;i<8;i++){
  ctx.fillStyle='rgb('+shadeColor(i/7).map(Math.round).join(',')+')';
  ctx.fillRect((20+i*42)*scale,base+11*scale,42*scale,13*scale);
 }
 ctx.fillStyle='#26333b';ctx.font=(14*scale)+'px Arial,sans-serif';
 ctx.fillText('низ '+Math.round(range.min)+' м',20*scale,base+42*scale);
 ctx.fillText('верх '+Math.round(range.max)+' м',250*scale,base+42*scale);
 ctx.restore();
}
function download(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function bytes(canvas,type='image/png',quality=.88){
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?b.arrayBuffer().then(data=>resolve(new Uint8Array(data))):reject(Error('Ошибка кодирования изображения')),type,quality));
}
async function downloadTiles(p,dem,range,zip,report){
 const files=[],dpi=+$('paper_dpi').value,interval=+$('contour_interval').value;
 const px=Math.round(p.pitch*dpi/25.4),k=p.s.scale/1000;
 if(p.total>49)throw Error('Для раскрасок ограничение 49 деталей. Увеличь масштаб.');
 for(let r=0;r<p.cols;r++)for(let c=0;c<p.cols;c++){
  const id=String.fromCharCode(65+r)+(c+1).toString().padStart(2,'0');
  report('Карта-раскраска '+(r*p.cols+c+1)+' из '+p.total+'…');
  const x=p.minx+c*p.pitch*k,y=p.maxy-r*p.pitch*k;
  const canvas=topographic(p,dem,range,x,y,p.pitch*k,p.pitch*k,px,px,interval);
  legend(canvas.getContext('2d'),px,px,id+' · рельеф для плитки',range,interval);
  files.push(['TILE_MAPS/'+id+'_color_contours_'+dpi+'dpi.png',await bytes(canvas)]);
  await tick();
 }
 files.push(['PRINT_INFO.txt',E.encode('Карты окраски '+p.total+' плиток.\n'+
  'Размер каждой карты '+p.pitch+' × '+p.pitch+' мм. Север находится сверху.\n'+
  'DPI '+dpi+'. Оттенки обозначают высоту, тени — склоны. Горизонтали '+interval+' м.\n'+
  'Это высотная раскраска, не дорожная топографическая карта. Схема привязана к DEM.\n'+
  'При печати PNG вручную указывай фактический размер '+p.pitch+' мм — метаданные DPI зависят от ПО.\n')]);
 const blob=zip(files);download(blob,'Terrain_Tile_Maps_'+p.cols+'x'+p.cols+'.zip');
 report('Готово: '+p.total+' PNG. Укажи при печати размер '+p.pitch+' мм. Размер архива '+(blob.size/1048576).toFixed(1)+' МБ.');
}
const ascii=s=>E.encode(s);
function pdf(images,wmm,hmm){
 // Binary PDF 1.4 with embedded JPEGs; MediaBox defines exact printable dimensions.
 const pts=v=>(v*72/25.4).toFixed(4),pages=images.length;
 const objs=[null],chunks=[];
 function set(i,s){objs[i]=s;}
 const kids=[];
 set(1,'<< /Type /Catalog /Pages 2 0 R >>');
 for(let i=0;i<pages;i++)kids.push((3+i*3)+' 0 R');
 set(2,'<< /Type /Pages /Count '+pages+' /Kids ['+kids.join(' ')+'] >>');
 for(let i=0;i<pages;i++){
  const page=3+i*3,content=page+1,im=page+2;
  const w=pts(wmm),h=pts(hmm),jpg=images[i].data;
  set(page,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w+' '+h+'] /Resources << /XObject << /Image '+im+' 0 R >> >> /Contents '+content+' 0 R >>');
  const instructions=ascii('q '+w+' 0 0 '+h+' 0 0 cm /Image Do Q\n');
  set(content,{dict:'<< /Length '+instructions.length+' >>',data:instructions});
  set(im,{dict:'<< /Type /XObject /Subtype /Image /Width '+images[i].width+' /Height '+images[i].height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>',data:jpg});
 }
 const h=ascii('%PDF-1.4\n%Terrain Puzzle\n'),parts=[h],offset=[0];let n=h.length;
 for(let i=1;i<objs.length;i++){
  offset[i]=n;
  const a=ascii(i+' 0 obj\n');parts.push(a);n+=a.length;
  if(typeof objs[i]==='string'){const b=ascii(objs[i]+'\nendobj\n');parts.push(b);n+=b.length;}
  else{
    const before=ascii(objs[i].dict+'\nstream\n'),after=ascii('\nendstream\nendobj\n');
    parts.push(before,objs[i].data,after);n+=before.length+objs[i].data.length+after.length;
  }
 }
 const xref=n;
 let tail='xref\n0 '+objs.length+'\n0000000000 65535 f \n';
 for(let i=1;i<objs.length;i++)tail+=String(offset[i]).padStart(10,'0')+' 00000 n \n';
 tail+='trailer\n<< /Size '+objs.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 parts.push(ascii(tail));return new Blob(parts,{type:'application/pdf'});
}
async function downloadPaper(p,dem,range,report){
 const paper=$('paper_format').value,fmt=paper==='A3'?[297,420]:[210,297],
 dpi=+$('paper_dpi').value,scale=+$('paper_scale').value,interval=+$('contour_interval').value;
 const [W,H]=fmt,pad=10,boxW=W-2*pad,boxH=H-2*pad;
 const pageM=[boxW*scale/1000,boxH*scale/1000],cols=Math.ceil(p.coverage/pageM[0]),rows=Math.ceil(p.coverage/pageM[1]);
 if(cols*rows>32)throw Error('Нужно '+cols*rows+' страниц. Увеличь бумажный масштаб 1:N или выбери A3 (макс. 32 листа).');
 const imgs=[];
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const wp=Math.round(W*dpi/25.4),hp=Math.round(H*dpi/25.4),side=Math.round(pad*dpi/25.4),
    cw=wp-2*side,ch=hp-2*side;
  const canvas=document.createElement('canvas');canvas.width=wp;canvas.height=hp;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,wp,hp);
  report('Лист '+(r*cols+c+1)+' из '+(cols*rows)+' • '+paper+', '+dpi+' DPI…');
  const x=p.minx+c*pageM[0],y=p.maxy-r*pageM[1];
  const topo=topographic(p,dem,range,x,y,pageM[0],pageM[1],cw,ch,interval);
  ctx.drawImage(topo,side,side);
  ctx.lineWidth=Math.max(1,dpi/150);ctx.strokeStyle='#44535e';ctx.strokeRect(side,side,cw,ch);
  const fs=Math.round(dpi/25.4*3.5);
  ctx.fillStyle='#172c38';ctx.font='bold '+fs+'px Arial,sans-serif';
  ctx.fillText('TERRAIN PUZZLE • '+paper+' • лист '+(r+1)+':'+(c+1)+' / '+rows+'×'+cols,side,side/1.7);
  ctx.textAlign='right';ctx.fillText('1:'+scale+' · '+interval+' м · север ↑',wp-side,side/1.7);
  ctx.font=(fs*.78)+'px Arial,sans-serif';
  ctx.fillText('Печать 100%, без подгонки по странице',wp-side,hp-side/2);
  ctx.textAlign='left';ctx.fillText('Рельеф Mapzen • '+Math.round(range.min)+'–'+Math.round(range.max)+' м',side,hp-side/2);
  const jpg=await bytes(canvas,'image/jpeg',.90);
  imgs.push({data:jpg,width:wp,height:hp});
  await tick();
 }
 const result=pdf(imgs,W,H);
 download(result,'Terrain_Map_'+paper+'_1-'+scale+'_'+cols+'x'+rows+'.pdf');
 report('PDF готов: '+cols+'×'+rows+'='+imgs.length+' листов '+paper+'; '+(result.size/1048576).toFixed(1)+' МБ. Печатай в масштабе 100%.');
}
window.TerrainMaps={downloadTiles,downloadPaper,pdf,topographic};
})();
