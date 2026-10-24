# DEM Provider Core — integration notes

**Status:** isolated and tested JavaScript module. **Not wired into production UI yet.** Safe for independent review alongside [Codex geometry issue #32](https://github.com/4qsn1k/4qsn1k.github.io/issues/32).

## Contract

`elevation-providers.js` exports `TerrainElevationProviders` for browsers, `module.exports` for Node.

- `PROVIDERS`: Mapzen Terrarium (PNG, 256px) and Mapterhorn Terrarium (WebP, 512px).
- `pixels(lat,lon,z,size)`: EPSG:3857 image pixel positions.
- `bounds` and `bestZoom`: tile window with edge padding; budget-limited selection.
- `height(r,g,b,alpha)`: Terrarium decoding; alpha=0 returns NoData.
- `createSampler`: bilinear sampling across adjoining tile boundaries, with strict NoData errors.
- `load`: bounded concurrent requests; injectable fetcher/decoder/cache for deterministic offline tests; source metadata.

Example:
```js
const r=await TerrainElevationProviders.load({
  bbox:{south:53.95,north:53.96,west:58.30,east:58.31},
  provider:'mapzen',
  maxTiles:72
});
console.log(r.sample(53.955,58.305),r.pixelSizeMeters);
```

Run tests: `node terrain-puzzle/tests/elevation-providers.test.js` (5 PASS on HOME-PC).

## Restrictions and next integration task
1. Raster pixel spacing is **not** the true underlying DEM measurement resolution.
2. Near Beloretsk, Mapterhorn Z13–Z16 returned 404 in one tested location; must inspect local coverage before choosing it.
3. Do not combine sources without checking and harmonizing vertical datums, no-data treatment, provenance and licensing.
4. This PR introduces provider infrastructure only. It does not switch the current generator from Mapzen.
5. Integrate it into `terrain.js` only after Codex geometry PR acceptance, with a separate tested PR.
6. Need explicit original-source resolution metadata before advertising 'automatic higher quality' mode.

All code in this PR is independent of Waterbot and Airlock and does not touch the production HTML/JS files.
