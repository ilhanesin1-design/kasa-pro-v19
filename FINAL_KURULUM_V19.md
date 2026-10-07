
# KASA PRO V19 FINAL - Kurulum

## 1. Frontend

`.env` içine mevcut çalışan Supabase değerlerini koyun:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Ardından:

```powershell
npm install
npm run tauri:dev
```

## 2. Supabase SQL

`supabase/sql/SUPABASE_V19_FINAL_SAFE.sql` dosyasını Supabase SQL Editor'de bir kez çalıştırın.

Dosyada DROP TABLE / TRUNCATE / DROP SCHEMA yoktur. Mevcut finans kayıtları topluca silinmez.

## 3. Admin kullanıcı oluşturma ve Yardım Merkezi

Supabase CLI ile iki Edge Function'ı deploy edin:

```powershell
supabase functions deploy admin-create-user
supabase functions deploy help-center
```

Edge Function secret'ları Supabase tarafından sağlanan `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` üzerinden kullanılır. Service-role key'i masaüstü `.env` dosyasına koymayın.

## 4. Fatura ödemesi

Ödeme seçenekleri yalnızca:

- Kasa
- Kart

Kasa seçilirse tek transaction içinde:

1. `app_invoice_payments` ödeme kaydı,
2. `app_invoices` kalan/ödenen güncellemesi,
3. `app_transactions` üzerinde Gider kaydı

oluşturulur.

Kart seçilirse fatura ödeme kaydı ve fatura bakiyesi güncellenir; Kasa'ya Gider yazılmaz.

## 5. SUPER_ADMIN

Sağ üst Kapsam menüsünden:

- Tüm işletmeler
- Tek işletme
- İşletme içindeki tek şube

seçilebilir.

Ayarlar > SUPER_ADMIN Yönetimi üzerinden:

- İşletme Ekle
- Kullanıcı Ekle
- Kullanıcı Ata
- Kullanıcıları Yönet

kullanılabilir.

## 6. Yardım Merkezi

Yardım mesajı `notifications` tablosuna SUPER_ADMIN kullanıcılarına düşer. SUPER_ADMIN uygulamaya girdiğinde üst bildirim merkezinde ve Bildirim Merkezi sayfasında görünür.


