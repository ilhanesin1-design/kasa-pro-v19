# KASA PRO V19 - Tek Seferlik Kod Denetimi

## Düzeltilenler

1. Demo finans rakamları ve hardcoded şirket/kullanıcı bilgileri kaldırıldı.
2. Sidebar artık oturumdaki kullanıcı/şube/rol bilgisini kullanıyor.
3. Admin olmayan kullanıcılar Kullanıcılar, Yetki Merkezi ve POSMIST menülerini göremez; rotalar da ayrıca Admin kontrolünden geçer.
4. Kayıt sırasında `profiles` kaydı senkronize ediliyor.
5. Türkçe `GELİR` / `GİDER` değerleri aksan duyarsız normalize ediliyor.
6. Dashboard tarih hesaplaması UTC kaynaklı gün kaymasını azaltacak şekilde yerel tarihe göre yapılıyor.
7. Dashboard toplam bakiyesi için 1000/5000 satır sınırı yerine sayfalı okuma kullanılıyor.
8. POSMIST username login Edge Function'a taşındı; CORS ve server-side email çözümleme eklendi. Eski RPC, Edge Function henüz deploy edilmemiş eski kurulumlarla uyumluluk için fallback olarak bırakıldı.
9. Faturalar, cari, kullanıcılar, yetki rolleri ve POSMIST için gerçek Supabase kayıtlarını gösteren genel veri tablosu eklendi; demo kayıt eklenmedi.
10. Yeni kullanıcı profili için additive SQL trigger/migration eklendi.

## Canlı Supabase doğrulaması gerekenler

Bu çalışma ortamı kullanıcının canlı Supabase projesine bağlanamadığı için aşağıdaki maddeler statik olarak denetlendi; canlı sonuçları doğrulanmadı:

- `app_transactions` gerçek kolon adları ve veri tipleri
- `branches`, `profiles`, `user_branch_roles`, `permissions` gerçek RLS politikaları
- `app_invoices` ve `app_cari_payments` kolonları
- POSMIST tablolarının gerçek RLS'i ve Edge Function secret'ları
- mevcut trigger/policy çakışmaları

Bu nedenle mevcut finans tablolarına bilinmeyen kolonlarla INSERT/UPDATE/DELETE yazılmadı. Bu, veri kaybını önlemek için bilinçli bir tercih.

## Deploy notu

POSMIST username login için:

`supabase functions deploy login-with-username`

ve Edge Function secret'ları Supabase tarafında tanımlanmalıdır. Service role key hiçbir zaman React/Tauri frontend'e konulmamalıdır.
