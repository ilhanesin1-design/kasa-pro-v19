
# KASA PRO V19 - Final Fixes

## Core fixes
- SUPER_ADMIN resolution now works from `user_branch_roles`, profile JSON `role`, and JWT metadata.
- SUPER_ADMIN can load all companies and all branches through secure RPCs.
- Company creation uses `superadmin_create_company` and shows real errors instead of silently falling back.
- Help Center writes notifications through the database RPC; it does not require an Edge Function.
- SUPER_ADMIN user creation no longer requires an Edge Function: the client creates the Auth user with a non-persistent secondary Supabase client, then a SECURITY DEFINER RPC finalizes profile + company/branch/role assignment.
- Transactions include `created_by` and resolve the operator name from `profiles.username` / `full_name`.
- Report Center exports a multi-sheet, styled XLSX with summary, transactions, invoices, and cari.
- Report workbook supports frozen headers, filters, currency formatting, widths, print setup, and corporate title styling.
- Brand text is `KASA PRO V19` / `BY İLHAN EŞİN`.

## Data safety
- No DROP TABLE, TRUNCATE, or bulk DELETE migration is included.
- Existing financial data is not altered on application startup.

## Supabase
Run `SUPABASE_1_SEFER_FINAL_GUVENLI.sql` once in Supabase SQL Editor. It contains the secure RPCs required by the application. The Edge Functions in `supabase/functions/` are retained only as optional compatibility paths.


