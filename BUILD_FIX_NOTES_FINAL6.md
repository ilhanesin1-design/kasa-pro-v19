# KASA PRO V19 – Build Fix FINAL6

The Vercel build failed because the db helper was being used with a generic type argument in one source revision while TypeScript inferred `unknown` in another.

The helper is now intentionally typed as returning `Promise<any>` and explicit `db<...>` calls were removed from table-resolution/fetch helpers. This preserves the existing Supabase result shape (`data`, `error`) without changing runtime behavior.

No database migration or data mutation was added by this fix.
