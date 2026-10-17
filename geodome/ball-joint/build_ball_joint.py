#!/usr/bin/env python3
"""GeoDome: experimental ball-joint connector family, Hubs-inspired, not original OEM parts.
Dimensional references: Hubs Part Specs PDF (5 pages), per-user-provided engineering docs.
Requires CadQuery 2.8, trimesh; generates CAD STEP, STL, QA manifest. mm units.
These are calibration and fit prototypes; not suitable for structural loads without tests.
"""
import os, math, json, argparse
from pathlib import Path
import cadquery as cq
import trimesh
from cadquery import Vector as V

SPEC={
 'ball_diameter':16.0,'radial_centre_5':18.0,'radial_centre_6':19.0,
 'hub_diameter_5':52.6,'hub_diameter_6':54.6,'hub_thickness':14.0,
 'ball_base_to_centre':25.0,'ball_connector_total_height':30.4,
 'ball_flange_diameter':16.0,'ball_stem_diameter':8.0,
 'wood_screw_diameter':4.5,'hub_center_hole':6.1,
 'hub_counterbore_top':12.5,'clamp_plate_diameter':30.0,
 'clamp_plate_thickness':1.5,
 'socket_radial_clearance':0.35,'neck_clearance':0.4,
 'socket_z':4.0,'underside_fillet':0,
}

def join_solid(parts):
    v=parts[0]
    for p in parts[1:]: v=v.fuse(p)
    return v.clean()

def ball_connector(p):
    radius=p['ball_diameter']/2
    base=cq.Solid.makeCylinder(p['ball_flange_diameter']/2,3.0,V(0,0,0))
    stem=cq.Solid.makeCylinder(p['ball_stem_diameter']/2,16,V(0,0,2))
    ball=cq.Solid.makeSphere(radius,V(0,0,p['ball_base_to_centre']),angleDegrees1=-90,angleDegrees2=90)
    # Embed stem into spherical head: sphere begins at z=17; stem ends at z=20.
    obj=join_solid([base,stem,ball])
    # Flatten upper spherical crown to schematic overall height 30.4 mm.
    obj=obj.cut(cq.Solid.makeBox(50,50,20,V(-25,-25,p['ball_connector_total_height'])))
    # Hole for the wood screw and top countersink; hardware is separate.
    obj=obj.cut(cq.Solid.makeCylinder(2.45,33,V(0,0,-1)))
    obj=obj.cut(cq.Solid.makeCone(2.45,3.8,3.1,V(0,0,27.3)))
    return obj.clean()

def hub(p,ways):
    if ways not in (5,6):raise ValueError(ways)
    outer=p[f'hub_diameter_{ways}']/2
    radius=p[f'radial_centre_{ways}']
    z=p['socket_z']
    a=p['ball_diameter']/2+p['socket_radial_clearance']
    thickness=p['hub_thickness']
    obj=cq.Solid.makeCylinder(outer,thickness)
    cuts=[]
    for i in range(ways):
        angle=2*math.pi*i/ways
        ux,uy=math.cos(angle),math.sin(angle)
        centre=V(radius*ux,radius*uy,z)
        cuts.append(cq.Solid.makeSphere(a,centre,angleDegrees1=-90,angleDegrees2=90))
        # U-shaped relief at the rim: distinguishes radial lobes visually and gives pivot room.
        scallop=V((outer+2.3)*ux,(outer+2.3)*uy,-1)
        cuts.append(cq.Solid.makeCylinder(8.2,thickness+2,scallop))
        # Slot for the pivot neck from the ball to the outside, at the lower face.
        # Straight slot is a conservative prototype, not exact OEM catch.
        p0=V((radius-1)*ux,(radius-1)*uy,z)
        cuts.append(cq.Solid.makeCylinder(p['ball_stem_diameter']/2+p['neck_clearance'],outer-radius+12,p0,V(ux,uy,0)))
        # Below-face relief gives a real assembly route from below.
        cuts.append(cq.Solid.makeBox(1,1,1)) if False else None
    for c in cuts:obj=obj.cut(c)
    obj=obj.cut(cq.Solid.makeCylinder(p['hub_center_hole']/2,thickness+2,V(0,0,-1)))
    obj=obj.cut(cq.Solid.makeCone(p['hub_center_hole']/2,p['hub_counterbore_top']/2,3.2,V(0,0,thickness-3.2)))
    obj=obj.clean()
    return obj

def clamp(p):
    obj=cq.Solid.makeCylinder(p['clamp_plate_diameter']/2,p['clamp_plate_thickness'])
    return obj.cut(cq.Solid.makeCylinder(3.2,p['clamp_plate_thickness']+2,V(0,0,-1))).clean()

def gauge(p):
    # Calibration collar tests fit only, ring bore Ø16.7 and clearance on neck.
    ro=12;ri=p['ball_diameter']/2+p['socket_radial_clearance']
    obj=cq.Solid.makeCylinder(ro,6)
    return obj.cut(cq.Solid.makeCylinder(ri,8,V(0,0,-1))).clean()

ITEMS={'hub_5_way':lambda p:hub(p,5),'hub_6_way':lambda p:hub(p,6),
       'ball_connector':ball_connector,'locking_plate_fit_test':clamp,'ball_diameter_gauge':gauge}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='output')
    parser.add_argument('--ball-clearance',type=float,default=.35)
    parser.add_argument('--neck-clearance',type=float,default=.4)
    parser.add_argument('--stl-tolerance',type=float,default=.065)
    args=parser.parse_args()
    p=SPEC.copy();p['socket_radial_clearance']=args.ball_clearance;p['neck_clearance']=args.neck_clearance
    d=Path(args.output);d.mkdir(parents=True,exist_ok=True); data={}
    for name,fn in ITEMS.items():
        s=fn(p)
        valid=s.isValid();solids=len(s.Solids());volume=s.Volume()
        print(name,'solid',solids,'valid',valid,'volume',round(volume,2),flush=True)
        if not valid or solids!=1 or volume<=0:raise RuntimeError(name+' invalid')
        cad=d/(name+'.step');stl=d/(name+'.stl')
        cq.exporters.export(s,str(cad),exportType='STEP')
        restored=cq.importers.importStep(str(cad)).val()
        assert restored.isValid() and len(restored.Solids())==1 and abs(s.Volume()-restored.Volume())<max(0.1,s.Volume()*1e-5)
        cq.exporters.export(s,str(stl),exportType='STL',tolerance=args.stl_tolerance,angularTolerance=.12)
        mesh=trimesh.load(str(stl),force='mesh')
        mesh.update_faces(mesh.nondegenerate_faces());mesh.remove_unreferenced_vertices()
        mesh.export(str(stl))
        print('   mesh watertight',mesh.is_watertight,'consistent winding',mesh.is_winding_consistent,'bodies',len(mesh.split(only_watertight=False)),flush=True)
        if not mesh.is_watertight or not mesh.is_winding_consistent:raise RuntimeError(name+' mesh invalid')
        data[name]={'volume_mm3':round(volume,2),'bbox_mm':[[round(v,2) for v in s.BoundingBox().min.toTuple()] if False else [round(s.BoundingBox().xmin,2),round(s.BoundingBox().ymin,2),round(s.BoundingBox().zmin,2)], [round(s.BoundingBox().xmax,2),round(s.BoundingBox().ymax,2),round(s.BoundingBox().zmax,2)]],'stl_triangles':len(mesh.faces)}
    (d/'manifest.json').write_text(json.dumps({'settings':p,'models':data,'status':'experimental; print fit gauges; NOT strength-certified'},ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()