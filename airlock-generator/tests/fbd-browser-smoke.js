"use strict";
// Optional real-browser check. Requires externally installed Playwright/Chromium.
// Run the repository's static server first; no PLC or telemetry gateway is used.
const {chromium}=require("playwright"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.AIRLOCK_CHROMIUM_PATH||"/usr/bin/chromium",args:["--no-sandbox"]});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-fbd-browser-"));
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:8000/airlock-generator/",{waitUntil:"networkidle"});
  await page.locator("#fbdBuild").click();
  assert.match(await page.locator("#fbdResult").textContent(),/не сформирован/,"default PR100 has insufficient DO");
  await page.evaluate(()=>{
   model.hardware={primary:{family:"PR103",baseDi:16,baseDo:16,modules:[]},secondary:[],link:"none",signaling:"door"};
   render();
  });
  await page.locator("#fbdTimeout").fill("500");await page.locator("#fbdBuild").click();
  assert.match(await page.locator("#fbdResult").textContent(),/План проверен: помещений 2, дверей 6/);
  async function download(selector,name){
   const promise=page.waitForEvent("download");await page.locator(selector).click();
   const item=await promise,file=path.join(temp,name);await item.saveAs(file);return fs.readFileSync(file,"utf8");
  }
  const plan=JSON.parse(await download("#fbdJSON","plan.json"));
  assert.equal(plan.verification.plan,"FBD_PLAN_PASS");assert.equal(plan.timeoutMs,500);
  const csv=await download("#fbdCSV","matrix.csv");assert.equal(csv.trim().split("\r\n").length,plan.edges.length+1);
  const qa=await download("#fbdQA","test-plan.md");assert.match(qa,/NEEDS_NATIVE_GUI/);
  const scada=JSON.parse(await download("#exportProjectScada","scada.json"));
  assert.equal(scada.schema,"airlock-scada-project/1");assert.equal(scada.model.rooms.length,6);assert.equal(scada.model.doors.length,8);
  let downloads=0;page.on("download",()=>downloads++);
  await page.evaluate(()=>model.doors[0].a="MISSING");await page.locator("#fbdJSON").click();
  assert.match(await page.locator("#fbdResult").textContent(),/Invalid door endpoints/);
  assert.equal(downloads,0,"invalid current model cannot download a stale FBD plan");
  assert.deepEqual(errors,[]);
  const result={passed:8,failed:0,checks:["default capacity error","FBD build","JSON","CSV","native QA","SCADA compatibility","stale-export refusal","no browser errors"],native:"NOT_RUN",physical:"NOT_TESTED"};
  const output=path.join(__dirname,"../qa-reports");fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,"fbd-browser.json"),JSON.stringify(result,null,2)+"\n");
  console.log("FBD_BROWSER_SMOKE_PASS 8/8 (Chromium)");
 }finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
