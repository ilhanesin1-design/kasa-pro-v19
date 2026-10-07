# KASA PRO V19 – Build Fix

Bu paket Vercel/TypeScript derlemesinde görülen `Property 'error'/'data' does not exist on type 'unknown'` hatasını düzeltir.

## Teknik düzeltme
`src/lib/app.ts` içindeki DB timeout wrapper artık `Promise<any>` döndürür. Böylece Supabase sorgu sonuçlarında `data` ve `error` alanlarının TypeScript tarafından `unknown` olarak yorumlanması engellenmiştir.

## Windows / Vercel
```powershell
npm install
npm run build
```

Vercel GitHub bağlantısı kullanıyorsa bu paketteki kaynak dosyalarını GitHub `main` dalına gönderin. Build, `tsc -b && vite build` çalıştırır.
