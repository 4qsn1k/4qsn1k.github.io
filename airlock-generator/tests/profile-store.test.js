"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {save,restore,read}=require("../gateway/profile-store");
const {validate}=require("../gateway/profile-schema");
const {load}=require("../gateway/telemetry");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"airlock-local-profile-")),file=path.join(tmp,"profile.json");
const p={schema:"airlock-scada-connection/1",controllers:[],bindings:[],model:{rooms:[],doors:[]},pollMs:500,staleMs:2000};
try{
 save(file,p);assert.equal(read(file).pollBudgetMs,10000);
 if(process.platform!=="win32")assert.equal(fs.statSync(file).mode&0o777,0o600);
 save(file,{...p,pollMs:700});assert.equal(read(file).pollMs,700);assert.equal(read(file+".bak").pollMs,500);
 const content=fs.readFileSync(file,"utf8"),backup=fs.readFileSync(file+".bak","utf8");
 for(const invalid of [{...p,schema:"unsupported/2"},{...p,controllers:[{}]},{...p,password:"do-not-save"},{...p,model:{...p.model,metadata:{apiToken:"do-not-save"}}}]){
  assert.throws(()=>save(file,invalid));assert.equal(fs.readFileSync(file,"utf8"),content);assert.equal(fs.readFileSync(file+".bak","utf8"),backup);
 }
 fs.writeFileSync(file,'{"broken":');assert.throws(()=>load(file),/PROFILE_JSON_INVALID/);
 restore(file);assert.equal(load(file).pollMs,500);assert.equal(fs.readFileSync(file+".bak","utf8"),backup);
 // Inject a target rename failure after its backup is durable; target stays valid and temp is cleaned.
 const rename=fs.renameSync;
 fs.renameSync=(from,to)=>{if(to===file)throw Error("simulated rename failure");return rename(from,to);};
 try{assert.throws(()=>save(file,{...p,pollMs:800}),/simulated/);}finally{fs.renameSync=rename;}
 assert.equal(read(file).pollMs,500);assert.equal(read(file+".bak").pollMs,500);
 assert.deepEqual(fs.readdirSync(tmp).sort(),["profile.json","profile.json.bak"]);
 assert.throws(()=>validate({...p,pollBudgetMs:60001}),/budget/);
 console.log("AIRLOCK_LOCAL_PROFILE_PASS schema validation, private permissions, atomic failure, backup and restore; no device access");
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
