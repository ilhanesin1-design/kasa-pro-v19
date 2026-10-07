# KASA PRO V19.27 — QR + Şifre Yönetimi + Şifre Sıfırlama Bildirimi

Bu sürüm mevcut çalışan Mobil Uyumlu V19 tabanı üzerine yalnızca üç özellik ekler:

1. Faturalar ekranında **QR ile fatura ekle**: telefon kamerası veya galeriden GİB QR okunur, fatura alanları doldurulur ve kullanıcı kaydetmeden önce kontrol eder.
2. SUPER_ADMIN kullanıcı yönetiminde **Şifreyi sıfırla**: mevcut parola görüntülenmez; SUPER_ADMIN yeni parola belirler.
3. Giriş ekranında **Şifremi unuttum** kullanıldığında standart Supabase reset e-postası gönderilir ve ayrıca SUPER_ADMIN bildirim merkezine bilgi düşer.

## Supabase Edge Functions

Yeni parola belirleme ve şifre sıfırlama bildirimi server-side Supabase Admin API gerektirir. Mevcut iki function güncellendi.

Supabase CLI ile bir kez:

```powershell
supabase functions deploy admin-create-user
supabase functions deploy help-center
```

Service-role/secret anahtarı Vercel frontend ortam değişkenlerine eklenmemelidir.

## Vercel

GitHub `main` üzerine bu paketin dosyalarını yükleyin. Vercel otomatik deploy ederse ayrıca bir ayar değişikliği gerekmez.

Build:

```text
npm run build
```

Output:

dist

## QR kullanımı

Faturalar → **QR ile fatura ekle** → kameraya izin ver → QR'ı okut → alanları kontrol et → **Faturayı kaydet**.

GİB QR standardındaki gönderen VKN/TCKN, fatura numarası, tarih, para birimi ve tutar gibi bilgiler otomatik alınır. Gönderen firma adı QR standardında ayrı bir alan olarak bulunmadığından firma adı tarama sonrası kontrol edilmelidir.
