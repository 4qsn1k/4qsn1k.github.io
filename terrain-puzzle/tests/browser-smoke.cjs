const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}:undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
 const page=await browser.newPage({acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>{if(r.url().includes('elevation-tiles-prod'))console.error('DEM request failure: '+r.failure()?.errorText);});
 // Chromium's isolated trust store lacks the session CA. curl retains the
 // managed proxy and CA verification; only test transport is bridged, not DEM data.
 if(process.argv.includes('--real-dem'))await page.route('https://s3.amazonaws.com/elevation-tiles-prod/**',async route=>{
   try{
     const {stdout}=await run('curl',['--fail','--silent','--show-error','--include','--header','Origin: http://127.0.0.1:8000',route.request().url()],{encoding:'buffer',maxBuffer:8*1024*1024});
     let rest=stdout,headers;
     do{const end=rest.indexOf('\r\n\r\n');assert.ok(end>=0);headers=rest.subarray(0,end).toString();rest=rest.subarray(end+4);}while(rest.subarray(0,5).toString()==='HTTP/');
     assert.match(headers,/HTTP\/[^ ]+ 200/);
     const cors=headers.match(/access-control-allow-origin:\s*([^\r\n]+)/i);assert.ok(cors,'DEM must supply CORS headers');
     await route.fulfill({status:200,headers:{'content-type':'image/png','access-control-allow-origin':cors[1].trim()},body:rest});
   }catch(e){console.error('Verified DEM transport failed: '+e.message);await route.abort();}
 });
 await page.goto(process.env.TERRAIN_TEST_URL||'http://127.0.0.1:8000/terrain-puzzle/');
 if(!process.argv.includes('--real-dem'))await page.selectOption('#source','demo');
 const grid=await page.evaluate(()=>({map:!!window.terrainPuzzleDebug.map(),grid:window.TerrainGridEditor.getState(),plan:window.terrainPuzzleDebug.plan().total}));console.log(JSON.stringify(grid));assert.equal(grid.map,true);assert.equal(grid.grid.count,2);assert.equal(grid.plan,4);
 await page.click('[data-nudge=\"east\"]');
 const shifted=await page.evaluate(()=>window.TerrainGridEditor.getState());assert.ok(shifted.center[1]>grid.grid.center[1]);
 if(process.argv.includes('--real-dem')){
  await page.evaluate(()=>{const a=window.terrainPuzzleDebug;const s=a.inputs();
    for(const [id,value] of Object.entries({lat1:53.958,lat2:53.962,lon1:58.297,lon2:58.303,scale:5000}))document.getElementById(id).value=value;
    window.TerrainGridEditor.syncFromCurrentInputs();a.recalc();});
 }
 await page.click('#tab3d');await page.waitForFunction(()=>document.querySelector('#preview3d').dataset.shape||document.getElementById('status').textContent.startsWith('Не удалось построить 3D'),{timeout:30000});
 if(!await page.locator('#preview3d').getAttribute('data-shape'))throw Error(await page.locator('#status').textContent());
 console.log('preview: PASS');
 const download=page.waitForEvent('download');await page.click('#go');const zip=await download;await zip.saveAs('/tmp/terrain-smoke.zip');console.log('ZIP: '+zip.suggestedFilename());
 await page.selectOption('#paper_format','A4');await page.selectOption('#paper_dpi','150');
 const pdfDownload=page.waitForEvent('download');await page.click('#exportPaperMap');
 const pdf=await pdfDownload;await pdf.saveAs('/tmp/terrain-smoke.pdf');console.log('PDF: '+pdf.suggestedFilename());
 const result=await page.evaluate(()=>({renderer:!!window.TerrainViewer,grid:window.TerrainGridEditor.getState(),status:document.getElementById('status').textContent}));
 console.log(JSON.stringify(result));
 if(errors.length)throw Error(errors.join('\n'));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
