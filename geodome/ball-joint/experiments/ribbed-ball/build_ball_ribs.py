#!/usr/bin/env python3
"""GeoDome Ball-Joint: hypothesis study of circumferential grooves on Ø16 ball.
Not an OEM reproduction; groove pitch and depth are not specified by vendor.
Run with CadQuery>=2.5 and Trimesh. Experimental fit study only, not load-rated.
"""
from pathlib import Path
import math
import json
import cadquery as cq
import trimesh
from cadquery import Vector as V

OUT=Path(__file__).resolve().parent
R=8.0
CENTER=25.0
TOTAL_HEIGHT=30.4
GROOVE_CENTERS=[20.5,21.75,23.0,24.25,25.5,26.75,28.0]

def ball_connector(depth):
    if not 0 <= depth <= 0.35:
        raise ValueError("Experimental groove depth range: 0–0.35 mm")
    flange=cq.Solid.makeCylinder(8,3,V(0,0,0))
    stem=cq.Solid.makeCylinder(4,16,V(0,0,2))
    sphere=cq.Solid.makeSphere(R,V(0,0,CENTER),angleDegrees1=-90,angleDegrees2=90)
    solid=flange.fuse(stem,sphere)
    solid=solid.cut(cq.Solid.makeBox(50,50,20,V(-25,-25,TOTAL_HEIGHT)))
    if depth:
        for z in GROOVE_CENTERS:
            surface_radius=math.sqrt(R**2-(z-CENTER)**2)
            cutter=cq.Solid.makeTorus(surface_radius+.3,.3+depth,V(0,0,z),V(0,0,1))
            solid=solid.cut(cutter)
    solid=solid.cut(cq.Solid.makeCylinder(2.45,33,V(0,0,-1)))
    solid=solid.cut(cq.Solid.makeCone(2.45,3.8,3.1,V(0,0,27.3)))
    solid=solid.clean()
    assert solid.isValid() and len(solid.Solids())==1
    return solid

def main():
    result={}
    for name,depth in [('smooth',0),('grooves_0p15',.15),('grooves_0p30',.3)]:
        body=ball_connector(depth)
        path=OUT/('ball_connector_'+name)
        cq.exporters.export(body,str(path)+'.step',exportType='STEP')
        imported=cq.importers.importStep(str(path)+'.step').val()
        assert imported.isValid() and len(imported.Solids())==1
        assert abs(imported.Volume()-body.Volume())<.005
        cq.exporters.export(body,str(path)+'.stl',exportType='STL',tolerance=.045,angularTolerance=.12)
        mesh=trimesh.load_mesh(str(path)+'.stl')
        mesh.update_faces(mesh.nondegenerate_faces())
        mesh.remove_unreferenced_vertices()
        assert mesh.is_watertight and mesh.is_winding_consistent
        mesh.export(str(path)+'.stl')
        result[name]={'depth_mm':depth,'volume_mm3':round(body.Volume(),2),
                     'faces':len(mesh.faces),'step_valid':True,'stl_watertight':True}
    (OUT/'qa.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
