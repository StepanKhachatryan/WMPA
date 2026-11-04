# Deploying

Two services, each doing one job:

| What | Where | Address |
| --- | --- | --- |
| The map (static files from `npm run build`) | Netlify | `https://wmpa.geogeeks.am` |
| The API (`water` Function) and PostGIS | Neon, AWS Europe (Frankfurt) | the Function's URL from `neon deploy` |

The order matters: the map's build needs the API's URL, so Neon goes first.

## 1. Neon — the database and the API

**Create the project in `aws-eu-central-1` (Frankfurt).** It is the closest to
Armenia of the regions that have Functions. A project's region is fixed when it
is created and cannot be changed afterwards — moving means a new project and a
data migration. Neon's CLI defaults to `aws-us-east-2` (Ohio) when no region is
given, so choose it explicitly, in the Console or with
`neon projects create --region-id aws-eu-central-1`.

Check that `neon deploy` targets that project before running it; this was not
verified here, because Neon is unreachable from the sandbox the code was
written in.

```bash
neon login
neon deploy                                   # Function + Realtime; writes .env.local
psql "$DATABASE_URL_UNPOOLED" -f neon/water/schema.sql
psql "$DATABASE_URL_UNPOOLED" -f neon/water/seed-demo.sql   # optional: demo river and lake
```

Then confirm the API answers from outside:

```bash
curl "$NEON_FUNCTION_WATER_BASE_URL/health"
curl "$NEON_FUNCTION_WATER_BASE_URL/layers"
```

## 2. Netlify — the map

1. **Import the repository** from GitHub as a new Netlify project:
   `StepanKhachatryan/WMPA`, branch `main`. Build settings come from
   `netlify.toml`; leave the form's fields as it fills them.
2. **Environment variables:** `WATER_API_URL` = the value of
   `NEON_FUNCTION_WATER_BASE_URL` from step 1. Without it the build fails on
   purpose rather than ship a map pointing at localhost.
3. **Domain management → Add a domain:** `wmpa.geogeeks.am`.
4. **At the DNS provider for `geogeeks.am`:** a CNAME record, host `wmpa`,
   value `<your-site-name>.netlify.app` — no `https://`. Netlify shows the exact
   value at the end of step 3.
5. **HTTPS** needs nothing: once the CNAME resolves, Netlify issues a Let's
   Encrypt certificate and renews it. DNS changes can take up to 48 hours to
   propagate; if no certificate appears within 24 hours, the record is usually
   wrong.

## CORS

The API answers browsers only from the origins in `ALLOWED_ORIGINS`
(`neon/water/index.ts`): `https://wmpa.geogeeks.am`, the GeoGeeks site, and
`http://localhost:3000` for development.

So the map works only at `wmpa.geogeeks.am`. At `<site>.netlify.app` and in
Netlify's deploy previews it loads, but gets no layers. That is deliberate:
allowing `*.netlify.app` would allow every site on Netlify. If previews need
data, add their exact origin, or point preview builds at a Neon branch with its
own Function URL.

The QGIS plugin is not a browser and is unaffected by CORS.
