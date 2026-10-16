/* node tests/pressure-and-interlocks.test.js */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const directory=path.resolve(__dirname,"..");
const load=(file,symbol)=>vm.runInNewContext(fs.readFileSync(path.join(directory,file),"utf8")+"\n"+symbol, {});
const AirlockEngine=load("engine.js","AirlockEngine");
const PressureCascade=load("pressure-cascade.js","PressureCascade");
const model=JSON.parse(fs.readFileSync(path.join(directory,"model.json"),"utf8"));
const run=(name,func)=>{func();console.log("PASS "+name);};
const opened=(from,to,via,phase="open")=>({type:"passage",id:1,from,to,via,phase});
const blocked=session=>[...AirlockEngine.blocked(model,[session]).keys()].sort().join(",");
run("model validates",()=>assert.equal(AirlockEngine.validate(model).length,0));
run("mutual mode blocks other doors in both directions",()=>{
  assert.equal(blocked(opened("4","3","3-4")),"1-4,2-4,4-6");
  assert.equal(blocked(opened("3","4","3-4")),"1-4,2-4,4-6");
});
run("mutual mode has no purge and releases immediately on closing",()=>{
  assert.equal(AirlockEngine.purgeRooms(model,opened("4","3","3-4")).length,0);
  assert.equal(blocked(opened("4","3","3-4","purge")),"");
});
run("purge mode persists while door is shut",()=>{
  assert.equal(blocked(opened("1","5","1-5")),"1-2,1-4");
  assert.equal(blocked(opened("1","5","1-5","purge")),"1-2,1-4");
  assert.equal([...AirlockEngine.purgeRooms(model,opened("1","5","1-5"))].join(","),"1");
});
run("adjacent mutual and purge zones respect independent hold time",()=>{
  const session=opened("4","1","1-4","purge");
  assert.equal(blocked(session),"1-2,1-5");
});
run("concurrent requests are reference counted",()=>{
  const both=AirlockEngine.blocked(model,[opened("4","3","3-4"),opened("1","5","1-5")]);
  assert.equal(both.get("1-4").length,2);
});
run("example pressure cascade has configured setpoints",()=>{
  const data=PressureCascade.analyze(model);
  assert.equal(data.length,model.doors.length);
  assert.equal(data.filter(x=>x.status!=="ok").length,0);
});
run("reversed pressure direction is reported",()=>{
  const r=model.rooms.find(x=>x.id==="3");
  const backup=r.pressurePa;r.pressurePa=15;
  try{
    const door=model.doors.find(x=>x.id==="3-4");
    assert.equal(PressureCascade.analyzeDoor(model,door,model.pressureDefaults).status,"warning");
  }finally{r.pressurePa=backup}
});
run("too-small pressure difference is reported",()=>{
  const r=model.rooms.find(x=>x.id==="3");
  const backup=r.pressurePa;r.pressurePa=30;
  try{
    const door=model.doors.find(x=>x.id==="3-4");
    assert.equal(PressureCascade.analyzeDoor(model,door,model.pressureDefaults).status,"warning");
  }finally{r.pressurePa=backup}
});
run("containment does not assume high class requires higher pressure",()=>{
  const r=model.rooms.find(x=>x.id==="3"), backupPurpose=r.pressurePurpose, backupP=r.pressurePa;
  r.pressurePurpose="containment";r.pressurePa=15;
  try{
    const door=model.doors.find(x=>x.id==="3-4");
    const info=PressureCascade.analyzeDoor(model,door,model.pressureDefaults);
    assert.equal(info.expected,null);
  }finally{r.pressurePurpose=backupPurpose;r.pressurePa=backupP}
});
console.log("ALL PRESSURE AND INTERLOCK TESTS PASS");
