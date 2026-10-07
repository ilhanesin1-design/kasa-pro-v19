
# KASA PRO V19 - Final çalışma paketi

Bu paket mevcut çalışan V19 Tauri + React + TypeScript + Supabase projesi üzerinden hazırlanmıştır.

## Eklenen/aktif edilen alanlar
- Gerçek Supabase finans hareketleri: Gelir/Gider ve Kasa
- Fatura ekleme, düzenleme, pasifleştirme, tekil listeleme ve A4 PDF/yazdır önizlemesi
- Cari hesap hareketi ekleme, düzenleme ve pasifleştirme
- Gerçek veri kullanan Rapor Merkezi
- TCMB kur güncellemesi + Supabase/local fallback Kur Merkezi
- Büyük, okunabilir Şube kartları ve Şube ekleme/düzenleme
- İşletmeler ekranı ve Super Admin için işletme oluşturma/düzenleme
- Kullanıcılar ve işletme/şube/rol atama ekranı
- Kullanıcı bazlı yetki merkezi
- Dolu Ayarlar ekranı: profil, işletme, okunabilirlik
- Admin-only POSMIST yönetimi ve entegrasyon ekleme/düzenleme
- Büyük kurumsal tipografi ve responsive tablo düzeni

## Veri güvenliği
- Projede otomatik çalışan DROP/TRUNCATE/migration yoktur.
- Uygulama açılışında mevcut iş kayıtlarını değiştiren işlem yoktur.
- Pasifleştirme ve düzenleme yalnızca kullanıcı ilgili butona bastığında yapılır.
- Frontend'e service-role anahtar konmaz.

## Kurulum
1. Mevcut çalışan `.env` dosyanızı proje köküne koyun.
2. `npm install`
3. `npm run tauri:dev`
4. Windows paketlemek için `npm run tauri:build`

## Not
POSMIST'in günlük 23:59 otomasyonu gerçek POSMIST API'sinin doğrulanmış API sözleşmesine ve Supabase Edge Function dağıtımına bağlıdır. Bu paket POSMIST yönetim ekranını ve güvenli istemci tarafı görünümünü içerir; doğrulanmamış bir üçüncü taraf API davranışı uydurulmamıştır.


