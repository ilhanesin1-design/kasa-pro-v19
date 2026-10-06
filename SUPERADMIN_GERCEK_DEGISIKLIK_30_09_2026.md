# SUPER_ADMIN Şube Kullanıcı Atama – Gerçek Kod Değişikliği

Bu paket önceki paketin aynısı değildir.

SUPER_ADMIN hesabı: ilhanesin1@gmail.com

## Yapılan gerçek değişiklikler
- SUPER_ADMIN kontrollerinde kullanıcı e-postası da dikkate alındı.
- ilhanesin1@gmail.com hesabı uygulama rolü yanlış/eksik gelse bile SUPER_ADMIN olarak normalize edilir.
- Şube Yönetimi'ndeki Kullanıcı Ata yetkisi `role + email` ile kontrol edilir.
- Şube kartındaki Kullanıcı Ata butonuna görünürlük için açık CSS kuralları eklendi.
- Butona `data-action="assign-branch-user"` işareti eklendi.
- Üst yönetim kartı SUPER_ADMIN olduğunda `SUPER_ADMIN · TAM YETKİ` gösterir.
- AppLayout, Sidebar ve yönetim sayfalarındaki SUPER_ADMIN kontrolleri e-posta ile de doğrulanır.

## Doğrulama
Önceki paketteki kaynak dosyaların SHA256 değerleri ile bu paketteki değerler farklıdır.
