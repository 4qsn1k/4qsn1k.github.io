"use strict";
/* Structural checks for Owen Logic 3.3.378 GUI-saved FBD instance fixtures.
 * These are serializer-shape tests, NOT Owen Logic compile/runtime tests.
 */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,"..","experimental","fixtures","fbd-two-native-blocks.sample.json"),"utf8"));
assert.equal(fixture.schema,"airlock-owle-fbd-elements/1");
assert.equal(fixture.notACompleteOwleProject,true);
assert.equal(fixture.originalProjectUnmodified,true);
assert.deepEqual(fixture.elements.map(x=>x.Name),["FB_Room_N1","FB_Room_N4"]);
const GUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const allIds=new Set();
for(const item of fixture.elements){
  const wrapped=item.ElementBlockStoreModel;
  const e=wrapped.ElementModel,meta=item.FunctionalBlocksDirectorStoreModel;
  assert.equal(item.Name,e.Title);
  assert(GUID.test(item.FunctionBlockUId));
  assert(GUID.test(e.UniqueId));
  assert(!allIds.has(e.UniqueId),"Duplicate FBD element UID");
  allIds.add(e.UniqueId);
  const countIn=meta.InputNames.length,countOut=meta.OutputNames.length;
  assert.equal(meta.InputDataTypes.length,countIn);
  assert.equal(meta.OutputDataTypes.length,countOut);
  assert.equal(e.Ports.length,countIn+countOut);
  assert.equal(countIn,item.Name==="FB_Room_N1"?5:6);
  assert.equal(countOut,item.Name==="FB_Room_N1"?13:15);
  const primitives=e.Primitives.filter(x=>x.Discriminator===3);
  const anchorIds=new Set(primitives.map(x=>x.UniqueId));
  for(const p of e.Ports){
    assert(GUID.test(p.UniqueId));
    assert(!allIds.has(p.UniqueId),"Duplicate port UID");
    allIds.add(p.UniqueId);
    assert(anchorIds.has(p.AnchorUniqueId),"Port without anchor primitive");
    const input=/^Input(\d+)$/.exec(p.Name);
    const output=/^Output(\d+)$/.exec(p.Name);
    assert(input||output,"Unsupported port name "+p.Name);
    if(input){
      const i=+input[1];assert(i<countIn);
      assert.equal(p.PortType,0);
      assert.equal(p.DataType,meta.InputDataTypes[i]);
    }else{
      const i=+output[1];assert(i<countOut);
      assert.equal(p.PortType,1);
      assert.equal(p.DataType,meta.OutputDataTypes[i]);
    }
  }
  assert.equal(meta.InputNames[0],"FireNormal");
  assert.equal(meta.InputNames[1],"ResetFault");
  assert(meta.InputNames.includes("I_D_1_4_Closed"),"Common reed input missing");
  assert(meta.OutputNames.includes("O_D_1_4_Block"),"Common inhibit output missing");
  console.log("PASS native GUI fixture "+item.Name+" "+countIn+" inputs "+countOut+" outputs");
}
console.log("NATIVE_FBD_FIXTURE_SHAPE_PASS: 2 instances, 39 typed ports, unique IDs. Does not validate .owle compilation.");
