# KASA PRO V19 - SUPER_ADMIN Kapsam ve Bildirim Düzeltmesi

Bu paket, SUPER_ADMIN hesabının işletme/şube kapsamının ve bildirim merkezinin gerçek Supabase fonksiyonlarıyla eşleşmesini düzeltir.

## Yapılan düzeltmeler
- SUPER_ADMIN işletmeleri: `get_superadmin_companies`
- SUPER_ADMIN şubeleri: `get_superadmin_branches`
- Yardım bildirimi: `submit_help_request`
- Bildirim okuma: `notifications` + `v19_load_notifications` fallback
- Bildirim okundu: `notifications` + `v19_mark_notification_read`
- Eski `v19_get_companies` / `v19_get_branches` çağrılarına bağımlılık kaldırıldı.
- Şube RPC'sindeki mükerrer `RETURN QUERY` kaldırıldı.
- Kapsam seçiminde işletme ve şube ilişkisi korunur.

## Supabase
`SUPERADMIN_KAPSAM_BILDIRIM_FIX.sql` dosyasını Supabase SQL Editor'da bir kez çalıştırın.
Bu SQL DROP/TRUNCATE/DELETE içermez.
