
# KASA PRO V19 · BY İLHAN EŞİN

Tauri 2 + React + TypeScript + Supabase ile çalışan masaüstü finans yönetim uygulaması.

## Bu sürümde
- Gerçek Supabase verileri; demo finans rakamları yok.
- SUPER_ADMIN işletme → şube kapsamını ayrı ayrı seçebilir.
- SUPER_ADMIN işletme oluşturabilir ve kullanıcı → işletme → çoklu şube → rol atayabilir.
- Gelir/gider kayıtlarında işlemi yapan kullanıcı adı gösterilir.
- Faturalar firma dosyası altında gruplanır; içeriğinde faturalar ayrı ayrı görünür.
- Fatura ödeme yöntemleri yalnızca Kasa ve Kart. Kasa ödemesi finans hareketlerine Gider olarak yazılır.
- Fatura düzenleme, soft-delete ve profesyonel yazdır/PDF görünümü bulunur.
- Yardım Merkezi SUPER_ADMIN bildirim merkezine kayıt oluşturur; bildirimler 5 saniyede bir yenilenir.
- Raporu oluştur düğmesi kurumsal XLSX dosyasını doğrudan indirir.
- Şifre sıfırlama Supabase Auth e-postası üzerinden yapılır.
- Giriş ve uygulama tipografisi büyütülmüştür.

## Windows
1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. `VITE_SUPABASE_URL` ve `VITE_SUPABASE_PUBLISHABLE_KEY` değerlerini girin.
3. Supabase SQL Editor'de `SUPABASE_1_SEFER_FINAL_GUVENLI.sql` dosyasını bir kez çalıştırın. Bu dosya DROP/TRUNCATE içermez.
4. `npm install`
5. `npm run tauri:dev`
6. EXE için `npm run tauri:build`

Service-role anahtarını `.env` içine koymayın.

## Önemli
Supabase projesindeki mevcut veriler uygulama açılışında topluca silinmez veya güncellenmez. Yazma işlemleri yalnızca kullanıcı ilgili butona basıp kaydettiğinde gerçekleşir.


