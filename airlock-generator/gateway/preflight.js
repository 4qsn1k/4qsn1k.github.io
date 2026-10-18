"use strict";
// Read-only Airlock Telemetry preflight. Does NOT open serial ports or TCP sockets.
const fs=require("node:fs");
const {load}=require("./telemetry");
const {validate}=require("./profile-schema");
function inspect(profile){
 if(!profile||typeof profile!=="object")throw Error("Profile is required");
 validate(profile);
 const errors=[],warnings=[];
 if(!Array.isArray(profile.controllers)||profile.controllers.length===0)
  errors.push("NO_CONTROLLERS: add a real, confirmed PR profile");
 if(!Array.isArray(profile.bindings)||profile.bindings.length===0)
  errors.push("NO_BINDINGS: assign confirmed read-only Modbus addresses");
 for(const c of profile.controllers||[]){
  const count=(profile.bindings||[]).filter(b=>b.controllerId===c.id).length;
  if(count===0)errors.push("NO_READS "+c.id);
  if(c.protocol==="modbus-rtu"){
   warnings.push("SERIAL "+c.id+": verify COM/Unit ID and isolated RS485 Slave before attempting any live read");
  }else{
   warnings.push("TCP "+c.id+": network endpoint MUST be on the authorized isolated test network");
  }
 }
 const signals=new Set((profile.bindings||[]).map(b=>b.signal));
 for(const required of ["SYSTEM.FireNormal"]){
  if(!signals.has(required))warnings.push("NOT_MAPPED "+required+": SCADA will not confirm room READY/GREEN");
 }
 const rooms=Array.isArray(profile.model?.rooms)?profile.model.rooms.length:0;
 const doors=Array.isArray(profile.model?.doors)?profile.model.doors.length:0;
 if(!rooms||!doors)errors.push("MODEL_EMPTY: missing room/door topology");
 return {ok:errors.length===0,controllerCount:(profile.controllers||[]).length,
  bindingCount:(profile.bindings||[]).length,rooms,doors,errors,warnings,
  hardwareConnectivity:"NOT_TESTED",writesAllowed:false};
}
function run(args=process.argv.slice(2),output=console){
 const idx=args.indexOf("--config");
 if(idx<0||!args[idx+1])throw Error("Usage: node gateway/preflight.js --config <local connection.json>");
 const path=require("node:path").resolve(args[idx+1]);
 if(!fs.existsSync(path))throw Error("Config file missing");
 const result=inspect(load(path));
 output.log(JSON.stringify(result,null,2));
 if(!result.ok)process.exitCode=2;
 return result;
}
if(require.main===module){
 try{run();}catch(e){console.error("PREFLIGHT_FAILED: "+e.message);process.exitCode=2;}
}
module.exports={inspect,run};
