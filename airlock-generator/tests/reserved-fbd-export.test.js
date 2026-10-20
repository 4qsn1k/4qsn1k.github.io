'use strict';
const a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'airlock-export-'));
try{
 const cli=path.join(__dirname,'../scripts/export-reserved-fbd.js');
 const run=(mode,dir)=>cp.spawnSync(process.execPath,[cli,mode,dir],{encoding:'utf8'});
 const two=path.join(root,'two');let p=run('two',two);a.equal(p.status,0,p.stderr);
 const q=JSON.parse(fs.readFileSync(path.join(two,'qualification.json')));a.equal(q.native.nativeWires,194);
 a.equal(q.status,'NATIVE_GUI_NOT_VERIFIED');a.equal(q.native.compileVerified,false);
 const owle=path.join(two,'Airlock_ISSUE28_NATIVE_FBD_UNVERIFIED.owle');a(fs.statSync(owle).size>10000);
 p=run('two',two);a.equal(p.status,1);a.match(p.stderr,/REFUSE_OVERWRITE/);
 const seven=path.join(root,'seven');p=run('seven',seven);a.equal(p.status,2);
 const blocked=JSON.parse(fs.readFileSync(path.join(seven,'qualification.json')));a.match(blocked.nativeExportBlocked,/CANNOT_FIT_PR100_CAPTURE/);
 a(!fs.existsSync(path.join(seven,'Airlock_ISSUE28_NATIVE_FBD_UNVERIFIED.owle')));
 const budget=JSON.parse(fs.readFileSync(path.join(seven,'hardware.json')));a.equal(budget.required.di,16);a.equal(budget.required.relayDo,8);
 a.equal(budget.required.breakdown.busy,0);a(budget.primary.reservesMet);
 const csv=fs.readFileSync(path.join(seven,'io.csv'),'utf8');a(!csv.includes('"I9"'));a(csv.includes('VIRTUAL_UNASSIGNED'));
 console.log('RESERVED_EXPORT_QA PASS two-door real OWLE; seven-door explicit blocker; no equipment access');
}finally{fs.rmSync(root,{recursive:true,force:true});}
