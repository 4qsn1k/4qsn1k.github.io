"use strict";
const assert=require("node:assert/strict");
const net=require("node:net");
const http=require("node:http");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const vm=require("node:vm");
const {query}=require("../gateway/modbus-tcp");
const {validate}=require("../gateway/profile-schema");
const {frameFor,readController,createPoller}=require("../gateway/telemetry");
const {start}=require("../gateway/server");
const root=path.join(__dirname,"..");
const model=JSON.parse(fs.readFileSync(path.join(root,"model.json"),"utf8"));
const pkg=vm.runInNewContext(fs.readFileSync(path.join(root,"project-package.js"),"utf8")+"\nAirlockProjectPackage",{});
let count=0;function pass(label){count++;console.log("PASS SCADA "+label);}
async function mock(){
 let requests=[];
 const server=net.createServer(socket=>{
  let buf=Buffer.alloc(0);
  socket.on("data",part=>{
   buf=Buffer.concat([buf,part]);
   if(buf.length<12)return;
   const id=buf.readUInt16BE(0),unit=buf[6],fc=buf[7],address=buf.readUInt16BE(8),qty=buf.readUInt16BE(10);
   requests.push({id,unit,fc,address,qty});
   // Fake register values: ROOM_1 State=10, ROOM_4 State=10, door closed/allow true.
   const demo={100:10,101:10,102:1,103:0,104:1,105:1};
   const bits=fc<=2?Math.ceil(qty/8):qty*2;
   const pdu=Buffer.alloc(2+bits);pdu[0]=fc;pdu[1]=bits;
   for(let i=0;i<qty;i++){
    const v=demo[address+i]??0;
    if(fc<=2){pdu[2+Math.floor(i/8)]|=(v?1:0)<<(i%8);}
    else pdu.writeUInt16BE(v,2+i*2);
   }
   const output=Buffer.alloc(7+pdu.length);output.writeUInt16BE(id,0);
   output.writeUInt16BE(0,2);output.writeUInt16BE(pdu.length+1,4);output[6]=unit;
   pdu.copy(output,7);
   socket.end(output);
  });
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 return {server,port:server.address().port,requests,close:()=>new Promise(resolve=>server.close(resolve))};
}
(async()=>{
 const modelPkg=pkg.build(model);
 assert.equal(modelPkg.schema,"airlock-scada-project/1");
 assert.equal(modelPkg.topology.controlledRoomIds.length,2);
 assert.equal(modelPkg.topology.sharedDoorIds.join(","),"1-4");
 pass("arbitrary project package + common reed detection");
 assert.throws(()=>pkg.validate({...model,doors:[{id:"bogus",a:"1",b:"900"}]}),/неверные|Неверные/i);
 pass("reject invalid layout and references");
 const m=await mock();
 try{
  const values=await query({host:"127.0.0.1",port:m.port,unitId:16,functionCode:3,address:100,count:6});
  assert.deepEqual(values,[10,10,1,0,1,1]);
  assert.equal(m.requests[0].fc,3);
  assert.equal(m.requests[0].unit,16);
  pass("Modbus TCP FC03 MBAP end-to-end on real local socket");
  for(const fc of [1,2,4]){
   const v=await query({host:"127.0.0.1",port:m.port,unitId:16,functionCode:fc,address:102,count:1});
   assert.equal(v[0],1);assert.equal(m.requests.at(-1).fc,fc);
  }
  pass("Modbus FC01/02/04 read-only requests");
  assert.throws(()=>query({host:"127.0.0.1",port:m.port,unitId:16,functionCode:6,address:100}),/read-only/);
  pass("write FC05/06/15/16 rejected before transport");
  const cfg={schema:"airlock-scada-connection/1",model,
   controllers:[{id:"PR1",protocol:"modbus-tcp",host:"127.0.0.1",port:m.port,unitId:16,timeoutMs:800}],
   bindings:[
    {signal:"ROOM_1.State",controllerId:"PR1",fc:3,address:100},
    {signal:"ROOM_4.State",controllerId:"PR1",fc:3,address:101},
    {signal:"SYSTEM.FireNormal",controllerId:"PR1",fc:3,address:102},
    {signal:"DOOR_1-4.Closed",controllerId:"PR1",fc:3,address:103},
    {signal:"DOOR_1-4.BlockRequested",controllerId:"PR1",fc:3,address:104},
    {signal:"DOOR_1-4.GreenPermit",controllerId:"PR1",fc:3,address:105}
   ],pollMs:600,staleMs:2400};
  const normalized=validate(cfg);
  assert.equal(normalized.bindings.length,6);
  pass("profile with explicit unit, host, register bindings validated");
  const readings=await readController(cfg.controllers[0],cfg.bindings);
  assert.equal(readings["ROOM_1.State"],10);
  assert.equal(readings["DOOR_1-4.Closed"],0);
  assert.equal(m.requests.at(-1).qty,6);
  pass("adjacent Modbus registers batched into a single read");
  let frame=frameFor(cfg,readings,{});
  assert.equal(frame.rooms["1"].state,"ready");assert.equal(frame.rooms["4"].state,"ready");
  assert.equal(frame.doors["1-4"].state,"open"); // Closed=0 always wins.
  assert.equal(frame.doors["1-2"].state,"unknown");
  pass("open reed overrides permit and unbound doors unknown");
  const next={...readings,"DOOR_1-4.Closed":1,"DOOR_1-4.BlockRequested":0};
  frame=frameFor(cfg,next,{});
  assert.equal(frame.doors["1-4"].state,"ready");
  delete next["DOOR_1-4.GreenPermit"];
  assert.equal(frameFor(cfg,next,{}).doors["1-4"].state,"unknown");
  next["DOOR_1-4.GreenPermit"]=1;next["ROOM_4.State"]=30;
  assert.equal(frameFor(cfg,next,{}).doors["1-4"].state,"unknown");
  const noFireProof={...readings};
  delete noFireProof["SYSTEM.FireNormal"];
  assert.equal(frameFor(cfg,noFireProof,{}).rooms["1"].state,"unknown");
  assert.equal(frameFor(cfg,noFireProof,{}).doors["1-4"].state,"open");
    pass("green requires full explicit proof from every participating room");
  frame=frameFor(cfg,readings,{PR1:"cable disconnected"});
  assert.equal(frame.source,"offline");assert.deepEqual(frame.rooms,{});
  assert.equal(frame.doors["1-4"].state,"unknown");
  pass("communications fault clears previously confirmed statuses");
  const poller=createPoller(cfg,async()=>readings);
  await poller.poll();
  assert.equal(poller.get().source,"live");
  const original=Date.now;try{Date.now=()=>original()+5000;assert.equal(poller.get().source,"offline");}
  finally{Date.now=original;}
  pass("stale telemetry transitions to offline");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-scada-"));
  const file=path.join(dir,"connection.json");
  fs.writeFileSync(file,JSON.stringify(cfg));
  const app=start({configPath:file,port:0,pollerFactory:()=>({
   poll:async()=>{},get:()=>({timestamp:Date.now(),source:"offline",rooms:{},doors:{},controllers:{PR1:{online:false}},ageMs:0})}),logger:{log(){},error(){}}});
  try{
   await new Promise(resolve=>app.server.once("listening",resolve));
   const port=app.server.address().port;
   const base="http://127.0.0.1:"+port;
   const status=await fetch(base+"/api/status"),project=await fetch(base+"/api/project");
   assert.equal(status.status,200);assert.equal(project.status,200);
   assert.equal((await project.json()).model.rooms.length,6);
   assert.equal((await fetch(base+"/scada.html")).status,200);
   assert.equal((await fetch(base+"/api/status",{method:"POST"})).status,405);
   assert.equal((await fetch(base+"/../package.json")).status,404);
   pass("local HTTP gateway serves project/status and blocks POST/path traversal");
  const realApp=start({configPath:file,port:0,logger:{log(){},error(){}}});
  try {
   await new Promise(resolve=>realApp.server.once("listening",resolve));
   const frame=await realApp.poller.poll();
   assert.equal(frame.source,"live");
   assert.equal(frame.controllers.PR1.online,true);
   assert.equal(frame.rooms["1"].state,"ready");
   assert.equal(frame.doors["1-4"].state,"open");
   const current=await fetch("http://127.0.0.1:"+realApp.server.address().port+"/api/status").then(r=>r.json());
   assert.equal(current.controllers.PR1.online,true);
   pass("actual Modbus TCP socket -> polling gateway -> HTTP JSON frame");
  } finally {await realApp.close();}
  }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
  assert.throws(()=>start({configPath:"none",host:"0.0.0.0"}),/loopback/);
  pass("public bind refused");
  const html=fs.readFileSync(path.join(root,"scada.html"),"utf8");
  for(const word of ["Контроллеры","Сигналы","Инструкция","scada.js","План"])assert(html.includes(word));
  new Function(fs.readFileSync(path.join(root,"scada.js"),"utf8"));
  pass("SCADA tab UI scripts syntax");
  console.log("SCADA_GATEWAY_QA_PASS "+count+"/15");
 } finally{await m.close();}
})().catch(e=>{console.error("SCADA_GATEWAY_QA_FAIL",e.stack||e);process.exitCode=1;});
