"use strict";
/* Connect reviewed S2000-2 reader/BUSY plan to Owen DI/DO shortlist.
 * The existing generic estimator's `readers` is NOT physical BUSY count:
 * per-reader Receive BUSY flags select consumers of one common pin.
 */
const busy=require("./s2000-2-busy-planner.js");
const sizing=require("./hardware-auto-selector.js");
const integer=(v,key)=>{if(!Number.isSafeInteger(v)||v<0)throw Error("BAD_"+key);return v};
function estimate(physicalDoors,scudDevices,settings={}){
 integer(physicalDoors,"PHYSICAL_DOORS");
 const access=busy.assessSystem(scudDevices);
 const readers=access.controllers.reduce((n,d)=>n+d.channels.filter(c=>c.hasCardReader).length,0);
 if(readers>physicalDoors)throw Error("ACCESS_CHANNELS_EXCEED_DOORS");
 if(access.status==="NOT_FEASIBLE_USING_ONLY_BUSY"){
  return {schema:"airlock-access-hardware-sizing/1",status:"STOP_UNRESOLVABLE_BUSY_DOMAINS",
   access,hardware:null,
   note:"Independent blocking of two channels using two different 10-second zone timers cannot use one shared physical BUSY terminal; do not size an invented BUSY output."};
 }
 if(settings.busyChannels!==undefined||settings.readers!==undefined)
  throw Error("DERIVED_ACCESS_RESOURCES_CANNOT_BE_OVERRIDDEN");
 const sizingPlan=sizing.select(physicalDoors,{
  ...settings,readers,busyChannels:access.plannedIsolatedPlcBusyOutputs
 });
 return {
  schema:"airlock-access-hardware-sizing/1",
  status:"CAPACITY_SHORTLIST_NOT_DEVICE_CONFIGURATION",
  access,hardware:sizingPlan,
  resourceBasis:{cardReaderChannels:readers,physicalS2000Controllers:scudDevices.length,
   physicalBusyTerminals:access.physicalBusyTerminalCount,
   separatePlcBusyOutputs:access.plannedIsolatedPlcBusyOutputs},
  restrictions:[
   "RS-485 controller link is not an independently approved safety interlock",
   "Shared BUSY does not allow independent zones on both readers when both accept BUSY",
   "Active BUSY inhibits standard EXIT button and remote access commands for the configured reader",
   "Fire, emergency egress, physical lock polarity and button wiring are separate safety gates"
  ]
 };
}
module.exports={estimate};
