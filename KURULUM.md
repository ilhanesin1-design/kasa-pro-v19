# KASA PRO V19.34 — gerçek tabloya schema-cache bağımsız erişim

Bu paket, `src/lib/app.ts` içindeki veri okuma yolunu günceller. Finans hareketleri, faturalar, cari hesaplar, şirketler, şubeler, roller ve ilgili modüller önce yeni `kasa_v19_read_rows` RPC'sini kullanır. RPC'nin okunacak tablo kümeleri sabit allow-list'tir ve `SECURITY INVOKER` ile çalışır; tablo izinlerini/RLS politikasını devre dışı bırakmaz.

## Zorunlu uygulama sırası

1. Supabase → **SQL Editor → New query** açın.
2. `KASA_PRO_V19_SCHEMA_CACHE_RPC_FIX.sql` dosyasının tamamını yapıştırıp bir kez çalıştırın. Başarısız olursa alttaki kırmızı hatayı kaydedin; devam etmeyin.
3. GitHub `main` deposunda mevcut `src/lib/app.ts` dosyasını bu paketteki `src/lib/app.ts` ile **değiştirin**. ZIP'in kendisini yüklemek veya klasörü projenin içine bir katman daha derin koymak, uygulamanın kaynak kodunu değiştirmez.
4. `package.json` sürümü `19.34.0` olarak güncellendi; bu, commit/deploy ayrımını görmeye yardımcı olur.
5. Vercel Deployments'ta `main` üzerindeki son commit'in deploy edildiğini doğrulayın. Ardından `dreamswep.com` sayfasında `Ctrl+F5` yapın.

## Güvenlik ve sınırlar

- Migration mevcut tablo oluşturmaz/silmez ve veri satırlarını değiştirmez.
- Genel tablo adı kabul edilmez; RPC yalnızca kodda listelenen veri kümelerine izin verir.
- RLS ve alttaki tablo SELECT izinleri yürürlükte kalır. Bir tabloda izin yoksa RLS/grant hatası görünür; RLS kapatılarak geçilmemelidir.
- Canlı veritabanına bu çalışma ortamından bağlanıp gerçek tablo adlarını veya canlı deploy durumunu doğrulamak mümkün olmadığından, son doğrulama Supabase SQL sonucuna ve Vercel deploy commit'ine bağlıdır.
