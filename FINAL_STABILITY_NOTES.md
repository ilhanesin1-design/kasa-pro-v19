# KASA PRO V19 — Stability Patch

- Supabase istekleri 12 saniye timeout ile korunur; sonsuz yüklenme durumları engellenir.
- AppLayout kullanıcı bağlamını tek kez yükler; Dashboard/Modül/Admin sayfaları aynı bağlamı kullanır.
- Admin rolü tüm user_branch_roles satırlarında aranır; başka bir rol satırı Admin'i gizlemez.
- E-posta ile giriş doğrudan Supabase Auth üzerinden yapılır. Kullanıcı adı girişinde Edge Function/RPC fallback kullanılır.
- POSMIST menüsü Admin için görünür; doğrudan URL erişimi de Admin kontrolü yapar.
- POSMIST ekranında API anahtarı gösterilmez.
- Demo finans rakamları kullanılmaz.
- Harici Google Fonts bağımlılığı kaldırılmıştır; uygulama çevrimdışı açılışta font beklemez.
- Mevcut Supabase verilerini silen/değiştiren migration bu pakete eklenmemiştir.
