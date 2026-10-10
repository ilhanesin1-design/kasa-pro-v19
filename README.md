# KASA PRO V19.38 — Kullanıcı kodları mevcut proje dosyalarına uygulandı

Bu paket, mevcut KASA PRO V19.37 kaynak yapısının üzerine istenen arayüz iyileştirmelerinin uygulanmış hâlidir. Ayrı yama birleştirme işlemi gerektirmez.

## Bu pakette uygulanan güncellemeler
- Dashboard'da aktif kapsamın aylık en yüksek gider kategorisi, gider tutarı ve yüzdesi belirgin ayrı kartta gösterilir.
- Sistem durumu metinleri `Server Aktif` / `Çevrimdışı` biçimindedir; çevrimdışı işlem kuyruğu ve bağlantı sonrası otomatik senkronizasyon korunmuştur.
- Kasa İşlemleri alt menüleri büyük tipografiyle gösterilir; Tüm İşlemler sayfasında Yeni Gelir Ekle ve Yeni Gider Ekle düğmeleri büyütülmüştür. Gelir ve gider ayrı rotalarda açılır.
- Bildirim açılır penceresine okunmuş bildirimleri temizle düğmesi eklenmiştir. Bildirim Merkezi sayfasındaki temizleme özelliği korunmuştur.
- Yardım Merkezi mesajı, aynı kapsam yöneticilerinin Bildirim Merkezi'ne gönderilecek şekilde açıklayıcı hale getirilmiştir.
- Kullanıcı atama penceresine açık izin checkbox'ları eklendi; kayıt sırasında atama ve seçili izinler kaydedilir. Genel Yetki Merkezi korunur.
- Faturalardaki borç, ödenen, kalan tutar ve tarihli ödeme geçmişi ekranları korunmuştur.
- POSMIST sayfasındaki kontrollü erişim açıklaması ve sürüm işareti güncellendi; SUPER_ADMIN ve `POSMIST_GOR` / `POSMIST_YONET` izinli kullanıcılar için mevcut kontrol korunur.
- Daha önce başarıyla çalıştırılmış SQL dosyasının kanonik yolu korunmuştur: `supabase/sql/INSTALL_V19_37_ALL_FEATURES.sql`. Bu uygulama SQL'i otomatik yeniden çalıştırmaz.

## Kurulum / test notu
1. ZIP'i açın ve GitHub için ayrı bir test dalında proje dosyalarını karşılaştırarak aktarın; çalışan `main` dalının üzerine yedek almadan yazmayın.
2. Yerel derleme için `npm install` ve `npm run build` çalıştırın.
3. İsterseniz Windows üzerinde `TEK_SEFER_YAYINLA.bat` dosyasını çalıştırın. Betik temiz `main` dalından `test/v19.38-code-applied-*` dalı oluşturur; üretim dalına doğrudan gönderim yapmaz. Derleme başarılı olursa yalnızca test dalına gönderir.
4. Vercel Preview’da giriş, POSMIST izinleri, çevrimdışı kuyruk, gelir/gider kaydı, bildirim temizleme, yardım mesajı ve fatura ara ödeme geçmişini doğrulayın. Test geçmeden `main` dalına birleştirmeyin.

**Test dürüstlüğü:** Kaynaklar statik olarak kontrol edildi. Bu ortamda bağımlılıklar yüklenemediği için Vite üretim derlemesi doğrulanamadı. Supabase/Posmist harici servisi canlı bağlantıda test edilmedi.
