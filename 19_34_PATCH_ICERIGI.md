# V19.34 patch contents

Files changed for the schema-cache issue:
- `src/lib/app.ts`: uses `kasa_v19_read_rows` as a database read path before direct PostgREST table requests; keeps RLS/grants, only falls back for missing-RPC/schema-cache cases, and does not silently swallow access errors.
- `package.json`: version marker changed to `19.34.0` so the deployment can be identified.
- `KASA_PRO_V19_SCHEMA_CACHE_RPC_FIX.sql` plus `supabase/sql/KASA_PRO_V19_SCHEMA_CACHE_RPC_FIX.sql`: additive SQL function; no table/data modifications.

The exact build has not been run in this environment because project npm dependencies are not installed. `src/lib/app.ts` passed TypeScript transpile syntax validation with zero diagnostics. Production data and live deployment have not been tested from here.
