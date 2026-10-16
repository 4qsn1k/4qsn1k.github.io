/* Run with: node tests/snap.test.js (from airlock-generator/) */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const src=fs.readFileSync(path.join(__dirname,"..","wall-snap.js"),"utf8");
const WallSnap=vm.runInNewContext(src+"\nWallSnap", {});
const make=(a,b)=>[{id:"1",...a},{id:"2",...b}];
const cases=[
 ["snap right edge",make({x:0,y:0,w:100,h:100},{x:400,y:0,w:80,h:80}),108,5,[100,0]],
 ["snap left edge",make({x:200,y:0,w:100,h:100},{x:0,y:0,w:80,h:80}),109,2,[120,0]],
 ["snap below",make({x:0,y:0,w:100,h:100},{x:0,y:200,w:80,h:80}),4,107,[0,100]],
 ["snap above",make({x:0,y:200,w:100,h:100},{x:0,y:0,w:80,h:80}),4,110,[0,120]],
 ["no long distance snap",make({x:0,y:0,w:100,h:100},{x:300,y:300,w:80,h:80}),192,193,[192,193]],
 ["no diagonal false positive",make({x:0,y:0,w:100,h:100},{x:200,y:300,w:80,h:80}),106,300,[106,300]]
];
for(const [title,rooms,x,y,expected] of cases){
  const actual=WallSnap.snapRect(rooms,"2",x,y);
  assert.deepEqual([actual.x,actual.y],expected,title);
  console.log("PASS "+title);
}
console.log("6 wall-snap tests passed.");
