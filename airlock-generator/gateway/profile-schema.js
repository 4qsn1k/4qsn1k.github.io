"use strict";
const SCHEMA="airlock-scada-connection/1";
function validate(input){
 if(!input||input.schema!==SCHEMA)throw Error("invalid profile schema");
 const controllers=input.controllers||[],bindings=input.bindings||[];
 if(!Array.isArray(controllers)||!Array.isArray(bindings)||controllers.length>16||bindings.length>256)
  throw Error("invalid controller/binding limits");
 const ids=new Set();
 for(const c of controllers){
  if(!c||typeof c.id!=="string"||!c.id.trim()||ids.has(c.id))throw Error("duplicate/invalid controller ID");
  ids.add(c.id);
  if(c.protocol!=="modbus-tcp")throw Error("only Modbus TCP / TCP-RTU gateway is currently supported");
  if(typeof c.host!=="string"||!c.host.trim()||c.host.length>253||!/^[a-z0-9.:_-]+$/i.test(c.host))
   throw Error("invalid controller host");
  if(!Number.isInteger(c.port)||c.port<1||c.port>65535)throw Error("invalid TCP port");
  if(!Number.isInteger(c.unitId)||c.unitId<1||c.unitId>247)throw Error("invalid slave unitId");
  if(!Number.isInteger(c.timeoutMs)||c.timeoutMs<200||c.timeoutMs>5000)throw Error("invalid timeout");
 }
 const names=new Set();
 for(const b of bindings){
  if(!b||typeof b.signal!=="string"||!/^(ROOM_[a-zA-Z0-9_-]+\.State|DOOR_[a-zA-Z0-9_-]+\.(Closed|BlockRequested|GreenPermit)|SYSTEM\.FireNormal)$/.test(b.signal)||
   names.has(b.signal))throw Error("invalid or duplicate signal");
  names.add(b.signal);
  if(!ids.has(b.controllerId)||![1,2,3,4].includes(b.fc)||!Number.isInteger(b.address)||b.address<0||b.address>65535)
   throw Error("invalid binding for "+b.signal);
  // Physical DO/coil reads are deliberately disabled; only read-only Modbus functions.
 }
 const staleMs=input.staleMs??5000;
 const pollMs=input.pollMs??1500;
 if(!Number.isInteger(staleMs)||staleMs<1000||staleMs>60000||
  !Number.isInteger(pollMs)||pollMs<500||pollMs>30000||staleMs<=pollMs)
  throw Error("invalid poll or freshness interval");
 return {schema:SCHEMA,controllers,bindings,staleMs,pollMs};
}
module.exports={SCHEMA,validate};
