'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../terrain-projection.js');
test('WGS84 UTM north hemisphere projects and reverses Beloretsk coordinates',()=>{
 const p=P.get(53.96,58.3);
 assert.equal(p.epsg,32640);
 for(const [lat,lon] of [[53.96,58.3],[53.98,58.33],[53.94,58.27],[54.5,58.9]]){
  const xy=p.toLocal(lat,lon),r=p.toGeographic(...xy);
  assert.ok(Math.abs(lat-r[0])<1e-8,'latitude roundtrip');
  assert.ok(Math.abs(lon-r[1])<1e-8,'longitude roundtrip');
  assert.ok(xy.every(Number.isFinite));
 }
});
test('Southern hemisphere and central UTM zone',()=>{
 const p=P.get(-33.87,151.2);assert.equal(p.epsg,32756);
 const xy=p.toLocal(-33.9,151.25),ll=p.toGeographic(...xy);
 assert.ok(Math.abs(ll[0]+33.9)<1e-8);
 assert.ok(Math.abs(ll[1]-151.25)<1e-8);
});
test('Unsupported polar latitudes are rejected',()=>{
 assert.throws(()=>P.get(85,0),/UTM/);
 assert.throws(()=>P.get(-81,0),/UTM/);
});
