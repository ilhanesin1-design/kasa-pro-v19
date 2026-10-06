# V19.24 FINAL

Ekran görüntülerindeki üç ana hata hedeflenmiştir:

1. SUPER_ADMIN olmasına rağmen `Yalnızca SUPER_ADMIN` uyarısı çıkması.
2. Yeni şube oluştururken SUPER_ADMIN yetki hatası.
3. Şube Admininin kendi şubesindeki gelir/gider, fatura ve cari işlemlerinde kısıtlanması.

Ek olarak AppLayout'taki çift Sidebar render kaldırıldı.

## Zorunlu Supabase adımı

`supabase/sql/V19_24_YETKI_FINAL_FIX.sql` dosyasını Supabase SQL Editor'da çalıştırın.

Sonrasında:
- uygulamadan çıkış yapın,
- tekrar giriş yapın,
- tarayıcıda Ctrl+F5 yapın.

Bu SQL veri silmez; yalnızca yetki fonksiyonları, RPC'ler ve okuma RLS kurallarını günceller.
