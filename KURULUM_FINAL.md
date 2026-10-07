
# KASA PRO V19 — FINAL KURULUM

## Windows

1. Çalışan mevcut `.env` dosyanızı proje köküne kopyalayın.
2. PowerShell: `npm install`
3. Çalıştırma: `npm run tauri:dev`
4. Windows paketleme: `npm run tauri:build`

## Supabase — tek seferlik güvenli SQL

`SUPABASE_1_SEFER_FINAL_GUVENLI.sql` dosyasını Supabase SQL Editor içinde bir kez çalıştırın.

Bu script: DROP TABLE veya TRUNCATE içermez. Mevcut finansal kayıtları topluca değiştirmez. Yalnızca eksik kolon/tablo/fonksiyon/policy yapılarını ekler veya günceller. Kullanıcı atama kaldırma fonksiyonu yalnızca SUPER_ADMIN tarafından açıkça çağrıldığında ilgili tek atamayı siler.

## SUPER_ADMIN kullanıcı oluşturma

Yeni Auth kullanıcısı oluşturma service-role gerektirdiği için `supabase/functions/admin-create-user` Edge Function deploy edilmelidir. Service-role anahtarını masaüstü `.env` dosyasına koymayın.

## Yardım Merkezi

Yardım Merkezi mesaj gönderirken `submit_help_request` RPC'yi kullanır. SUPER_ADMIN bildirimleri `notifications` tablosuna oluşturulur. `supabase/functions/help-center` bu akış için zorunlu değildir.

## İşletme fotoğrafları

Login ekranındaki 5 yerel fotoğraf `src/assets/hero/01.png` ... `05.png` dosyalarındadır ve otomatik fade/zoom döngüsünde gösterilir.

## Doğrulama

Kaynak TS/TSX dosyaları TypeScript transpile/syntax kontrolünden geçirildi. Bu ortamda npm registry erişimi zaman aşımına uğradığı için tam `npm build` ve Windows Tauri production build çalıştırılamadı.


