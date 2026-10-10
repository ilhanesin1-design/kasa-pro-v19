# KASA PRO V19.35 yama notları

## Bu paketteki değişiklikler
- Dashboard gider kategorileri son 8 işlemden değil, yüklenen gerçek finans kayıtlarının içinde bulunulan aya ait gider kayıtlarından hesaplanır; en yüksek kategori ve yüzdesi görünür.
- Sistem durumu metni “Supabase Bağlantısı” yerine “Server” ve “Senkronizasyon” olarak gösterilir. Bağlantı durumu başarılı veri yüklemesine ve tarayıcı ağ olaylarına göre güncellenir.
- Kasa İşlemleri alt menülerinin yazı ve tıklama alanları büyütülür.
- Gelir ve gider için ayrı ekran rotaları eklenir; bu ekranlardan işlem türü sabit kalır. Tüm İşlemler ve Kasa ekranları korunur.
- Bildirim Merkezi'ne okunmuş bildirimleri temizleme kontrolü eklenir.
- Fatura dosyasında her fatura için toplam, ödenen, kalan ve açılabilir ödeme geçmişi gösterilir.
- SQL yaması Yardım Merkezi bildirimlerini ortak şirket/şube kapsamındaki yöneticilere ve SUPER_ADMIN'e iletecek şekilde günceller; SUPER_ADMIN için okundu bildirimlerini temizleyen güvenli RPC ekler.

## Kurulum
1. Bu ZIP içindeki dosyaları GitHub `main` dalındaki aynı yollarla değiştirin.
2. Supabase SQL Editor'de `supabase/sql/V19_35_FEATURE_PATCH.sql` dosyasını çalıştırın.
3. Commit/push sonrası Vercel dağıtımını bekleyin.

## Önemli sınırlama
Bu yama tam çevrimdışı yazma kuyruğunu ve tüm modüller için sunucu tarafında idempotent senkronizasyonu henüz sağlamaz. Var olan RPC'lerin imzaları ve canlı veritabanı şeması, çevrimdışı sıradaki işlemlerin güvenli şekilde tekilleştirilmesini destekleyecek biçimde doğrulanmadan işlemleri yerel kuyruğa alıp otomatik göndermek mükerrer finans kaydı oluşturabilir. Bu nedenle bu pakette çevrimdışı senkronizasyonun tamamlandığı iddia edilmemektedir. Üretime hazır çevrimdışı kayıt için tüm yazma RPC'lerine idempotency anahtarı ekleyen bir veritabanı geçişi ve her modülün kayıt akışının buna bağlanması gerekir.

## Doğrulama
Kaynak ZIP mevcut ortamda düzenlendi. `npm run build` çalıştırılmak istendi ancak bağımlılıklar kurulu değildi; `npm install` bu ortamda zaman aşımına uğradı. Bu nedenle bu paket için tam derleme testi doğrulanmış değildir. Önce staging/preview ortamında derleme ve akış testleri yapılmalıdır.
