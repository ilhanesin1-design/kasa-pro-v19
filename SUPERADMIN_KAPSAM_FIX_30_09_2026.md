# KASA PRO V19 — SUPER_ADMIN Kapsam Düzeltmesi

Bu sürümde:
- SUPER_ADMIN kapsamı Supabase'den yüklenen gerçek işletme/şube listesiyle senkronize edilir.
- Eski localStorage kapsamı artık geçersizse temizlenir.
- Geçersiz seçili işletme/şube yüzünden sağ üstte "Tüm İşletmeler" görünüp sol tarafta eski "Yetkili işletme" görünmesi engellenir.
- SUPER_ADMIN için sol panel aktif kapsamı seçilen işletme/şube ile tutarlı gösterilir.
- Tüm işletmeler seçildiğinde: "Tüm işletmeler / N şube".
- İşletme seçildiğinde: "İşletme adı / N şube".
- Şube seçildiğinde: "Şube adı / 1 şube".
- Supabase verileri silinmez/değiştirilmez.
- SQL değişikliği gerekmez.

Not: Bu kaynak paketinde npm bağımlılıkları dahil değildir. Ortamda `npm install` ardından `npm run build` ile derleme yapılmalıdır.
