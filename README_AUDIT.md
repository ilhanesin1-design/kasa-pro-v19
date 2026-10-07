
# KASA PRO V19 - Tek Seferlik Audit / Düzeltme Paketi

Bu sürüm demo finans rakamlarını kaldırır ve Supabase'i tek veri kaynağı olarak kullanır.

## Kontrol edilen başlıklar
- `.env` ile Vite/Supabase bağlantısı
- Supabase Auth oturumu
- username login için Edge Function + uyumluluk fallback
- kayıt sırasında `profiles` senkronizasyonu
- dinamik kullanıcı/şube bilgileri
- Admin-only Users / Permissions / POSMIST rotaları
- sidebar'da hardcoded şirket/kullanıcı bilgilerinin kaldırılması
- Türkçe `GELİR` normalizasyonu
- yerel tarih hesabı / timezone hatalarının azaltılması
- 1000/5000 satır sınırlarının dashboard bakiyesinde pagination ile azaltılması
- demo kayıtlarının aranması

## Bilinçli olarak yapılmayanlar
Canlı Supabase şemasına erişim olmadan bilinmeyen tablo kolonlarına CRUD yazılmadı. `app_invoices`, `app_cari_payments`, `permissions`, `posmist_integrations` gibi tabloların gerçek kolonları doğrulanmadan veri kaybı riski oluşturacak INSERT/UPDATE/DELETE işlemleri eklenmedi.

## Gerekli canlı doğrulama
Supabase tarafında mevcut RLS/policies ve gerçek tablo şeması ile test edilmelidir. Özellikle `profiles`, `user_branch_roles`, `branches`, `app_transactions` kolonları V19'un kullandığı alanlarla uyumlu olmalıdır.


