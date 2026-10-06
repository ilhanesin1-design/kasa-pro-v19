# KASA PRO V19 - Windows Uygulamasi

Bu proje Tauri 2 tabanli Windows masaustu uygulamasidir.

## Bilgisayarda derlemek

Gerekli yazilimlar:
- Node.js 22+
- Rust stable
- Microsoft Visual Studio Build Tools / C++ build tools

Ardindan `BUILD-WINDOWS.bat` dosyasini calistirin.

Kurulum dosyalari:
- `src-tauri/target/release/bundle/nsis/*.exe`
- `src-tauri/target/release/bundle/msi/*.msi`

## Supabase

`.env` dosyasina:

`VITE_SUPABASE_URL=...`
`VITE_SUPABASE_PUBLISHABLE_KEY=...`

yazin.

Service-role/secret key kullanmayin.

## GitHub'dan otomatik EXE

`.github/workflows/build-windows.yml` workflow'u GitHub Actions ile Windows EXE/MSI uretir.
GitHub repository Settings > Secrets and variables > Actions alanina su iki secret eklenmelidir:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Sonra Actions > KASA PRO V19 Windows > Run workflow secilir.
Build sonunda `KASA-PRO-V19-Windows` artifact'i indirilir.
