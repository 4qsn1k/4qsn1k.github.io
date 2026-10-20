"use strict";
const a=require('node:assert/strict'),f=require('../native-airlock-fbd');
const candidate=require('../experimental/fixtures/real-cad-1252-1274-candidate.json');
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS RESERVED_FBD '+name)};
function rig(config=f.twoDoor(),initial={}){
 const p=f.build(config),s=f.simulator(p),inputs={FIRE_NORMAL:true,DATA_HEALTHY:true};
 for(const d of p.doors){inputs['CLOSED_'+d.id]=true;inputs['REQUEST_'+d.id]=false;}
 s.step({...inputs,...initial},10000);return {p,s};
}
const off=v=>a(Object.values(v).every(x=>x===false));
test('two door arbitration before reeds open, fixed A priority; loser consumed',()=>{
 const {s}=rig();let v=s.step({REQUEST_A:true,REQUEST_B:true});
 a.deepEqual(v.permit,{A:true,B:false});a.deepEqual(v.reserved,{A:true,B:false});
 v=s.step({},5020);off(v.permit);off(v.reserved);
 v=s.step({},20000);off(v.permit);
 v=s.step({REQUEST_B:false});v=s.step({REQUEST_B:true});a.equal(v.permit.B,true);
});
test('both directions open/close, 9.0,9.9,10.0 seconds and reopen reset',()=>{
 for(const id of ['A','B']){
  const other=id==='A'?'B':'A',{s}=rig();a.equal(s.step({['REQUEST_'+id]:true}).permit[id],true);
  off(s.step({['CLOSED_'+id]:false},40).permit);
  let v=s.step({['REQUEST_'+id]:false,['CLOSED_'+id]:true},9000);a.equal(v.ready.AB,false);
  a.equal(s.step({},900).ready.AB,false);a.equal(s.step({},100).ready.AB,true);
  s.step({['CLOSED_'+id]:false},20);s.step({['CLOSED_'+id]:true},9900);
  s.step({['CLOSED_'+id]:false},20);a.equal(s.step({['CLOSED_'+id]:true},9900).ready.AB,false);
  a.equal(s.step({},101).ready.AB,true);
  a.equal(s.step({['REQUEST_'+other]:true}).permit[other],true);
 }
});
test('request release before open cancels, held request expires, startup high never replays',()=>{
 let {s}=rig();s.step({REQUEST_A:true});off(s.step({REQUEST_A:false}).permit);
 a.equal(s.step({REQUEST_B:true}).permit.B,true);off(s.step({},5020).permit);
 ({s}=rig(f.twoDoor(),{REQUEST_A:true}));off(s.snapshot().permit);off(s.step({},30000).permit);
 s.step({REQUEST_A:false});a.equal(s.step({REQUEST_A:true}).permit.A,true);
});
test('denied requests during hold consumed and never queued',()=>{
 const {s}=rig();s.step({CLOSED_A:false},20);s.step({CLOSED_A:true},1000);
 off(s.step({REQUEST_B:true}).permit);off(s.step({},10000).permit);
 s.step({REQUEST_B:false});a.equal(s.step({REQUEST_B:true}).permit.B,true);
});
test('open overtime is continuous 30s and independent of normal hold',()=>{
 const {s}=rig();a.equal(s.step({CLOSED_A:false},29999).buzzer,false);
 a.equal(s.step({},1).overtime.A,true);a.equal(s.snapshot().buzzer,true);
 a.equal(s.step({CLOSED_A:true}).buzzer,false);
});
test('two forced opens latch fault; close alone cannot reset; fresh manual recovery',()=>{
 const {s}=rig();let v=s.step({CLOSED_A:false,CLOSED_B:false});a.equal(v.fault,true);off(v.permit);
 a.equal(s.step({CLOSED_A:true,CLOSED_B:true},12000).fault,true);
 v=s.step({RESET:true});a.equal(v.fault,false);off(v.permit);
 a.equal(s.step({RESET:false},9900).ready.AB,false);a.equal(s.step({},120).ready.AB,true);
});
test('emergency and data loss revoke grants; recovery requires release and reset',()=>{
 for(const signal of ['FIRE_NORMAL','DATA_HEALTHY']){
  const {s}=rig();s.step({REQUEST_A:true});let v=s.step({[signal]:false});off(v.permit);a.equal(v.fault,true);
  a.equal(v.emergency,signal==='FIRE_NORMAL');
  v=s.step({[signal]:true,RESET:true},10000);a.equal(v.fault,true,'held request forbids reset');
  s.step({REQUEST_A:false,RESET:false});v=s.step({RESET:true});a.equal(v.fault,false);
  off(s.step({RESET:false},10020).permit);a.equal(s.step({REQUEST_A:true}).permit.A,true);
 }
});
test('restart discards reservations, requires startup dwell and fresh request',()=>{
 const {p,s}=rig();s.step({REQUEST_A:true});const restarted=s.restart();
 const v=restarted.step({FIRE_NORMAL:true,DATA_HEALTHY:true,CLOSED_A:true,CLOSED_B:true,REQUEST_A:true},20000);
 off(v.permit);off(v.reserved);a.equal(p.noStructuredText,true);
});
const seven=f.sevenDoor(candidate);
test('seven unique reeds, seven request/permit channels, six holds, no BUSY, no 1274',()=>{
 const p=f.build(seven);a.equal(p.doors.length,7);a.equal(p.groups.length,6);
 a.equal(p.nodes.filter(n=>n.id.startsWith('HOLD_')).length,6);
 a.equal(p.nodes.filter(n=>n.kind==='INPUT'&&n.id.startsWith('CLOSED_')).length,7);
 a.equal(p.nodes.filter(n=>n.kind==='INPUT'&&n.id.startsWith('REQUEST_')).length,7);
 a.equal(p.physicalBusyDo,0);a(!JSON.stringify(p).includes('1274'));
 a.equal(p.doors.filter(d=>d.requestSource==='S2000_2_K1').length,1);
});
test('all seven openings affect exactly incident zones, no closed-door cascade',()=>{
 for(const door of seven.doors){
  const {s}=rig(seven);let v=s.step({['CLOSED_'+door.id]:false},40);
  for(const g of seven.groups)a.equal(v.ready[g.id],!g.doorIds.includes(door.id),door.id+' '+g.id);
  v=s.step({['CLOSED_'+door.id]:true},9900);
  for(const g of seven.groups)a.equal(v.ready[g.id],!g.doorIds.includes(door.id));
  v=s.step({},100);a(Object.values(v.ready).every(Boolean));
 }
});
test('all 128 simultaneous request sets obey greedy priority in both triple room and 1252 convergence',()=>{
 const keys=seven.priority;
 for(let mask=0;mask<128;mask++){
  const {s}=rig(seven),requests={};keys.forEach((id,i)=>requests['REQUEST_'+id]=!!(mask&(1<<i)));
  const v=s.step(requests),expected=[],occupied=new Set();
  keys.forEach((id,i)=>{const groups=seven.groups.filter(g=>g.doorIds.includes(id));
   if((mask&(1<<i))&&groups.every(g=>!occupied.has(g.id))){expected.push(id);groups.forEach(g=>occupied.add(g.id));}
  });
  a.deepEqual(keys.filter(id=>v.permit[id]),expected);
  for(const g of seven.groups)a(g.doorIds.filter(id=>v.permit[id]).length<=1);
 }
});
test('shared reservations survive request release AFTER opening; disjoint branches work',()=>{
 const {s}=rig(seven),left='D_1257_1256',right='D_1255_1253';
 let v=s.step({['REQUEST_'+left]:true,['REQUEST_'+right]:true});a.equal(v.permit[left],true);a.equal(v.permit[right],true);
 s.step({['CLOSED_'+left]:false},20);v=s.step({['REQUEST_'+left]:false});a.equal(v.reserved[left],true);
 a.equal(s.step({['CLOSED_'+left]:true}).reserved[left],false);
});
test('each adjacent pair rejects a later request before either reed moves',()=>{
 for(const g of seven.groups)for(const first of g.doorIds)for(const second of g.doorIds){
  if(first===second)continue;
  const {s}=rig(seven);a.equal(s.step({['REQUEST_'+first]:true}).permit[first],true);
  const v=s.step({['REQUEST_'+second]:true},100);a.equal(v.permit[first],true);a.equal(v.permit[second],false);
 }
});
test('all common-room forced-open pairs latch a distinct fault',()=>{
 for(const g of seven.groups)for(let i=0;i<g.doorIds.length;i++)for(let j=i+1;j<g.doorIds.length;j++){
  const {s}=rig(seven);const v=s.step({['CLOSED_'+g.doorIds[i]]:false,['CLOSED_'+g.doorIds[j]]:false});
  a.equal(v.fault,true);off(v.permit);
 }
});
test('seeded faults and requests never produce two normal grants in a common group',()=>{
 const {s}=rig(seven);let seed=28;
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let i=0;i<2000;i++){
  const change={};for(const d of seven.doors){if(rnd()%9===0)change['CLOSED_'+d.id]=rnd()%3!==0;if(rnd()%5===0)change['REQUEST_'+d.id]=!!(rnd()%2);}
  if(i%100===0)change.RESET=false;if(i%100===1)change.RESET=true;
  const v=s.step(change,40);for(const g of seven.groups)a(g.doorIds.filter(id=>v.permit[id]).length<=1);
  if(v.fault||v.emergency)off(v.permit);
 }
});
test('invalid graph, unknown/nonboolean signals and malformed links rejected',()=>{
 a.throws(()=>f.build({...f.twoDoor(),priority:['A','A']}),/INVALID_PRIORITY/);
 a.throws(()=>f.build({...f.twoDoor(),groups:[{id:'AB',doorIds:['A','X']}]}),/BAD_GROUPS/);
 const {p,s}=rig();a.throws(()=>s.step({CLOSED_A:null}),/INVALID_INPUT/);a.throws(()=>s.step({CLOSED_X:true}),/INVALID_INPUT/);
 a.throws(()=>s.step({},-1),/BAD_ELAPSED/);const bad=structuredClone(p);bad.edges.push(bad.edges[0]);a.throws(()=>f.validate(bad),/MULTIPLE_DRIVERS/);
});
console.log(`RESERVED_FBD_QA ${count}/${count} PASS REFERENCE_ONLY NATIVE_GUI_NOT_VERIFIED`);
