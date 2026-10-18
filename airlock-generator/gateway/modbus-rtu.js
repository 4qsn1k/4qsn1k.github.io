"use strict";
// One-shot read-only Python/pymodbus 3.15 adapter. COM port never opened by Node.
const path=require("node:path"),{spawn}=require("node:child_process");
const worker=path.join(__dirname,"modbus-rtu-worker.py");
function query(p,options={}){
 const req={comPort:p.comPort,baudrate:p.baudrate,parity:p.parity,stopbits:p.stopbits,
   unitId:p.unitId,functionCode:p.functionCode,address:p.address,count:p.count,timeoutMs:p.timeoutMs};
 if(!/^COM[1-9][0-9]{0,2}$|^\/dev\/tty(?:USB|ACM|S)[0-9]{1,3}$/i.test(req.comPort||""))
  return Promise.reject(Error("Invalid RS485 serial port"));
 if(![1,2,3,4].includes(req.functionCode))
  return Promise.reject(Error("Only read-only Modbus function codes allowed"));
 if(!Number.isInteger(req.address)||req.address<0||req.address>65535||
    !Number.isInteger(req.count)||req.count<1||req.count>(req.functionCode<=2?128:32)||
    req.address+req.count>65536)return Promise.reject(Error("Invalid Modbus address/count"));
 const py=options.python||process.env.AIRLOCK_PYTHON||(process.platform==="win32"?"python":"python3");
 const args=/^py(?:\.exe)?$/i.test(path.basename(py))?["-3",worker]:[worker];
 return new Promise((resolve,reject)=>{
  const child=spawn(py,args,{stdio:["pipe","pipe","pipe"],windowsHide:true,shell:false,
    env:options.env||process.env});
  let stdout="",stderr="",done=false;
  const finish=(error,values)=>{
   if(done)return;done=true;clearTimeout(timer);
   if(error)reject(error);else resolve(values);
  };
  const timer=setTimeout(()=>{child.kill();finish(Error("RS485 worker timeout"));},
    Math.max(1800,(req.timeoutMs||1200)+2200));
  child.on("error",e=>finish(Error("Python RTU worker failed: "+e.message)));
  child.stdout.on("data",part=>{
   stdout+=part.toString("utf8");
   if(stdout.length>4096){child.kill();finish(Error("RTU response too long"));}
  });
  child.stderr.on("data",part=>{if(stderr.length<1024)stderr+=part.toString("utf8");});
  child.on("close",code=>{
   if(done)return;
   try{
    const r=JSON.parse(stdout.trim());
    if(code!==0||!r.ok||!Array.isArray(r.values))
     throw Error("RS485: "+String(r.error||stderr||"worker failed").slice(0,175));
    if(r.values.length!==req.count||r.values.some(x=>!Number.isInteger(x)||x<0||x>(req.functionCode<=2?1:65535)))
     throw Error("Invalid RTU response values");
    finish(null,r.values);
   }catch(e){finish(e);}
  });
  child.stdin.on("error",()=>{});
  child.stdin.end(JSON.stringify(req));
 });
}
module.exports={query};
