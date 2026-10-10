# KASA PRO V19.35.1 düzeltme notları

## Bu pakette yapılan düzeltmeler
- Dashboard gider kategorileri, yüklenen finans hareketlerinin içindeki bulunulan aya ait giderlerden hesaplanır; kategori halka grafiği, en yüksek kategori etiketi ve yüzde payları aynı toplama dayanır.
- Sistem Durumu kartı "Server Aktif" / "Çevrimdışı" durumunu gösterir. Bu kart tüm modüller için çevrimdışı yazma kuyruğu anlamına gelmez.
- Kasa İşlemleri alt menülerinin yazı ve tıklama alanları büyütülmüştür.
- Gelir ve gider için ayrı rotalar vardır. Bu rotalarda tür filtresi zorunlu kalır; ekranlar arasında tür dışı kayda geçilemez.
- Dashboard hızlı işlem düğmeleri doğrudan `/income` ve `/expense` ekranlarına gider.
- Düzenlenen finans kaydında mevcut şube seçili gelir; tarih filtreleme ve düzenleme ISO tarih anahtarını kullanır. Güncellemede tutarın 0'dan büyük olması doğrulanır.
- Okunmuş bildirimleri temizleme düğmesi eklenmiştir.
- Bildirim SQL'i Türkçe `bildirimler` ve İngilizce `notifications` tablo adaylarını ve mevcut V19.33 uyumluluk yardımcılarını kullanır. `v19_load_notifications()` yöneticiye yalnızca kendi hesabına gelen bildirimleri döndürür.
- İstemci, eski yüklemelerde SUPER_ADMIN dışındaki yöneticilere boş liste döndüren bildirim RPC'si sonucunda RLS korumalı tablo okuyucusuna geri döner; alternatif Türkçe/İngilizce alıcı ve içerik sütun adlarını da kontrol eder.
- Finans işlemi güncelleme yordamı boş şube ve sıfır/negatif tutarı reddeder.

## Kurulum sırası
1. GitHub `main` dalına ZIP'in tümünü toplu olarak değil, içindeki dosyaları aynı yollarla, inceleyerek aktarın.
2. Ön koşul olarak canlı Supabase ortamında V19.33 uyumluluk yardımcılarının (`v19_pick_table`, `v19_column_name`, `v19_norm_role`, `v19_insert_json`, `v19_update_json`, `v19_is_super_admin`) kurulu olduğunu doğrulayın.
3. Supabase SQL Editor'de yalnızca `supabase/sql/V19_35_FEATURE_PATCH.sql` dosyasını çalıştırın. Canlı şema/RLS incelemesi yapılmadan diğer tarihsel SQL dosyalarını toplu çalıştırmayın.
4. Commit sonrası Vercel Preview'da derleme ve oturum/işlem/bildirim/fatura akışlarını test edin. Önce gelir/gider ve bildirim testleri geçmeden canlıya almayın.

## Bilinen sınırlamalar
- Bu paket tüm modüller için kalıcı çevrimdışı yazma kuyruğu ve sunucu tarafı idempotent senkronizasyon sağlamaz. Bu özellik tamamlanmış değildir.
- Yetki Merkezi izin değerlerini saklar; ancak bu pakette gelir/gider ekle/düzenle/sil izinlerinin bütün sunucu RPC'lerinde zorunlu uygulanması tamamlanmış olarak doğrulanmamıştır. Bu değerleri tek başına güvenlik sınırı kabul etmeyin.
- Supabase üretim şemasına, RLS politikalarına veya Vercel Preview'a bu ortamdan erişilemediği için canlı entegrasyon testi yapılmamıştır.
- Bağımlılıklar ağ zaman aşımı nedeniyle kurulamadı; bu yüzden tam `npm run build` testi başarılı olarak raporlanamaz.

## Test kapsamı
Statik kaynak kontrolleri ve ZIP bütünlüğü kontrol edildi. Ancak bu ortamda bağımlılıklar kurulamadığı için Vite üretim derlemesi, tam TypeScript tür kontrolü ve PostgreSQL/Supabase üzerinde SQL çalıştırma testi tamamlanmadı. Ayrıntı: `TEST_RAPORU_19_35_1.md`.
