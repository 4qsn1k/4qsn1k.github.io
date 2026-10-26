'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const atlas=require('../topography-3d.js');
const big={lat0:53.96,corners:[[53.925,58.24],[53.985,58.24],[53.985,58.35],[53.925,58.35]]};
const small={lat0:53.96,corners:[[53.961,58.304],[53.963,58.304],[53.963,58.307],[53.961,58.307]]};
test('Tile budget gives more detail for large footprint when technically available',()=>{
 const options=atlas.options(big);
 assert.equal(options.length,3);
 assert.ok(options[0].available);
 assert.ok(options.every(x=>!x.available||x.tiles<=x.limit));
 assert.ok(options.some(x=>x.improved&&x.selectable));
 assert.ok(options.filter(x=>x.selectable).every(x=>x.id==='auto'||x.zoom>options[0].zoom));
});
test('Unavailable or redundant details are marked disabled',()=>{
 const options=atlas.options(small);
 assert.ok(options[0].available);
 assert.equal(options[0].zoom,15);
 assert.ok(options.slice(1).every(x=>!x.selectable));
 assert.equal(options[0].approxPixelMeters>0,true);
});
test('Tiny texture GPU budget forces coarser map rather than overlarge canvas',()=>{
 const a=atlas.choice(big,36,15,1024);
 assert.ok((a.x1-a.x0+1)*256<=1024);
 assert.ok((a.y1-a.y0+1)*256<=1024);
 assert.ok(a.tiles<=36);
});
test('No fake accuracy claimed by geographic raster pixel size',()=>{
 const opts=atlas.options(big);
 assert.ok(opts.every(x=>!x.available||x.approxPixelMeters>0));
 assert.ok(atlas.LIMITS.auto<atlas.LIMITS.detail && atlas.LIMITS.detail<atlas.LIMITS.max);
});
