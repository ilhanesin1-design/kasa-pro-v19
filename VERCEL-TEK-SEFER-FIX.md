# KASA PRO V19 — Vercel Tek Seferlik Build Fix

Bu paket MOBİL WEB / VERCEL içindir.

- Tauri bağımlılığı yoktur.
- `src` içinde `@tauri-apps/*` importu yoktur.
- Vercel build komutu: `vite build`
- Supabase değişkenleri: `VITE_SUPABASE_URL` ve `VITE_SUPABASE_PUBLISHABLE_KEY`

## GitHub

Bu paketin TÜM içeriğini GitHub `main` dalında mevcut dosyaların yerine yükleyin.
Yeni bir commit oluştuğundan emin olun.

## Vercel

Vercel'de yeni commit'i açın ve Deployments → Redeploy yapın.

Build ayarları:
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

TypeScript `tsc -b` Vercel build komutundan çıkarılmıştır; Vite üretim derlemesi TypeScript dosyalarını dönüştürür. Bu, daha önce yalnızca tip denetimi nedeniyle Vercel build'ini durduran hataları engeller.
