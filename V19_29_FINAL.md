# KASA PRO V19.29 — QR + Şifre Sıfırlama Final

- QR fatura okutma InvoicePage üzerinde görünür banner + mobil kamera + galeri desteği ile korunmuştur.
- `html5-qrcode` kullanılır; GİB QR JSON alanları fatura formuna aktarılır.
- Şifre sıfırlama linki production ortamında doğrudan `https://kasa-pro-v19.vercel.app/reset-password` adresine yönlendirilir; localhost testinde de production reset adresi kullanılır.
- SUPER_ADMIN mevcut parolayı göremez; yeni parola belirleyebilir. Bu işlem `admin-create-user` Edge Function üzerinden güvenli Admin API çağrısı ile yapılır.
- Şifremi unuttum isteği `help-center` Edge Function üzerinden SUPER_ADMIN bildirim merkezine kaydedilir.
- Mevcut uygulama verilerini silen migration eklenmemiştir.
