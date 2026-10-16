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
  // A changeover contact makes red/green mutually exclusive with one DO.
  // Safe signaling convention for powered lamps: NC=RED, NO=GREEN.
  // The relay must be energized ONLY on an explicit permissive condition.
  const roomTrafficRelays=rooms.map(r=>({
    id:"ROOM_"+r.id+"_SIGNAL_RELAY",kind:"DO_LOGICAL",
    scope:"ROOM_STATUS_NOT_DOOR_ACCESS",
    source:"FB_Room_N"+r.id+".O_Ready",
    terminal:null,contactWiring:{com:"lamp supply",nc:"RED",no:"GREEN"},
    energizeFor:"GREEN",deenergized:"RED_IF_LAMP_SUPPLY_AVAILABLE"
  }));
  // Door-specific indications are preferable when a door belongs to
  // multiple zones. Every participating zone must be READY, the final
  // inter-zone inhibition must be clear, and the door reed must be CLOSED.
  const perDoorTrafficRelays=controlledDoors.map(d=>{
    const roomIds=[d.a,d.b].filter(id=>activeSet.has(String(id)));
    const symbolId=symbol(d.id);
    return {
      id:"DOOR_"+symbolId+"_SIGNAL_RELAY",kind:"OPTIONAL_DO_LOGICAL",
      doorId:d.id,terminal:null,roomIds,
      greenExpression:[
        "FireNormal",
        "CLOSED_"+symbolId,
        "NOT FINAL_BLOCK_"+symbolId,
        ...roomIds.map(id=>"FB_Room_N"+id+".O_Ready")
      ].join(" AND "),
      contactWiring:{com:"lamp supply",nc:"RED",no:"GREEN"},
      energizeFor:"GREEN",deenergized:"RED_IF_LAMP_SUPPLY_AVAILABLE"
    };
  });
  const signals=[
   ...blockRequests.map(b=>({id:b.result,kind:"DO_LOGICAL",terminal:null,note:"Request; not a direct lock output"})),
   ...roomTrafficRelays,
   {id:"ANY_ALARM",kind:"DO_LOGICAL",source:rooms.map(r=>"FB_Room_N"+r.id+".O_Alarm").join(" OR "),terminal:null}
  ];
  return {
   schema:"airlock-project-wiring/0.2",
   activeRoomIds:rooms.map(r=>r.id),
   inputs,blockRequests,logicalOutputs:signals,
   trafficLightOptions:{roomGroups:roomTrafficRelays,perDoor:perDoorTrafficRelays},
   planningCounts:{controlledRooms:rooms.length,uniqueReedInputs:controlledDoors.length,
    commonInputs:2,logicalBlockingRequests:blockRequests.length,
    roomLightChannels:roomTrafficRelays.length,
    roomTrafficRelays:roomTrafficRelays.length,
    doorTrafficRelays:perDoorTrafficRelays.length,
    aggregatedAlarmChannels:1,
    estimatedDOWithRoomSignals:blockRequests.length+roomTrafficRelays.length+1,
    estimatedDOWithDoorSignals:blockRequests.length+perDoorTrafficRelays.length+1},
   warnings:[
    "Это список потенциальных физических сигналов, а не проверка ресурсов конкретной модели ПР.",
    "Два FB могут управлять общей дверью только через OR с правильными приоритетами и аппаратным интерфейсом.",
    "Сигнал заблокировать нельзя подключать напрямую к замку без определения поведения при пропадании питания.",
    "Перекидное реле на одну пару красный/зелёный: COM питание, NC красный, NO зелёный, зелёный только при включённой катушке.",
    "При потере управляющего сигнала реле выбирает красный только если сохранено питание ламп; потеря питания обеих ламп не даёт индикации.",
    "Один светофор на помещение показывает состояние помещения, а не разрешение конкретной общей двери. Для двери между двумя зонами нужен расчёт отдельного разрешения с учётом обеих зон и FINAL_BLOCK.",
    "Фактические светофоры и питание рассчитываются отдельно от виртуального выходного сигнала.",
    "Отдельная цепь аварийной эвакуации обязательна."
   ]
  };
 }
 return {build};
})();
