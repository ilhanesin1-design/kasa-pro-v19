# KASA PRO V19 Windows Kurulum

1. Bu klasöre mevcut çalışan `.env` dosyanızı kopyalayın.
2. `.env` içinde `VITE_SUPABASE_URL` ve `VITE_SUPABASE_PUBLISHABLE_KEY` değerleri bulunmalıdır.
3. Supabase SQL Editor'de `SUPABASE_1_SEFER_FINAL_GUVENLI.sql` dosyasını bir kez çalıştırın.
4. PowerShell'i proje klasöründe açın.
5. `npm install`
6. `npm run tauri:dev`
7. Windows paketini almak için `npm run tauri:build`

Service-role anahtarını `.env` içine koymayın.

Kullanıcı oluşturma ve Yardım Merkezi için Edge Function deploy zorunlu değildir; ana uygulama RPC uyumluluk katmanını kullanır. Proje INACTIVE olduğu sürece Edge Function deploy komutları 404 verebilir.
