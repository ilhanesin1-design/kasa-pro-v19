# SUPER_ADMIN kesin yetki düzeltmesi

Bu sürümde SUPER_ADMIN hesabı için hem frontend hem veritabanı kontrolü düzeltilmiştir.

- SUPER_ADMIN hesabı e-posta üzerinden de tanınır.
- Şube Yönetimi'nde Kullanıcı Ata görünür.
- Tüm işletmeler ve tüm şubeler görünür.
- Şube bazında Personel / Muhasebe / Şube Admini / Görüntüleme atanabilir.
- Mevcut kullanıcı şubeden çıkarılabilir.
- Aynı şubede rol değiştirildiğinde eski şube rolü kaldırılır.

Kurulumdan sonra `SUPER_ADMIN_ILHANESIN_FIX.sql` dosyasını Supabase SQL Editor'da bir kez çalıştırın.
