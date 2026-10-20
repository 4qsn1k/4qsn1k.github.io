"use strict";
/* Official S2000-2 REp v2.75 sections 1.4, 1.16.4-1.16.6, 1.17.
 * OFFLINE capability comparison; NO UProg commands or PLC writes.
 * A supervised FIRE/EGRESS bypass is mandatory and outside this model.
 */
const reference="https://bolid.ru/files/373/566/s2000_2_ret_v.2.75_aug_25.pdf";
const catalogue=Object.freeze({
 "normal":{cardBlocked:false,exitButtonBlocked:false,remoteCommandBlocked:false,
  release:"ordinary reader authorisation",physicalZonesIndependent:true},
 "access-closed":{cardBlocked:true,exitButtonBlocked:false,remoteCommandBlocked:false,
  release:"change access mode (key or network command)",physicalZonesIndependent:true},
 "tech-loop-reader-gate":{cardBlocked:true,exitButtonBlocked:false,remoteCommandBlocked:false,
  release:"technology loop crosses its configured allow threshold",physicalZonesIndependent:true,
  caveat:"Z1/Z2 enables card recognition ONLY when loop is ALARM/VIOLATED, not when normal; alarm state is not a safe relay-level semantic"},
 "armed-security-loop":{cardBlocked:true,exitButtonBlocked:true,remoteCommandBlocked:false,
  release:"DISARM blocking security loop, NOT simple electrical normalisation",
  physicalZonesIndependent:true,minimumFirmware:"2.20",
  caveat:"Requires valid arm/disarm state machine and network/key authority; armed alarmed or not-taken states may still block; combined disarm+access keys can bypass intended dwell"},
 "busy":{cardBlocked:true,exitButtonBlocked:true,remoteCommandBlocked:true,
  release:"physical shared BUSY line de-asserted",physicalZonesIndependent:false,
  caveat:"One physical BUSY terminal on S2000-2; per-reader receive enable but not two independent signals"}
});
const assert=(p,msg)=>{if(!p)throw Error(msg)};
function analyze(request){
 assert(request&&typeof request==="object","MISSING_POLICY");
 const mode=request.mode;
 assert(typeof mode==="string"&&catalogue[mode],"UNKNOWN_ACCESS_MODE");
 const selected=catalogue[mode];
 const channels=request.independentHoldDomains||1;
 assert(Number.isInteger(channels)&&channels>=1&&channels<=2,"INVALID_DOMAINS");
 const exitNeeded=request.blockNormalExit===true;
 const physicallyControlledByLocalPLC=request.doorsUnderAirlockPLC===true;
 const requireRemoteBlocking=request.blockRemoteCommands===true;
 const exitException=request.allowReturnToDirtierDuringHold===true;
 const issues=[];
 if(exitNeeded&&!selected.exitButtonBlocked)
  issues.push("MODE_DOES_NOT_BLOCK_NORMAL_EXIT_BUTTON");
 if(requireRemoteBlocking&&!selected.remoteCommandBlocked)
  issues.push("REMOTE_COMMANDS_NOT_BLOCKED");
 if(channels===2&&!selected.physicalZonesIndependent)
  issues.push("ONE_SHARED_BUSY_CANNOT_CARRY_TWO_INDEPENDENT_DOMAINS");
 if(mode==="armed-security-loop"){
  issues.push("REQUIRES_EXPLICIT_DISARM_NOT_RESTORED_CONTACT");
  issues.push("NO_LOCAL_OWEN_MODBUS_ARM_DISARM_OVER_S2000_2_ORION_ASSUMED");
 }
 if(exitException&&!request.hasDirectionEvidence)
  issues.push("DIRECTION_CANNOT_BE_DEDUCED_FROM_ONE_REED");
 if(exitException&&selected.exitButtonBlocked)
  issues.push("EARLY_RETURN_NEEDS_APPROVED_EGRESS_EXCEPTION_NOT_NORMAL_BLOCKED_EXIT_BUTTON");
 if(physicallyControlledByLocalPLC&&selected.exitButtonBlocked)
  issues.push("PLANNED_PLC_AND_BOLID_LOCK_AUTHORITY_MUST_NOT_CONFLICT");
 const supportsRequested=issues.length===0;
 return {
  schema:"airlock-s2000-2-access-methods/1",mode,
  reference,capabilities:{...selected},
  requested:{independentHoldDomains:channels,blockNormalExit:exitNeeded,
   blockRemoteCommands:requireRemoteBlocking,
   allowReturnToDirtierDuringHold:exitException},
  status:supportsRequested?"LOGICALLY_POSSIBLE_SUBJECT_TO_COMMISSIONING":"CANNOT_AUTO_APPROVE",
  issues,physicalEgressAccepted:false,nativePlcTested:false,
  note:"A physical emergency escape/APS override is separate from access-mode logic."
 };
}
module.exports={analyze,catalogue,reference};
