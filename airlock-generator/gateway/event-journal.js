"use strict";
// Read-only bounded journal for SCADA observation. No PLC output commands.
const fs=require("node:fs");
function createJournal({filePath=null,maxEvents=500,maxFileBytes=5242880,maxArchives=3}={}){
 if(!Number.isInteger(maxFileBytes)||maxFileBytes<128||maxFileBytes>1073741824)throw Error("Invalid maximum journal file size");
 if(!Number.isInteger(maxArchives)||maxArchives<0||maxArchives>10)throw Error("Invalid journal archive count");
 if(!Number.isInteger(maxEvents)||maxEvents<10||maxEvents>5000)throw Error("Invalid journal capacity");
 const events=[],previous=new Map();
 function append(entry){
  if(!filePath)return;
  const data=JSON.stringify(entry)+"\n",bytes=Buffer.byteLength(data,"utf8");
  const exists=fs.existsSync(filePath),current=exists?fs.statSync(filePath).size:0;
  if(exists&&current>0&&current+bytes>maxFileBytes){
   if(maxArchives===0)fs.unlinkSync(filePath);
   else{
    const last=filePath+"."+maxArchives;
    if(fs.existsSync(last))fs.unlinkSync(last);
    for(let i=maxArchives-1;i>=1;i--){
     const source=filePath+"."+i,target=filePath+"."+(i+1);
     if(fs.existsSync(source))fs.renameSync(source,target);
    }
    fs.renameSync(filePath,filePath+".1");
   }
  }
  fs.appendFileSync(filePath,data,"utf8");
 }
 const emit=(at,type,controllerId,detail={})=>{
  const entry={at,type,controllerId,...detail};
  events.push(entry);
  if(events.length>maxEvents)events.splice(0,events.length-maxEvents);
  append(entry);
 };
 function observe(frame){
  if(!frame||!Number.isFinite(frame.timestamp)||!frame.controllers)return 0;
  const before=events.length;
  for(const [id,details] of Object.entries(frame.controllers)){
   const online=!!details.online;
   const raw=online&&details.raw&&typeof details.raw==="object"?details.raw:{};
   const last=previous.get(id);
   if(!last || last.online!==online){
    emit(frame.timestamp,online?"LINK_UP":"LINK_DOWN",id,
      online?{}:{reason:String(details.error||"no response").slice(0,120)});
   }
   if(online&&last?.online){
    for(const [signal,value] of Object.entries(raw)){
     if(Object.hasOwn(last.raw,signal)&&last.raw[signal]!==value){
      emit(frame.timestamp,"SIGNAL_CHANGED",id,{signal,from:last.raw[signal],to:value});
     }
    }
   }
   previous.set(id,{online,raw:{...raw}});
  }
  return events.length-before;
 }
 function recent(limit=Math.min(50,maxEvents)){
  if(!Number.isInteger(limit)||limit<1||limit>maxEvents)throw Error("Invalid journal read limit");
  return events.slice(-limit).reverse().map(x=>({...x}));
 }
 return {observe,recent,size:()=>events.length};
}
module.exports={createJournal};
