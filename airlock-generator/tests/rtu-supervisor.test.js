"use strict";
// Controlled subprocess exit is the proof of ownership release; stdin never touches a COM device.
const assert=require("node:assert/strict"),{EventEmitter}=require("node:events"),{PassThrough,Writable}=require("node:stream");
const {createTransport}=require("../gateway/modbus-rtu");
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const p={comPort:"COM9",baudrate:9600,parity:"N",stopbits:1,unitId:1,functionCode:3,address:0,count:1,timeoutMs:200};
function fake(){
 let active=0,peak=0,spawns=0;const children=[],requests=[];
 function spawn(py,args){
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.closed=false;child.kills=[];active++;peak=Math.max(peak,active);spawns++;children.push(child);
  child.stdin=new Writable({write(data,enc,cb){requests.push({child,req:JSON.parse(data)});cb();}});
  child.kill=signal=>{child.kills.push(signal||"SIGTERM");return true;}; // Deliberately ignores TERM, no close yet.
  child.end=(code=0)=>{if(child.closed)return;child.closed=true;active--;child.emit("close",code);};
  child.reply=(values=[7],extra={})=>{const req=requests.filter(r=>r.child===child).at(-1).req;
   child.stdout.write(JSON.stringify({ok:true,id:req.id,values,...extra})+"\n");
   if(!args.includes("--persistent"))child.end();
  };
  return child;
 }
 return {spawn,children,requests,get peak(){return peak;},get spawns(){return spawns;}};
}
(async()=>{
 const f=fake(),t=createTransport({spawnWorker:f.spawn,maxQueue:2,queueTimeoutMs:40});
 let closing;
 try{
  const abort=new AbortController();const first=t.query(p,{signal:abort.signal}).catch(e=>e.code);
  const second=t.query({...p,comPort:"com9",unitId:2}).catch(e=>e.code);
  const third=t.query({...p,unitId:3}).catch(e=>e.code);
  assert.equal(t.stats()[0].queued,2);
  assert.equal(await t.query({...p,unitId:4}).catch(e=>e.code),"QUEUE_FULL");
  abort.abort();await settle();assert.equal(f.spawns,1);assert.equal(t.stats()[0].active,true);
  assert.equal(await second,"QUEUE_TIMEOUT");assert.equal(await third,"QUEUE_TIMEOUT");
  assert.equal(f.spawns,1);f.children[0].end();assert.equal(await first,"POLL_DEADLINE");
  const recovered=t.query({...p,unitId:2});f.children.at(-1).reply();assert.deepEqual(await recovered,[7]);
  assert.equal(f.peak,1);
  console.log("PASS SUPERVISOR bounded queue, queue expiry, COM alias ownership and no release until child close");
 }finally{closing=t.close();for(const c of f.children)c.end();await closing;}
 const f2=fake(),t2=createTransport({spawnWorker:f2.spawn,idleMs:10000});
 try{
  for(let i=1;i<=10;i++){const q=t2.query({...p,unitId:i,rtuMode:"persistent"});f2.children[0].reply([i]);assert.deepEqual(await q,[i]);}
  assert.equal(f2.spawns,1);assert.equal(f2.peak,1);
  const bad=t2.query({...p,rtuMode:"persistent"}).catch(e=>e.code);
  f2.children[0].reply([7],{id:-1});await settle();assert.equal(f2.spawns,1);
  const waiting=t2.query({...p,unitId:2,rtuMode:"persistent"});
  f2.children[0].end();assert.equal(await bad,"RTU_PROTOCOL");
  assert.equal(f2.spawns,2);f2.children[1].reply([9]);assert.deepEqual(await waiting,[9]);
  assert.equal(f2.peak,1);
  console.log("PASS SUPERVISOR persistent owner reused across 10 Unit IDs; malformed response requires confirmed process restart");
 }finally{closing=t2.close();for(const c of f2.children)c.end();await closing;}
 const f3=fake(),t3=createTransport({spawnWorker:f3.spawn});
 try{
  const hung=t3.query(p).catch(e=>e.code);
  await new Promise(resolve=>setTimeout(resolve,2650));
  assert(f3.children[0].kills.includes("SIGKILL"));
  assert.equal(t3.stats()[0].active,true); // Still quarantined, even if OS fails to deliver kill.
  assert.equal(f3.spawns,1);f3.children[0].end();assert.equal(await hung,"RTU_TIMEOUT");
  console.log("PASS SUPERVISOR stalled Python has bounded watchdog; TERM then KILL without overlapping masters");
 }finally{closing=t3.close();for(const c of f3.children)c.end();await closing;}
 const f4=fake(),t4=createTransport({spawnWorker:f4.spawn});
 try{
  const a=t4.query(p),b=t4.query({...p,unitId:2}),other=t4.query({...p,comPort:"COM10"});
  assert.equal(f4.spawns,2);f4.children[1].reply([10]);assert.deepEqual(await other,[10]);
  assert.equal(f4.requests.length,2); // Same-bus unit 2 has not started.
  f4.children[0].reply([1]);assert.deepEqual(await a,[1]);
  assert.equal(f4.spawns,3);assert.equal(f4.requests[2].req.unitId,2);
  f4.children[2].reply([2]);assert.deepEqual(await b,[2]);
  console.log("PASS SUPERVISOR FIFO across parallel Unit IDs; other COM bus progresses independently");
 }finally{closing=t4.close();for(const c of f4.children)c.end();await closing;}
 const f5=fake(),t5=createTransport({spawnWorker:f5.spawn});
 try{
  const noisy=t5.query(p).catch(e=>e.code);
  f5.children[0].stdout.write("x".repeat(5000));
  for(let i=0;i<20;i++)f5.children[0].stdout.write("ignored after failure".repeat(100));
  assert.equal(f5.spawns,1);f5.children[0].end();assert.equal(await noisy,"RTU_PROTOCOL");
  const crashed=t5.query(p).catch(e=>e.code);
  f5.children[1].stdout.write(JSON.stringify({ok:true,values:[7]})+"\n");
  f5.children[1].end(2);
  assert.equal(await crashed,"RTU_PROTOCOL");
  console.log("PASS SUPERVISOR oversized output and success JSON with failed exit cannot confirm data");
 }finally{closing=t5.close();for(const c of f5.children)c.end();await closing;}
 console.log("AIRLOCK_RTU_SUPERVISOR_PASS");
})().catch(e=>{console.error(e);process.exitCode=1;});
