"""Inspect generated Terrain Puzzle ZIP, enclosed STL/3MF meshes and GPS."""
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

import numpy as np
import trimesh

path = sys.argv[1]
with zipfile.ZipFile(path) as outer:
    assert outer.testzip() is None
    project = json.loads(outer.read("project.json"))
    tiles = [n for n in outer.namelist() if n.endswith(".stl")]
    colors = [n for n in outer.namelist() if n.endswith(".3mf")]
    assert len(tiles) == project["plan"]["total"]
    assert "EPSG:32640" in project["geometry"]["projection"] or project["source"] == "SYNTHETIC TEST DATA"
    for stl_file in tiles:
        m = trimesh.load(io.BytesIO(outer.read(stl_file)), file_type="stl")
        assert m.is_watertight and m.is_winding_consistent
        assert m.volume > 0 and np.isfinite(m.vertices).all()
        assert max(m.extents[:2]) < project["settings"]["tile_size"] + 0.001
    print("STL", len(tiles), "watertight PASS")
    if project["settings"]["export_3mf"]:
        assert len(colors) == len(tiles)
        for name in colors:
            with zipfile.ZipFile(io.BytesIO(outer.read(name))) as packet:
                assert packet.testzip() is None
                assert {"[Content_Types].xml","_rels/.rels","3D/3dmodel.model"} <= set(packet.namelist())
                root = ET.fromstring(packet.read("3D/3dmodel.model"))
                ns = {"m":"http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}
                vertices = root.findall(".//m:vertices/m:vertex", ns)
                triangles = root.findall(".//m:triangles/m:triangle", ns)
                mats = root.findall(".//m:basematerials/m:base", ns)
                assert len(mats) == 6 and len(vertices)>0 and len(triangles)>0
                assert all(0 <= int(tri.attrib["p1"]) < 6 for tri in triangles)
        print("3MF", len(colors), "containers, palette, faces PASS")
    if "ROUTE/route.geojson" in outer.namelist():
        j = json.loads(outer.read("ROUTE/route.geojson"))
        assert j["geometry"]["type"] == "LineString"
        assert len(j["geometry"]["coordinates"])>=2
        print("ROUTE", len(j["geometry"]["coordinates"]), "coordinates PASS")
    print("QA PASS", path)
