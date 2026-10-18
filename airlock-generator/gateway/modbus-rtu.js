"use strict";
// One bounded owner per bus. A deadline never releases ownership before child close.
const path=require("node:path"),{spawn}=require("node:child_process");
const {fault}=require("./health-errors");
const worker=path.join(__dirname,"modbus-rtu-worker.py");
function createTransport({spawnWorker=spawn,maxQueue=16,queueTimeoutMs=15000,idleMs=10000}={}){
 const buses=new Map();let closed=false;
 function terminate(bus,error){
  const child=bus.child;if(!child)return;
  bus.failure=bus.failure||error;
  child.kill();
  clearTimeout(bus.killTimer);
  bus.killTimer=setTimeout(()=>child.kill("SIGKILL"),200);
 }
 function launch(bus,item){
  const py=item.options.python||process.env.AIRLOCK_PYTHON||(process.platform==="win32"?"python":"python3");
  const args=/^py(?:\.exe)?$/i.test(path.basename(py))?["-3",worker]:[worker];
  if(bus.mode==="persistent")args.push("--persistent");
  const child=spawnWorker(py,args,{stdio:["pipe","pipe","pipe"],windowsHide:true,shell:false,env:item.options.env||process.env});
  bus.child=child;bus.output="";bus.failure=null;
  child.stderr.on("data",()=>{}); // Never forward port names/library errors to browser or logs.
  child.stdin.on("error",()=>terminate(bus,fault("RTU_WORKER")));
  child.on("error",()=>{bus.failure=fault("RTU_WORKER");});
  child.stdout.on("data",part=>{
   if(bus.failure)return;
   bus.output+=part.toString("utf8");
   if(bus.output.length>4096)return terminate(bus,fault("RTU_PROTOCOL"));
   if(bus.mode!=="persistent")return;
   const end=bus.output.indexOf("\n");if(end<0)return;
   const line=bus.output.slice(0,end);bus.output=bus.output.slice(end+1);
   if(bus.output.length||!bus.active)return terminate(bus,fault("RTU_PROTOCOL"));
   completeReply(bus,line);
  });
  child.once("close",code=>{
   clearTimeout(bus.killTimer);clearTimeout(bus.idleTimer);
   bus.child=null;
   if(bus.active){
    if(bus.failure)finish(bus,bus.failure);
    else if(bus.mode==="oneshot")completeReply(bus,bus.output.trim(),code);
    else finish(bus,fault("RTU_WORKER"));
   }
   bus.failure=null;drain(bus);
  });
 }
 function completeReply(bus,line,exitCode){
  const item=bus.active;let reply;
  if(performance.now()>=item.expires)return bus.child?terminate(bus,fault("RTU_TIMEOUT")):finish(bus,fault("RTU_TIMEOUT"));
  try{
   reply=JSON.parse(line);
   if(reply.ok&&exitCode!==undefined&&exitCode!==0)throw Error();
   if(bus.mode==="persistent"&&reply.id!==item.id)throw Error();
   if(!reply.ok){
    const code=/^MODBUS_EXCEPTION_[0-9]{1,3}$/.test(reply.code||"")?reply.code:
     ["BUS_BUSY","RTU_PROTOCOL","RTU_UNAVAILABLE"].includes(reply.code)?reply.code:"RTU_WORKER";
    const error=Error(code);error.code=code;return finish(bus,error);
   }
   if(!Array.isArray(reply.values)||reply.values.length!==item.req.count||reply.values.some(v=>
    !Number.isInteger(v)||v<0||v>(item.req.functionCode<=2?1:65535)))throw Error();
  }catch{return bus.child?terminate(bus,fault("RTU_PROTOCOL")):finish(bus,fault("RTU_PROTOCOL"));}
  finish(bus,null,reply.values);
 }
 function finish(bus,error,values){
  const item=bus.active;if(!item)return;
  clearTimeout(item.timer);item.options.signal?.removeEventListener("abort",item.abort);
  bus.active=null;
  if(error)item.reject(error);else item.resolve(values);
  // Persistent replies complete only one request. Next request uses the same owner.
  if(bus.child&&!bus.failure){
   clearTimeout(bus.idleTimer);
   bus.idleTimer=setTimeout(()=>terminate(bus,fault("STOPPED")),idleMs);
   bus.idleTimer.unref?.();
  }
  if(!bus.failure)drain(bus);
 }
 function drain(bus){
  if(bus.active||bus.failure)return;
  const item=bus.queue.shift();
  if(!item){if(!bus.child)buses.delete(bus.key);return;}
  clearTimeout(item.queueTimer);
  if(performance.now()>=item.queueExpires){
   item.options.signal?.removeEventListener("abort",item.abort);item.reject(fault("QUEUE_TIMEOUT"));drain(bus);return;
  }
  bus.active=item;
  if(!bus.child){try{launch(bus,item);}catch{finish(bus,fault("RTU_WORKER"));return;}}
  clearTimeout(bus.idleTimer);
  const timeout=Math.max(1800,(item.req.timeoutMs||1200)+2200);
  item.expires=performance.now()+timeout;
  item.timer=setTimeout(()=>terminate(bus,fault("RTU_TIMEOUT")),timeout);
  const data=JSON.stringify({...item.req,id:item.id})+"\n";
  if(bus.mode==="persistent")bus.child.stdin.write(data);else bus.child.stdin.end(data);
 }
 let sequence=0;
 function query(p,options={}){
  if(closed)return Promise.reject(fault("STOPPED"));
  if(!/^COM[1-9][0-9]{0,2}$|^\/dev\/tty(?:USB|ACM|S)[0-9]{1,3}$/i.test(p.comPort||""))return Promise.reject(Error("Invalid RS485 serial port"));
  if(![1,2,3,4].includes(p.functionCode))return Promise.reject(Error("Only read-only Modbus function codes allowed"));
  if(!Number.isInteger(p.address)||p.address<0||p.address>65535||!Number.isInteger(p.count)||p.count<1||p.count>(p.functionCode<=2?128:32)||p.address+p.count>65536)return Promise.reject(Error("Invalid Modbus address/count"));
  const req=Object.fromEntries(["comPort","baudrate","parity","stopbits","unitId","functionCode","address","count","timeoutMs"].map(k=>[k,p[k]]));
  // Windows COM is case insensitive; Linux device paths are case sensitive.
  const key=/^COM/i.test(p.comPort)?p.comPort.toUpperCase():p.comPort;
  req.comPort=key;
  if(options.signal?.aborted)return Promise.reject(fault("POLL_DEADLINE"));
  const mode=p.rtuMode||"oneshot",config=JSON.stringify([p.baudrate,p.parity,p.stopbits,mode,options.python||"",options.env?.PYTHONPATH||""]);
  let bus=buses.get(key);
  if(bus&&bus.config!==config)return Promise.reject(fault("BUS_CONFIG"));
  if(!bus){bus={key,config,mode,queue:[],active:null,child:null,failure:null};buses.set(key,bus);}
  if(bus.queue.length>=maxQueue)return Promise.reject(fault("QUEUE_FULL"));
  return new Promise((resolve,reject)=>{
   const item={req,options,resolve,reject,id:++sequence,queueExpires:performance.now()+queueTimeoutMs};
   item.abort=()=>{
    if(bus.active===item){terminate(bus,fault("POLL_DEADLINE"));return;}
    const i=bus.queue.indexOf(item);if(i>=0)bus.queue.splice(i,1);
    clearTimeout(item.queueTimer);options.signal?.removeEventListener("abort",item.abort);
    reject(fault("POLL_DEADLINE"));
   };
   item.queueTimer=setTimeout(()=>{
    const i=bus.queue.indexOf(item);if(i<0)return;bus.queue.splice(i,1);
    options.signal?.removeEventListener("abort",item.abort);reject(fault("QUEUE_TIMEOUT"));
   },queueTimeoutMs);
   options.signal?.addEventListener("abort",item.abort,{once:true});
   bus.queue.push(item);drain(bus);
  });
 }
 async function close(){
  closed=true;
  await Promise.all([...buses.values()].map(bus=>{
   for(const item of bus.queue.splice(0)){clearTimeout(item.queueTimer);item.options.signal?.removeEventListener("abort",item.abort);item.reject(fault("STOPPED"));}
   if(!bus.child)return Promise.resolve();
   return new Promise(resolve=>{bus.child.once("close",resolve);terminate(bus,fault("STOPPED"));});
  }));
 }
 return {query,close,stats:()=>[...buses.values()].map(b=>({active:!!b.active,queued:b.queue.length,worker:!!b.child}))};
}
const shared=createTransport();
module.exports={query:shared.query,createTransport};
