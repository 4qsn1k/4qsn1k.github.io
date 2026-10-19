"use strict";
const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {load,createPoller}=require("./telemetry");
const {createJournal}=require("./event-journal");
const files={
 "/scada.html":["scada.html","text/html; charset=utf-8"],
 "/scada.js":["scada.js","text/javascript; charset=utf-8"],
 "/scada.css":["scada.css","text/css; charset=utf-8"],
 "/project-package.js":["project-package.js","text/javascript; charset=utf-8"]
};
function start({configPath,host="127.0.0.1",port=8787,logger=console,pollerFactory=createPoller}){
 if(!["127.0.0.1","::1"].includes(host))throw Error("Refusing non-loopback host. Use a tunnel for remote users.");
 const project=load(configPath);
 const poller=pollerFactory(project);
 const journal=createJournal({filePath:process.env.AIRLOCK_EVENT_LOG||null});
 const portControlToken=crypto.randomBytes(24).toString("hex");
 const tick=()=>{
  if(poller.tick){try{journal.observe(poller.tick());}catch{logger.error("POLL_OBSERVATION_FAILED");}return;}
  // Compatibility for injected/legacy pollers; never attach unlimited waiters.
  if(tick.pending)return;
  tick.pending=true;Promise.resolve().then(()=>poller.poll()).then(frame=>journal.observe(frame))
   .catch(()=>logger.error("POLL_OBSERVATION_FAILED")).finally(()=>{tick.pending=false;});
 };
 const request=(req,res)=>{
  const url=(req.url||"").split("?")[0];
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if(req.method==="POST"&&url.startsWith("/api/ports/")){
   const match=/^\/api\/ports\/(COM[1-9][0-9]{0,2})\/(release|resume)$/.exec(url);
   const configured=match&&project.controllers.some(c=>c.protocol==="modbus-rtu"&&
     c.comPort.toUpperCase()===match[1]);
   if(!match||!configured){res.writeHead(404);res.end("Unknown port");return;}
   const actualHost=host+":"+server.address()?.port;
   const authenticated=req.headers.host===actualHost&&
     req.headers.origin==="http://"+actualHost&&
     req.headers["x-airlock-control"]===portControlToken&&
     req.headers["content-length"]==="0";
   if(!authenticated){res.writeHead(403);res.end("Local operator confirmation required");return;}
   const status=poller.portStatus?.().find(c=>c.port===match[1]);
   if(!status){res.writeHead(503);res.end("Port control unavailable");return;}
   const action=match[2],port=match[1];
   const work=action==="release"?poller.pausePort(port):poller.resumePort(port);
   Promise.resolve(work).then(result=>{
    if(res.writableEnded)return;
    journal.observe(poller.get());
    res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});
    res.end(JSON.stringify({ok:true,action,...result}));
   }).catch(()=>{
    if(res.writableEnded)return;
    journal.observe(poller.get());
    res.writeHead(503,{"Content-Type":"application/json; charset=utf-8"});
    res.end(JSON.stringify({ok:false,error:"PORT_CONTROL_UNCONFIRMED"}));
   });
   return;
  }
  if(req.method!=="GET"){res.writeHead(405,{"Allow":"GET"});res.end("Read-only monitor");return;}
  if(url==="/api/ports"){
   res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});
   res.end(JSON.stringify({ports:poller.portStatus?.()||[],controlToken:portControlToken}));
   return;
  }
  if(url==="/") {res.writeHead(302,{Location:"/scada.html"});res.end();return;}
  if(url==="/api/project"){
   // Server keeps controller IP/unit data private from the page. Only topology is exposed.
   res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});
   res.end(JSON.stringify({schema:project.schema,model:project.model,
     controllers:project.controllers.map(c=>({id:c.id,model:c.model||"",protocol:c.protocol,redacted:true})),bindings:project.bindings.map(b=>({signal:b.signal,controllerId:b.controllerId,fc:b.fc,address:b.address})),
     mode:"real-read-only",pollMs:project.pollMs,staleMs:project.staleMs}));
   return;
  }
  if(url==="/api/events"){
   res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});
   journal.observe(poller.get());
   res.end(JSON.stringify({events:journal.recent(50),journal:journal.status()}));return;
  }
    if(url==="/api/status"){
   res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});
   const frame=poller.get();journal.observe(frame);
   res.end(JSON.stringify(frame));return;
  }
  if(files[url]){
   const [filename,type]=files[url];const filenameAbs=path.join(__dirname,"..",filename);
   try{const data=fs.readFileSync(filenameAbs);res.writeHead(200,{"Content-Type":type});res.end(data);}
   catch{res.writeHead(500);res.end("file missing");}
   return;
  }
  res.writeHead(404);res.end("Not found");
 };
 const server=http.createServer(request);
 const timer=setInterval(tick,Math.min(100,project.pollMs));
 timer.unref?.();
 tick();
 server.listen(port,host,()=>logger.log("AIRLOCK_SCADA_LOCAL http://"+host+":"+server.address().port+"/scada.html"));
 return {server,poller,journal,close:async()=>{clearInterval(timer);await poller.close?.();return new Promise(resolve=>server.close(resolve));}};
}
if(require.main===module){
 const args=process.argv.slice(2),index=args.indexOf("--config");
 if(index<0||!args[index+1]){
  console.error("Usage: node gateway/server.js --config C:\\path\\airlock-connection.json [--port 8787]");
  process.exitCode=2;
 }else{
  const portIndex=args.indexOf("--port");
  const port=portIndex<0?8787:Number(args[portIndex+1]);
  if(!Number.isInteger(port)||port<0||port>65535){console.error("Invalid port");process.exitCode=2;}
  else{try{const app=start({configPath:args[index+1],port});
   for(const signal of ["SIGINT","SIGTERM"])process.once(signal,()=>{app.close().catch(()=>{process.exitCode=1;});});}
   catch(e){console.error("SCADA_NOT_STARTED: invalid or unavailable local configuration");process.exitCode=1;}}
 }
}
module.exports={start};
