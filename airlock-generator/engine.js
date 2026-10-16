/* Universal multi-room interlock engine. Simulation only, NOT a safety PLC. */
const AirlockEngine = (() => {
  const has = value => value != null && value !== "*";
  const same = (expected, actual) => !has(expected) || String(expected) === String(actual);
  const incident = (model, id) => model.doors.filter(d => d.a === id || d.b === id);
  const roomMode = room => room?.interlockMode || (room?.interlockEnabled ? "purge" : "none");
  const rooms = (model, session) => {
    if (session.type === "occupancy") {
      const r = model.rooms.find(r => r.id === session.roomId);
      return r && roomMode(r)==="purge" ? [r.id] : [];
    }
    if (session.type !== "passage") return [];
    return [session.from,session.to].filter((id,i,a)=>a.indexOf(id)===i &&
      model.rooms.some(r=>r.id===id && roomMode(r)!=="none"));
  };
  const purgeRooms = (model, session) => rooms(model,session).filter(id=>
    roomMode(model.rooms.find(r=>r.id===id))==="purge"
  );
  const requestsFor = (model, session) => {
    const req = [];
    for(const id of rooms(model,session)){
      const r=model.rooms.find(r=>r.id===id);
      if(roomMode(r)==="mutual" && session.phase!=="open") continue;
      for(const door of incident(model,id)){
        if(session.type==="passage" && door.id===session.via)continue;
        if((model.exemptions||[]).some(e=>e.room===id && e.door===door.id))continue;
        req.push({doorId:door.id,source:"room:"+id+":"+roomMode(r),sessionId:session.id});
      }
    }
    for(const rule of model.rules||[]){
      const type=rule.eventType||"passage";
      if(type!==session.type)continue;
      if(session.phase==="purge" && rule.hold==="open_only")continue;
      let match=false;
      if(type==="occupancy")match=same(rule.room,session.roomId);
      else match=same(rule.from,session.from)&&same(rule.to,session.to)&&same(rule.via,session.via);
      if(match)for(const doorId of rule.block||[]){
        if(model.doors.some(d=>d.id===doorId)&&doorId!==session.via)
          req.push({doorId,source:"rule:"+rule.id,sessionId:session.id});
      }
    }
    return req;
  };
  const blocked = (model,sessions,fire=false) => {
    const map = new Map();
    if(fire)return map;
    for(const session of sessions)for(const request of requestsFor(model,session)){
      const previous=map.get(request.doorId)||[];
      previous.push(request);map.set(request.doorId,previous);
    }
    return map;
  };
  const validate = model => {
    const errors=[],roomIds=new Set(),doorIds=new Set();
    for(const room of model.rooms||[]){
      if(!room.id||roomIds.has(room.id))errors.push("Некорректный или повторный ID помещения: "+room.id);
      roomIds.add(room.id);
      if(!["none","purge","mutual"].includes(roomMode(room)))errors.push("Некорректный режим "+room.id);
    }
    for(const d of model.doors||[]){
      if(!d.id||doorIds.has(d.id))errors.push("Повторный ID двери: "+d.id);
      doorIds.add(d.id);
      if(!roomIds.has(d.a)||!roomIds.has(d.b)||d.a===d.b)errors.push("Некорректные помещения двери "+d.id);
    }
    for(const rule of model.rules||[]){
      if(!Array.isArray(rule.block))errors.push("Правило "+rule.id+" без списка блокировок");
      for(const id of rule.block||[])if(!doorIds.has(id))errors.push("Правило "+rule.id+" ссылается на неизвестную дверь "+id);
    }
    for(const ex of model.exemptions||[]){
      if(!roomIds.has(ex.room)||!incident(model,ex.room).some(d=>d.id===ex.door))
        errors.push("Некорректное исключение "+ex.room+"/"+ex.door);
    }
    return errors;
  };
  return {incident,roomMode,rooms,purgeRooms,requestsFor,blocked,validate};
})();
