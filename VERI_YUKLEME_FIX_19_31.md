# KASA PRO V19.31 — VERİ YÜKLEME FİX

Bu sürümde veri katmanı canlı V19 SQL uyumluluk katmanıyla yeniden eşleştirildi.

## Düzeltilen kritik noktalar

1. Finans, fatura, cari, şube, işletme, rol, yetki, bildirim ve POSMIST okumaları yalnızca `app_*` tablolarına bağlı değildi; eski V19 Türkçe tablo adları da tekrar destekleniyor.
2. SUPER_ADMIN işletme ve şube listeleri önce `v19_get_companies()` / `v19_get_branches()` RPC'leri ile okunuyor. Bunlar eski ve yeni tablo adlarını uyumluluk katmanı üzerinden çözüyor.
3. Bildirim merkezi `bildirimler` ve `notifications` tablolarını destekliyor.
4. Liste okumaları tek `range(0, limit)` isteğine bağlı değil. Supabase/PostgREST satır sınırı 100 gibi düşük bir değerde olsa bile sayfalı okuma yapılıyor.
5. Mevcut kayıtlar silinmiyor veya taşınmıyor. Değişiklik yalnızca frontend veri okuma katmanındadır.

## Önemli

Bu çalışma ortamı canlı Supabase projesine bağlanamadığı için canlı verilerin kendisi doğrulanamadı. Kod tarafında ilgili veri yolları ve mevcut V19 SQL uyumluluk isimleri yeniden eşleştirildi.
