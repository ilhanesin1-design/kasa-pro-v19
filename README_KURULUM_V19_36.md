# KASA PRO V19.36 — POSMIST kontrollü erişim ve finans izinleri

## Neler değişti
- Süper yönetici POSMIST ve yönetim yetkilerini korur.
- `POSMIST_GOR` yalnızca görüntüleme; `POSMIST_YONET` görüntüleme ve değişiklik yetkisi verir. POSMIST API anahtarı listelerde gönderilmez/gösterilmez.
- Gelir/gider ekleme, düzenleme ve silme izinleri hem arayüzde hem de idempotent sunucu RPC'sinde denetlenir.
- Fatura ekleme, düzenleme, silme ve ödeme izinleri sunucu tarafında doğrulanır; eski ve hedef şube kapsamı da denetlenir.
- Gelir ve gider ayrı rotalarda (`/income`, `/expense`) açılır.
- Yerel veri önbelleği ve çevrimdışı finans/fatura/cari/yardım kuyruğu; sunucuya aynı UUID ile yeniden gönderim sayesinde tekilleştirme kullanır.
- Dashboard en yüksek gider kategorisini ve payını gösterir; sistem etiketi `Server Aktif` / `Çevrimdışı` olur.
- Okunmuş bildirim temizleme, yönetici Yardım Merkezi bildirimleri, daha okunaklı Kasa alt menüsü ve fatura ödeme geçmişi korunur.

## Canlıya almadan önce
1. GitHub’daki mevcut `main` dalını ve Supabase veritabanını yedekleyin; yeni bir GitHub test dalı oluşturun.
2. Supabase projesinde daha önce kurulmamışsa `SUPABASE_1_SEFER_FINAL_GUVENLI.sql`, `SUPER_ADMIN_ILHANESIN_FIX.sql`, `supabase/sql/V19_24_YETKI_FINAL_FIX.sql` ve `supabase/sql/V19_35_FEATURE_PATCH.sql` ön koşullarını doğrulayın. Bunları körlemesine tekrar çalıştırmayın; mevcut sürümle karşılaştırın. Özellikle `SUPER_ADMIN_ILHANESIN_FIX.sql` ile süper yönetici e-posta/rol doğrulamasının mevcut olduğunu teyit edin; aksi halde yönetim RPC'leri kapsam erişimini reddedebilir.
3. Önce kaynak dosyaları test dalına aktarın ve Vercel Preview deploy başlatın. Bu aşamada eski RPC uyumluluğu nedeniyle temel çevrimiçi işlemler çalışır; tam yetki/çevrimdışı test için yeni SQL migration gerekir.
4. Ön koşullar doğrulandıktan sonra `supabase/sql/V19_36_CONTROLLED_ACCESS_OFFLINE.sql` dosyasını test veritabanındaki Supabase SQL Editor'de tek seferde çalıştırın. Hata alırsanız sonraki adımlara geçmeyin; hata metnini kaydedin.
5. Bağımlılıkları kurulu bir ortamda `npm install` ve `npm run build` çalıştırın. Ardından süper yönetici, yalnızca POSMIST görüntüleme izni olan kullanıcı ve POSMIST yönetme izni olan kullanıcıyla ayrı ayrı test edin. Gerçek kayıt kullanmayın; test şubesi kullanın.
6. Preview ile SQL/RPC/şube kapsam kontrolleri başarılı olduktan sonra main/deploy için karar verin.

## POSMIST izin atama
Yetki Merkezi'nde kullanıcının `POSMIST ekranını görme` kutusunu açın. Kullanıcı bağlantı ekleyip/değiştirecekse ayrıca `POSMIST ayarlarını düzenleme` iznini açın. Süper yönetici için ayrı izin gerekmez. İzinler sunucu doğrulamasıyla da uygulanır.

## Çevrimdışı davranış sınırı
Çevrimdışı önbellek okuma ve finans, fatura, cari ile yardım talebi için kuyruk bu pakette ele alınır. Kullanıcı atama, izin yönetimi, şube/işletme kurulumu ve POSMIST sır/gizli anahtar değişiklikleri çevrimiçi yapılmalıdır. Bu, hassas ayarların cihazda gecikmeli ve denetimsiz uygulanmasını önlemek içindir. Fatura, sunucuya senkronize olmamışken yeni ödeme girilemez; önce fatura eşitlenir.

## Test durumu
Bu pakette TypeScript/TSX sözdizimsel transpile, yerel import hedefi/eşleşmeleri ve ZIP bütünlük kontrolü raporlanır. Bu çalışma ortamında ağ/bağımlılık kurulumu zaman aşımına uğradığı için Vite üretim derlemesi ve canlı Supabase SQL/izin/RPC testi yapılmış sayılmaz. Bu yüzden paketi doğrudan canlı `main` üzerine yüklemeyin.


**POSMIST entegrasyonu hakkında:** Bu kaynakta kontrollü ekran erişimi, bağlantı ayarlarını güvenli yönetme ve gizli anahtarı listelerde göstermeme yapılmıştır. POSMIST sağlayıcısından günlük verileri gerçekten çeken zamanlanmış iş/Edge Function, API yanıt şeması doğrulanmadığı için bu pakette tamamlanmış sayılmaz.
