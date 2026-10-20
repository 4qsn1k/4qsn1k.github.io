/* Conservative automatic 24V discrete I/O catalog shortlist.
 * Not a physical wiring, price quote, procurement or commissioning.
 * Derived from Owen PR100/PR102/PR103 and PRM-1/5/6 published datasheets.
 * In multi-PLC cases aggregate I/O is NEVER claimed as safe placement.
 */
"use strict";
const PRS=[
 {id:"PR100-24.1208.03.1",family:"PR100",di:8,relayDo:8,maxPrm:0,
  rs485:1,ethernet:false,specialDi:0,
  source:"https://docs.owen.ru/product/pr100/78/117414"},
 {id:"PR102-24.2416.03.1",family:"PR102",di:16,relayDo:16,maxPrm:2,
  rs485:1,ethernet:false,specialDi:0,
  source:"https://agriculture.owen.ru/product/pr102/modifications"},
 {id:"PR102-24.2416.03.2",family:"PR102",di:16,relayDo:16,maxPrm:2,
  rs485:2,ethernet:false,specialDi:0,
  source:"https://agriculture.owen.ru/product/pr102/modifications"},
 {id:"PR103-24.1610.03.1.0",family:"PR103",di:6,relayDo:10,maxPrm:2,
  rs485:1,ethernet:true,specialDi:4,
  source:"https://docs.owen.ru/product/pr103/897/101853"},
 {id:"PR103-24.1610.03.2.0",family:"PR103",di:6,relayDo:10,maxPrm:2,
  rs485:2,ethernet:true,specialDi:4,
  source:"https://docs.owen.ru/product/pr103/897/101853"}
];
const PRM=[
 {id:"PRM-1.24",di:8,relayDo:8,source:"https://owen.ru/product/prm1/specifications"},
 {id:"PRM-5.24",di:0,relayDo:16,source:"https://owen.ru/product/prm5"},
 {id:"PRM-6.24",di:16,relayDo:12,source:"https://owen.ru/product/prm6/specifications"}
];
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const integer=(x,key)=>{assert(Number.isSafeInteger(x)&&x>=0&&x<=1024,"BAD_"+key);return x};
function requirements(doors,settings={}){
 const n=integer(doors,"DOORS");
 assert(n>=2,"AT_LEAST_TWO_DOORS");
 const readers=integer(settings.readers??1,"READERS");
 assert(readers<=n,"MORE_READERS_THAN_DOORS");
 const sensorsPerDoor=integer(settings.sensorsPerDoor??1,"SENSORS_PER_DOOR");
 assert(sensorsPerDoor>=1&&sensorsPerDoor<=4,"INVALID_SENSOR_COUNT");
 const locksPerDoor=integer(settings.lockOutputsPerDoor??1,"LOCK_OUTPUTS_PER_DOOR");
 const lampChannelsPerDoor=integer(settings.lampOutputsPerDoor??1,"LAMP_OUTPUTS_PER_DOOR");
 const lampChannelTotal=integer(settings.lampChannelsTotal??n*lampChannelsPerDoor,"LAMP_CHANNEL_TOTAL");
 const buzzerChannels=integer(settings.buzzerChannels??1,"BUZZER_CHANNELS");
 const busyChannels=integer(settings.busyChannels??readers,"BUSY_CHANNELS");
 const fireInputs=integer(settings.fireInputs??1,"FIRE_INPUTS");
 const resetInputs=integer(settings.resetInputs??1,"RESET_INPUTS");
 const extraInputs=integer(settings.extraInputs??0,"EXTRA_INPUTS");
 const requestInputs=integer(settings.requestInputs??0,"REQUEST_INPUTS");
 const extraOutputs=integer(settings.extraOutputs??0,"EXTRA_OUTPUTS");
 const reserveDi=integer(settings.reserveDi??2,"RESERVE_DI");
 const reserveDo=integer(settings.reserveDo??2,"RESERVE_DO");
 const di=n*sensorsPerDoor+fireInputs+resetInputs+extraInputs+requestInputs;
 const relayDo=n*locksPerDoor+lampChannelTotal+buzzerChannels+busyChannels+extraOutputs;
 return {doors:n,readers,di,relayDo,requestInputs,reserve:{di:reserveDi,relayDo:reserveDo},
  breakdown:{reedInputs:n*sensorsPerDoor,fireInputs,resetInputs,extraInputs,
   locks:n*locksPerDoor,lamps:lampChannelTotal,
   buzzer:buzzerChannels,busy:busyChannels,extraOutputs},
  notes:[
   "Counts assume each physical lock uses one relay and each red/green lamp uses one output with an external changeover relay.",
   "Bolid BUSY on the single CNC entry is not six additional readers.",
   "An electric two-wire lock may need a different electrical circuit and relay contact arrangement.",
   "Physical safety egress release, independent fire circuit, fault monitoring and supply protection must be designed separately."
  ]};
}
function combinations(maxPrm){
 const c=[[]];if(maxPrm>=1)for(const m of PRM)c.push([m]);
 if(maxPrm>=2)for(let i=0;i<PRM.length;i++)for(let j=i;j<PRM.length;j++)c.push([PRM[i],PRM[j]]);
 return c;
}
function score(c,required,networkRequested){
 const slackDi=c.totalDi-required.di,slackDo=c.totalDo-required.relayDo;
 const overload=Math.max(0,required.di-c.totalDi)+Math.max(0,required.relayDo-c.totalDo);
 const resourceWaste=Math.abs(slackDi)+Math.abs(slackDo);
 return overload*1e6+c.modules.length*500+
  resourceWaste*1.5+(c.specialDi>0?35:0)+
  (networkRequested&&c.rs485<2?15:0)+(c.ethernet?10:0);
}
function select(doors,settings={}){
 const req=requirements(doors,settings);
 const target={di:req.di+req.reserve.di,relayDo:req.relayDo+req.reserve.relayDo};
 const networkMode=settings.networkMode||"rs485-modbus-rtu";
 assert(["rs485-modbus-rtu","ethernet-modbus-tcp"].includes(networkMode),"UNKNOWN_NETWORK_MODE");
 const choices=[];
 for(const pr of PRS){
  if(networkMode==="ethernet-modbus-tcp"&&!pr.ethernet)continue;
  for(const mods of combinations(pr.maxPrm)){
   // Fast inputs require an application-specific compatibility check.
   // Strictly exclude them from GUARANTEED ordinary contact DI counts.
   const totalDi=pr.di+mods.reduce((n,m)=>n+m.di,0);
   const totalDo=pr.relayDo+mods.reduce((n,m)=>n+m.relayDo,0);
   if(totalDi<req.di||totalDo<req.relayDo)continue;
   const candidate={
    controller:pr.id,family:pr.family,
    modules:mods.map(m=>m.id),moduleCount:mods.length,
    totalDi,totalDo,spareDi:totalDi-req.di,spareDo:totalDo-req.relayDo,
    reservesMet:totalDi>=target.di&&totalDo>=target.relayDo,
    specialDiExcluded:pr.specialDi,specialDi:pr.specialDi,
    ethernet:pr.ethernet,rs485Ports:pr.rs485,
    source:pr.source,moduleSources:mods.map(m=>m.source),
    network:networkMode,
    score:0
   };
   candidate.score=score(candidate,target,settings.preferTwoRs485===true);
   choices.push(candidate);
  }
 }
 choices.sort((a,b)=>(b.reservesMet?1:0)-(a.reservesMet?1:0)||
  a.score-b.score||a.controller.localeCompare(b.controller));
 const best=choices[0]||null;
 const alternatives=[];
 const seen=new Set(best?[best.family+"|"+best.modules.join("+")]:[]);
 for(const choice of choices.slice(best?1:0)){
  const key=choice.family+"|"+choice.modules.join("+");
  if(seen.has(key))continue;
  alternatives.push(choice);seen.add(key);
  if(alternatives.length>=4)break;
 }
 let networkAlternative=null;
 if(!best){
  // Aggregate planning: not real partition or a valid Modbus program.
  // Each local reed, relay and fire input must be placed on a real PLC.
  let multi=[];
  for(const p of PRS.filter(p=>networkMode==="rs485-modbus-rtu"||p.ethernet)){
   for(let n=2;n<=8;n++){
    const sumDi=p.di*n,sumDo=p.relayDo*n;
    if(sumDi>=target.di&&sumDo>=target.relayDo){
     multi.push({controller:p.id,count:n,modulesPerController:[],
      aggregateDi:sumDi,aggregateDo:sumDo,network:networkMode,
      status:"AGGREGATE_CAPACITY_ONLY_NO_PLACEMENT_OR_WATCHDOG",
      source:p.source});break;
    }
   }
  }
  multi.sort((a,b)=>a.count-b.count||
   (a.aggregateDi+a.aggregateDo)-(b.aggregateDi+b.aggregateDo));
  networkAlternative=multi[0]||null;
 }
 return {schema:"airlock-auto-hardware-estimate/1",
  status:"PRELIMINARY_CAPACITY_SELECTION_ONLY",
  required:req,primary:best,alternatives,
  networkAlternative,
  extraWarnings:[
   "For PR103 fast inputs (FDI) were excluded; their compatibility with specific dry-contact wiring requires vendor confirmation.",
   "All relay outputs are hypothetical. DO safety polarity, relay current, NC/NO changeover and physical APS override are not represented.",
   "RS-485 Modbus RTU is a data network, not the PRM expansion bus and not an automatically certified interlock.",
   "Multi-controller design requires local output authority, read freshness/timeout, master/slave allocation, fail-safe commissioning and a physical terminal plan.",
   "Native vendor .owle, Owen Logic resource utilisation and PLC scan-time tests have not passed."
  ]};
}
if(typeof module!=="undefined"&&module.exports)module.exports={requirements,select,PRS,PRM};
