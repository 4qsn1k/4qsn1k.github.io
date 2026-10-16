/* Static pressure cascade model. Setpoints only — never live measurements. */
const PressureCascade = (() => {
  const gradeRank={A:4,B:3,C:2,D:1};
  const roomById=(model,id)=>(model.rooms||[]).find(r=>r.id===id);
  const pressure=r=>r && r.pressurePa!==null && r.pressurePa!=="" &&
       r.pressurePa!==undefined && Number.isFinite(Number(r.pressurePa)) ? Number(r.pressurePa) : null;
  const tol=r=>r && Number.isFinite(Number(r.pressureTolerancePa)) &&
       r.pressureTolerancePa!==null && r.pressureTolerancePa!=="" ? Math.max(0,Number(r.pressureTolerancePa)):0;
  const ranked=r=>r && Object.hasOwn(gradeRank,String(r.cleanClass||"").trim().toUpperCase()) ?
       gradeRank[String(r.cleanClass).trim().toUpperCase()]:null;
  const analyzeDoor=(model,d,defaults={})=>{
    const a=roomById(model,d.a),b=roomById(model,d.b);
    if(!a||!b)return {id:d.id,status:"invalid",warnings:["Дверь соединяет неизвестные помещения"]};
    const pa=pressure(a),pb=pressure(b);
    if(pa===null||pb===null)return {id:d.id,a:d.a,b:d.b,status:"unset",pa,pb,warnings:["Расчётное давление одного из помещений не задано"]};
    const signed=pa-pb,delta=Math.abs(signed);
    const from=signed>0?d.a:signed<0?d.b:null;
    const to=signed>0?d.b:signed<0?d.a:null;
    const rankA=ranked(a),rankB=ranked(b);
    const gradedDifference=rankA!==null&&rankB!==null&&rankA!==rankB;
    const manualMin=d.minPressureDiffPa!==null&&d.minPressureDiffPa!==undefined&&d.minPressureDiffPa!==""?
       Number(d.minPressureDiffPa):null;
    const minDelta=manualMin!==null&&Number.isFinite(manualMin)&&manualMin>=0?manualMin:
        gradedDifference?(Number.isFinite(Number(defaults.minGradeDiffPa))?Math.max(0,Number(defaults.minGradeDiffPa)):10):0;
    const expectedFlow=d.expectedFlow||"auto";
    let expected=null;
    if(expectedFlow==="a_to_b")expected=d.a;
    else if(expectedFlow==="b_to_a")expected=d.b;
    else if(expectedFlow==="auto"&&gradedDifference&&
       a.pressurePurpose!=="containment"&&b.pressurePurpose!=="containment"){
       expected=rankA>rankB?d.a:d.b;
    }
    const totalTolerance=tol(a)+tol(b);
    const guaranteedMin=Math.max(0,delta-totalTolerance);
    const warnings=[];
    if(expected && from!==expected)warnings.push(from===null?
       "Нет ожидаемого направления потока":"Направление потока противоположно ожидаемому");
    if(minDelta>0 && delta<minDelta)warnings.push("Расчётный перепад ниже заданного порога "+minDelta+" Па");
    else if(minDelta>0 && guaranteedMin<minDelta)warnings.push("При предельных отклонениях перепад может стать меньше "+minDelta+" Па");
    if(delta<=totalTolerance && expected)warnings.push("В пределах допусков возможен нулевой или обратный поток");
    return {
      id:d.id,a:d.a,b:d.b,pa,pb,signed,delta,from,to,minDelta,totalTolerance,
      guaranteedMin,expected,status:warnings.length?"warning":"ok",warnings
    };
  };
  const analyze=model=>(model.doors||[]).map(d=>analyzeDoor(model,d,model.pressureDefaults||{}));
  return {pressure,tol,ranked,analyzeDoor,analyze};
})();
