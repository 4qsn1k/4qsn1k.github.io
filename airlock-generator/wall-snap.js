/* Magnetic alignment of room walls. Geometry-only; no I/O side effects. */
const WallSnap = (() => {
  const DEFAULT_THRESHOLD = 14, MIN_SHARED = 12;
  const overlap=(a,b,c,d)=>Math.min(b,d)-Math.max(a,c);
  const close=(a,b,t)=>Math.abs(a-b)<=t;
  function sharedWalls(rooms,id,epsilon=0.51){
    const r=rooms.find(v=>String(v.id)===String(id));if(!r)return [];
    const walls=[];
    for(const o of rooms){
      if(String(o.id)===String(id))continue;
      const y1=Math.max(r.y,o.y),y2=Math.min(r.y+r.h,o.y+o.h);
      const x1=Math.max(r.x,o.x),x2=Math.min(r.x+r.w,o.x+o.w);
      if(y2-y1>=MIN_SHARED){
        if(close(r.x+r.w,o.x,epsilon))walls.push({roomId:o.id,axis:"x",x:o.x,y1,y2});
        if(close(r.x,o.x+o.w,epsilon))walls.push({roomId:o.id,axis:"x",x:r.x,y1,y2});
      }
      if(x2-x1>=MIN_SHARED){
        if(close(r.y+r.h,o.y,epsilon))walls.push({roomId:o.id,axis:"y",y:o.y,x1,x2});
        if(close(r.y,o.y+o.h,epsilon))walls.push({roomId:o.id,axis:"y",y:r.y,x1,x2});
      }
    }
    return walls;
  }
  function snapRect(rooms,id,proposedX,proposedY,t=DEFAULT_THRESHOLD){
    const r=rooms.find(r=>String(r.id)===String(id));
    if(!r)return {x:proposedX,y:proposedY,walls:[],snapped:false};
    const others=rooms.filter(o=>String(o.id)!==String(id));
    let x=proposedX,y=proposedY;
    const xc=[];
    for(const o of others)if(overlap(y,y+r.h,o.y,o.y+o.h)>=MIN_SHARED){
      for(const v of [o.x-r.w,o.x+o.w])if(close(x,v,t))xc.push({v,d:Math.abs(x-v),o});
    }
    xc.sort((a,b)=>a.d-b.d);if(xc.length)x=xc[0].v;
    const yc=[];
    for(const o of others)if(overlap(x,x+r.w,o.x,o.x+o.w)>=MIN_SHARED){
      for(const v of [o.y-r.h,o.y+o.h])if(close(y,v,t))yc.push({v,d:Math.abs(y-v),o});
    }
    yc.sort((a,b)=>a.d-b.d);if(yc.length)y=yc[0].v;
    // Align neighboring corners when already snapping their common wall.
    if(xc.length&&!yc.length){
      const o=xc[0].o,v=[o.y,o.y+o.h-r.h].filter(a=>close(a,y,t));
      if(v.length)y=v.sort((a,b)=>Math.abs(a-proposedY)-Math.abs(b-proposedY))[0];
    }
    if(yc.length&&!xc.length){
      const o=yc[0].o,v=[o.x,o.x+o.w-r.w].filter(a=>close(a,x,t));
      if(v.length)x=v.sort((a,b)=>Math.abs(a-proposedX)-Math.abs(b-proposedX))[0];
    }
    x=Math.round(x);y=Math.round(y);
    const shifted=rooms.map(o=>String(o.id)===String(id)?{...o,x,y}:o);
    const walls=sharedWalls(shifted,id);
    return {x,y,walls,snapped:walls.length>0};
  }
  return {DEFAULT_THRESHOLD,sharedWalls,snapRect};
})();
