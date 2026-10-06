# KASA PRO V19 — Üretim tablo düzeltmesi

Supabase projesindeki gerçek üretim tabloları kullanılır:

- Finans hareketleri: `public.app_transactions`
- Faturalar: `public.app_invoices`
- Fatura ödemeleri: `public.app_invoice_payments`
- Cari ödemeler: `public.app_cari_payments`
- İşletmeler: `public.companies`
- Şubeler: `public.branches`
- Kullanıcı profilleri: `public.profiles`
- Kullanıcı/şube rolleri: `public.user_branch_roles`
- Kullanıcı izinleri: `public.user_permissions`
- Bildirimler: `public.notifications`
- POSMIST: `public.posmist_integrations`

Önceki sürüm, eski tablo adlarını (`uygulama_islemleri` vb.) aday listesinde tutuyordu. Üretim şemasında bu tablo olmadığı için eski/önbelleğe alınmış istemcilerde `PGRST205` görülebiliyordu.

Bu sürüm finans okuma katmanını doğrudan `app_transactions` tablosuna bağlar.

## Güvenlik

Bu değişiklik mevcut verileri silmez ve tablo oluşturmaz. `SUPABASE_PROD_SCHEMA_RELOAD.sql` yalnızca PostgREST şemasını yeniler.
