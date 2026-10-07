
# KASA PRO V19 — Final çalışma notları

## Yapılanlar
- Mevcut Supabase verilerine zarar veren migration/SQL eklenmedi.
- Username login akışı daha sağlam hata kontrolü ve session doğrulamasıyla güncellendi.
- Login Edge Function'daki fallback kullanıcıda `profile.email` kullanma hatası düzeltildi; artık bulunan email kullanılıyor.
- Login ekranındaki hata mesajları sessiz kalmak yerine gerçek servis/oturum hatasını gösterecek şekilde iyileştirildi.
- Giriş ekranı ve uygulama tipografisi büyütüldü.
- Fatura ekranı gerçek `app_invoices` kayıtlarını kullanır.
- Aynı fatura numarası + fatura adı UI'da tek kayıt olarak gösterilir; tekrarlar listede çoğaltılmaz.
- Mevcut fatura satırı, mevcut kolon adlarından uygun olanlar bulunarak düzenlenebilir.
- Profesyonel A4 fatura önizlemesi eklendi; `PDF / Yazdır` ile Windows yazdırma penceresinden PDF olarak kaydedilebilir.

## Önemli
- Fatura düzenleme, kullanıcının açıkça "Değişiklikleri kaydet" demesiyle mevcut `app_invoices` satırını günceller. Otomatik veri değişikliği yoktur.
- Fatura oluşturma için tablo şeması bilinmeden kolon uydurulmamıştır.
- Projede service-role anahtarı frontend'e konulmamıştır.
- `npm install` bu çalışma ortamında ağ zaman aşımı nedeniyle tamamlanamadı; bu nedenle burada tam TypeScript/Vite build doğrulaması yapılamadı. Windows makinede mevcut çalışan proje üzerinde `npm install` sonrası `npm run build` ve `npm run tauri:dev` çalıştırılmalıdır.


