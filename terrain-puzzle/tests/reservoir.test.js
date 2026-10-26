'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../landcover.js');
const A={lat:53.9,lon:58.2},B={lat:53.9,lon:58.4},C={lat:54.1,lon:58.4},D={lat:54.1,lon:58.2};
const E={lat:53.96,lon:58.26},F={lat:53.96,lon:58.28},G={lat:53.98,lon:58.28},H={lat:53.98,lon:58.26};
const members=[
 {role:'outer',geometry:[A,B]},{role:'outer',geometry:[C,B]},
 {role:'outer',geometry:[C,D]},{role:'outer',geometry:[D,A]},
 {role:'inner',geometry:[E,F,G]},{role:'inner',geometry:[E,H,G]}
];
test('OSM reservoir relation joins reversed member segments into closed polygon',()=>{
 const result=L.parseOverpass({elements:[{type:'relation',id:500,tags:{type:'multipolygon',natural:'water',water:'reservoir',name:'Test reservoir'},members}]});
 assert.equal(result.length,1);
 assert.equal(result[0].kind,'water');
 assert.equal(result[0].coords.length,5);
 assert.equal(result[0].holes.length,1);
 assert.equal(result[0].holes[0].length,5);
 assert.equal(result[0].tags.water,'reservoir');
});
test('GeoJSON export and import preserves reservoir outer ring and island hole',()=>{
 const original=L.parseOverpass({elements:[{type:'relation',id:501,tags:{natural:'water',water:'reservoir'},members}]});
 const geo=L.toGeoJSON(original);
 assert.equal(geo.features[0].geometry.coordinates.length,2);
 const restored=L.parseGeoJSON(geo);
 assert.equal(restored[0].holes.length,1);
 assert.equal(restored[0].kind,'water');
});
test('Incomplete reservoir ring is never fabricated as closed water polygon',()=>{
 const input={elements:[{type:'relation',id:502,tags:{natural:'water',water:'reservoir'},members:[{role:'outer',geometry:[A,B]},{role:'outer',geometry:[C,D]}]}]};
 assert.equal(L.parseOverpass(input).length,0);
});
test('Legacy reservoir landuse tag classifies as water',()=>{
 assert.equal(L.classify({landuse:'reservoir'}),'water');
 assert.equal(L.classify({water:'reservoir'}),'water');
});
