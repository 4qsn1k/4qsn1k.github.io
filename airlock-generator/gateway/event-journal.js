"use strict";
// Read-only bounded journal for SCADA observation. No PLC output commands.
const fs=require("node:fs");
function createJournal({filePath=null,maxEvents=500}={}){
 if(!Number.isInteger(maxEvents)||maxEvents<10||maxEvents>5000)throw Error("Invalid journal capacity");
 const events=[],previous=new Map();
 const emit=(at,type,controllerId,detail={})=>{
  const entry={at,type,controllerId,...detail};
  events.push(entry);
  if(events.length>maxEvents)events.splice(0,events.length-maxEvents);
  if(filePath)fs.appendFileSync(filePath,JSON.stringify(entry)+"\n","utf8");
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
