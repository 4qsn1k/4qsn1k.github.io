/* Terrain Puzzle v1.4: printer constraints and proactive option availability. */
(function(){
'use strict';
const $=id=>document.getElementById(id),MAX_TRI=6000000,MAX_GRID=196,MAX_Z=210;
let heightRange=null;
function settings(){
 const e=window.terrainPuzzleDebug.inputs();
 return { ...e, printerLimit:+$('printerLimit').value, count:+$('gridCount').value };
}
function score(n,mm,step,puzzle){
 const pitch=mm-(puzzle?16:0),steps=Math.ceil(pitch/step);
 return n*n*(4*steps*steps+4*steps);
}
function evaluate(n,mm,step,s){
 if(mm>s.printerLimit)return 'Превышен размер стола '+s.printerLimit+' мм';
 if(mm<70||mm>210)return 'Размер детали вне 70–210 мм';
 if(n*n>MAX_GRID)return 'Более '+MAX_GRID+' деталей';
 const faces=score(n,mm,step,s.puzzle);
 if(faces>MAX_TRI)return (faces/1e6).toFixed(2)+' млн треугольников > 6 млн';
 return '';
}
function update(){
 const s=settings(),n=s.count,mm=s.tile_size,step=s.mesh_step;
 const out=$('optionAvailability'),unavailable=[];
 const selectGrid=$('gridCount'),selectSteps=$('mesh_step'),selectMM=$('tile_size');
 const apply=(select,converter,fn)=>{
   for(const opt of [...select.options]){
     if(!opt.dataset.originalLabel)opt.dataset.originalLabel=opt.textContent.replace(/\s*· недоступно$/,'');
     const why=fn(converter(opt.value));
     opt.disabled=Boolean(why);
     opt.title=why||'Доступно для текущих настроек';
     opt.textContent=opt.dataset.originalLabel+(why?' · недоступно':'');
   }
 };
 apply(selectGrid,Number,q=>evaluate(q,mm,step,s));
 apply(selectSteps,Number,q=>evaluate(n,mm,q,s));
 const existingFootprint=window.TerrainGridEditor?.getState()?.active
  ?window.TerrainGridEditor.getState().sideMeters:(()=>{try{return window.terrainPuzzleDebug.plan().selected;}catch{return 0;}})();
 apply(selectMM,Number,q=>{
   const part=q-(s.puzzle?16:0),required=Math.max(1,Math.ceil(existingFootprint/(part*s.scale/1000)-1e-8));
   if(required>6)return 'нужно '+required+'×'+required+' плиток (макс. 6×6)';
   return evaluate(required,q,step,s);
 });
 const selectScale=$('scale');
 const fixedSide=window.TerrainGridEditor?.getState()?.active
  ?window.TerrainGridEditor.getState().sideMeters:(()=>{try{return window.terrainPuzzleDebug.plan().selected;}catch{return 0;}})();
 const lat=(s.lat1+s.lat2)/2,earthDeg=111319.4908;
 const scaleAvailable=[];
 for(const opt of [...selectScale.options]){
   if(!opt.dataset.baseName)opt.dataset.baseName=opt.textContent.replace(/ · [0-9]+×[0-9]+ деталей.*$/,'').replace(/ · недоступно.*$/,'');
   const scalar=Number(opt.value),sizeOfPiece=mm-(s.puzzle?16:0);
   const count=Math.max(1,Math.ceil(fixedSide/(sizeOfPiece*scalar/1000)-1e-8));
   const width=count*sizeOfPiece*scalar/1000;
   let why='';
   if(count>6)why='нужно '+count+'×'+count+' деталей (макс. 6×6)';
   else if(evaluate(count,mm,step,s))why=evaluate(count,mm,step,s);
   else if(width/earthDeg>5||width/(earthDeg*Math.max(.08,Math.cos(lat*Math.PI/180)))>5)
     why='охват больше 5° по координатам';
   opt.disabled=Boolean(why);
   opt.title=why||'Подходит: '+count+'×'+count+' деталей, охват '+(width/1000).toFixed(1)+' км';
   opt.textContent=opt.dataset.baseName+(why?' · недоступно':' · '+count+'×'+count+' деталей');
   if(why)scaleAvailable.push('1:'+scalar.toLocaleString('ru-RU')+' — '+why);
 }
 $('scaleEstimate').innerHTML='<strong>Доступные масштабы для выбранного участка:</strong>'+
 '<div>Выбрано '+(fixedSide/1000).toFixed(2)+' км по стороне. Масштаб влияет на количество плиток.</div>'+
 (scaleAvailable.length?'<div class="blockReason">'+scaleAvailable.slice(0,8).join('; ')+'.</div>':
 '<div>Все указанные масштабы доступны.</div>');
 const options=selectGrid.options;
 const forbiddenCounts=[...options].filter(x=>x.disabled).map(x=>x.dataset.originalLabel);
 if(forbiddenCounts.length)unavailable.push('Сетки: '+forbiddenCounts.join(', '));
 const forbiddenMesh=[...selectSteps.options].filter(x=>x.disabled).map(x=>x.value+' мм');
 if(forbiddenMesh.length)unavailable.push('Шаги STL: '+forbiddenMesh.join(', '));
 const forbiddenMM=[...selectMM.options].filter(x=>x.disabled).map(x=>x.value+' мм');
 if(forbiddenMM.length)unavailable.push('Размеры деталей: '+forbiddenMM.join(', '));
 const faces=score(n,mm,step,s.puzzle),meg=(faces*50/1048576).toFixed(0);
 let heightText='Высота макета: после загрузки реального рельефа в 3D.';
 if(heightRange){
   const height=3+(heightRange.max-heightRange.min)*1000/s.scale*s.exaggeration;
   heightText='Оценка высоты: '+height.toFixed(1)+' мм / лимит '+MAX_Z+' мм.';
   const opts=$('exaggeration').options;
   for(const item of opts){
     const h=3+(heightRange.max-heightRange.min)*1000/s.scale*Number(item.value);
     item.disabled=h>MAX_Z;
     item.title=item.disabled?'Высота при ×'+item.value+': '+h.toFixed(1)+' мм > '+MAX_Z+' мм':'Доступно: '+h.toFixed(1)+' мм';
     if(!item.dataset.originalLabel)item.dataset.originalLabel=item.textContent.replace(/\s*· недоступно$/,'');
     item.textContent=item.dataset.originalLabel+(item.disabled?' · недоступно':'');
   }
   if(height>MAX_Z)unavailable.push('Выбранный множитель высоты ×'+s.exaggeration+' превышает '+MAX_Z+' мм');
 }else{
   for(const item of $('exaggeration').options){
     if(item.dataset.originalLabel)item.textContent=item.dataset.originalLabel;
     item.disabled=false;item.title='Уточняется после получения данных высот';
   }
 }
 const valid=evaluate(n,mm,step,s)||(selectScale.selectedOptions[0]?.disabled?'Недоступный масштаб':''); const height=heightRange?3+(heightRange.max-heightRange.min)*1000/s.scale*s.exaggeration:0;
 // Prevent generating known-invalid settings. Unknown terrain height remains checked by the original engine.
 const triangle3mf=4*Math.ceil((mm-(s.puzzle?16:0))/step)**2+4*Math.ceil((mm-(s.puzzle?16:0))/step);
 const tooLarge3mf=$('export3mf')?.checked&&triangle3mf>160000;
 $('go').disabled=Boolean(valid)||(heightRange&&height>MAX_Z)||tooLarge3mf;
 if(tooLarge3mf)unavailable.push('3MF: слишком много полигонов на плитку ('+triangle3mf+'). Увеличь шаг сетки STL');
 out.innerHTML='<strong>Доступно сейчас:</strong> '+n+'×'+n+' ('+n*n+' плиток), '+mm+'×'+mm+' мм, шаг '+step+' мм.'+
   '<div>Расчёт: '+(faces/1e6).toFixed(2)+' млн треугольников из 6 млн · ≈ '+meg+' МБ STL без сжатия.</div>'+
   '<div>'+heightText+'</div>'+
   (unavailable.length?'<div class="blockReason">Отключено: '+unavailable.join('; ')+'.</div>':
    '<div>Для указанных параметров все варианты сетки и размеров доступны.</div>');
 if(valid)out.innerHTML+='<div class="blockReason">Выбранный режим недопустим: '+valid+'</div>';
}
function selectedLimits(){
 const mmSelect=$('tile_size'),limit=+$('printerLimit').value;
 if(+mmSelect.value>limit){
   let options=[...mmSelect.options].map(o=>+o.value).filter(x=>x<=limit);
   if(!options.length)throw Error('Нет доступного размера детали.');
   mmSelect.value=String(Math.max(...options));
   // Commit grid-editor updates via the same user-facing event.
   mmSelect.dispatchEvent(new Event('change',{bubbles:true}));
 }
 update();
}
$('printerLimit').addEventListener('change',selectedLimits);
for(const id of ['gridCount','tile_size','mesh_step','puzzle','export3mf','scale','exaggeration','smooth_m'])
 $(id).addEventListener('change',update);
window.addEventListener('terrain:gridchange',update);
window.addEventListener('terrain:elevations',e=>{heightRange=e.detail?.range??null;update();});
window.addEventListener('terrain:invalidate',()=>{heightRange=null;update();});
selectedLimits();
window.TerrainOptionAvailability={update,evaluate,score,getRange:()=>heightRange};
})();
