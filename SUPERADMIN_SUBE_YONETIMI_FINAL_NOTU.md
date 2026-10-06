# SUPER_ADMIN Şube Yönetimi Final Fix

Bu sürümde SUPER_ADMIN için Şube Yönetimi ekranı doğrudan şube bazlı kullanıcı yönetimi içerir.

## Ekranda görünen işlemler
- Her şube kartında **Kullanıcı Ata**
- Şube seçildiğinde yalnızca seçilen şube için atama penceresi
- Kullanıcı seçimi
- **Personel / Muhasebe / Şube Admini / Görüntüleme** rol seçimi
- **Kullanıcıyı Şubeye Ata**
- **Mevcut kullanıcı şubeden çıkar**
- Mevcut kullanıcıya yeni rol verildiğinde eski aynı-şube rolü kaldırılıp yeni rol kaydedilir
- SUPER_ADMIN için tüm işletme ve şubeler listelenir

## Supabase
`SUBE_KULLANICI_ATAMA_FINAL_FIX.sql` dosyasını Supabase SQL Editor'da bir kez çalıştırın.
