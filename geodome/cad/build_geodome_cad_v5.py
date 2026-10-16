#!/usr/bin/env python3
"""GeoDome v5: generate analytic STEP and optionally STL models from UI JSON.
Requires CadQuery >=2.5, optional trimesh for watertight STL test.
python build_geodome_cad.py settings.json output_directory
"""
import json, math, sys
from pathlib import Path
from collections import defaultdict
import cadquery as cq

POINTS=[[0.5257311121, 0.0, 0.8506508084], [0.1624598481, 0.5, 0.8506508084], [-0.4253254042, 0.3090169944, 0.8506508084], [-0.4253254042, -0.3090169944, 0.8506508084], [0.1624598481, -0.5, 0.8506508084], [0.6881909602, 0.5, 0.5257311121], [0.6881909602, -0.5, 0.5257311121], [0.9510565163, 0.3090169944, 0.0], [0.9510565163, -0.3090169944, 0.0], [-0.2628655561, 0.8090169944, 0.5257311121], [0.5877852523, 0.8090169944, 0.0], [0.0, 1.0, 0.0], [-0.8506508084, 0.0, 0.5257311121], [-0.5877852523, 0.8090169944, 0.0], [-0.9510565163, 0.3090169944, 0.0], [-0.2628655561, -0.8090169944, 0.5257311121], [-0.9510565163, -0.3090169944, 0.0], [-0.5877852523, -0.8090169944, 0.0], [-0.0, -1.0, 0.0], [0.5877852523, -0.8090169944, 0.0], [0.0, 0.0, 1.0], [0.894427191, 0.0, 0.4472135955], [0.2763932023, 0.8506508084, 0.4472135955], [-0.7236067977, 0.5257311121, 0.4472135955], [-0.7236067977, -0.5257311121, 0.4472135955], [0.2763932023, -0.8506508084, 0.4472135955]]
EDGES=[[0, 1], [0, 4], [0, 5], [0, 6], [0, 20], [0, 21], [1, 2], [1, 5], [1, 9], [1, 20], [1, 22], [2, 3], [2, 9], [2, 12], [2, 20], [2, 23], [3, 4], [3, 12], [3, 15], [3, 20], [3, 24], [4, 6], [4, 15], [4, 20], [4, 25], [5, 7], [5, 10], [5, 21], [5, 22], [6, 8], [6, 19], [6, 21], [6, 25], [7, 8], [7, 10], [7, 21], [8, 19], [8, 21], [9, 11], [9, 13], [9, 22], [9, 23], [10, 11], [10, 22], [11, 13], [11, 22], [12, 14], [12, 16], [12, 23], [12, 24], [13, 14], [13, 23], [14, 16], [14, 23], [15, 17], [15, 18], [15, 24], [15, 25], [16, 17], [16, 24], [17, 18], [17, 24], [18, 19], [18, 25], [19, 25]]
BASE=[16,17,18,19,8,7,10,11,13,14]
NEIGH=[[] for _ in POINTS]
for a,b in EDGES:NEIGH[a].append(b);NEIGH[b].append(a)
BASE_A=[7,11,14,17,19]
BASE_B=[i for i in BASE if i not in BASE_A]
DEFAULT=dict(baseMode='elongated',diam=3.5,height=2.25,dowel=25.0,clearance=.5,wall=6.,depth=45.,setback=40.,core=30.,fasten=True,screwDiam=3.7,screwFromMouth=20.,screwQty=1,screwPitch=14.,bossDiam=13.,mark=True)

def unit(v):
 d=math.sqrt(sum(x*x for x in v));return [x/d for x in v]
def delta(a,b):return [x-y for x,y in zip(a,b)]
def points_of(p):
 scale=p['height']/(p['diam']/2) if p['baseMode']=='elongated' else 1.0
 return [[x,y,z*scale] for x,y,z in POINTS]
def edge_groups(p):
 pts=points_of(p);ls=[]
 for a,b in EDGES:
  dist=math.dist(pts[a],pts[b])*p['diam']*500
  group=next((g for g in ls if abs(g['length']-dist)<.04),None)
  if group is None:group={'length':dist,'edges':[]};ls.append(group)
  group['edges'].append((a,b))
 ls.sort(key=lambda g:-g['length'])
 names={tuple(sorted(e)):chr(65+i) for i,g in enumerate(ls) for e in g['edges']}
 return ls,names

def port_list(i,p,add_stand=False):
 pts=points_of(p);groups,edgetypes=edge_groups(p)
 rays=[{'type':edgetypes[tuple(sorted((i,j)))], 'axis':unit(delta(pts[j],pts[i]))} for j in NEIGH[i]]
 if add_stand:rays.append({'type':'ST','axis':[0,0,-1]})
 return rays

def models(p):
 mode=p['baseMode'];stand=mode=='stands';elong=mode=='elongated';rows=[]
 def add(name,ids,plus_stand=False): rows.append((name,len(ids),ids[0],port_list(ids[0],p,plus_stand)))
 add('05_krai_4_levyi_so_stoikoi' if stand else '01_krai_4_levyi',BASE_A,stand)
 add('06_krai_4_pravyi_so_stoikoi' if stand else '02_krai_4_pravyi',BASE_B,stand)
 if elong:
  add('03_verh_5',[20]);add('03_niz_5',[21,22,23,24,25]);add('04_verh_6',[0,1,2,3,4]);add('04_sered_6',[5,6,9,12,15])
 else:
  add('03_uzel_5',[20,21,22,23,24,25]);add('04_uzel_6',[0,1,2,3,4,5,6,9,12,15])
 if stand:
  pts=points_of(p);i=BASE[0]
  rays=[{'type':'ST','axis':[0,0,1]}, {'type':'OB','axis':unit(delta(pts[BASE[-1]],pts[i]))}, {'type':'OB','axis':unit(delta(pts[BASE[1]],pts[i]))}]
  rows.append(('07_niz_3',10,i,rays))
 pts=points_of(p)
 for name,qty,i,rays in rows:
  outward=pts[i]
  for ray in rays:
   d=ray['axis'];u=[outward[k]-d[k]*sum(a*b for a,b in zip(outward,d)) for k in range(3)]
   if math.dist(u,[0,0,0])<.01:u=[-d[1],d[0],0] if abs(d[0])+abs(d[1])>0.1 else [1,0,0]
   ray['screwDir']=unit(u)
  yield name,qty,rays

def build(rays,p):
 inner=(p['dowel']+p['clearance'])/2; outer=inner+p['wall'];tip=p['setback']+p['depth']
 sphere=cq.Solid.makeSphere(p['core'],angleDegrees1=-90,angleDegrees2=90)
 add=[];cut=[]
 for ray in rays:
  a=cq.Vector(*ray['axis']);side=cq.Vector(*ray['screwDir'])
  # Start each cylinder at the CORE CENTER. No cap remains at the root after union.
  add.append(cq.Solid.makeCylinder(outer,tip,cq.Vector(0,0,0),a))
  if p['mark'] and ray['type']=='A':add.append(cq.Solid.makeCylinder(outer+1,3,a.multiply(tip-7),a))
  cut.append(cq.Solid.makeCylinder(inner,tip-p['setback']+1,a.multiply(p['setback']),a))
  chamfer=.8
  cut.append(cq.Solid.makeCone(inner,inner+chamfer,chamfer,a.multiply(tip-chamfer),a))
  if p['fasten']:
   for n in range(int(p['screwQty'])):
    t=tip-p['screwFromMouth']+(n-(p['screwQty']-1)/2)*p['screwPitch'];c=a.multiply(t)
    add.append(cq.Solid.makeCylinder(p['bossDiam']/2,5.6,c.add(side.multiply(outer-2.2)),side))
    cut.append(cq.Solid.makeCylinder(p['screwDiam']/2,(outer+5.5)-(inner-1.5),c.add(side.multiply(inner-1.5)),side))
 shape=sphere.fuse(*add).cut(*cut).clean()
 if not shape.isValid() or len(shape.Solids())!=1:raise ValueError('CAD union / drill failed')
 return shape

def read_settings(path):
 d=dict(DEFAULT)
 if path:
  data=json.loads(Path(path).read_text(encoding='utf-8'))
  d.update(data.get('inputs',data))
 for k in d:
  if k in ('baseMode',):continue
  if isinstance(DEFAULT[k],bool):d[k]=d[k] is True or str(d[k]).lower()=='true'
  else:d[k]=float(d[k])
 d['screwQty']=int(d['screwQty'])
 if d['baseMode'] not in ('ground','elongated','stands'):raise ValueError('Invalid base mode')
 if not 3<=d['diam']<=4 or not d['diam']/2<=d['height']<=3:raise ValueError('Outside design range')
 if d['baseMode']=='ground':d['height']=d['diam']/2
 if d['wall']<5 and d['fasten']:raise ValueError('Wall too thin for screw')
 return d

def main():
 p=read_settings(sys.argv[1] if len(sys.argv)>1 and sys.argv[1]!='-' else None)
 out=Path(sys.argv[2] if len(sys.argv)>2 else 'STEP_output');out.mkdir(exist_ok=True,parents=True)
 records=[]
 for name,qty,rays in models(p):
  print(name,'...',flush=True)
  shape=build(rays,p)
  file=out/(name+'.step')
  cq.exporters.export(shape,str(file),exportType='STEP')
  test=cq.importers.importStep(str(file)).val()
  if not test.isValid() or len(test.Solids())!=1 or abs(test.Volume()-shape.Volume())>shape.Volume()*1e-5:raise ValueError('STEP re-import failed')
  stl=out/(name+'.stl')
  cq.exporters.export(shape,str(stl),exportType='STL',tolerance=.14,angularTolerance=.20)
  try:
   import trimesh
   mesh=trimesh.load(str(stl),force='mesh')
   mesh.update_faces(mesh.nondegenerate_faces());mesh.remove_unreferenced_vertices()
   if not mesh.is_watertight:raise ValueError('STL not watertight: '+name)
   mesh.export(str(stl))
  except ImportError:print('STL topology check skipped (trimesh not installed)')
  records.append({'name':name,'qty':qty,'ports':len(rays),'step_bytes':file.stat().st_size,'volume_mm3':round(shape.Volume(),2)})
 (out/'manifest.json').write_text(json.dumps({'params':p,'parts':records},ensure_ascii=False,indent=2),encoding='utf-8')
 print('Done',len(records),'parts',flush=True)
if __name__=='__main__':main()