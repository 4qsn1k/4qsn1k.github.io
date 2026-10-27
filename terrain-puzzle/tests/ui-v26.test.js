'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
test('Workbench has six accessible task stages and preserves existing DOM controls',()=>{
 const js=read('ui-v26.js');
 for(const id of ['place','model','nature','export','paper','projects'])
  assert.ok(js.includes("id:'"+id+"'"),id);
 assert.ok(js.includes('scroller.append(info.section)'),'Move live controls, no cloning');
 assert.ok(js.includes('selectPane(info.id)'));
 assert.ok(js.includes('aria-controls'));
});
test('3D actions and advanced visualization remain functional',()=>{
 const js=read('ui-v26.js');
 for(const id of ['refreshPreview','expandViewer','previewTopo','topoDetail','viewScale','riverWidth'])
  assert.ok(read('index.html').includes('id="'+id+'"'),id);
 assert.ok(js.includes('viewer.append(extra)'),'Advanced settings grouping exists');
 assert.ok(js.includes("$('#tab3d')")||js.includes("$('tab3d')"),'3D tab is addressable');
});
test('Publishing includes new CSS and JS after existing controls are initialized',()=>{
 const html=read('index.html');
 assert.ok(html.includes('ui-v26.css'));
 assert.ok(html.indexOf('<script src="./ui-v26.js"></script>')>html.indexOf('<script src="./ui-v22.js"></script>'));
});
test('Responsive panels remain reachable and full model canvas uses remaining space',()=>{
 const css=read('ui-v26.css'),js=read('ui-v26.js');
 assert.ok(css.includes('max-width:760px'));
 assert.ok(css.includes('.tp-side-collapsed'));
 assert.ok(css.includes('grid-template-columns:76px 328px minmax(0,1fr)'));
 assert.ok(js.includes('sidebarToggle'));
 assert.ok(js.includes("window.innerWidth<=760"),'Mobile map first');
});
