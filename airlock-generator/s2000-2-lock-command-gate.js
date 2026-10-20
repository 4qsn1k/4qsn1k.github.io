"use strict";
/* Engineering-only alternative to external S2000-2 BUSY:
 * each physical lock accepts its own PLC 'NORMAL ACCESS PERMIT' request,
 * and Bolid's separate relay still controls authorization when present.
 * NO wiring diagram, DO polarity, actual lock command, PLC IO writes
 * or permission to inhibit emergency egress.
 */
const selector=require("./hardware-auto-selector.js");
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const idsUnique=xs=>new Set(xs).size===xs.length;
function assess({doors,scudDoorIds=[],settings={}}){
 assert(Array.isArray(doors)&&doors.length>=2,"DOORS_REQUIRED");
 const physicalIds=doors.map(d=>d.id);
 assert(physicalIds.every(x=>typeof x==="string"&&x.length>0)&&idsUnique(physicalIds),
  "DUPLICATE_OR_INVALID_PHYSICAL_DOOR");
 assert(Array.isArray(scudDoorIds)&&idsUnique(scudDoorIds),"INVALID_SCUD_DOORS");
 assert(scudDoorIds.every(d=>physicalIds.includes(d)),"SCUD_DOOR_NOT_PHYSICAL");
 assert(settings.busyChannels===undefined,"BUSY_NOT_USED_IN_THIS_ARCHITECTURE");
 assert(settings.lockOutputsPerDoor===undefined,"LOCK_GATE_CHANNEL_IS_COUNTED_ONCE");
 const channels=doors.map(d=>({
  doorId:d.id,normalGrantSource:scudDoorIds.includes(d.id)?
    "S2000_2_K_RELAY_AUTHORIZED_CARD_OR_NORMAL_EXIT":"LOCAL_AIRLOCK_BUTTON_OR_REQUEST",
  plcGateSource:"INDEPENDENT_TIMED_ZONE_PERMIT",
  releaseExpression:"NORMAL_GRANT AND PLC_PERMIT",
  plcPhysicalRelayOutputs:1,
  physicalLockTerminal:null,
  rawNormalAccessOnly:true,
  emergencyReleasePath:"SEPARATE_HARDWIRED_APPROVED_EGRESS",
  earlyDirtySideReturnSupported:false,
  vendorLockInputPolarity:"REQUIRES_EXACT_LOCK_MODEL_AND_MANUAL"
 }));
 const hardware=selector.select(doors.length,{...settings,
  readers:scudDoorIds.length,
  requestInputs:doors.length,
  busyChannels:0,
  lockOutputsPerDoor:1});
 return {
  schema:"airlock-independent-lock-command-gate/1",
  status:"LOGICAL_NORMAL_ACCESS_ONLY_NEEDS_ELECTRICAL_AND_EGRESS_APPROVAL",
  scudDoorIds:[...scudDoorIds],
  scudPhysicalBusyChannelsUsed:0,
  plcLockPermissionOutputs:doors.length,
  inputsRequiredForScudRelayFeedback:scudDoorIds.length,
  localRequestInputs:doors.length-scudDoorIds.length,
  requestInputs:doors.length,
  channels,hardware,
  booleanExample:"NORMAL_UNLOCK = SCUD_OR_BUTTON_GRANT AND PLC_TIMED_PERMISSION",
  warnings:[
   "Each door requires a sampled request DI, including isolated S2000-2 K authorization feedback for reservation before reed motion.",
   "This count replaces BUSY with individual existing lock-control DO channels; do NOT add both for the same physical door.",
   "The Bolid K relay and the PLC gate must be independently authorized for normal release; correct dry-contact series/parallel arrangement depends on the exact lock input.",
   "The ALer AL-400 PRemium manufacturer's close-contact-to-unlock applies ONLY if that precise model is confirmed.",
   "The PLC gate must never be the sole means of emergency escape. Fire/egress requires an independent approved physical release path.",
   "When S2000-2 grants card access but PLC denies its lock gate, S2000-2 may still indicate/log access GRANTED or no-passage while the door stays locked; reader LED/event semantics require field verification.",
   "The normal S2000-2 EXIT button will be denied by a closed PLC gate too. An early cleaner-to-dirtier return requires an explicit separately evaluated request and wiring.",
   "A reed does not report direction. Normal reader/EXIT button side or a separately qualified direction sensor is required.",
   "Physical lock sensors, diode isolation, circuit supervision, relay contact types, common returns, 24V supply and fire override not specified here.",
   "Capacity is an advisory upper bound. No real DO terminal is assigned."
  ],
  physicalLockReleaseApproved:false,independentFireEgressApproved:false,
  actualS2000ConfigurationUnchanged:true,firmwareOrPlcProgramLoaded:false
 };
}
function evaluateNormalAccess({scudGrant=false,localButton=false,plcPermit=false,hasScud=false,fire=false}={}){
 for(const [k,v] of Object.entries({scudGrant,localButton,plcPermit,hasScud,fire}))
  assert(typeof v==="boolean","NONBOOLEAN_"+k);
 const grant=hasScud?scudGrant:localButton;
 return {
  normalUnlockRequest:!fire&&grant&&plcPermit,
  normalAccessGrant:grant,
  plcPermit,
  interlockDenial:!plcPermit,
  emergencyReleaseRequest:fire,
  actualLockReleased:null,
  actualEmergencyEscapeVerified:false,
  note:fire?"Fire egress must release via independent hardware; this model does NOT actuate it":
   "Logical normal-access request only, not a physical coil output"
 };
}
module.exports={assess,evaluateNormalAccess};
