# KASA PRO V19.24 Yetki Final Fix

Supabase SQL Editor'da **V19_24_YETKI_FINAL_FIX.sql** dosyasını bir kez çalıştırın.

Bu sürüm:
- `ilhanesin1@gmail.com` hesabını SUPER_ADMIN olarak tanır.
- SUPER_ADMIN için işletme, şube, kullanıcı, fatura, gelir/gider ve cari işlemlerindeki kapsam kısıtlarını kaldırır.
- Şube Admini için yalnızca atandığı şubede gelir/gider, fatura ve cari işlemlerinde tam oluşturma/düzenleme/silme yetkisi verir.
- Finans tablolarında şube bazlı okuma RLS'sini düzeltir.
- Önceki `Yalnızca SUPER_ADMIN` ve yeni şube ekleme yetki hatasının veritabanı tarafını düzeltir.

Ardından uygulamadan çıkıp yeniden giriş yapın ve tarayıcıyı Ctrl+F5 ile yenileyin.
