"""Validate each STL in a browser-exported ZIP (requires numpy and trimesh)."""
import io
import json
import sys
import zipfile
import numpy as np
import trimesh

with zipfile.ZipFile(sys.argv[1]) as archive:
    manifest = json.loads(archive.read('project.json'))
    assert manifest['geometry']['range_margin_m'] == 0
    for tile in manifest['tiles']:
        mesh = trimesh.load(io.BytesIO(archive.read(tile['filename'])), file_type='stl')
        assert np.isfinite(mesh.vertices).all(), tile['id']
        assert mesh.is_watertight, tile['id']
        assert mesh.is_winding_consistent, tile['id']
        assert mesh.volume > 0, tile['id']
        assert (mesh.extents[:2] <= manifest['settings']['tile_size'] + 1e-4).all(), tile['id']
        assert mesh.extents[2] <= 210, tile['id']
        assert np.allclose(mesh.extents, tile['extents_mm']), tile['id']
        print(f"PASS {tile['id']}: watertight, outward winding, volume={mesh.volume:.3f}, extents={mesh.extents}")
    assert len(manifest['tiles']) > 0
    print(f"PASS {len(manifest['tiles'])} STL files")
