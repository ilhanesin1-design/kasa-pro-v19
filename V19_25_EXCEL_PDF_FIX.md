# V19.25 Excel + PDF Fix

- Excel raporundaki işlem filtresi artık kullanıcıya gösterilen `tr-TR` tarih metnini değil, gerçek `YYYY-MM-DD` tarih anahtarını kullanır. Bu nedenle seçilen tarih aralığındaki finans işlemleri Excel'e ve rapor tablosuna dahil edilir.
- PDF/Yazdır raporunda eski `body * { visibility:hidden }` kuralının rapor içeriğini de gizlemesi düzeltildi. Rapor sayfası ve tablosu yazdırma önizlemesinde görünür.
- Fatura yazdırma stili korunmuştur.
