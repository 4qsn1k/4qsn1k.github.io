/* Inter-zone FBD wiring plan: deduplicate reed inputs and OR block requests.
 * Provides an engineering worksheet, not physical PLC terminal assignments.
 */
const AirlockProjectWiring=(()=>{
 "use strict";
 const symbol=id=>"D_"+String(id).replace(/[^a-zA-Z0-9_]/g,"_");
 function build(m){
  const rooms=m.rooms.filter(r=>["mutual","purge"].includes(r.interlockMode||
    (r.interlockEnabled?"purge":"none")));
  const activeSet=new Set(rooms.map(r=>String(r.id)));
  const controlledDoors=m.doors.filter(d=>activeSet.has(String(d.a))||activeSet.has(String(d.b)));
  const inputs=[
   {id:"FireNormal",kind:"DI",terminal:null,controllers:rooms.map(r=>"FB_Room_N"+r.id)},
   {id:"ResetFault",kind:"DI",terminal:null,controllers:rooms.map(r=>"FB_Room_N"+r.id)},
   ...controlledDoors.map(d=>({
    id:"CLOSED_"+symbol(d.id),kind:"DI",doorId:d.id,terminal:null,
    controllers:[d.a,d.b].filter(id=>activeSet.has(String(id))).map(id=>"FB_Room_N"+id)
   }))
  ];
  const blockRequests=controlledDoors.map(d=>({
   doorId:d.id,
   sources:[d.a,d.b].filter(id=>activeSet.has(String(id))).map(id=>
    "FB_Room_N"+id+".O_"+symbol(d.id)+"_Block"),
   operator:"OR",result:"FINAL_BLOCK_"+symbol(d.id),
   implementation:null,terminal:null,
   caution:"Interface could be BUSY to access controller or lock inhibit; design separately"
  }));
  const signals=[
   ...blockRequests.map(b=>({id:b.result,kind:"DO_LOGICAL",terminal:null,note:"Request; not a direct lock output"})),
   ...rooms.flatMap(r=>[
    {id:"ROOM_"+r.id+"_RED",kind:"DO_LOGICAL",source:"FB_Room_N"+r.id+".O_Red",terminal:null},
    {id:"ROOM_"+r.id+"_GREEN",kind:"DO_LOGICAL",source:"FB_Room_N"+r.id+".O_Green",terminal:null}
   ]),
   {id:"ANY_ALARM",kind:"DO_LOGICAL",source:rooms.map(r=>"FB_Room_N"+r.id+".O_Alarm").join(" OR "),terminal:null}
  ];
  return {
   schema:"airlock-project-wiring/0.1",
   activeRoomIds:rooms.map(r=>r.id),
   inputs,blockRequests,logicalOutputs:signals,
   planningCounts:{controlledRooms:rooms.length,uniqueReedInputs:controlledDoors.length,
    commonInputs:2,logicalBlockingRequests:blockRequests.length,
    roomLightChannels:rooms.length*2,aggregatedAlarmChannels:1},
   warnings:[
    "Это список потенциальных физических сигналов, а не проверка ресурсов конкретной модели ПР.",
    "Два FB могут управлять общей дверью только через OR с правильными приоритетами и аппаратным интерфейсом.",
    "Сигнал заблокировать нельзя подключать напрямую к замку без определения поведения при пропадании питания.",
    "Фактические светофоры и питание рассчитываются отдельно от виртуального выходного сигнала.",
    "Отдельная цепь аварийной эвакуации обязательна."
   ]
  };
 }
 return {build};
})();
