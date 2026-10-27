'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path');
const source=n=>fs.readFileSync(path.resolve(__dirname,'..',n),'utf8');
test('Map HUD includes real selected extent and does not intercept map controls',()=>{
 const js=source('ui-hud27.js'),css=source('ui-hud27.css');
 for(const token of ["$('selected')","$('coverage')","$('tiles')","$('dimensions')","MutationObserver","ResizeObserver"])assert.ok(js.includes(token),token);
 assert.ok(css.includes('pointer-events:none'));
 assert.ok(css.includes('#map .leaflet-top.leaflet-left'));
});
test('Live height frame, DEM tiles and STL stages expose real ratios',()=>{
 const js=source('ui-hud27.js');
 for(const token of ['Общее поле высот:', 'Высоты\\s+', 'Генерация STL:', 'aria-valuenow', 'role', 'Формирование ZIP','Готово\\. Архив'])
   assert.ok(js.includes(token),token);
 assert.ok(js.includes('progress.hidden=true'));
 assert.ok(js.includes('progress.dataset.state'));
});
test('Single responsive HUD included after existing live UI initialization',()=>{
 const html=source('index.html'),css=source('ui-hud27.css');
 assert.ok(html.includes('ui-hud27.css'));
 assert.ok(html.indexOf('ui-hud27.js')>html.indexOf('ui-v26.js'));
 assert.ok(css.includes('@media(max-width:760px)'));
 assert.ok(html.includes('v2.7'));
});
