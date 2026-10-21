#!/usr/bin/env python3
"""GeoDome 2V: experimental six-way CAD hub (STEP + watertight STL).
Usage: python build_six_hub.py
Dependencies: cadquery, trimesh. Units: mm. Not structurally certified.
"""
from pathlib import Path
import json
import cadquery as cq
import trimesh

# Derived from 2V unit-sphere node 0 of the browser configurator.
# First vector is the socket axis; second points to accessible screw side.
RAYS = [
    ((-.587785252,.809016994,0),(.361803399,.262865556,.894427191)),
    ((-.587785252,-.809016994,0),(.361803399,-.262865556,.894427191)),
    ((.262865556,.809016994,-.525731112),(.638196601,.262865556,.723606798)),
    ((.262865556,-.809016994,-.525731112),(.638196601,-.262865556,.723606798)),
    ((-.961938358,0,.273266529),(.273266529,0,.961938358)),
    ((.674608925,0,-.738175316),(.738175316,0,.674608925)),
]
P = dict(dowel=25, clearance=.5, wall=6, core=30, setback=40,
         depth=45, screw_diameter=3.7, screw_from_mouth=20,
         boss_diameter=13, mouth_chamfer=.9, collar_flare=5)

def build(reinforced=True):
    p=P; inner=(p['dowel']+p['clearance'])/2; outer=inner+p['wall']
    tip=p['setback']+p['depth']; core=p['core']
    positive=[]; bores=[]
    for direction,screw_direction in RAYS:
        axis=cq.Vector(*direction).normalized()
        radial=cq.Vector(*screw_direction).normalized()
        positive.append(cq.Solid.makeCylinder(outer,tip,cq.Vector(0,0,0),axis))
        if reinforced:
            f=p['collar_flare'];sections=[(.35*core,outer+.6*f),
               (.60*core,outer+f),(.85*core,outer+.85*f),
               (core+4,outer+.32*f),(core+10,outer),(core+13,outer)]
            wires=[cq.Wire.makeCircle(r,axis.multiply(z),axis) for z,r in sections]
            positive.append(cq.Solid.makeLoft(wires,ruled=False))
        bores.append(cq.Solid.makeCylinder(inner,tip-p['setback']+1.5,
                                          axis.multiply(p['setback']),axis))
        ch=p['mouth_chamfer'];bores.append(cq.Solid.makeCone(inner,inner+ch,
                                  ch,axis.multiply(tip-ch),axis))
        center=axis.multiply(tip-p['screw_from_mouth'])
        positive.append(cq.Solid.makeCylinder(p['boss_diameter']/2,6,
                              center.add(radial.multiply(outer-2.5)),radial))
        bores.append(cq.Solid.makeCylinder(p['screw_diameter']/2,
                         outer-inner+6,center.add(radial.multiply(inner-1.1)),radial))
    solid=cq.Solid.makeSphere(core,angleDegrees1=-90,angleDegrees2=90)
    solid=solid.fuse(*positive).cut(*bores).clean()
    if not solid.isValid() or len(solid.Solids())!=1:
        raise ValueError('Invalid CAD solid')
    return solid

def main():
    out=Path(__file__).resolve().parent
    for mode in ('straight','reinforced'):
        shape=build(mode=='reinforced')
        step=out/f'six_hub_{mode}.step'
        stl=out/f'six_hub_{mode}.stl'
        cq.exporters.export(shape,str(step),exportType='STEP')
        cq.exporters.export(shape,str(stl),exportType='STL',tolerance=.08,angularTolerance=.12)
        # OCC tessellation produces zero-area triangles at sphere poles;
        # remove only these triangles to get a manifold STL without changing CAD.
        mesh=trimesh.load(str(stl),force='mesh')
        mesh.update_faces(mesh.nondegenerate_faces())
        mesh.remove_unreferenced_vertices()
        assert mesh.is_watertight and mesh.is_winding_consistent
        mesh.export(str(stl))
        reread=cq.importers.importStep(str(step)).val()
        assert reread.isValid() and len(reread.Solids())==1
        assert abs(reread.Volume()-shape.Volume())/shape.Volume()<1e-5
        print(mode, 'CAD valid, STL watertight, volume mm3:',round(shape.Volume()))
    (out/'settings.json').write_text(json.dumps(P,indent=2),encoding='utf-8')
if __name__=='__main__':main()
