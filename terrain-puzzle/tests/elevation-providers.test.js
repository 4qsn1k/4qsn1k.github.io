'use strict';
const assert=require('node:assert/strict'),t=require('../elevation-providers.js');
const eq=(a,b)=>assert.ok(Math.abs(a-b)<1e-8);
const ts=[];
function run(name,fn){ts.push(Promise.resolve().then(fn).then(()=>console.log('PASS '+name)));}
run('Terrarium decoding including signed and NoData',()=>{
 eq(t.height(128,0,0,255),0);eq(t.height(127,255,0,255),-1);eq(t.height(128,1,128,255),1.5);
 assert.equal(t.height(128,0,0,0),null);
});
run('Coordinates and 512px Mapterhorn vs 256px Mapzen',()=>{
 const a=t.pixels(53.96,58.30,10,256),b=t.pixels(53.96,58.30,10,512);
 eq(a[0]*2,b[0]);eq(a[1]*2,b[1]);
 assert.match(t.PROVIDERS.mapterhorn.url(12,123,456),/12\/123\/456.webp/);
});
run('Zoom/antimeridian input guards',()=>{
 const w=t.bestZoom({south:53.958,north:53.962,west:58.298,east:58.302},'mapzen',72);
 assert.ok(w.z<=15&&w.count>0&&w.count<=72);
 assert.throws(()=>t.bounds({south:1,north:2,west:170,east:-170},8,'mapzen'));
});
run('Bilinear interpolation exactly across tile seam',()=>{
 const n=256,z=3,x=4,y=3,tiles=new Map();
 function raster(h){const rgba=new Uint8Array(n*n*4),v=h+32768;for(let i=0;i<rgba.length;i+=4){rgba[i]=Math.floor(v/256);rgba[i+1]=v%256;rgba[i+3]=255;}return rgba;}
 tiles.set(x+','+y,raster(100));tiles.set((x+1)+','+y,raster(200));
 tiles.set(x+','+(y+1),raster(100));tiles.set((x+1)+','+(y+1),raster(200));
 const s=t.createSampler('mapzen',z,tiles);
 eq(s.samplePixels((x+1)*n-.5,y*n+20.25),150);
 eq(s.samplePixels(x*n+20,y*n+20),100);
 const d=tiles.get(x+','+y);d[(20*n+20)*4+3]=0;
 assert.throws(()=>s.samplePixels(x*n+20,y*n+20),/NoData/);
});
run('Mocked network loader and source metadata',async()=>{
 const v=await t.load({bbox:{south:.01,north:.02,west:.02,east:.03},provider:'mapzen',maxZoom:5,
 fetcher:async()=>({ok:true,blob:async()=>new Blob([])}),
 decoder:async()=>{const a=new Uint8Array(256*256*4);for(let i=0;i<a.length;i+=4){a[i]=128;a[i+3]=255;}return a;}});
 eq(v.sample(.015,.025),0);
 assert.ok(v.pixelSizeMeters>0);assert.equal(v.originalDemResolutionMeters,null);
});
Promise.all(ts).then(()=>console.log('ALL TESTS PASS')).catch(e=>{console.error('TEST FAIL',e);process.exitCode=1;});
