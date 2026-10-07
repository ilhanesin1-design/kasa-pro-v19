# KASA PRO V19.27

## QR ile fatura
Faturalar ekranına QR okutma eklendi. GİB e-Fatura/e-Arşiv karekodundaki VKN/TCKN, tarih, fatura no, ETTN, para birimi, toplam ve KDV bilgileri okunup yeni fatura formuna doldurulur. GİB standardı gönderenin adını değil VKN/TCKN'sini taşıdığı için firma adı QR'dan kesin olarak alınamaz; formda kontrol edilebilir.

## SUPER_ADMIN şifre yönetimi
Mevcut kullanıcı parolası okunmaz. SUPER_ADMIN kullanıcı seçerek yeni parola belirleyebilir. Parola işlemi mevcut `admin-create-user` Edge Function içindeki güvenli `reset_password` işlemi üzerinden Supabase Auth admin API ile yapılır.

## Şifremi unuttum bildirimi
Kullanıcı `Şifremi unuttum` seçeneğini kullandığında mevcut `help-center` Edge Function içindeki `password_reset` işlemi SUPER_ADMIN hesaplarına bildirim oluşturur. Ardından normal Supabase Auth şifre yenileme e-postası gönderilir. Bildirim başarısız olsa bile kullanıcıya reset e-postası gönderilmeye devam eder.

## Edge Functions
Mevcut iki fonksiyonun güncel kodunu deploy edin:

```powershell
supabase functions deploy admin-create-user
supabase functions deploy help-center
```

Service-role anahtarı frontend/Vercel env içine eklenmez.

