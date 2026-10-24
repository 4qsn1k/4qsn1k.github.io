# Geometry validation (Issue #32)

From the repository root, Node.js >=22, no npm installation or network required:

```sh
node --test terrain-puzzle/tests/geometry-core.test.js
```

19 cases cover 1×1/2×2/3×3/6×6, puzzle/plain edges, flat/sloped/peaked/negative/anomalous fields, NoData, exact shared seam orientation and Z, 0.2 mm gap, binary STL topology, normals, positive volume, dimensions, repeatability and LOD consistency. The STL checker independently reconstructs coordinate edges from serialized Float32 triangles; each edge must have exactly two opposite incidences. It also rejects duplicates and zero-area faces.

Browser integration requires Playwright and Chromium (already available in this cloud image):

```sh
python3 -m http.server 8000 --bind 127.0.0.1
# Another terminal, from repository root:
node terrain-puzzle/tests/browser-smoke.cjs
node terrain-puzzle/tests/browser-smoke.cjs --real-dem
```

The `--real-dem` command uses production Mapzen loading around Beloretsk (53.96 N, 58.30 E). It must complete separately; demo PASS does not imply real DEM PASS. In this cloud image Chromium lacks the proxy CA in its isolated trust store. The real-DEM test bridges only Mapzen HTTP transport through curl, preserving the inherited proxy, TLS verification, actual PNG payload and server CORS headers. It does not bypass verification or use synthetic responses. Direct Chromium HTTPS access still requires browser CA provisioning. The script checks initial Leaflet/grid state, renders WebGL, downloads ZIP and A4 PDF into `/tmp/terrain-smoke.*`. It fails on page JavaScript errors. Use `TERRAIN_TEST_URL` to change the internal test URL. A proxy/network denial is a blocked integration check, not missing terrain coverage. Mapzen Z15 raster pixel spacing does not establish source DEM accuracy.

Independent exported STL validation:

```sh
python3 -m pip install --target /tmp/terrain-validation-deps --no-deps trimesh==4.9.0
# numpy must also be available
PYTHONPATH=/tmp/terrain-validation-deps python3 terrain-puzzle/tests/validate-stl.py /tmp/terrain-smoke.zip
```

## Height-field contract

`geometry.js` works without DOM or network. The adapter in `terrain.js` converts geographic coordinates into the existing local equirectangular metre frame. Horizontal model millimetres map to metres using `scale/1000`; Z uses one global absolute elevation minimum, exaggeration, and a 3 mm base. Row A is north; local tile Y points north. No per-tile elevation offset or clipping of negative relative heights is used.

One Float64 lattice spans the whole project at the selected output mesh spacing. DEM is sampled once at every lattice point; all consumers use its bilinear interpolant, including warped puzzle coordinates and preview LOD. Lattice min/max conservatively bound every interpolated sample, with **zero additional arbitrary margin**. They are not claimed to be the extrema of the original continuous terrain or all original DEM pixels. Interpolation can smooth sub-lattice features: denser mesh cannot recover absent DEM detail. Source NoData fails field construction. Async construction yields every 32 rows and reports progress.

`buildTileMesh` shares warping, world origins, datum, outward winding and topology between STL and preview. Preview uses fewer segments, so fine peaks may be omitted visually; it never recomputes its datum. Before the gap, adjacent puzzle boundaries coincide within floating-point error. The nominal 0.2 mm gap is an axis separation, not a guaranteed perpendicular manufacturing clearance on curved surfaces. Physical fit remains untested.

`project.json` records conservative elevation bounds, field spacing/count and range method, base, seam profile/width/amplitude/gap, projection/datum limitations and actual per-tile serialized bounds/extents. Runtime finite checks are not represented as a full mesh certification.

## Remaining limitations

- Existing local projection remains; UTM, antimeridian and polar handling are future work.
- Vertical datum is inherited from one source, not normalized between providers.
- DEM provider integration belongs to PR #33; its files are untouched.
- Real DEM and live map imagery require allowed external destinations. The Leaflet/grid UI can be checked independently of live imagery.
- PDF A4 regression is automated here; A0 300 DPI and physical slicer/print testing are not rerun.
