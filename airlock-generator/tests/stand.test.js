/* Offline deterministic tests for the interactive display.
 * These verify the JS reference model only, not Owen Logic or hardware.
 */
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.join(__dirname,"..");
const load=(file,symbol)=>vm.runInNewContext(fs.readFileSync(path.join(root,file),"utf8")+"\n"+symbol,{});
const room=load("st-testbench.js","AirlockStTestbench");
const wiring=load("project-wiring.js","AirlockProjectWiring");
const testbench=load("interzone-testbench.js","AirlockInterzoneTestbench");
const stand=load("stand-core.js","AirlockStandCore");
const model=JSON.parse(fs.readFileSync(path.join(root,"model.json"),"utf8"));
const create=()=>stand.create(model,room,wiring,testbench);
function check(name,fn){fn();console.log("PASS stand: "+name)}
check("scenario A preserves interzone inhibit in N1 purge",()=>{
 const s=create(),a=s.scenario("A");
 assert.equal(a.rooms["1"].state,30);assert.equal(a.rooms["4"].state,10);
 assert.equal(a.blocked["1-4"],true);
 assert.equal(s.contactForDoor("1-4").command,false);
});
check("scenario B uses independent N4 open door",()=>{
 const s=create(),a=s.scenario("B");
 assert.equal(a.rooms["1"].state,10);assert.equal(a.rooms["4"].state,20);
 assert.equal(a.inputs.Closed["3-4"],false);
 assert.equal(a.blocked["1-4"],true);
});
check("scenario C has both READY and can command NO green",()=>{
 const s=create(),a=s.scenario("C"),contact=s.contactForDoor("1-4");
 assert.equal(a.rooms["1"].state,10);assert.equal(a.rooms["4"].state,10);
 assert.equal(contact.command,true);assert.equal(contact.contact,"NO");
 assert.equal(contact.greenLit,true);assert.equal(contact.redLit,false);
 assert.equal(a.blocked["1-4"],false);
});
check("scenario D opens one physical reed into both rooms, NO never green",()=>{
 const s=create(),a=s.scenario("D");
 assert.equal(a.inputs.Closed["1-4"],false);
 assert.equal(a.rooms["1"].state,20);assert.equal(a.rooms["4"].state,20);
 assert.equal(a.blocked["1-4"],false);
 assert.equal(s.contactForDoor("1-4").command,false);
 assert.equal(s.contactForDoor("1-4").redLit,true);
 assert.equal(a.blocked["1-2"],true);
 assert.equal(a.blocked["3-4"],true);
});
check("scenario E holds shared request until N1 finishes purge",()=>{
 const s=create(),a=s.scenario("E");
 assert.equal(a.rooms["1"].state,30);assert.equal(a.rooms["4"].state,10);
 assert.equal(a.blocked["1-4"],true);
 let later=s.step(20000);
 assert.equal(later.rooms["1"].state,30);
 later=s.step(11000);
 assert.equal(later.rooms["1"].state,10);assert.equal(later.blocked["1-4"],false);
});
check("scenario F software fire requests clear while green remains OFF",()=>{
 const s=create(),a=s.scenario("F");
 assert.equal(a.rooms["1"].state,99);assert.equal(a.rooms["4"].state,99);
 assert.equal(a.blocked["1-4"],false);
 assert.equal(s.contactForDoor("1-4").contact,"NC");
 assert.equal(s.contactForDoor("1-4").greenLit,false);
});
check("one DO drives both lamps through NC/NO, loss of power kills both",()=>{
 const s=create();s.scenario("C");s.setSupply(false);
 let x=s.contactForDoor("1-4");
 assert.equal(x.coilEnergized,true);assert.equal(x.redLit,false);assert.equal(x.greenLit,false);
 s.setSupply(true);x=s.contactForDoor("1-4");assert.equal(x.greenLit,true);
 s.door("1-4");x=s.contactForDoor("1-4");
 assert.equal(x.redLit,true);assert.equal(x.greenLit,false);
});
check("fault reset requires closed doors",()=>{
 const s=create();s.scenario("D");
 assert.throws(()=>s.resetFault(),/закройте/);
 s.door("1-4");
 const snap=s.resetFault();assert.equal(snap.inputs.ResetFault,false);
});
check("single shared door I4 and 1 DO per signal relay budget",()=>{
 const s=create();
 assert.equal(s.plan.inputs.filter(x=>x.doorId==="1-4").length,1);
 assert.equal(s.plan.planningCounts.roomTrafficRelays,2);
 assert.equal(s.plan.planningCounts.doorTrafficRelays,6);
 assert.equal(s.plan.planningCounts.estimatedDOWithRoomSignals,9);
 assert.equal(s.plan.planningCounts.estimatedDOWithDoorSignals,13);
});
check("bad inputs and unknown scenarios are rejected",()=>{
 const s=create();
 assert.throws(()=>s.door("unknown"),/Door outside/);
 assert.throws(()=>s.step(-1),/Invalid/);
 assert.throws(()=>s.scenario("unknown"),/Unknown/);
});
check("standalone page scripts and accessible controls are present",()=>{
 const html=fs.readFileSync(path.join(root,"stand.html"),"utf8");
 for(const file of ["st-testbench.js","project-wiring.js","interzone-testbench.js","stand-core.js","stand.js"]){
  assert(html.includes('src="./'+file+'"'));
 }
 for(const id of ["siteMap","doorStrip","scenarioButtons","relayDoor","redLamp","greenLamp","budgetTotal","eventLog"]){
  assert(html.includes('id="'+id+'"'));
 }
 const tag='<script id="standModel" type="application/json">';
 const offset=html.indexOf(tag);
 const end=html.indexOf("</script>",offset);
 assert(offset>=0 && end>offset,"embedded stand demo model required");
 const embedded=JSON.parse(html.slice(offset+tag.length,end));
 assert.equal(embedded.rooms.length,model.rooms.length);
 assert.equal(embedded.doors.length,model.doors.length);
 assert(html.includes("NC")&&html.includes("NO")&&html.includes("COM"));
 new Function(fs.readFileSync(path.join(root,"stand.js"),"utf8"));
});
console.log("INTERACTIVE_STAND_TESTS_PASS 11/11 — JS REFERENCE ONLY");
