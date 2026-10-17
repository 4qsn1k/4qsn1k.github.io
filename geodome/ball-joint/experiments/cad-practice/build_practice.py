#!/usr/bin/env python3
"""GeoDome experimental printable fittings: 7 hypothetical rings, steel plate, open gauges.
Not an OEM copy or approved structural component. Dependencies: cadquery, trimesh.
Units mm. CAD dims from Hubs part-specs.pdf; ring geometry is a design assumption.
"""
from pathlib import Path
import math,json
import cadquery as cq
from cadquery import Vector as V
import trimesh

OUT=Path(__file__).parent
R=8.0; BALL_Z=25.0; TOP=30.4; OFF=.35
RINGS=[20.5+1.25*i for i in range(7)]

def connector(d):
    a=cq.Solid.makeCylinder(8,3)
    a=a.fuse(cq.Solid.makeCylinder(4,16,V(0,0,2)),
             cq.Solid.makeSphere(R,V(0,0,BALL_Z),angleDegrees1=-90,angleDegrees2=90))
    a=a.cut(cq.Solid.makeBox(60,60,20,V(-30,-30,TOP)))
    if d:
        for z in RINGS:
            sr=math.sqrt(R*R-(z-BALL_Z)**2)
            a=a.cut(cq.Solid.makeTorus(sr+OFF,OFF+d,V(0,0,z),V(0,0,1)))
    a=a.cut(cq.Solid.makeCylinder(2.45,34,V(0,0,-1)))
    a=a.cut(cq.Solid.makeCone(2.45,3.8,3.1,V(0,0,27.3)))
    return a.clean()

def plate(h):
    return cq.Solid.makeCylinder(15,1.5).cut(
           cq.Solid.makeCylinder(h/2,2.5,V(0,0,-.5))).clean()

def bowl(g):
    # Open half-sphere fit gauge, NOT a retaining ball socket.
    return cq.Solid.makeCylinder(12,9).cut(
           cq.Solid.makeSphere(R+g,V(0,0,9),angleDegrees1=-90,angleDegrees2=90)).clean()

def export(shape,name):
    if not shape.isValid() or len(shape.Solids())!=1:raise ValueError(name+' invalid')
    fp=OUT/name
    cq.exporters.export(shape,str(fp)+'.step',exportType='STEP')
    imp=cq.importers.importStep(str(fp)+'.step').val()
    if not imp.isValid() or len(imp.Solids())!=1 or abs(imp.Volume()-shape.Volume())>.01:
        raise ValueError(name+' STEP roundtrip failed')
    cq.exporters.export(shape,str(fp)+'.stl',exportType='STL',tolerance=.05,angularTolerance=.12)
    m=trimesh.load_mesh(str(fp)+'.stl',force='mesh')
    m.update_faces(m.nondegenerate_faces());m.remove_unreferenced_vertices()
    if not m.is_watertight or not m.is_winding_consistent:raise ValueError(name+' STL invalid')
    m.export(str(fp)+'.stl')
    return dict(name=name,volume_mm3=round(shape.Volume(),3),faces=len(m.faces),step_valid=True,watertight=True)

def main():
    qa=[]
    for name,depth in [('0_control',0),('1_soft_015',.15),('2_middle_020',.20),('3_deep_025',.25)]:
        qa.append(export(connector(depth),'ball_'+name))
    for hole in [6.0,6.4]:
        qa.append(export(plate(hole),'steel_plate_D30_t1p5_hole_'+str(hole).replace('.','p')))
    for gap in [.15,.30,.45]:
        qa.append(export(bowl(gap),'open_fit_bowl_R'+str(8+gap).replace('.','p')))
    (OUT/'qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(qa,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
