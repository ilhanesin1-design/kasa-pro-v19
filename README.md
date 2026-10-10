# KASA PRO V19.37 — Tek Paket Kurulumu

Bu ZIP tüm kaynak kodunu içerir. Parça yaması indirmeniz veya ZIP'leri birleştirmeniz gerekmez.

## İçerdiği istenen özellikler
- Gösterge panelinde bu ay en yüksek gider kategorisi ve toplam gider içindeki yüzdesi.
- Sistem durumunda `Server Aktif` / `Çevrimdışı`; önbellekten veri gösteriliyorsa sunucu bağlı gibi gösterilmez.
- Çevrimdışı okunabilir önbellek; gelir/gider, fatura, cari ve yönetici Yardım Merkezi bildirimi için yerel kuyruk; çevrimiçi olunca 15 saniyelik tekrar deneme ve aynı olay UUID'siyle yinelenen kayıt koruması.
- Kasa İşlemleri alt menülerinde daha büyük, daha okunaklı yazılar.
- Okunmuş bildirimleri temizleme.
- Yardım Merkezi'nde diğer kapsam içindeki yöneticilere bildirim gönderme ve bildirimleri kullanıcıya göre okuma.
- Gelir ve gider için ayrı `/income` ve `/expense` ekranları.
- Kullanıcıya gelir/gider ve cari hareket ekleme, düzenleme ve silme ile fatura ve POSMIST görüntüleme/yönetme izinleri atama.
- Faturada toplam/ödenen/kalan tutar ve tarihli ödeme geçmişi; çevrimdışı fatura oluşturma ve aynı fatura için kuyruktaki ödemeleri senkronizasyonda gerçek fatura kimliğine bağlama.
- Süper yönetici tüm izinleri korur; diğer hesaplar yalnızca atanan `POSMIST_GOR` ve/veya `POSMIST_YONET` izinleri kadar POSMIST erişimi alır.

## Kurulum: tek ZIP, tek yeni SQL dosyası

1. GitHub'da mevcut `main` dalını ve Supabase projesini yedekleyin. Mevcut kaynaklara doğrudan üzerine yazmak yerine `test/v19.37` gibi test dalında deneyin.
2. ZIP'i bilgisayarınıza indirin ve ayıklayın. İçindeki proje dosyalarını (özellikle `src`, `supabase`, `package.json`, `vite.config.ts` ve `index.html`) proje köküne, klasör yapısını koruyarak aktarın. ZIP'in kendisini GitHub'a yüklemeyin.
3. Vercel Preview'de test dalını derleyin. Depoda Supabase ortam değişkenleri (`VITE_SUPABASE_URL` ve `VITE_SUPABASE_PUBLISHABLE_KEY`) zaten tanımlı olmalıdır; eksikse mevcut doğru değerleri Vercel ayarlarından kontrol edin, anahtarları sohbet içine göndermeyin.
4. Supabase SQL Editor'de **yalnızca** `supabase/sql/INSTALL_V19_37_ALL_FEATURES.sql` dosyasının tamamını, daha önce kullandığınız aynı Supabase projesinde test ortamında çalıştırın. Dosya başlangıçta gerekli mevcut V19 helper/RPC fonksiyonlarını denetler ve eksiklerse açıklayıcı hata ile kurulumun başında durur. Eksik fonksiyonlar için bütün eski SQL dosyalarını gelişigüzel çalıştırmayın.
5. Vercel Preview derlemesi ve SQL kurulumu başarılı olduktan sonra aşağıdaki testleri yapın. Sorun yoksa test dalını `main` ile birleştirin ve üretim dağıtımını izleyin.

## Zorunlu testler
- Süper yönetici: POSMIST ayarlarını ekleyebiliyor/düzenleyebiliyor/silebiliyor; tüm menü ve yetkileri açık.
- Sadece `POSMIST_GOR`: bağlantıları görebiliyor, ama ekleme/düzenleme/silme yapamıyor.
- `POSMIST_YONET`: atanan şirket/şube kapsamında ayarları yönetebiliyor.
- Gelir ekleme izni açık, silme izni kapalı kullanıcı: gelir ekleyebiliyor, ama silemiyor; aynı test gider için de yapılmalı.
- İnternet kapalıyken bir gelir/gider kaydı ve bir fatura oluşturun; uygulama işlemi cihazda bekletmeli. Bağlantı dönünce kayıtlar otomatik aktarılmalı ve aynı olay tekrar gönderilse bile çift kayıt oluşmamalı.
- Faturaya iki ayrı kısmi ödeme girin; toplam borç, ödenen, kalan ve iki tarih/tutar satırı doğru görünmeli.
- Bir yönetici Yardım Merkezi'nden kapsamındaki başka bir yöneticiye mesaj göndersin; alıcı Bildirim Merkezi'nde mesajı okusun ve okunan bildirimleri temizleyebilsin.

## Test durumu ve sınırlar
Kaynak dosyaları statik TypeScript/TSX transpile, yerel import hedefleri/eşleşmeleri ve ZIP bütünlüğüyle kontrol edin. Bu çalışma ortamında NPM kayıt sunucusuna DNS bağlantısı kurulamadığı için `npm install` tamamlanamadı; bu nedenle burada Vite üretim derlemesi başarılı diye raporlanamaz. Canlı Supabase veritabanı da bu çalışma sırasında erişilebilir değildi; SQL/RPC davranışı canlıda çalıştırılarak test edilmiş sayılmaz. Preview derleme ve SQL sonrası gerçek testleri tamamlamadan paketi üretime almayın.

## Çevrimdışı modun sınırları
Oturumun çevrimdışında yeniden açılabilmesi için kullanıcı daha önce çevrimiçiyken giriş yapmış olmalı ve tarayıcıdaki Supabase oturumu duruyor olmalıdır. Önceden önbelleğe alınmamış kayıtlar çevrimdışında gösterilemez. Kullanıcı atama, yetki değişiklikleri, şirket/şube kurulumu ve POSMIST gizli anahtar yönetimi çevrimiçi yapılır. Yerel kuyruk bu cihaz ve tarayıcıya özgüdür; tarayıcı verilerini temizlemek bekleyen kayıtları silebilir, bu yüzden senkron bekleyen kayıtlar varken site verilerini temizlemeyin.

## POSMIST günlük veri çekimi
Bu ZIP kontrollü POSMIST erişimi ve bağlantı ayarlarını yönetir; API anahtarını liste yanıtlarında göstermez. Sağlayıcının gerçek API yanıt örneği ve auth/endpoint kuralları sağlanmadığı için POSMIST'ten günlük veri çekimini yapan zamanlanmış Edge Function'ın tamamlandığı iddia edilmez. `Server Aktif` uygulama backend'inin erişilebilirliğini ifade eder; POSMIST kaynağının verisinin güncel olduğunu tek başına garanti etmez.
