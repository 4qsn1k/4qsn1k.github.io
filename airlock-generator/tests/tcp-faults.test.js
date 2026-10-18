"use strict";
// Only loopback fake responders. FC01-04 asserted for every wire request.
const assert=require("node:assert/strict"),net=require("node:net");
const {query}=require("../gateway/modbus-tcp");
const {createPoller}=require("../gateway/telemetry");
const {createJournal}=require("../gateway/event-journal");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let mode="good",active=0,peak=0,count=0;const sockets=new Set(),requests=[];
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.once("close",()=>sockets.delete(socket));let buf=Buffer.alloc(0);
  socket.on("error",()=>{});
  socket.on("data",part=>{
   buf=Buffer.concat([buf,part]);if(buf.length<12)return;
   const fc=buf[7],unit=buf[6],address=buf.readUInt16BE(8),quantity=buf.readUInt16BE(10);
   assert([1,2,3,4].includes(fc));requests.push({unit,address,fc});
   if(unit===1){active++;count++;peak=Math.max(peak,active);socket.once("close",()=>active--);}
   const selected=unit===2?"good":mode;
   if(selected==="stall")return;
   const payload=fc<=2?Buffer.from([fc,1,1]):Buffer.concat([Buffer.from([fc,quantity*2]),Buffer.alloc(quantity*2)]);
   if(fc>2)for(let i=0;i<quantity;i++)payload.writeUInt16BE(1,2+i*2);
   const out=Buffer.alloc(7+payload.length);buf.copy(out,0,0,2);out.writeUInt16BE(payload.length+1,4);out[6]=unit;payload.copy(out,7);
   if(selected==="exception"){const e=Buffer.from(out.subarray(0,9));e.writeUInt16BE(3,4);e[7]=fc|128;e[8]=2;socket.end(e);return;}
   if(selected==="lost"){socket.end(out.subarray(0,out.length-1));return;}
   if(selected==="mismatch"){out[0]^=1;socket.end(out);return;}
   if(selected==="length"){out.writeUInt16BE(300,4);socket.end(out);return;}
   if(selected==="trickle"){
    let index=0;const timer=setInterval(()=>{if(index<out.length)socket.write(out.subarray(index,index+++1));else{clearInterval(timer);socket.end();}},30);
    socket.once("close",()=>clearInterval(timer));return;
   }
   if(selected==="batch-fail"&&address>0){socket.end(out.subarray(0,8));return;}
   socket.end(out);
  });
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const port=server.address().port,p={host:"127.0.0.1",port,unitId:1,functionCode:3,address:0,count:1,timeoutMs:100};
 try{
  for(const functionCode of [1,2,3,4])assert.deepEqual(await query({...p,functionCode}),[1]);
  for(const [fault,code] of [["lost","TCP_PROTOCOL"],["mismatch","TCP_PROTOCOL"],["length","TCP_PROTOCOL"],["exception","MODBUS_EXCEPTION_2"],["stall","TCP_TIMEOUT"],["trickle","TCP_TIMEOUT"]]){
   mode=fault;const start=Date.now();await assert.rejects(query(p),e=>e.code===code);assert(Date.now()-start<1000);
   mode="good";assert.deepEqual(await query(p),[1]);
  }
  console.log("PASS TCP lost bytes, MBAP mismatch, invalid length, exceptions, stall, absolute trickle deadline and reconnect");
  const profile={schema:"airlock-scada-connection/1",model:{rooms:[],doors:[]},
   controllers:[1,2].map(unitId=>({id:"P"+unitId,protocol:"modbus-tcp",host:"127.0.0.1",port,unitId,timeoutMs:100})),
   bindings:[1,2].map(i=>({signal:"PLC_P"+i+".DI1",controllerId:"P"+i,fc:2,address:0})),pollMs:10,staleMs:1000,pollBudgetMs:1000};
  const poller=createPoller(profile),journal=createJournal();
  try{
   await poller.poll();journal.observe(poller.get());mode="stall";const startCount=count;peak=0;
   const timer=setInterval(()=>poller.tick(),1);
   try{await sleep(650);}finally{clearInterval(timer);}
   let f=poller.get();journal.observe(f);
   assert.equal(f.controllers.P1.online,false);assert.equal(f.controllers.P2.online,true);
   assert(f.controllers.P1.consecutiveFailures>=4);assert(count-startCount<=7);assert(peak<=1);
   assert.equal(f.polling.queued,0);
   mode="good";await poller.poll();await poller.poll();f=poller.get();journal.observe(f);assert.equal(f.controllers.P1.online,true);
   assert.equal(f.controllers.P1.consecutiveFailures,0);assert(journal.recent().some(e=>e.type==="LINK_DOWN"));
   console.log("PASS TCP repeated timeout: <=7 reads/650ms, <=1 flight per PLC, zero backlog, healthy PLC and recovery");
  }finally{await poller.close();}
  mode="batch-fail";
  const partial=createPoller({...profile,controllers:[profile.controllers[0]],bindings:[{signal:"PLC_P1.DI1",controllerId:"P1",fc:2,address:0},{signal:"PLC_P1.DI2",controllerId:"P1",fc:2,address:100}]});
  try{await partial.poll();assert.equal(partial.get().controllers.P1.online,false);assert.deepEqual(partial.get().controllers.P1.raw,{});}finally{await partial.close();}
  console.log("PASS TCP failure of later batch discards earlier readings");
 }finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
 await assert.rejects(query(p),e=>e.code==="TCP_UNAVAILABLE");
 assert.equal(active,0);
 console.log("AIRLOCK_TCP_FAULTS_OFFLINE_PASS including refusal after listener shutdown");
})().catch(e=>{console.error(e);process.exitCode=1;});
