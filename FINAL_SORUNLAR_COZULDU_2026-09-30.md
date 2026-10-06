# KASA PRO V19 — Toplu sorun düzeltme paketi

## Düzeltilenler

1. **SUPER_ADMIN kullanıcı yönetimi**
   - `Kullanıcılar` menüsü yalnızca SUPER_ADMIN'e gösterilir.
   - `/users` rotası yalnızca SUPER_ADMIN'e açıktır.
   - Ayarlar > SUPER_ADMIN Yönetimi altında `Kullanıcılar` kısayolu vardır.
   - Kullanıcı işletme + birden fazla şube + rol ile atanabilir.
   - Atama fonksiyonu benzersiz constraint'e bağımlı değildir; aynı kullanıcı/işletme/şube için mevcut rolü günceller.

2. **Gelir/Gider düzenleme**
   - Gerçek finans tablosu `app_transactions` kullanılır.
   - Güncelleme fonksiyonu doğrudan gerçek tabloya göre güvenli hale getirildi.
   - Düzenleme sonrası yenileme hatası ekranda uygulamayı beyaz bırakmamalı.
   - Finans listesinde `İşlemi Yapan` kolonu vardır.
   - CSV dışa aktarımında da `İşlemi Yapan` vardır.

3. **Fatura düzenleme**
   - `app_invoices` üzerinden güncelleme korunmuştur.
   - Düzenleme sonrası asenkron yenileme hataları yakalanır.
   - Global React Error Boundary eklenmiştir; render hatasında beyaz ekran yerine hata paneli gösterilir.

4. **Bildirimler**
   - `notifications` tablosu gerçek kaynak olarak kullanılır.
   - Yardım Merkezi talepleri SUPER_ADMIN bildirimlerine gönderilir.
   - Bildirim merkezi RPC başarısız olsa bile doğrudan `notifications` tablosundan okumayı dener.
   - Okundu işlemi için doğrudan tablo fallback'i vardır.
   - V3 yardım mesajı formatı desteklenir.

5. **Mevcut Supabase verileri**
   - Toplu DROP/TRUNCATE/DELETE yoktur.
   - Finans, fatura, kullanıcı ve bildirim kayıtları kendiliğinden silinmez.

## Supabase

`SORUNLAR_COZULDU_V19.sql` dosyasını SQL Editor'da çalıştırın. Bu dosya mevcut verileri silmez.

## Doğrulama

Bu çalışma ortamında ağ üzerinden `npm install` 120 saniyelik denemede tamamlanmadı; bu nedenle tam Windows/Tauri derlemesi burada doğrulanamadı. Kaynak dosyalar ve ZIP arşivi ayrıca statik olarak kontrol edildi.
