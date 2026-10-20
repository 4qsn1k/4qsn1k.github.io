#!/usr/bin/env node
"use strict";
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const f=require('../native-airlock-fbd'),h=require('../hardware-auto-selector');
function main(args){
 if(args.length!==2||!['two','seven'].includes(args[0]))throw Error('USAGE: node scripts/export-reserved-fbd.js two|seven NEW_DIRECTORY');
 const [mode,destination]=args,dir=path.resolve(destination);if(fs.existsSync(dir))throw Error('REFUSE_OVERWRITE');
 const config=mode==='two'?f.twoDoor():f.sevenDoor(require('../experimental/fixtures/real-cad-1252-1274-candidate.json'));
 const plan=f.build(config),hardware=h.select(plan.doors.length,{requestInputs:plan.doors.length,busyChannels:0,lampOutputsPerDoor:0});
 const files={'reserved-fbd-plan.json':JSON.stringify(plan,null,2)+'\n','hardware.json':JSON.stringify(hardware,null,2)+'\n'};
 const rows=[['signal','role','deviceChannel','physicalTerminal','status']];
 const testMap=mode==='two'?{CLOSED_A:'I1',CLOSED_B:'I2',REQUEST_A:'I3',REQUEST_B:'I4',FIRE_NORMAL:'I5',RESET:'I6',DATA_HEALTHY:'I7',PERMIT_A:'Q1',PERMIT_B:'Q2',BUZZER:'Q3',FAULT_LATCH:'Q4'}:{};
 for(const n of plan.nodes.filter(n=>n.kind==='INPUT'||n.kind==='OUTPUT'))rows.push([n.id,n.role||'LOGICAL_INPUT',testMap[n.id]||'', '',testMap[n.id]?'SIMULATOR_TEST_ONLY':'VIRTUAL_UNASSIGNED']);
 files['io.csv']=rows.map(r=>r.map(x=>'"'+x.replaceAll('"','""')+'"').join(';')).join('\r\n')+'\r\n';
 fs.mkdirSync(dir,{recursive:false});
 for(const [name,content]of Object.entries(files))fs.writeFileSync(path.join(dir,name),content,{flag:'wx'});
 const report={mode,status:'NATIVE_GUI_NOT_VERIFIED',physicalDeviceWrites:0};
 const proc=cp.spawnSync(process.env.PYTHON||'python',['-B',path.join(__dirname,'../experimental/native-reserved-owle.py'),
  '--plan',path.join(dir,'reserved-fbd-plan.json'),'--capture',path.join(__dirname,'../experimental/native-gui/Issue28_PR100_PRIMITIVES_GUI_CAPTURE.owle'),
  '--output',path.join(dir,'Airlock_ISSUE28_NATIVE_FBD_UNVERIFIED.owle')],{encoding:'utf8'});
 if(proc.status===0){report.native=JSON.parse(proc.stdout);}else{report.nativeExportBlocked=proc.error?.message||proc.stderr.trim();}
 fs.writeFileSync(path.join(dir,'qualification.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report,null,2));return report;
}
if(require.main===module){try{const r=main(process.argv.slice(2));if(r.nativeExportBlocked)process.exitCode=2;}
 catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={main};
