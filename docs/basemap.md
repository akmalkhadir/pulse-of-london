# Self-hosted basemap (`london.pmtiles`)

The map's dark vector basemap is a single Protomaps-schema PMTiles file served
from R2 at `…/basemap/london.pmtiles`. It is **not** part of CI — regenerate it
manually a few times a year (OSM data drifts slowly):

1. `brew install protomaps/tap/pmtiles` (or grab a release binary from
   <https://github.com/protomaps/go-pmtiles/releases>).
2. Extract Greater London from a recent Protomaps planet build (the `pmtiles`
   CLI reads the remote planet over HTTP range requests, so only the London
   region downloads — pick a dated build from <https://build.protomaps.com/>):
   ```
   pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles london.pmtiles \
     --bbox=-0.5103,51.2868,0.3340,51.6919 --maxzoom=15
   ```
3. `pmtiles show london.pmtiles` — confirm it's the **Protomaps** schema
   (layers: `earth`, `water`, `roads`, `places`, `landuse`, `boundaries`, …),
   max zoom 15. If you instead see OpenMapTiles names (`transportation`,
   `waterway`), you extracted from the wrong source — `@protomaps/basemaps`
   only styles the Protomaps schema.
4. Upload to the R2 bucket (the same bucket that serves `snapshot.json`):
   ```
   wrangler r2 object put <bucket>/basemap/london.pmtiles \
     --file london.pmtiles --content-type application/octet-stream --remote
   ```
5. Confirm a ranged GET returns HTTP `206`:
   ```
   curl -s -r 0-99 -o /dev/null -w "%{http_code}\n" \
     https://pub-65d41e5468344746919009655cb3a516.r2.dev/basemap/london.pmtiles
   ```
6. **CORS (required, one-time per bucket).** The browser fetches the pmtiles file
   cross-origin (the site is on `…workers.dev`, the file on `…r2.dev`), so the
   bucket needs a CORS rule allowing `GET` + the `Range` header from the site
   origin. Without it the basemap fails with `No 'Access-Control-Allow-Origin'`.
   Set it once with `cors.json`:
   ```json
   {
     "rules": [
       {
         "allowed": {
           "origins": ["https://pulse-of-london.akmal-a-khadir.workers.dev"],
           "methods": ["GET"],
           "headers": ["range"]
         },
         "exposeHeaders": ["content-length", "content-range", "etag", "accept-ranges"],
         "maxAgeSeconds": 3600
       }
     ]
   }
   ```
   ```
   wrangler r2 bucket cors set pulse-of-london --file cors.json
   ```
   Verify: an `OPTIONS` preflight returns `204` with `Access-Control-Allow-Origin`,
   and a ranged `GET` returns `206` with that header. (Add localhost origins here
   if you want the basemap to render in local dev/preview too.)

The browser reads this file directly via the `pmtiles://` protocol (registered
in `packages/web/app/lib/basemap.ts`); only viewport tiles transfer, and R2
egress is free. The public URL is the `BASEMAP_PMTILES_URL` constant in that
file — update it there if the bucket changes.

**Attribution:** OSM (ODbL) + Protomaps — rendered by `AttributionFooter` and the
map's compact attribution control. Glyphs/sprites load from
`protomaps.github.io/basemaps-assets` (no key); they may be moved to R2 later.
