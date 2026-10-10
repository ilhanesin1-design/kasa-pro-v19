KASA PRO V19.38 - TEK ZIP / TEST DALINA UYGULAMA

ONEMLI: ZIP'i GitHub sitesine dosya olarak yuklemek uygulama kodunu yayina almaz. Kaynak dosyalar commit edilmelidir.

1. GitHub Desktop ile https://github.com/ilhanesin1-design/kasa-pro-v19 reposunu bilgisayarina klonla.
2. Bu ZIP'i normal bir klasore cikart.
3. TEK_SEFER_YAYINLA.bat dosyasina cift tikla.
4. Soruldugunda yerel kasa-pro-v19 klasorunun tam yolunu yapistir.
5. Script temiz main dalini guncel kaynak olarak alir, kaynak yedegi olusturur ve ayri test/v19.38-code-applied-* dalina gecer.
6. Dosyalari aktarir, npm install ve npm run build calistirir. Build basarisiz olursa test dalindaki degisiklikler geri alinir; main dalina push yapilmaz. Build basarili olursa yalnizca test dalina push yapilir.
7. Vercel > Deployments ekraninda bu test dali icin olusan Preview dagitimini kontrol et. Preview ve Supabase testleri basarili olmadan Production/main dalina birlestirme yapma.

GEREKSINIMLER: Windows, Git/GitHub Desktop oturumu, Node.js LTS, npm ve internet baglantisi.
GUVENLIK: .env dosyalari kopyalanmaz. Supabase SQL bu script tarafindan calistirilmaz; daha once basariyla calistirdiysan tekrar calistirma.

Build, fetch veya push hata verirse siyah penceredeki son hata satirlarini paylas. Canli Production dagitimi otomatik yapilmaz.
