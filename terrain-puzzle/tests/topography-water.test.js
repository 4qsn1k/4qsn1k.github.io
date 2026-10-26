'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const topo=require('../topography-3d.js');
const landcover=require('../landcover.js');
global.TerrainLandcover=landcover;
const view=require('../landcover-3d.js');
test('Map atlas is restricted to 12 or fewer tiles for small geographic area',()=>{
 const p={corners:[[53.957,58.296],[53.968,58.296],[53.968,58.314],[53.957,58.314]]};
 const q=topo.choice(p,12);
 assert.ok(q.tiles>0&&q.tiles<=12);
 assert.ok(q.z>=5&&q.z<=15);
});
test('Continuous water geometry uses selected display width even for OSM stream',()=>{
 const p={projectionContext:{toLocal:(lat,lon)=>[(lon-58.3)*60000,(lat-53.96)*111000]},
  minx:-1000,miny:-1000,maxx:1000,maxy:1000,coverage:2000,cols:1,rows:1,pitch:190,
  s:{scale:5000,exaggeration:1}};
 const f={kind:'river',tags:{waterway:'stream',width:''},coords:[{lat:53.96,lon:58.29},{lat:53.96,lon:58.31}]};
 const dem={height:()=>300},range={min:290,max:310};
 const sample=(width)=>view.build(p,dem,range,[f],[],{forest:false,river:true,road:false,riverWidthMeters:width}).water;
 const a=sample(20),b=sample(100);
 assert.ok(a.length>100&&b.length>100);
 const rangeY=x=>{
  const y=x.filter((_,i)=>i%9===1);
  return Math.max(...y)-Math.min(...y);
 };
 assert.ok(rangeY(b)>rangeY(a)*4.5,'width display must grow with selected width');
});
test('Continuous water avoids gaps along a segmented centerline',()=>{
 const p={projectionContext:{toLocal:(lat,lon)=>[(lon-58.3)*60000,(lat-53.96)*111000]},
  minx:-1000,miny:-1000,maxx:1000,maxy:1000,coverage:2000,cols:1,rows:1,pitch:190,s:{scale:5000,exaggeration:1}};
 const f={kind:'river',tags:{waterway:'river'},coords:[{lat:53.959,lon:58.29},{lat:53.96,lon:58.3},{lat:53.961,lon:58.31}]};
 const out=view.build(p,{height:()=>300},{min:290,max:310},[f],[],{forest:false,river:true,road:false,riverWidthMeters:60}).water;
 assert.ok(out.length>1000);
 assert.ok(out.every(Number.isFinite));
});
