# KASA PRO V19.22 — Web Yayın

Bu proje Vite + React + Supabase'tir ve Vercel'e SPA olarak yayınlanmaya hazırdır.

## 1. Supabase
- Supabase SQL Editor'da `supabase/sql/V19_22_FINAL_FIX.sql` dosyasını çalıştırın.
- Mevcut `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` değerlerini koruyun.

## 2. Vercel
- Projeyi GitHub'a yükleyin veya Vercel'e ZIP/proje olarak bağlayın.
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `vercel.json` SPA fallback'i içerir.

## 3. Sonuç
Yayınlandıktan sonra Vercel'in verdiği HTTPS adresi üzerinden bilgisayar, tablet ve telefondan dünyanın her yerinden aynı Supabase verilerine erişilir.
