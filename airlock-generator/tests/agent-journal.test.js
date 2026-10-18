"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createJournal}=require("../gateway/event-journal");
const {start}=require("../gateway/server");
const model=require("../model.json");
let count=0;
const ok=name=>{count++;console.log("PASS JOURNAL "+name)};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-journal-"));
(async()=>{
 try{
  const logfile=path.join(tmp,"events.jsonl");
  const j=createJournal({filePath:logfile,maxEvents:10});
  const f=(at,online,di,q)=>({timestamp:at,source:online?"live":"offline",
   controllers:{PR1:{online,error:online?null:"No serial response",raw:online?{DI1:di,Q1:q}:{}}}});
  j.observe(f(1000,true,0,1));
  assert.equal(j.recent()[0].type,"LINK_UP");ok("first verified response records link-up");
  j.observe(f(2000,true,1,1));
  assert.equal(j.recent()[0].type,"SIGNAL_CHANGED");
  assert.deepEqual({from:j.recent()[0].from,to:j.recent()[0].to},{from:0,to:1});
  ok("DI transition creates one event");
  j.observe(f(3000,false));
  j.observe(f(3500,false));
  assert.equal(j.recent().filter(x=>x.type==="LINK_DOWN").length,1);
  ok("link loss recorded once without spamming");
  j.observe(f(4000,true,0,1));
  assert.equal(j.recent()[0].type,"LINK_UP");
  assert.equal(j.recent().filter(x=>x.type==="SIGNAL_CHANGED").length,1);
  ok("recovery is a new baseline; no fake DI change");
  j.observe(f(5000,true,0,0));
  assert.equal(j.recent()[0].signal,"Q1");ok("Q output read-state changes recorded");
  assert.equal(fs.readFileSync(logfile,"utf8").trim().split("\n").length,j.size());
  assert.throws(()=>j.recent(100),/limit/);
  ok("JSONL persisted and bounded read access");
  const cfg={schema:"airlock-scada-connection/1",model,
   controllers:[{id:"PR1",protocol:"modbus-tcp",host:"127.0.0.1",port:15020,unitId:16,timeoutMs:900}],
   bindings:[],pollMs:750,staleMs:3000};
  const file=path.join(tmp,"config.json");fs.writeFileSync(file,JSON.stringify(cfg));
  const app=start({configPath:file,port:0,logger:{log(){},error(){}},
   pollerFactory:()=>({get:()=>f(Date.now(),true,1,0),poll:async()=>f(Date.now(),true,1,0)})});
  try{
   await new Promise(resolve=>app.server.once("listening",resolve));
   const url="http://127.0.0.1:"+app.server.address().port+"/api/events";
   const response=await fetch(url);
   assert.equal(response.status,200);
   assert.ok(Array.isArray((await response.json()).events));
   assert.equal((await fetch(url,{method:"POST"})).status,405);
   ok("HTTP /api/events is GET-only on loopback");
  }finally{await app.close();}
  const rotateLog=path.join(tmp,"rotating.jsonl");
  const rotated=createJournal({filePath:rotateLog,maxEvents:30,maxFileBytes:160,maxArchives:2});
  for(let i=0;i<12;i++)rotated.observe(f(8000+i*1000,true,i%2,0));
  assert(fs.existsSync(rotateLog+".1"));
  assert(fs.statSync(rotateLog).size<=160);
  assert(fs.statSync(rotateLog+".1").size<=160);
  assert(rotated.recent().length>=10);
  ok("journal JSONL files rotate at size limit without losing RAM history");
  assert.throws(()=>createJournal({maxFileBytes:50}),/size/);
  assert.throws(()=>createJournal({maxArchives:40}),/archive/);
  ok("invalid disk retention parameters rejected");
  console.log("SCADA_JOURNAL_OFFLINE_PASS "+count+"/9");
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
