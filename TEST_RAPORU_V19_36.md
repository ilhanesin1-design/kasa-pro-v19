# KASA PRO V19.36 Statik Kontrol Raporu

Tarih: 2026-10-10

**Statik kontroller: 22/22 geçti.**

- [x] **POSMIST route no longer superadmin-only**
- [x] **POSMIST view/manage permission controls**
- [x] **POSMIST API-key sanitizer in server SQL**
- [x] **Server-side POSMIST mutation permission guards**
- [x] **Server-side granular income/expense permissions**
- [x] **Separate income and expense routes/actions**
- [x] **Dashboard top expense share and server status**
- [x] **Offline cache and persistent outbox**
- [x] **Offline retry uses server-side idempotency UUID**
- [x] **Outbox replay does not overwrite concurrent different events**
- [x] **Invoice totals and payment-history display**
- [x] **Read notifications can be cleared**
- [x] **Notification read/clear actions can queue offline**
- [x] **Help center sends admin messages**
- [x] **Kasa submenu usability styles exist**
- [x] **Sensitive legacy RPCs revoked from direct client access**
- [x] **Source TS/TSX files exist** — 25 files
- [x] **SQL dollar-quoted blocks paired** — {'$query$': 2, '$$': 10}
- [x] **SQL brackets balanced (lexical check)** — paren=0; bracket=0
- [x] **Required SQL migration helpers referenced** — Prerequisites described in README
- [x] **No .env secret file in source tree**
- [x] **No node_modules bundled**

## Açık doğrulamalar

- Vite build not executed: npm install failed with EAI_AGAIN while resolving registry.npmjs.org; Vite is not installed in this environment.
- Supabase migration not executed against the user database; database schema/RLS/RPC behavior still requires Preview testing.
- Static SQL punctuation checks are not a PostgreSQL parser and do not establish SQL runtime correctness.
