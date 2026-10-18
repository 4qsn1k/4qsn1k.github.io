#!/usr/bin/env python3
"""GeoDome experimental flat-land Ø16 ball with softened 0.15 mm grooves.
Requires cadquery and trimesh. Not an OEM copy and not load-rated.
"""
from pathlib import Path
import json, math
import cadquery as cq
from cadquery import Vector as V
import trimesh

OUT=Path(__file__).resolve().parent
R,CZ,LOW,TOP=8.0,25.0,18.0,30.4
PITCH,DEPTH,HALF_WIDTH=1.25,0.15,0.40
CENTERS=[20.5+i*PITCH for i in range(7)]

def radial(z):
    r=math.sqrt(R*R-(z-CZ)**2)
    for c in CENTERS:
        u=abs(z-c)/HALF_WIDTH
        if u<1.0:
            r-=DEPTH*(.5+.5*math.cos(math.pi*u))**3
    return r

def build():
    sphere=lambda z: V(math.sqrt(R*R-(z-CZ)**2),0,z)
    edges=[]
    previous=LOW
    for c in CENTERS:
        a,b=c-HALF_WIDTH,c+HALF_WIDTH
        edges.append(cq.Edge.makeThreePointArc(sphere(previous),
                                                sphere((previous+a)/2),sphere(a)))
        points=[V(radial(a+(b-a)*i/32),0,a+(b-a)*i/32) for i in range(33)]
        edges.append(cq.Edge.makeSpline(points,tol=1e-7))
        previous=b
    edges.append(cq.Edge.makeThreePointArc(sphere(previous),
                                            sphere((previous+TOP)/2),sphere(TOP)))
    outline=cq.Wire.assembleEdges([
        cq.Edge.makeLine(V(0,0,LOW),sphere(LOW)),*edges,
        cq.Edge.makeLine(sphere(TOP),V(0,0,TOP)),
        cq.Edge.makeLine(V(0,0,TOP),V(0,0,LOW))])
    ball=cq.Solid.revolve(outline,[],360,V(0,0,0),V(0,0,1))
    body=cq.Solid.makeCylinder(8,3).fuse(
        cq.Solid.makeCylinder(4,17,V(0,0,2)),ball).clean()
    body=body.cut(cq.Solid.makeCylinder(2.45,34,V(0,0,-1)),
                  cq.Solid.makeCone(2.45,3.8,3.1,V(0,0,27.3))).clean()
    assert body.isValid() and len(body.Solids())==1
    return body

def main():
    part=build()
    step=OUT/'ball_1_soft_015_soft_edges_v3.step'
    stl=OUT/'ball_1_soft_015_soft_edges_v3.stl'
    cq.exporters.export(part,str(step),exportType='STEP')
    reread=cq.importers.importStep(str(step)).val()
    assert reread.isValid() and len(reread.Solids())==1
    assert abs(reread.Volume()-part.Volume())<.02
    cq.exporters.export(part,str(stl),exportType='STL',
                        tolerance=.08,angularTolerance=.22)
    mesh=trimesh.load_mesh(str(stl),force='mesh')
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    assert mesh.is_watertight and mesh.is_winding_consistent
    mesh.export(str(stl))
    dims=reread.BoundingBox()
    assert abs(dims.xlen-16)<.01 and abs(dims.zlen-30.4)<.01
    qa=dict(grooves=7,depth_mm=.15,pitch_mm=1.25,
            groove_width_mm=.8,crest_land_mm=.45,
            bounds_mm=[dims.xlen,dims.ylen,dims.zlen],
            cad_valid=True,stl_watertight=True)
    (OUT/'qa.json').write_text(json.dumps(qa,indent=2),encoding='utf-8')
    print(json.dumps(qa,indent=2))
if __name__=='__main__':main()
