#!/usr/bin/env node
"use strict";
/* Deterministic reference vectors to port the existing Issue 28 request
 * reservation model into vendor ST. NOT proof of Owen Logic scan semantics.
 * No networking, COM ports, PLC I/O or external dependencies.
 */
const fs=require("node:fs");
const path=require("node:path");
const f=require("../native-airlock-fbd.js");
const candidate=require("../experimental/fixtures/real-cad-1252-1274-candidate.json");
function initial(config){
 const inp={FIRE_NORMAL:true,DATA_HEALTHY:true,RESET:false};
 for(const d of config.doors){inp["CLOSED_"+d.id]=true;inp["REQUEST_"+d.id]=false;}
 return inp;
}
function rig(config){
 const sim=f.simulator(f.build(config));return {sim,ready:sim.step(initial(config),10000)};
}
function pick(v){return {timeMs:v.timeMs,permit:v.permit,ready:v.ready,
 reserved:v.reserved, fault:v.fault, buzzer:v.buzzer, emergency:v.emergency,
 overtime:v.overtime};}
function traceTwo(){
 const config=f.twoDoor(),sim=f.simulator(f.build(config)),results=[];
 const emit=(label,changes={},advanceMs=0)=>{
  const v=sim.step(changes,advanceMs);
  results.push({label,changes,advanceMs,expected:pick(v)});
 };
 emit("startup_all_closed",initial(config),0);
 emit("startup_9s",{},9000);
 emit("startup_9_9s",{},900);
 emit("startup_10s",{},100);
 emit("same_scan_A_B_requests",{REQUEST_A:true,REQUEST_B:true});
 emit("A_open",{CLOSED_A:false},40);
 emit("A_close_requests_released",{CLOSED_A:true,REQUEST_A:false,REQUEST_B:false});
 emit("post_close_9s",{},9000);
 emit("post_close_9_9s",{},900);
 emit("post_close_10s",{},100);
 emit("fresh_B_request",{REQUEST_B:true});
 return results;
}
function exhaustiveSeven(){
 const config=f.sevenDoor(candidate),result=[];
 for(let mask=0;mask<128;mask++){
  const {sim}=rig(config);
  const changes={};config.doors.forEach((d,i)=>{changes["REQUEST_"+d.id]=!!(mask&(1<<i));});
  const v=sim.step(changes);
  result.push({mask,requested:config.doors.filter((d,i)=>!!(mask&(1<<i))).map(d=>d.id),
    granted:config.doors.filter(d=>v.permit[d.id]).map(d=>d.id),
    fault:v.fault,buzzer:v.buzzer});
 }
 return result;
}
function buildVectors(){
 const cfg=f.sevenDoor(candidate),two=f.twoDoor();
 return {schema:"airlock-st-reference-vectors/1",qualification:"JS_REFERENCE_ONLY_NOT_NATIVE_OWEN",
  physicalDeviceWrites:0,physicalBusyDo:0,
  twoDoorPriority:two.priority,sevenDoorPriority:cfg.priority,
  sevenDoorGroups:cfg.groups,tenSecondHoldMs:10000,unusedGrantTestMs:5000,
  openOvertimeMs:30000,twoDoorTrace:traceTwo(),all128SevenDoorRequests:exhaustiveSeven()};
}
function save(filename){
 if(!filename||path.extname(filename).toLowerCase()!==".json")throw Error("USAGE_JSON_OUTPUT");
 const dest=path.resolve(filename);if(fs.existsSync(dest))throw Error("REFUSE_OVERWRITE");
 const content=JSON.stringify(buildVectors(),null,2)+"\n";
 fs.writeFileSync(dest,content,{encoding:"utf8",flag:"wx"});
 console.log("ST_REFERENCE_VECTORS_PASS "+dest);return dest;
}
if(require.main===module){try{save(process.argv[2]);}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={buildVectors,save};
