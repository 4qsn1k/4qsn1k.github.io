"use strict";
// Local-only profile operations. No sockets, serial imports, or browser mutation API.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {validate}=require("./profile-schema");
const MAX_BYTES=1024*1024;
function decode(text){
 let data;try{if(Buffer.byteLength(text)>MAX_BYTES)throw Error();data=JSON.parse(text);}catch{throw Error("PROFILE_JSON_INVALID");}
 const result=validate(data),model=data.package?.model||data.model;
 if(!model||!Array.isArray(model.rooms)||!Array.isArray(model.doors))throw Error("project.model missing");
 // Reject secrets anywhere, including nested model extensions. Error names reveal no values.
 function inspect(value){
  if(!value||typeof value!=="object")return;
  for(const [key,item] of Object.entries(value)){
   if(/password|passwd|secret|token|credential/i.test(key))throw Error("PROFILE_SECRET_FIELD_REFUSED");
   inspect(item);
  }
 }
 inspect(data);
 const controllerKeys=["id","model","protocol","host","port","comPort","baudrate","parity","stopbits","unitId","timeoutMs","rtuMode"];
 return {...result,controllers:result.controllers.map(c=>Object.fromEntries(controllerKeys.filter(k=>Object.hasOwn(c,k)).map(k=>[k,c[k]]))),
  bindings:result.bindings.map(b=>({signal:b.signal,controllerId:b.controllerId,fc:b.fc,address:b.address})),model};
}
function read(file){
 const absolute=path.resolve(file);
 if(fs.statSync(absolute).size>MAX_BYTES)throw Error("PROFILE_TOO_LARGE");
 return decode(fs.readFileSync(absolute,"utf8"));
}
function atomic(file,text){
 const target=path.resolve(file),temp=target+".tmp-"+crypto.randomBytes(8).toString("hex");let fd;
 try{
  fd=fs.openSync(temp,"wx",0o600);fs.writeFileSync(fd,text,"utf8");fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  fs.renameSync(temp,target);
  // Directory fsync is unavailable on some Windows filesystems.
  if(process.platform!=="win32"){const directory=fs.openSync(path.dirname(target),"r");try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}}
 }finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function save(file,input){
 const profile=decode(JSON.stringify(input));
 if(fs.existsSync(file)){const previous=read(file);atomic(file+".bak",JSON.stringify(previous,null,2)+"\n");}
 atomic(file,JSON.stringify(profile,null,2)+"\n");return profile;
}
function restore(file){
 const backup=read(file+".bak");atomic(file,JSON.stringify(backup,null,2)+"\n");return backup;
}
if(require.main===module){
 const [action,target,source]=process.argv.slice(2);
 try{
  if(action==="restore"&&target)restore(target);
  else if(action==="save"&&target&&source)save(target,read(source));
  else throw Error("Usage: profile-store.js save <local-target> <local-source> | restore <local-target>");
  console.log("LOCAL_PROFILE_OK; NO_POLL_PERFORMED");
 }catch{console.error("LOCAL_PROFILE_FAILED; inspect local profile privately");process.exitCode=2;}
}
module.exports={read,decode,save,restore};
