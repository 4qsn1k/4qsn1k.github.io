"use strict";
const SCHEMA="airlock-scada-connection/1";
function validate(input){
 if(!input||input.schema!==SCHEMA)throw Error("invalid profile schema");
 const controllers=input.controllers||[],bindings=input.bindings||[];
 if(!Array.isArray(controllers)||!Array.isArray(bindings)||controllers.length>16||bindings.length>256)
  throw Error("invalid controller/binding limits");
 const ids=new Set(),buses=new Map(),endpoints=new Set();
 for(const c of controllers){
  if(!c||typeof c.id!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(c.id)||["constructor","prototype","__proto__"].includes(c.id)||ids.has(c.id))throw Error("duplicate/invalid controller ID");
  ids.add(c.id);
  if(!["modbus-tcp","modbus-rtu"].includes(c.protocol))throw Error("unsupported Modbus transport");
  if(c.protocol==="modbus-tcp"){
   if(typeof c.host!=="string"||!c.host.trim()||c.host.length>253||!/^[a-z0-9.:_-]+$/i.test(c.host))
    throw Error("invalid controller host");
   if(!Number.isInteger(c.port)||c.port<1||c.port>65535)throw Error("invalid TCP port");
  }else{
   if(typeof c.comPort!=="string"||!/^COM[1-9][0-9]{0,2}$|^\/dev\/tty(?:USB|ACM|S)[0-9]{1,3}$/i.test(c.comPort))
    throw Error("invalid RS485 port");
   if(![1200,2400,4800,9600,19200,38400,57600,115200].includes(c.baudrate))
    throw Error("invalid RS485 baudrate");
   if(!["N","E","O"].includes(c.parity)||![1,2].includes(c.stopbits))
    throw Error("invalid RS485 parity / stopbits");
  }
  if(c.rtuMode!==undefined&&!["oneshot","persistent"].includes(c.rtuMode))throw Error("invalid RTU mode");
  if(c.protocol==="modbus-rtu"){
   const key=/^COM/i.test(c.comPort)?c.comPort.toUpperCase():c.comPort;
   const config=JSON.stringify([c.baudrate,c.parity,c.stopbits,c.rtuMode||"oneshot"]);
   if(buses.has(key)&&buses.get(key)!==config)throw Error("conflicting serial bus configuration");
   buses.set(key,config);
   const endpoint=key+":"+c.unitId;
   if(endpoints.has(endpoint))throw Error("duplicate serial unit");
   endpoints.add(endpoint);
  }
  if(!Number.isInteger(c.unitId)||c.unitId<1||c.unitId>247)throw Error("invalid slave unitId");
  if(!Number.isInteger(c.timeoutMs)||c.timeoutMs<200||c.timeoutMs>5000)throw Error("invalid timeout");
 }
 const names=new Set();
 for(const b of bindings){
  if(!b||typeof b.signal!=="string"||!/^(ROOM_[a-zA-Z0-9_-]+\.State|DOOR_[a-zA-Z0-9_-]+\.(Closed|BlockRequested|GreenPermit)|SYSTEM\.FireNormal|PLC_[a-zA-Z0-9_-]+\.(DI[1-9][0-9]*|Q[1-9][0-9]*))$/.test(b.signal)||
   names.has(b.signal))throw Error("invalid or duplicate signal");
  names.add(b.signal);
  if(!ids.has(b.controllerId)||![1,2,3,4].includes(b.fc)||!Number.isInteger(b.address)||b.address<0||b.address>65535)
   throw Error("invalid binding for "+b.signal);
  if(b.signal.startsWith("PLC_")&&!b.signal.startsWith("PLC_"+b.controllerId+"."))throw Error("diagnostic signal controller mismatch");
  // Physical DO/coil reads are deliberately disabled; only read-only Modbus functions.
 }
 const pollBudgetMs=input.pollBudgetMs??10000;
 if(!Number.isInteger(pollBudgetMs)||pollBudgetMs<1000||pollBudgetMs>60000)throw Error("invalid poll budget");
 const staleMs=input.staleMs??5000;
 const pollMs=input.pollMs??1500;
 if(!Number.isInteger(staleMs)||staleMs<1000||staleMs>60000||
  !Number.isInteger(pollMs)||pollMs<500||pollMs>30000||staleMs<=pollMs)
  throw Error("invalid poll or freshness interval");
 return {schema:SCHEMA,controllers,bindings,staleMs,pollMs,pollBudgetMs};
}
module.exports={SCHEMA,validate};
