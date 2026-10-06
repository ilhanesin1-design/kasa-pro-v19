# KASA PRO V19 – FINAL KONTROL

Bu paket, kullanıcı tarafından bildirilen toplu sorunların tek sürümde birleştirilmiş çalışma tabanıdır.

## Düzeltilen ana başlıklar
- SUPER_ADMIN rol tespiti ve işletme → şube kapsamı
- SUPER_ADMIN işletme listeleme ve işletme oluşturma RPC'si
- SUPER_ADMIN kullanıcı oluşturma / işletme / çoklu şube / rol ataması UI'si
- Türkçe canlı tablo adları için uyumluluk katmanı
- Bildirimlerin gerçek `bildirimler` tablosundan okunması ve 5 saniyelik yenileme
- Yardım Merkezi bildirim üretimi
- Gelir/gider işleminde işlemi yapan kullanıcı adı
- Fatura firma klasörleri, fatura içeriğinde ayrı kayıtlar, düzenleme ve soft-delete
- Fatura ödemesinde yalnızca Kasa/Kart; Kasa ödemesi gider hareketine dönüşür
- Raporu oluştur düğmesinde doğrudan kurumsal XLSX indirme
- SUPER_ADMIN kapsamının finansal ekranlara uygulanması
- Giriş ekranı ve uygulama tipografisinin büyütülmesi
- `KASA PRO V19 · BY İLHAN EŞİN` marka metni
- Şifre sıfırlama e-postası
- TCMB kur ekranı ve önbellek
- Tauri açılış hatalarında boş ekran yerine hata ekranı

## Veri güvenliği
`SUPABASE_1_SEFER_FINAL_GUVENLI.sql` içinde otomatik veri silme için DROP/TRUNCATE/DELETE komutu bulunmaz. SQL yalnızca fonksiyonları tanımlar/günceller. Gerçek veri yazma/güncelleme, uygulamadaki kullanıcı eylemi ile çağrılan RPC'lerde gerçekleşir.

## Doğrulama
- TS/TSX syntax/transpile kontrolü: 0 hata
- ZIP arşiv kontrolü: final paket oluşturulurken ayrıca doğrulanmalıdır.
- Tam Windows `npm run build` ve `cargo check` bu çalışma ortamında Node/Rust bağımlılıkları kurulumu ve Rust toolchain erişimi olmadığı için burada çalıştırılamamıştır.
