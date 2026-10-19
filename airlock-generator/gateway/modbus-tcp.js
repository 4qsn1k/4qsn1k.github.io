"use strict";
// Read-only Modbus TCP client. Function codes 01/02/03/04 ONLY.
// Suitable for a Modbus TCP↔RTU gateway when its mode provides Modbus TCP frames.
const net=require("node:net");
const {fault}=require("./health-errors");
let nextId=1;
function query({host,port=502,unitId=1,functionCode,address,count=1,timeoutMs=1200,signal}){
 if(typeof host!=="string"||!host.trim()||host.length>253)throw Error("controller.host required");
 if(!Number.isInteger(port)||port<1||port>65535)throw Error("invalid TCP port");
 if(!Number.isInteger(unitId)||unitId<1||unitId>247)throw Error("invalid unit ID");
 if(![1,2,3,4].includes(functionCode))throw Error("read-only function code required");
 if(!Number.isInteger(address)||address<0||address>65535)throw Error("invalid zero-based register address");
 const max=functionCode<=2?128:32;
 if(!Number.isInteger(count)||count<1||count>max||address+count>65536)throw Error("invalid Modbus count");
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw Error("invalid request timeout");
 const id=nextId++&65535;
 const buffer=Buffer.alloc(12);
 buffer.writeUInt16BE(id,0);buffer.writeUInt16BE(0,2);buffer.writeUInt16BE(6,4);
 buffer.writeUInt8(unitId,6);buffer.writeUInt8(functionCode,7);
 buffer.writeUInt16BE(address,8);buffer.writeUInt16BE(count,10);
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(fault("POLL_DEADLINE"));
  const socket=net.createConnection({host,port});
  let done=false,received=Buffer.alloc(0);
  function finish(err,data){
   if(done)return;done=true;clearTimeout(deadline);signal?.removeEventListener("abort",abort);socket.destroy();
   if(err)reject(err);else resolve(data);
  }
  const abort=()=>finish(fault("POLL_DEADLINE"));
  const expires=performance.now()+timeoutMs;
  const deadline=setTimeout(()=>finish(fault("TCP_TIMEOUT")),timeoutMs);
  signal?.addEventListener("abort",abort,{once:true});
  socket.once("error",err=>finish(fault("TCP_UNAVAILABLE")));
  socket.once("end",()=>finish(fault("TCP_PROTOCOL")));
  socket.once("connect",()=>socket.write(buffer));
  socket.on("data",part=>{
   if(done)return;
   if(performance.now()>=expires)return finish(fault("TCP_TIMEOUT"));
   if(received.length+part.length>266)return finish(fault("TCP_PROTOCOL"));
   received=Buffer.concat([received,part]);
   if(received.length<7)return;
   const length=received.readUInt16BE(4);
   if(length<3||length>260)return finish(fault("TCP_PROTOCOL"));
   if(received.length<6+length)return;
   if(received.length!==6+length)return finish(fault("TCP_PROTOCOL"));
   if(received.readUInt16BE(0)!==id||received.readUInt16BE(2)!==0||
      received.readUInt8(6)!==unitId)return finish(fault("TCP_PROTOCOL"));
   const pdu=received.subarray(7,6+length);
   if(pdu[0]===(functionCode|128)){const e=Error("Modbus exception "+pdu[1]);e.code="MODBUS_EXCEPTION_"+pdu[1];return finish(e);}
   if(pdu[0]!==functionCode||pdu.length<2)return finish(fault("TCP_PROTOCOL"));
   const bytes=pdu[1],expected=functionCode<=2?Math.ceil(count/8):count*2;
   if(bytes!==expected||pdu.length!==2+bytes)return finish(fault("TCP_PROTOCOL"));
   const values=[];
   if(functionCode<=2){for(let i=0;i<count;i++)values.push((pdu[2+Math.floor(i/8)]>>(i%8))&1);}
   else{for(let i=0;i<count;i++)values.push(pdu.readUInt16BE(2+i*2));}
   finish(null,values);
  });
 });
}
module.exports={query};
