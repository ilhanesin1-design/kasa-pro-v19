import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { username, password } = await req.json();
    const clean = String(username ?? '').trim();
    if (!clean || !password) return json({ error: 'Giriş bilgileri hatalı' }, 401);

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !serviceKey || !anonKey) return json({ error: 'Sunucu yapılandırması eksik' }, 500);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let email: string | null = null;

    // Prefer the existing public profile mapping. No rows are inserted or updated.
    const { data: profile } = await admin.from('profiles').select('email').ilike('username', clean).maybeSingle();
    email = profile?.email ?? null;

    // Legacy users may have username only in auth metadata. Read-only fallback.
    if (!email) {
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = users.users.find((u) => String(u.user_metadata?.username ?? '').trim().toLocaleLowerCase() === clean.toLocaleLowerCase());
      email = match?.email ?? null;
    }

    if (!email) return json({ error: 'Giriş bilgileri hatalı' }, 401);

    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) return json({ error: 'Giriş bilgileri hatalı' }, 401);
    return json({ session: data.session, user: data.user });
  } catch {
    return json({ error: 'Beklenmeyen sunucu hatası' }, 500);
  }
});
