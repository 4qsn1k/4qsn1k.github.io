'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.resolve(__dirname,'..',n),'utf-8');
test('OSM controls and audit report are visible in browser markup',()=>{
 const html=read('index.html');
 for(const id of ['osmTopSummary','osmAudit','osmShow3d','landcoverPanel','osmToolbarButton']){
  if(id==='osmToolbarButton')assert.ok(read('ui-v22.js').includes(id));else assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.ok(html.includes('ui-v22.js'));
});
test('OSM API is queried before fallback Overpass and parser errors are visible',()=>{
 const source=read('landcover-ui.js');
 assert.ok(source.indexOf('await querySmallOSM(box)')<source.indexOf('await queryOverpass(box)'));
 assert.ok(source.includes('dataStats.status=\'error\''));
 assert.ok(source.includes('escapeHTML(source)'));
});
test('Camera damping and interpolated mesh lighting are wired',()=>{
 const source=read('preview.js');
 assert.ok(source.includes('requestAnimationFrame(animateCamera)'));
 assert.ok(source.includes('topNormal'));
 assert.ok(source.includes('targetZoom=clamp('));
});
