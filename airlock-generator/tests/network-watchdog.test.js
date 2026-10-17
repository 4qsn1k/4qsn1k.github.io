/* Conceptual Modbus freshness watchdog regression tests, no network calls. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const load=(f,n)=>vm.runInNewContext(fs.readFileSync(path.join(root,f),"utf8")+"\n"+n,{});
const wiring=load("project-wiring.js","AirlockProjectWiring");
const hardware=load("hardware-planner.js","AirlockHardwarePlanner");
const planner=load("distributed-planner.js","AirlockDistributedPlanner");
const watchdog=load("network-watchdog.js","AirlockLinkWatchdog");
const model=JSON.parse(fs.readFileSync(path.join(root,"model.json"),"utf8"));
const plan=wiring.build(model);
const pr={family:"PR103",modification:"SITE-VERIFY",baseDi:8,baseDo:8,modules:[]};
const hw={primary:pr,secondary:[pr],link:"ethernet-modbus-tcp",signaling:"room"};
const t={roomOwners:{"1":"PLC1","4":"PLC2"},
 doorInputOwners:{"1-2":"PLC1","1-4":"PLC1","1-5":"PLC1","2-4":"PLC2","3-4":"PLC2","4-6":"PLC2"},
 doorOutputOwners:{"1-2":"PLC1","1-4":"PLC1","1-5":"PLC1","2-4":"PLC2","3-4":"PLC2","4-6":"PLC2"},alarmOwner:"PLC1"};
const distributed=planner.build(model,plan,hw,hardware,t);
const first=distributed.network.signals.find(r=>r.signal==="FB_Room_N4.O_D_1_4_Block");
const reed=distributed.network.signals.find(r=>r.signal==="CLOSED_D_1_4");
const good={closed:true,fireNormal:true,allRoomReady:true,finalBlock:false,localFault:false};
const run=(name,fn)=>{fn();console.log("PASS "+name)};
run("no implicit timeout permitted",()=>{
 assert.throws(()=>watchdog.create(distributed),/timeoutMs/);
 assert.throws(()=>watchdog.create(distributed,{timeoutMs:0}),/timeoutMs/);
});
run("no received signal means remote door grant denied",()=>{
 const w=watchdog.create(distributed,{timeoutMs:200});
 assert.equal(w.freshFor("FINAL_BLOCK_D_1_4",0),false);
 assert.equal(w.requirePermit("FINAL_BLOCK_D_1_4",0,good,planner),false);
});
run("fresh matching frame allows only logical permit, then expires",()=>{
 const w=watchdog.create(distributed,{timeoutMs:200});
 assert.equal(w.receive({...first,value:false,seq:1,atMs:100}).accepted,true);
 assert.equal(w.status(first,299).fresh,true);
 assert.equal(w.requirePermit("FINAL_BLOCK_D_1_4",299,good,planner),true);
 assert.equal(w.status(first,301).reason,"TIMEOUT");
 assert.equal(w.requirePermit("FINAL_BLOCK_D_1_4",301,good,planner),false);
});
run("duplicate or replayed frame cannot renew freshness",()=>{
 const w=watchdog.create(distributed,{timeoutMs:200});
 w.receive({...first,value:true,seq:10,atMs:100});
 assert.equal(w.receive({...first,value:false,seq:10,atMs:200}).accepted,false);
 assert.equal(w.receive({...first,value:false,seq:9,atMs:200}).accepted,false);
 assert.equal(w.status(first,310).fresh,false);
 assert.equal(w.receive({...first,value:false,seq:11,atMs:320}).accepted,true);
 assert.equal(w.status(first,350).fresh,true);
});
run("shared reed copy independently requires fresh network data",()=>{
 const w=watchdog.create(distributed,{timeoutMs:1000});
 assert.equal(w.freshFor("FB_Room_N4.CLOSED_D_1_4",200),false);
 w.receive({...reed,value:true,seq:0,atMs:200});
 assert.equal(w.freshFor("FB_Room_N4.CLOSED_D_1_4",500),true);
 assert.equal(w.freshFor("FB_Room_N4.CLOSED_D_1_4",1201),false);
});
run("wrong BOOL, route or timestamp rejected",()=>{
 const w=watchdog.create(distributed,{timeoutMs:1000});
 assert.throws(()=>w.receive({...first,value:1,seq:1,atMs:100}),/BOOL/);
 assert.throws(()=>w.receive({...first,from:"PLC9",value:false,seq:1,atMs:100}),/Неизвестный/);
 assert.throws(()=>w.receive({...first,value:false,seq:-1,atMs:100}),/Неверный/);
 assert.equal(w.freshFor("FINAL_BLOCK_D_1_4",200),false);
});
console.log("NETWORK_WATCHDOG_QA 6/6 PASS — reference only; no live Modbus");
