"use strict";
// Evidence/reference-graph contract only. None of these objects is an OWLE document.
const crypto=require("node:crypto");
const hash=x=>crypto.createHash("sha256").update(typeof x==="string"||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest("hex");
const CONTRACT=JSON.parse(JSON.stringify(require("./fixtures/owle-qa012-sanitized-ports-and-connectors.json")));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES=new Map([[0,"BOOL"],[3,"UDINT"]]); // FBD namespace; ST BOOL=6 is different.
const ROLES={INPUT_SHARED:[2,1],OUTPUT_OR:[3,1],OR_SHARED:[18,3],ROOM_A:[41,18],ROOM_B:[41,21]};
const CRITICAL=[
 ["INPUT_SHARED","Output0","ROOM_A","Input3"],
 ["INPUT_SHARED","Output0","ROOM_B","Input2"],
 ["ROOM_A","Output8","OR_SHARED","Input0"],
 ["ROOM_B","Output7","OR_SHARED","Input1"],
 ["OR_SHARED","Output2","OUTPUT_OR","Input0"]
];
const GAPS=Object.freeze([
 "GUI_SAVED_MINIMAL_TEST_ARCHIVE_AND_MEMBER_MANIFEST",
 "COMPLETE_DOCUMENT_VARIABLE_CATALOG_AND_VIRTUAL_IO_METADATA",
 "COMPLETE_DI_DO_OR_WRAPPERS_PRIMITIVES_GEOMETRY_AND_DEFAULTS",
 "PORT_ANCHOR_OWNER_AND_PRIMITIVE_UUID_RELATIONSHIPS",
 "ST_DEFINITION_INSTANCE_AND_MODIFICATION_REFERENCES",
 "CONNECTOR_ROUTING_AND_EXECUTION_ORDER_SEMANTICS",
 "QUALITY_GREEN_AND_REMOTE_GUARD_NATIVE_TEMPLATES",
 "NEW_PROJECT_HOME_PC_OPEN_SAVE_COMPILE_SIMULATION"
]);
function check(ok,code){if(!ok)throw Error(code)}
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const keys=x=>Object.keys(x).sort();
const endpoint=x=>JSON.stringify([x.element,x.port]);
function inspectEvidence(x){
 check(x?.schema==="airlock-owle-test-metadata/1","UNKNOWN_EVIDENCE_SCHEMA");
 check(same(keys(x),["schema","evidence","sourceArchiveSha256","counts","documentKeys","examples","edges","guidPolicy","omitted","validation"].sort()),"UNKNOWN_EVIDENCE_FIELDS");
 check(x.sourceArchiveSha256===CONTRACT.sourceArchiveSha256,"UNRECOGNIZED_EVIDENCE_SOURCE");
 check(same(x.documentKeys,CONTRACT.documentKeys),"UNKNOWN_DOCUMENT_SHAPE");
 check(same(x.counts,{elements:25,connectors:16})&&x.edges?.length===16&&x.examples?.length===5,"INCOMPLETE_EVIDENCE");
 check(!UUID.test(x.evidence)&&!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(JSON.stringify(x)),"UNSANITIZED_UUID");
 check(!/FUNCTION_BLOCK|VAR_INPUT|END_FUNCTION_BLOCK/.test(JSON.stringify(x)),"UNSANITIZED_SOURCE");
 check(x.validation.newNativeSerializerValidated===false&&x.validation.realPLCConnected===false,"INVALID_EVIDENCE_CLAIM");
 const roles=new Map(),ports=new Map();
 const primitiveShapes=[
  ["Discriminator","PointTypes","Points","StyleSheetName"],
  ["Discriminator","Height","Name","Text","TextStyleModel","Width","X","Y"],
  ["Color","Discriminator","LineModel","Name","UniqueId"],
  ["Discriminator","EndPointX","EndPointY","StartPointX","StartPointY"]
 ].map(a=>JSON.stringify(a.sort()));
 for(const e of x.examples){
  const spec=ROLES[e.role],known=CONTRACT.examples.find(k=>k.role===e.role);
  check(known&&same(keys(e),keys(known))&&same(e.wrapperKeys,known.wrapperKeys)&&same(e.elementModelKeys,known.elementModelKeys),"UNKNOWN_ELEMENT_SHAPE");
  check(spec&&!roles.has(e.role)&&e.discriminator===spec[0],"UNKNOWN_OR_DUPLICATE_ELEMENT");
  check(same(e.elementDefaults,known.elementDefaults)&&same(e.primitiveFieldShapes,known.primitiveFieldShapes),"UNKNOWN_ELEMENT_METADATA");
  for(const k of ["inputIndex","outputIndex","pinDefaultValue"])check(e[k]===known[k],"UNKNOWN_ELEMENT_DEFAULT");
  check(e.nativePortCount===spec[1]&&e.ports.length===spec[1],"INCOMPLETE_PORTS");roles.set(e.role,e);
  for(const s of e.primitiveFieldShapes)check(primitiveShapes.includes(JSON.stringify([...s].sort())),"UNKNOWN_PRIMITIVE_SHAPE");
  const names=new Set();
  for(const p of e.ports){
   check(same(keys(p),["name","portType","dataType","pointIndexMode","arrayType","isFloating"].sort()),"UNKNOWN_PORT_FIELDS");
   check(!names.has(p.name),"DUPLICATE_PORT");names.add(p.name);
   const m=/^(Input|Output)(\d+)$/.exec(p.name);
   check(same(p,known.ports.find(k=>k.name===p.name)),"NATIVE_PORT_CONTRACT_MISMATCH");
   check(m&&p.portType===(m[1]==="Input"?0:1)&&TYPES.has(p.dataType),"INVALID_PORT_TYPE");
   check(p.arrayType===null&&typeof p.isFloating==="boolean"&&[0,1].includes(p.pointIndexMode),"UNSUPPORTED_PORT_SHAPE");
   if(e.discriminator===41){
    const t=p.portType===0?e.fbInterface.InputDataTypes:e.fbInterface.OutputDataTypes;
    check(t[Number(m[2])]===p.dataType,"FB_TYPE_MISMATCH");
   }else check(p.dataType===0,"BOOL_REQUIRED");
   ports.set(endpoint({element:e.role,port:p.name}),p);
  }
  const inputs=e.ports.filter(p=>p.portType===0),outputs=e.ports.filter(p=>p.portType===1);
  const expected=e.discriminator===18?["Input0","Input1","Output2"]:
   [...inputs.map((_,i)=>"Input"+i),...outputs.map((_,i)=>"Output"+i)];
  check(same([...names].sort(),expected.sort()),"INVALID_NATIVE_PORT_NAMES");
  if(e.discriminator===41)check(e.fbInterface.InputDataTypes.length===inputs.length&&e.fbInterface.OutputDataTypes.length===outputs.length,"INCOMPLETE_FB_INTERFACE");
 }
 const links=new Set(),drivers=new Set();
 for(const edge of x.edges){
  check(same(keys(edge),keys(CONTRACT.edges[0])),"UNKNOWN_CONNECTOR_FIELDS");
  check(edge.discriminator===1&&same([...edge.connectorKeys].sort(),["Color","FromPortUId","Points","ToPortUId","UniqueId","ZOrder"].sort()),"UNKNOWN_CONNECTOR_SHAPE");
  check(same(edge.pointsFieldShapes,[["IsEmpty","X","Y"]])&&edge.color===-16777216,"UNKNOWN_CONNECTOR_METADATA");
  for(const [end,direction]of [[edge.from,1],[edge.to,0]]){
   check(end&&same(keys(end),["element","port"])&&typeof end.element==="string"&&typeof end.port==="string","INVALID_ENDPOINT");
   if(roles.has(end.element))check(ports.get(endpoint(end))?.portType===direction,"DANGLING_OR_WRONG_DIRECTION");
   else check(/^NODE_\d+$/.test(end.element)&&end.port===(direction?"Output0":"Input0"),"UNKNOWN_OPAQUE_ENDPOINT");
  }
  const a=ports.get(endpoint(edge.from)),b=ports.get(endpoint(edge.to));
  check(!a||!b||a.dataType===b.dataType,"CONNECTOR_TYPE_MISMATCH");
  const link=JSON.stringify([edge.from.element,edge.from.port,edge.to.element,edge.to.port]);
  check(!links.has(link)&&!drivers.has(endpoint(edge.to)),"DUPLICATE_CONNECTOR_OR_DRIVER");links.add(link);drivers.add(endpoint(edge.to));
 }
 for(const link of CRITICAL)check(links.has(JSON.stringify(link)),"MISSING_CRITICAL_LINK");
 return {schema:"airlock-native-shape-inspection/1",status:"NATIVE_STRUCTURE_FIXTURE_PASS",sourceArchiveSha256:x.sourceArchiveSha256,
  totalElements:25,fullyDescribedElements:5,opaqueElements:20,connectors:16,criticalLinks:5,
  usableForSerialization:false,nativeDocument:null,missing:[...GAPS]};
}
function validateReferences(g){
 check(g?.schema==="airlock-native-reference-graph/1","UNKNOWN_REFERENCE_SCHEMA");
 check(same(keys(g),["schema","status","nativeDocument","definitions","elements","connectors"].sort()),"UNKNOWN_REFERENCE_FIELDS");
 check(g.nativeDocument===null&&g.status==="REFERENCE_GRAPH_ONLY","INVALID_REFERENCE_CLAIM");
 const ids=new Set(),ports=new Map(),definitions=new Map(),drivers=new Set(),roles=new Set();
 const add=id=>{check(UUID.test(id)&&!/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id),"INVALID_UUID");const k=id.toLowerCase();check(!ids.has(k),"DUPLICATE_UUID");ids.add(k);return k};
 for(const d of g.definitions){check(same(keys(d),["id","role"]),"UNKNOWN_DEFINITION_FIELDS");check(["ROOM_A","ROOM_B"].includes(d.role),"UNKNOWN_DEFINITION_ROLE");definitions.set(add(d.id),d.role)}
 for(const e of g.elements){
  check(same(keys(e),["role","id","discriminator","ports",...(e.discriminator===41?["definitionId"]:[])].sort()),"UNKNOWN_REFERENCE_ELEMENT_FIELDS");
  check(ROLES[e.role]?.[0]===e.discriminator&&!roles.has(e.role),"UNKNOWN_ELEMENT");roles.add(e.role);add(e.id);
  if(e.discriminator===41)check(typeof e.definitionId==="string"&&definitions.get(e.definitionId.toLowerCase())===e.role,"UNRESOLVED_ST_INSTANCE");
  const names=new Set();
  for(const p of e.ports){
   check(same(keys(p),["id","name","direction","type"].sort()),"UNKNOWN_REFERENCE_PORT_FIELDS");
   const id=add(p.id);check(!names.has(p.name),"DUPLICATE_PORT");names.add(p.name);
   const known=CONTRACT.examples.find(k=>k.role===e.role).ports.find(k=>k.name===p.name);
   check(known&&known.portType===p.direction&&TYPES.get(known.dataType)===p.type,"NATIVE_PORT_CONTRACT_MISMATCH");
   check([0,1].includes(p.direction)&&["BOOL","UDINT"].includes(p.type),"INVALID_PORT_TYPE");
   const role=ROLES[e.role];check(role&&new RegExp(p.direction?"^Output\\d+$":"^Input\\d+$").test(p.name),"INVALID_PORT_DIRECTION");
   ports.set(id,{...p,element:e});
  }
  check(e.ports.length===ROLES[e.role][1],"INCOMPLETE_PORTS");
  if(e.discriminator===18)check(same(e.ports.map(p=>[p.name,p.direction,p.type]),[["Input0",0,"BOOL"],["Input1",0,"BOOL"],["Output2",1,"BOOL"]]),"INVALID_OR_PORTS");
 }
 for(const e of g.connectors){
  check(same(keys(e),["id","FromPortUId","ToPortUId"].sort()),"UNKNOWN_REFERENCE_CONNECTOR_FIELDS");
  add(e.id);const from=ports.get(e.FromPortUId?.toLowerCase()),to=ports.get(e.ToPortUId?.toLowerCase());
  check(from&&to,"DANGLING_GUID");check(from.direction===1&&to.direction===0,"WRONG_DIRECTION");
  check(from.type===to.type,"BOOL_UDINT_MISMATCH");
  const dest=e.ToPortUId.toLowerCase();check(!drivers.has(dest),"MULTIPLE_DRIVERS");drivers.add(dest);
 }
 for(const e of g.elements.filter(e=>e.discriminator===18))for(const p of e.ports.filter(p=>p.direction===0))check(drivers.has(p.id.toLowerCase()),"MISSING_OR_INPUT");
 check(roles.size===5&&definitions.size===2,"INCOMPLETE_REFERENCE_SUBSET");
 const links=new Set(g.connectors.map(e=>{const a=ports.get(e.FromPortUId.toLowerCase()),b=ports.get(e.ToPortUId.toLowerCase());return JSON.stringify([a.element.role,a.name,b.element.role,b.name])}));
 check(links.size===5&&CRITICAL.every(e=>links.has(JSON.stringify(e))),"CRITICAL_REFERENCE_LINK_MISMATCH");
 return true;
}
function specimenReferences(evidence){
 inspectEvidence(evidence);
 const definitions=evidence.examples.filter(e=>e.discriminator===41).map(e=>({role:e.role,id:crypto.randomUUID()}));
 const elements=evidence.examples.map(e=>({role:e.role,id:crypto.randomUUID(),discriminator:e.discriminator,
  ...(e.discriminator===41?{definitionId:definitions.find(d=>d.role===e.role).id}:{}),
  ports:e.ports.map(p=>({id:crypto.randomUUID(),name:p.name,direction:p.portType,type:TYPES.get(p.dataType)}))}));
 const id=(role,name)=>elements.find(e=>e.role===role).ports.find(p=>p.name===name).id;
 const connectors=CRITICAL.map(([a,b,c,d])=>({id:crypto.randomUUID(),FromPortUId:id(a,b),ToPortUId:id(c,d)}));
 const g={schema:"airlock-native-reference-graph/1",status:"REFERENCE_GRAPH_ONLY",nativeDocument:null,
  definitions,elements,connectors};validateReferences(g);return g;
}
function remapReferences(graph){
 validateReferences(graph);const g=structuredClone(graph),map=new Map();
 const fresh=id=>{const k=id.toLowerCase();if(!map.has(k))map.set(k,crypto.randomUUID());return map.get(k)};
 for(const d of g.definitions)d.id=fresh(d.id);
 for(const e of g.elements){e.id=fresh(e.id);if(e.definitionId)e.definitionId=fresh(e.definitionId);for(const p of e.ports)p.id=fresh(p.id)}
 for(const e of g.connectors){e.id=fresh(e.id);e.FromPortUId=fresh(e.FromPortUId);e.ToPortUId=fresh(e.ToPortUId)}
 validateReferences(g);return g;
}
function mapPlan(fbd,plan,evidence,signatures){
 fbd.validate(plan);inspectEvidence(evidence);
 const old=fbd.nativeEvidence(plan,signatures),mapped=[],blocked=[];
 for(const n of plan.nodes){
  let role=null,names=null;
  if(n.kind==="INPUT"&&n.outputs.length===1&&n.outputs[0].type==="BOOL"){role="INPUT_SHARED";names=["Output0"]}
  if(n.kind==="OUTPUT"&&n.inputs.length===1&&n.inputs[0].type==="BOOL"){role="OUTPUT_OR";names=["Input0"]}
  if(n.kind==="OR"&&n.inputs.length===2){role="OR_SHARED";names=["Input0","Input1","Output2"]}
  if(n.kind==="ROOM_FB"){
   const b=old.blocks.find(b=>b.blockName===n.blockName);
   if(b?.status==="GUI_SIGNATURE_MATCH"){
    names=[...n.inputs,...n.outputs].map(p=>b.portNames.find(q=>q.logicalName===p.name).nativeName);
    const match=evidence.examples.find(e=>e.discriminator===41&&e.nativePortCount===names.length&&e.ports.every(p=>{
     const idx=names.indexOf(p.name);return idx>=0&&TYPES.get(p.dataType)===[...n.inputs,...n.outputs][idx].type;
    }));if(match)role=match.role;
   }
  }
  if(!role){blocked.push({node:n.id,kind:n.kind,reason:"NO_VERIFIED_NATIVE_TEMPLATE"});continue}
  const e=evidence.examples.find(e=>e.role===role);
  mapped.push({node:n.id,kind:n.kind,controller:n.controller,evidenceRole:role,discriminator:e.discriminator,
   ports:[...n.inputs,...n.outputs].map((p,i)=>({logicalPort:p.id,nativeName:names[i],type:p.type}))});
 }
 const ports=new Map(mapped.flatMap(n=>n.ports.map(p=>[p.logicalPort,{node:n.node,controller:n.controller,nativeName:p.nativeName}])));
 const edges=[],blockedEdges=[];
 for(const e of plan.edges){
  const a=ports.get(e.from),b=ports.get(e.to);
  if(a&&b&&a.controller===b.controller)edges.push({logicalEdge:e.id,from:a,to:b,type:e.type});
  else blockedEdges.push({logicalEdge:e.id,reason:a&&b?"CROSS_CONTROLLER_UNSUPPORTED":"UNMAPPED_ENDPOINT"});
 }
 return {schema:"airlock-native-mapping-report/1",status:"SERIALIZATION_BLOCKED_INCOMPLETE_NATIVE_FIXTURE",testOnly:true,
  verification:{plan:"FBD_PLAN_PASS",structure:"NATIVE_STRUCTURE_FIXTURE_PASS",nativeGui:"NEEDS_NATIVE_GUI",physical:"PHYSICAL_NOT_TESTED"},
  nativeDocument:null,usableForSerialization:false,planSha256:hash(plan),
  coverage:{nodes:plan.nodes.length,mappedNodes:mapped.length,blockedNodes:blocked.length,edges:plan.edges.length,mappedEdges:edges.length,blockedEdges:blockedEdges.length},
  mappedNodes:mapped,mappedEdges:edges,blockedNodes:blocked,blockedEdges,missing:[...GAPS]};
}
module.exports={inspectEvidence,validateReferences,specimenReferences,remapReferences,mapPlan,hash,GAPS};
