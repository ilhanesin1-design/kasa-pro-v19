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
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { full_name, username, email, password, company_id, branch_id, role } = await req.json();
    if (!token) return json({ error: 'Oturum gerekli.' }, 401);

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ error: 'Edge Function sunucu anahtarları eksik.' }, 500);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: caller, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !caller.user) return json({ error: 'Oturum doğrulanamadı.' }, 401);

    const { data: roleRows, error: roleError } = await admin.from('user_branch_roles').select('role').eq('user_id', caller.user.id);
    if (roleError) return json({ error: roleError.message }, 500);
    const callerEmail = String(caller.user.email ?? '').trim().toLowerCase();
    const superAdmin = callerEmail === 'ilhanesin1@gmail.com' || (roleRows ?? []).some((r) => { const role=String(r.role).trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_'); return ['SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR'].includes(role); });
    if (!superAdmin) return json({ error: 'Bu işlem yalnızca SUPER_ADMIN tarafından yapılabilir.' }, 403);

    const cleanName = String(full_name ?? '').trim();
    const cleanUsername = String(username ?? '').trim().toLowerCase();
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    const cleanPassword = String(password ?? '');
    const cleanCompany = String(company_id ?? '').trim();
    const cleanBranch = branch_id ? String(branch_id).trim() : null;
    const cleanRole = String(role ?? '').trim().toUpperCase();
    if (!cleanName || !cleanUsername || !cleanEmail || cleanPassword.length < 6 || !cleanCompany) return json({ error: 'Ad, kullanıcı adı, e-posta, şifre ve işletme zorunludur.' }, 400);
    if (!['EMPLOYEE','ACCOUNTANT','BRANCH_ADMIN','COMPANY_ADMIN'].includes(cleanRole)) return json({ error: 'Geçersiz rol.' }, 400);
    if (cleanBranch) {
      const { data: branch, error: branchError } = await admin.from('branches').select('id').eq('id', cleanBranch).eq('company_id', cleanCompany).maybeSingle();
      if (branchError) return json({ error: branchError.message }, 500);
      if (!branch) return json({ error: 'Seçilen şube işletmeye ait değil.' }, 400);
    }

    const { data: duplicate } = await admin.from('profiles').select('id').ilike('username', cleanUsername).limit(1);
    if ((duplicate ?? []).length) return json({ error: 'Bu kullanıcı adı zaten kullanılıyor.' }, 409);

    const created = await admin.auth.admin.createUser({ email: cleanEmail, password: cleanPassword, email_confirm: true, user_metadata: { username: cleanUsername, full_name: cleanName } });
    if (created.error || !created.data.user) return json({ error: created.error?.message ?? 'Auth kullanıcısı oluşturulamadı.' }, 400);

    const newUser = created.data.user;
    const { error: profileError } = await admin.from('profiles').upsert({ id: newUser.id, full_name: cleanName, username: cleanUsername, email: cleanEmail, is_active: true }, { onConflict: 'id' });
    if (profileError) return json({ error: `Kullanıcı oluşturuldu ancak profil kaydı tamamlanamadı: ${profileError.message}`, user: { id: newUser.id, email: cleanEmail, username: cleanUsername } }, 500);

    const { error: assignmentError } = await admin.from('user_branch_roles').upsert({ user_id: newUser.id, company_id: cleanCompany, branch_id: cleanBranch, role: cleanRole }, { onConflict: 'user_id,company_id,branch_id,role' });
    if (assignmentError) return json({ error: `Kullanıcı oluşturuldu ancak işletme/şube ataması tamamlanamadı: ${assignmentError.message}`, user: { id: newUser.id, email: cleanEmail, username: cleanUsername } }, 500);

    return json({ user: { id: newUser.id, email: cleanEmail, username: cleanUsername, full_name: cleanName } });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Beklenmeyen sunucu hatası.' }, 500);
  }
});
