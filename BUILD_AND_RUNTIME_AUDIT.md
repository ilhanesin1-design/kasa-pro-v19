# KASA PRO V19 — Baştan Sona Teknik Kontrol

## Kontrol edilen başlıklar

- TypeScript/TSX sözdizimi: tüm `.ts` / `.tsx` kaynakları transpile kontrolünden geçirildi.
- `src/lib/app.ts` exportları: uygulamadaki `../lib/app` importlarıyla karşılaştırıldı; eksik export yok.
- Auth: Supabase session kalıcılığı açık; `detectSessionInUrl` açık.
- Şifre yenileme: `/reset-password` route'u ve Supabase recovery redirect mevcut.
- SUPER_ADMIN: profil/JWT/rol kaynağından rol tespiti; işletme/şube RPC'leri için fallback mevcut.
- Şube yükleme: SUPER_ADMIN artık doğrudan varsayılan `public.şubeler` adına bağlı değil; `v19_get_branches()` üzerinden canlı şema uyumluluğu kullanılıyor.
- Dashboard: şube verisini RPC/uyumluluk katmanından alır; aynı transaction verisini gereksiz ikinci kez yüklemez.
- Rapor: `DashboardData.invoiceTotal` uyumluluğu korunmuştur.
- İşletme silme: toplu silme yerine pasifleştirme/soft-delete davranışı korunmuştur.
- Kullanıcı atama: `setBranchUser` ve `deleteCompany` uyumluluk exportları mevcut.
- QR fatura: `html5-qrcode` ve InvoicePage QR akışı mevcut.
- Mevcut finans verisi: proje açılışında toplu DROP/TRUNCATE/DELETE işlemi bulunmuyor.

## Canlı Supabase notu

Bu çalışma ortamından kullanıcının canlı Supabase projesine doğrudan erişim yapılmadı. Bu nedenle canlı tablo adları/RLS sonuçları burada sorgulanmadı. Kod, canlı şema için aday tablo isimleri ve güvenli RPC katmanı üzerinden uyumluluk sağlar.
