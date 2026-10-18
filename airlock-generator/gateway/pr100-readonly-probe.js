"use strict";
// Standalone, READ-ONLY diagnostic for an isolated PR100 RS485 lab controller.
// No writes, no Owen Logic program changes, no Telegram, no access control actions.
const fs=require("node:fs");
const {query}=require("./modbus-rtu");
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function parse(argv){
 const options={comPort:"COM3",baudrate:9600,parity:"N",stopbits:1,unitId:16,
  timeoutMs:1200,cycles:1,intervalMs:1500,logFile:null};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];if(!arg.startsWith("--")||i+1>=argv.length)throw Error("Invalid argument "+arg);
  const value=argv[++i];
  const names={"--com":"comPort","--baud":"baudrate","--parity":"parity",
   "--stopbits":"stopbits","--unit":"unitId","--timeout":"timeoutMs",
   "--cycles":"cycles","--interval":"intervalMs","--log":"logFile"};
  const name=names[arg];if(!name)throw Error("Unknown argument "+arg);
  options[name]=["comPort","parity","logFile"].includes(name)?value:Number(value);
 }
 options.comPort=String(options.comPort).toUpperCase();
 if(!/^COM[1-9][0-9]{0,2}$|^\/dev\/tty(?:USB|ACM|S)[0-9]{1,3}$/i.test(options.comPort)||
   ![1200,2400,4800,9600,19200,38400,57600,115200].includes(options.baudrate)||
   !["N","E","O"].includes(options.parity)||![1,2].includes(options.stopbits)||
   !Number.isInteger(options.unitId)||options.unitId<1||options.unitId>247||
   !Number.isInteger(options.cycles)||options.cycles<1||options.cycles>3600||
   !Number.isInteger(options.intervalMs)||options.intervalMs<500||options.intervalMs>60000||
   !Number.isInteger(options.timeoutMs)||options.timeoutMs<200||options.timeoutMs>5000)
  throw Error("Invalid COM, speed, parity, slave or monitoring interval");
 return options;
}
async function readOnce(c,transport=query){
 const base={comPort:c.comPort,baudrate:c.baudrate,parity:c.parity,
   stopbits:c.stopbits,unitId:c.unitId,timeoutMs:c.timeoutMs};
 const di=await transport({...base,functionCode:2,address:4096,count:8});
 const q=await transport({...base,functionCode:1,address:0,count:8});
 return {at:new Date().toISOString(),device:"PR100",comPort:c.comPort,unitId:c.unitId,
  di:Object.fromEntries(di.map((value,i)=>["DI"+(i+1),value])),
  q:Object.fromEntries(q.map((value,i)=>["Q"+(i+1),value]))};
}
async function run(c,transport=query,logger=console){
 logger.log("PR100 READ ONLY | "+c.comPort+" | "+c.baudrate+" 8"+c.parity+c.stopbits+
  " | Slave "+c.unitId+" | Modbus FC02/FC01");
 let previous=null;
 for(let i=0;i<c.cycles;i++){
  const result=await readOnce(c,transport);
  const changes=[];
  for(const group of ["di","q"])for(const [key,value] of Object.entries(result[group]))
   if(previous&&previous[group][key]!==value)changes.push(key+": "+previous[group][key]+" -> "+value);
  logger.log(result.at+"  "+Object.entries(result.di).map(([k,v])=>k+"="+v).join(" ")+
   " | "+Object.entries(result.q).map(([k,v])=>k+"="+v).join(" "));
  if(changes.length)logger.log("ИЗМЕНЕНИЯ: "+changes.join("; "));
  if(c.logFile)fs.appendFileSync(c.logFile,JSON.stringify({...result,changes})+"\n","utf8");
  previous=result;
  if(i<c.cycles-1)await wait(c.intervalMs);
 }
 return previous;
}
if(require.main===module){
 try{run(parse(process.argv.slice(2))).catch(e=>{console.error("НЕТ СВЯЗИ: "+e.message);process.exitCode=1;});}
 catch(e){console.error("Ошибка параметров: "+e.message);process.exitCode=2;}
}
module.exports={parse,readOnce,run};
