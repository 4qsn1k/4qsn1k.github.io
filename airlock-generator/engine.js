/* Airlock topology engine v0.2 — independent of room numbering and UI */
const AirlockEngine = (() => {
  const has = (x) => x != null && x !== "*";
  const same = (a,b) => !has(a) || String(a) === String(b);
  const incident = (model, roomId) => model.doors.filter(d => d.a === roomId || d.b === roomId);
  const rooms = (model, session) => {
    if (session.type === "occupancy") {
      const r = model.rooms.find(r => r.id === session.roomId);
      return r && r.interlockEnabled ? [r.id] : [];
    }
    if (session.type !== "passage") return [];
    return [session.from, session.to].filter((id, i, arr) =>
      arr.indexOf(id) === i && model.rooms.some(r => r.id === id && r.interlockEnabled));
  };
  const requestsFor = (model, session) => {
    const req = [];
    for (const rid of rooms(model, session)) {
      for (const d of incident(model, rid)) {
        if (session.type === "passage" && d.id === session.via) continue;
        if ((model.exemptions || []).some(e => e.room === rid && e.door === d.id)) continue;
        req.push({doorId:d.id, source:"zone:"+rid, sessionId:session.id});
      }
    }
    for (const rule of model.rules || []) {
      const kind = rule.eventType || "passage";
      if (kind !== session.type) continue;
      let match = false;
      if (kind === "occupancy") match = same(rule.room, session.roomId);
      else match = same(rule.from, session.from) && same(rule.to, session.to) && same(rule.via,session.via);
      if (match) for(const doorId of rule.block || []) {
        // Explicit requests remain active even if there is a local room exemption.
        if(model.doors.some(d=>d.id===doorId) && doorId !== session.via)
          req.push({doorId,source:"rule:"+rule.id,sessionId:session.id});
      }
    }
    return req;
  };
  const blocked = (model, sessions, fire = false) => {
    const out = new Map();
    if (fire) return out;
    for (const session of sessions) for (const request of requestsFor(model,session)) {
      const prior=out.get(request.doorId)||[];
      prior.push(request);out.set(request.doorId,prior);
    }
    return out;
  };
  const validate = model => {
    const errors=[], roomIds=new Set(), doorIds=new Set();
    for(const r of model.rooms||[]){
      if(!r.id||roomIds.has(r.id)) errors.push("Дублированное или пустое помещение: "+r.id);
      roomIds.add(r.id);
    }
    for(const d of model.doors||[]){
      if(!d.id||doorIds.has(d.id)) errors.push("Дублированная или пустая дверь: "+d.id);
      doorIds.add(d.id);
      if(!roomIds.has(d.a)||!roomIds.has(d.b)||d.a===d.b)errors.push("Некорректные помещения двери "+d.id);
    }
    for(const rule of model.rules||[]){
      if(!Array.isArray(rule.block))errors.push("У правила "+rule.id+" нет списка блокировок");
      for(const id of rule.block||[])if(!doorIds.has(id))errors.push("Правило "+rule.id+" ссылается на неизвестную дверь "+id);
    }
    for(const ex of model.exemptions||[]){
      if(!roomIds.has(ex.room)||!incident(model,ex.room).some(d=>d.id===ex.door))errors.push("Некорректное исключение "+ex.room+"/"+ex.door);
    }
    return errors;
  };
  return {incident,rooms,requestsFor,blocked,validate};
})();
