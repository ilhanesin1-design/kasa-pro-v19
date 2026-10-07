# KASA PRO V19.28 — QR + Şifre Yenileme

## Mobil gelen fatura QR
- Faturalar ekranında görünür "Gelen faturayı hızlı işle" alanı ve "QR okut" düğmesi vardır.
- Kamera varsayılan olarak arka kamerayı ister; desteklemeyen tarayıcıda cihaz kamerası listesine geri döner.
- Galeriden QR görseli seçme desteği vardır.
- GİB Karekod Standardı'ndaki JSON alanları (vkntckn, avkntckn, senaryo, tip, tarih, no, ettn, parabirimi, malhizmettoplam, kdvmatrah(...), hesaplanankdv(...), vergidahil, odenecek) okunur.
- QR sonucunda fatura formu açılır; kullanıcı kaydetmeden önce şube/firma ve diğer bilgileri kontrol eder.

## Şifre yenileme
- "Şifremi unuttum" artık `/reset-password` sayfasına yönlendirir.
- PKCE `code` ve access/refresh token hash biçimleri işlenir.
- Süresi dolmuş bağlantı için anlaşılır hata gösterilir ve tekrar giriş ekranına dönülebilir.
- SUPER_ADMIN mevcut parolayı göremez; güvenli şekilde yeni parola belirleyebilir.
- Şifre sıfırlama talebi help-center Edge Function ile SUPER_ADMIN bildirimine gönderilir.

## Supabase URL ayarı
Supabase Dashboard > Authentication > URL Configuration bölümünde:
- Site URL: https://kasa-pro-v19.vercel.app
- Redirect URL: https://kasa-pro-v19.vercel.app/reset-password
- Yerel geliştirme gerekiyorsa: http://localhost:3000/reset-password
