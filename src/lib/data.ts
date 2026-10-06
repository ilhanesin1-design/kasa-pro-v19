/**
 * V19 production data layer.
 *
 * Demo/sample financial records intentionally do not live in the frontend.
 * Screens that display data must read from Supabase through src/lib/app.ts.
 */
export const money = (n: number) =>
  Number(n || 0).toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  });
