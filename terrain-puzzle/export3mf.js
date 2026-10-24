/* Terrain Puzzle color 3MF tile writer. 3MF Core basematerials describe six
   height zones; this is a surface-color preview, not a validated multi-extruder
   slicer profile. Geometry is identical to STL's shared TerrainGeometry mesh. */
(function(root,factory){
'use strict';const api=factory();
if(root)root.Terrain3MF=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
const E=new TextEncoder();
const palette=[
 ['Low terrain (blue)','#2E7898FF'],['Forest green','#429572FF'],
 ['Meadow green','#86BC70FF'],['Sand/Grass','#D1CC80FF'],
 ['Rock orange','#BC8D62FF'],['High terrain','#DDD8CFFF']];
const xmlEscape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function materialAt(z,min,max){const t=(z-min)/(Math.max(.00001,max-min));return Math.max(0,Math.min(palette.length-1,Math.floor(t*palette.length)));}
function makeTile(p,field,range,row,col,zip){
 if(typeof zip!=='function')throw Error('ZIP encoder required');
 const mesh=(typeof window!=='undefined'?window.TerrainGeometry:globalThis.TerrainGeometry)?.buildTileMesh(p,field,range,row,col);
 if(!mesh)throw Error('Geometry module unavailable');
 if(mesh.faces.length>160000)throw Error('3MF слишком детальный: больше 160 тыс. треугольников на деталь. Увеличь шаг STL.');
 const vertices=mesh.positions,faces=mesh.faces;
 const va=[],fa=[];
 for(let i=0;i<vertices.length;i+=3){
  va.push('<vertex x="'+vertices[i].toFixed(5)+'" y="'+vertices[i+1].toFixed(5)+'" z="'+vertices[i+2].toFixed(5)+'"/>');
 }
 for(const face of faces){
  const [a,b,c]=face;
  const mid=(vertices[a*3+2]+vertices[b*3+2]+vertices[c*3+2])/3;
  const mat=(a>=mesh.topVertexCount||b>=mesh.topVertexCount||c>=mesh.topVertexCount)?0:
    materialAt(mid,3,3+(range.max-range.min)*1000/p.s.scale*p.s.exaggeration);
  fa.push('<triangle v1="'+a+'" v2="'+b+'" v3="'+c+'" pid="1" p1="'+mat+'"/>');
 }
 const id=String.fromCharCode(65+row)+(col+1);
 const matXml=palette.map(([name,color])=>'<base name="'+xmlEscape(name)+'" displaycolor="'+color+'"/>').join('');
 const model='<?xml version="1.0" encoding="UTF-8"?>'+
  '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'+
  '<metadata name="Title">Terrain Puzzle '+id+'</metadata><resources><basematerials id="1">'+matXml+'</basematerials>'+
  '<object id="2" type="model" pid="1" pindex="0" name="'+id+'"><mesh><vertices>'+
  va.join('')+'</vertices><triangles>'+fa.join('')+'</triangles></mesh></object></resources>'+
  '<build><item objectid="2"/></build></model>';
 const content='<?xml version="1.0" encoding="UTF-8"?>'+
 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
 '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'+
 '</Types>';
 const rels='<?xml version="1.0" encoding="UTF-8"?>'+
 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
 '<Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/>'+
 '</Relationships>';
 const blob=zip([['[Content_Types].xml',E.encode(content)],['_rels/.rels',E.encode(rels)],['3D/3dmodel.model',E.encode(model)]]);
 return blob.arrayBuffer().then(b=>new Uint8Array(b));
}
return {makeTile,palette};
});