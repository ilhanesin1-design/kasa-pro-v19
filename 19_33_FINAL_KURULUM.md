# KASA PRO V19.33 – Son kurulum

## Bu sürüm
- Ekrandaki `public.şubeler` schema-cache hatasında SUPER_ADMIN için doğrudan REST tablo araması yerine önce veritabanı RPC'si kullanılır.
- RPC başarıyla `[]` döndürse bile uygulama tekrar hatalı REST tablo yoluna düşmez.
- RPC yoksa güvenli rol-tablosu fallback'i denenir.
- Dashboard/Kasa/Fatura/Cari için şube çözümleme tek yoldan yapılır.
- Mobil web QR penceresi açılınca arka kamera otomatik başlatılır; GİB QR JSON'u fatura formuna aktarılır.

## Önemli
Supabase tarafında `SUPABASE_1_SEFER_FINAL_GUVENLI.sql` dosyasını SQL Editor'da bir kez çalıştırın. Uygulamanın SUPER_ADMIN şube/işletme RPC katmanı bununla kurulur. Mevcut finansal kayıtları silen DROP/TRUNCATE komutu içermez.
