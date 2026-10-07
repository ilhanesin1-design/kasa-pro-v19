# KASA PRO V19 - GitHub Sync / Final Fix

## Düzeltilenler

1. Şifre sıfırlama e-postası artık `/reset-password` adresine gider.
2. Supabase Auth `detectSessionInUrl` aktif edildi; recovery bağlantısından gelen oturum yakalanır.
3. `/reset-password` sayfası eklendi ve `PASSWORD_RECOVERY`/session kontrolü yapar.
4. Yeni şifre `supabase.auth.updateUser({ password })` ile güncellenir.
5. Başarılı güncellemeden sonra güvenli şekilde `/login` sayfasına dönülür.
6. Vercel SPA route'ları için `vercel.json` rewrite eklendi.
7. Fatura ekleme ekranına kamera ile QR okutma eklendi.
8. QR içeriği JSON, URL query parametreleri veya `anahtar=değer` / `anahtar:değer` formatlarından okunabilir.
9. Firma, fatura no, tutar, ödenen, tarih, vade, KDV, içerik, not ve para birimi mümkün olduğunca otomatik doldurulur.
10. QR ile okunan veri kaydetmeden önce kullanıcı tarafından düzenlenebilir; mevcut `v19_create_invoice` RPC ve Supabase veri modeli korunmuştur.
11. Mevcut finans kayıtlarını silen veya topluca değiştiren SQL eklenmemiştir.

## GitHub'a uygulanacak dosyalar

- `src/lib/supabase.ts`
- `src/pages/Auth.tsx`
- `src/pages/ResetPasswordPage.tsx`
- `src/App.tsx`
- `src/pages/InvoicePage.tsx`
- `src/styles/theme.css`
- `package.json`
- `vercel.json`

## Kurulum

```bash
npm install
npm run build
```

`html5-qrcode` bağımlılığı QR kamera taraması için eklenmiştir.

## Supabase

URL Configuration:

- Site URL: `https://kasa-pro-v19.vercel.app`
- Redirect URL: `https://kasa-pro-v19.vercel.app/reset-password`

Bu değerler uygulamadaki yeni akışla eşleşmektedir.
