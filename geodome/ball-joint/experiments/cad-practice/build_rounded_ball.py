#!/usr/bin/env python3
"""Rounded Ball-Joint CAD study. Not a load-rated OEM replacement.
Dependencies: cadquery>=2.5, trimesh. All dimensions in mm.
"""
from pathlib import Path
import math, json
import cadquery as cq
from cadquery import Vector as V
import trimesh
OUT=Path(__file__).resolve().parent
R=8.0; CZ=25.0; LOW=18.0; TOP=30.4; STEP=1.25
CENTRES=[20.5+i*STEP for i in range(7)]
VARIANTS={'rounded_soft_015':.15,'rounded_medium_020':.20,'rounded_deep_025':.25}

def radius(z,depth):
    rad=math.sqrt(R*R-(z-CZ)**2)
    for c in CENTRES:
        t=(z-c)/STEP+.5
        if 0<t<1:
            rad-=depth*math.sin(math.pi*t)**4
    return rad

def model(depth):
    if not 0<=depth<=.30:raise ValueError("Depth must be 0..0.30 mm")
    zz={LOW+(TOP-LOW)*i/520 for i in range(521)}
    for c in CENTRES:
        for j in range(9):
            z=c+(j/8-.5)*STEP
            if LOW<z<TOP:zz.add(z)
    vertices=[V(radius(z,depth),0,z) for z in sorted(zz)]
    profile=cq.Wire.assembleEdges([
        cq.Edge.makeLine(V(0,0,LOW),vertices[0]),
        cq.Edge.makeSpline(vertices,tol=1e-6),
        cq.Edge.makeLine(vertices[-1],V(0,0,TOP)),
        cq.Edge.makeLine(V(0,0,TOP),V(0,0,LOW))])
    ball=cq.Solid.revolve(profile,[],360,V(0,0,0),V(0,0,1))
    body=cq.Solid.makeCylinder(8,3).fuse(
        cq.Solid.makeCylinder(4,17,V(0,0,2)),ball).clean()
    body=body.cut(cq.Solid.makeCylinder(2.45,34,V(0,0,-1)),
                  cq.Solid.makeCone(2.45,3.8,3.1,V(0,0,27.3))).clean()
    assert body.isValid() and len(body.Solids())==1
    return body

def main():
    qa=[]
    for name,depth in VARIANTS.items():
        body=model(depth)
        step=OUT/(name+'.step');stl=OUT/(name+'.stl')
        cq.exporters.export(body,str(step),exportType='STEP')
        imported=cq.importers.importStep(str(step)).val()
        assert imported.isValid() and len(imported.Solids())==1
        assert abs(imported.Volume()-body.Volume())<.02
        cq.exporters.export(body,str(stl),exportType='STL',
                            tolerance=.045,angularTolerance=.09)
        mesh=trimesh.load_mesh(str(stl),force='mesh')
        mesh.update_faces(mesh.nondegenerate_faces())
        mesh.remove_unreferenced_vertices()
        assert mesh.is_watertight and mesh.is_winding_consistent
        mesh.export(str(stl))
        qa.append(dict(name=name,radial_depth_mm=depth,
                       volume_mm3=round(body.Volume(),3),
                       triangles=len(mesh.faces),step_valid=True,
                       stl_watertight=True))
    (OUT/'qa.json').write_text(json.dumps(qa,indent=2),encoding='utf8')
    print(json.dumps(qa,indent=2))

if __name__=='__main__':main()
