/* Elevation providers for Terrain Puzzle. Independent module, not wired to UI yet.
 * Implements provider descriptors, slippy-map addressing, bilinear Terrarium sampling.
 * Pixel dimensions are NOT claimed to be original DEM resolution.
 */
(function(root, build){
  'use strict';
  const api=build();
  if(root)root.TerrainElevationProviders=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const RAD=Math.PI/180, R=6378137,MAX_LAT=85.0511287798;
  const PROVIDERS=Object.freeze({
    mapzen:Object.freeze({id:'mapzen',size:256,minZoom:5,maxZoom:15,
      url:function(z,x,y){return 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'+z+'/'+x+'/'+y+'.png';},
      datum:'mixed/unknown',accuracy:'original source DEM varies by region',
      attribution:'Mapzen Terrain Tiles / AWS; underlying source attribution required'}),
    mapterhorn:Object.freeze({id:'mapterhorn',size:512,minZoom:0,maxZoom:16,
      url:function(z,x,y){return 'https://tiles.mapterhorn.com/'+z+'/'+x+'/'+y+'.webp';},
      datum:'verify source metadata',accuracy:'variable by region and zoom',
      attribution:'Mapterhorn; underlying source attribution required'})
  });
  function provider(id){const p=typeof id==='string'?PROVIDERS[id]:id;
    if(!p||!p.size||typeof p.url!=='function')throw Error('Unknown elevation provider');
    return p;
  }
  function coordinate(lat,lon) {
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)
      throw RangeError('Invalid geographic coordinate');
    return [Math.max(-MAX_LAT,Math.min(MAX_LAT,lat)),lon];
  }
  function pixels(lat,lon,z,size){
    const v=coordinate(lat,lon),phi=v[0]*RAD,n=size*Math.pow(2,z);
    if(!Number.isInteger(z)||z<0||z>23)throw RangeError('Invalid zoom');
    return [(v[1]+180)*n/360,(1-Math.asinh(Math.tan(phi))/Math.PI)*n/2];
  }
  function bounds(box,z,id,pad){
    const p=provider(id);pad=pad===undefined?2:pad;
    if(!box||![box.north,box.south,box.east,box.west].every(Number.isFinite))
      throw Error('Missing bbox');
    if(box.north<=box.south||box.east<=box.west)throw Error('Invalid bbox or antimeridian crossing');
    const nw=pixels(box.north,box.west,z,p.size),se=pixels(box.south,box.east,z,p.size),max=Math.pow(2,z)-1;
    const x0=Math.max(0,Math.floor((nw[0]-pad)/p.size)),x1=Math.min(max,Math.floor((se[0]+pad)/p.size));
    const y0=Math.max(0,Math.floor((nw[1]-pad)/p.size)),y1=Math.min(max,Math.floor((se[1]+pad)/p.size));
    return {z:z,x0:x0,x1:x1,y0:y0,y1:y1,count:(x1-x0+1)*(y1-y0+1)};
  }
  function bestZoom(box,id,budget,maxZoom){
    const p=provider(id),limit=budget||72,top=Math.min(maxZoom===undefined?p.maxZoom:maxZoom,p.maxZoom);
    if(limit<1||!Number.isInteger(limit))throw Error('Bad tile budget');
    for(let z=top;z>=p.minZoom;z--){
      const w=bounds(box,z,p);
      if(w.count<=limit)return w;
    }
    throw Error('Bounding box exceeds tile budget');
  }
  function height(r,g,b,a){
    if(![r,g,b,a].every(Number.isFinite))throw Error('Corrupted DEM channels');
    if(a===0)return null;
    return r*256+g+b/256-32768;
  }
  function createSampler(id,z,tiles,strict){
    const p=provider(id),n=p.size,required=strict!==false;
    function cell(x,y){
      const tx=Math.floor(x/n),ty=Math.floor(y/n);
      const data=tiles.get(tx+','+ty);
      if(!data){
        if(!required)return null;
        throw Error('Missing DEM tile '+z+'/'+tx+'/'+ty);
      }
      if(data.length!==n*n*4)throw Error('Unexpected raster shape');
      const a=((y-ty*n)*n+x-tx*n)*4;
      return height(data[a],data[a+1],data[a+2],data[a+3]);
    }
    function samplePixels(x,y){
      const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
      const zs=[cell(ix,iy),cell(ix+1,iy),cell(ix,iy+1),cell(ix+1,iy+1)];
      const weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];
      let sum=0,weight=0;
      for(let k=0;k<4;k++){
        if(zs[k]===null){if(required)throw Error('DEM NoData');continue;}
        if(!Number.isFinite(zs[k]))throw Error('Non-finite elevation');
        sum+=zs[k]*weights[k];weight+=weights[k];
      }
      if(!weight)throw Error('No valid DEM heights');
      return sum/weight;
    }
    function sample(lat,lon){const xy=pixels(lat,lon,z,n);return samplePixels(xy[0],xy[1]);}
    function pixelSizeMeters(lat){return Math.cos(lat*RAD)*2*Math.PI*R/(n*Math.pow(2,z));}
    return {sample:sample,samplePixels:samplePixels,pixelSizeMeters:pixelSizeMeters};
  }
  async function browserDecode(blob,tileSize){
    if(typeof createImageBitmap!=='function'||typeof document==='undefined')
      throw Error('Browser image decoding unavailable; supply decodeImage in tests');
    const img=await createImageBitmap(blob);
    try{
      if(img.width!==tileSize||img.height!==tileSize)throw Error('Unexpected DEM image size');
      const canvas=document.createElement('canvas');canvas.width=canvas.height=tileSize;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(img,0,0);
      return ctx.getImageData(0,0,tileSize,tileSize).data;
    }finally{img.close();}
  }
  async function load(options){
    const p=provider(options.provider||'mapzen'),maxTiles=options.maxTiles||72;
    const w=bestZoom(options.bbox,p,maxTiles,options.maxZoom),tiles=new Map();
    const fetcher=options.fetcher||(typeof fetch==='function'?fetch:null),decoder=options.decoder||browserDecode;
    if(!fetcher)throw Error('No fetch implementation available');
    const queue=[];for(let y=w.y0;y<=w.y1;y++)for(let x=w.x0;x<=w.x1;x++)queue.push([x,y]);
    const cache=options.cache||new Map(),parallel=Math.min(Math.max(1,options.parallel||4),10);
    let cursor=0,done=0;
    await Promise.all(Array.from({length:Math.min(queue.length,parallel)},async function(){
      while(cursor<queue.length){
        const at=queue[cursor++],x=at[0],y=at[1],key=p.id+':'+w.z+'/'+x+'/'+y;
        let rgba=cache.get(key);
        if(!rgba){
          const resp=await fetcher(p.url(w.z,x,y),{mode:'cors'});
          if(!resp||!resp.ok)throw Error('DEM HTTP '+(resp?resp.status:'?')+' '+key);
          rgba=await decoder(await resp.blob(),p.size);
          if(!rgba||rgba.length!==p.size*p.size*4)throw Error('Bad decoded DEM dimensions '+key);
          cache.set(key,rgba);
        }
        tiles.set(x+','+y,rgba);
        if(typeof options.progress==='function')options.progress(++done,queue.length);
      }
    }));
    const sampling=createSampler(p,w.z,tiles,options.strict!==false);
    return {provider:p.id,window:w,count:w.count,zoom:w.z,sample:sampling.sample,
      pixelSizeMeters:sampling.pixelSizeMeters((options.bbox.north+options.bbox.south)/2),
      originalDemResolutionMeters:null, // unknown without underlying dataset metadata
      sourceVerticalDatum:p.datum,attribution:p.attribution};
  }
  return Object.freeze({PROVIDERS:PROVIDERS,pixels:pixels,bounds:bounds,bestZoom:bestZoom,height:height,
    createSampler:createSampler,load:load});
});
