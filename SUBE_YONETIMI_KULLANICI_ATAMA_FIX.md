# Şube Yönetimi - Kullanıcı Atama Fix

Bu sürümde özellik doğrudan **Yönetim > Şubeler** ekranına eklenmiştir.

- Her şube kartında `Kullanıcı Ata` butonu vardır.
- Buton yalnızca `SUPER_ADMIN` tarafından görünür.
- Pencerede o şubeye atanmış kullanıcılar listelenir.
- Kullanıcı + rol seçilerek doğrudan o şubeye atama yapılır.
- Personel, Muhasebe, Şube Admini ve Görüntüleme rolleri desteklenir.
- Mevcut şube ataması aynı pencereden kaldırılabilir.
- Atama `superadmin_assign_user` RPC üzerinden yapılır.
