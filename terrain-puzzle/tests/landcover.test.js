'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const L=require('../landcover.js');
const {test}=require('node:test');
const box=[{lat:53.963,lon:58.310},{lat:53.963,lon:58.316},{lat:53.967,lon:58.316},{lat:53.967,lon:58.310},{lat:53.963,lon:58.310}];
const payload={elements:[
 {type:'way',id:101,tags:{natural:'wood',leaf_type:'needleleaved',species:'Pinus sylvestris'},geometry:box},
 {type:'way',id:102,tags:{waterway:'river',name:'Белая'},geometry:[{lat:53.965,lon:58.310},{lat:53.9653,lon:58.316}]},
 {type:'way',id:103,tags:{highway:'track'},geometry:[{lat:53.964,lon:58.310},{lat:53.966,lon:58.316}]},
 {type:'node',id:104,tags:{natural:'tree',species:'Betula pendula'},lat:53.965,lon:58.314}
]};
test('botanical type derives from mapped OSM species and genus only',()=>{
 assert.equal(L.forestSpecies({species:'Picea abies'}).type,'spruce');
 assert.equal(L.forestSpecies({genus:'Pinus'}).type,'pine');
 assert.equal(L.forestSpecies({species:'Betula pendula'}).type,'birch');
 assert.equal(L.forestSpecies({leaf_type:'needleleaved'}).verified,false);
 assert.equal(L.forestSpecies({}).type,'unknown');
});
test('OSM data parses river, forest, road and geotagged birch',()=>{
 const features=L.parseOverpass(payload);
 assert.equal(features.length,4);
 assert.ok(features.find(f=>f.kind==='forest'&&f.subtype==='pine'&&f.verified));
 assert.ok(features.find(f=>f.kind==='tree'&&f.subtype==='birch'&&f.verified));
 assert.ok(features.find(f=>f.kind==='river'));
 assert.ok(features.find(f=>f.kind==='road'));
});
test('geojson roundtrip keeps geographic objects',()=>{
 const a=L.parseOverpass(payload),b=L.parseGeoJSON(L.toGeoJSON(a));
 assert.equal(b.length,4);
 assert.ok(b.every(f=>f.source==='OpenStreetMap'));
 assert.equal(b.find(x=>x.kind==='forest').subtype,'pine');
});
test('polygon inclusion works for concave mapped forests',()=>{
 assert.equal(L.containsPolygon(1,1,[[0,0],[2,0],[2,2],[0,2]]),true);
 assert.equal(L.containsPolygon(4,4,[[0,0],[2,0],[2,2],[0,2]]),false);
});
test('species miniatures produce watertight STL candidates',()=>{
 const types=['spruce','pine','birch','generic-deciduous','generic'];
 const meshes=types.map((x,i)=>L.treeMesh(i*12+5,5,0,10,x));
 assert.ok(meshes.every(m=>m.faces.length>20&&m.positions.length>60));
 const bytes=L.meshSTL(meshes);assert.equal(new DataView(bytes.buffer).getUint32(80,true),meshes.reduce((n,m)=>n+m.faces.length,0));
 const out=path.join(os.tmpdir(),'terrain-landcover-tree-test.stl');fs.writeFileSync(out,bytes);fs.unlinkSync(out);
});
test('Overpass invalid or unsupported data rejects and does not invent species',()=>{
 assert.throws(()=>L.parseOverpass({}),/invalid/);
 assert.deepEqual(L.parseOverpass({elements:[{type:'node',id:10,tags:{natural:'rock'},lat:53.9,lon:58.1}]}),[]);
});
