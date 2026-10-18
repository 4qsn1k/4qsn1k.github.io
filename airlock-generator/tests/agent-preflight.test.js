"use strict";
// Non-invasive agent start checks; NEVER open COM ports or connect to a PLC.
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {inspect,run}=require("../gateway/preflight");
const model=require("../model.json");
let n=0;
function pass(label){n++;console.log("PASS PREFLIGHT "+label)}
const base={schema:"airlock-scada-connection/1",model,controllers:[{id:"PR1",protocol:"modbus-rtu",
 comPort:"COM3",baudrate:9600,parity:"N",stopbits:1,unitId:16,timeoutMs:1200}],
 bindings:[{signal:"PLC_PR1.DI1",controllerId:"PR1",fc:2,address:4096}],pollMs:1500,staleMs:5000};
const a=inspect(base);
assert.equal(a.ok,true);assert.equal(a.hardwareConnectivity,"NOT_TESTED");assert.equal(a.writesAllowed,false);
pass("valid read-only serial profile; no hardware claims");
const b=inspect({...base,controllers:[],bindings:[]});
assert.equal(b.ok,false);assert(b.errors.some(e=>e.startsWith("NO_CONTROLLERS")));
pass("empty unconfigured profile never starts agent");
const c=inspect({...base,bindings:[]});
assert.equal(c.ok,false);assert(c.errors.some(e=>e.startsWith("NO_READS")));
pass("missing serial bindings never count as ONLINE");
const bad=JSON.parse(JSON.stringify(base));bad.bindings[0].fc=6;
assert.throws(()=>inspect(bad),/invalid binding/);
pass("invalid or write FC rejected during preflight");
const tcp={...base,controllers:[{id:"PR1",protocol:"modbus-tcp",host:"127.0.0.1",port:502,
 unitId:16,timeoutMs:1000}]};
assert.equal(inspect(tcp).ok,true);
pass("TCP and RTU configurations use shared preflight");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-preflight-"));
try{
 const file=path.join(dir,"connection.json");fs.writeFileSync(file,JSON.stringify(base));
 const messages=[];
 assert.equal(run(["--config",file],{log:s=>messages.push(s)}).ok,true);
 assert(messages.join("\n").includes("NOT_TESTED"));
 pass("CLI parse/load is read-only, prints NOT_TESTED");
}finally{fs.rmSync(dir,{recursive:true,force:true});}
const scriptRoot=path.join(__dirname,"..","scripts","windows");
const install=fs.readFileSync(path.join(scriptRoot,"register-telemetry-task.ps1"),"utf8");
const launch=fs.readFileSync(path.join(scriptRoot,"start-telemetry-agent.ps1"),"utf8");
assert(install.includes('DRY_RUN_ONLY')&&install.includes('if(-not($Install -or $Remove))'));
assert(install.includes('PRECHECK_FAIL')&&launch.includes('PROFILE_NOT_READY_NO_PLC_POLL_PERFORMED'));
assert(!launch.includes("modbus-write")&&!install.includes("Start-ScheduledTask"));
pass("Windows scheduler defaults to safe dry run and never auto-starts");
console.log("AIRLOCK_AGENT_PREFLIGHT_QA_PASS "+n+"/7");
