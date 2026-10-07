import { createEphemeralSupabase, supabase } from './supabase';

const DB_TIMEOUT_MS = 12000;

async function withTimeout<T>(promiseLike: PromiseLike<T>, label: string, timeoutMs = DB_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} zaman aşımına uğradı. İnternet bağlantısını ve Supabase durumunu kontrol edin.`)), timeoutMs);
    });
    return await Promise.race([Promise.resolve(promiseLike), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function db(promiseLike: PromiseLike<any>, label: string, timeoutMs = DB_TIMEOUT_MS): Promise<any> {
  return withTimeout<any>(promiseLike, label, timeoutMs);
}
type AnySupabase = NonNullable<typeof supabase>;
type AnyRow = Record<string, any>;

export type UserContext = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  companyId: string | null;
  role: string | null;
  branchIds: string[];
  branchNames: string[];
  phone: string;
};

const TABLES = {
  profiles: ['profiles'],
  roles: ['kullanıcı_şubesi_rolleri', 'kullanici_subesi_rolleri', 'user_branch_roles'],
  companies: ['şirketler', 'sirketler', 'companies'],
  branches: ['şubeler', 'subeler', 'branches', 'dallar'],
  transactions: ['uygulama_islemleri', 'uygulama_işlemleri', 'app_transactions', 'kasa_hareketleri'],
  invoices: ['uygulama_faturaları', 'uygulama_faturalar', 'app_invoices', 'faturalar'],
  invoicePayments: ['uygulama_fatura_ödemeleri', 'uygulama_fatura_odemeleri', 'app_invoice_payments', 'fatura_odeme_gecmisi'],
  cari: ['uygulama_cari_ödemeleri', 'uygulama_cari_odemeleri', 'app_cari_payments', 'cari_kart_odemeleri'],
  permissions: ['kullanıcı_izinleri', 'kullanici_izinleri', 'user_permissions'],
  notifications: ['bildirimler', 'notifications'],
  posmist: ['posmist_entegrasyonları', 'posmist_entegrasyonlari', 'posmist_integrations'],
} as const;

const tableCache = new Map<string, string>();

export const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('tr-TR').trim();
export const isIncome = (value: unknown) => ['gelir', 'income', 'tahsilat'].includes(normalize(value));
export const money = (n: number) => Number(n || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });
export const isSuperAdmin = (role: string | null | undefined) => ['super_admin','superadmin','platform_admin','superadministrator','super_adminstrator'].includes(normalize(role).replace(/[\s-]+/g, '_'));
export const isAdminRole = (role: string | null | undefined) => { const r = normalize(role).replace(/ /g, '_'); return isSuperAdmin(role) || ['admin','administrator','company_admin','companyadmin','branch_admin','branchadmin','yonetici','yönetici'].includes(r) || r.startsWith('admin_'); };
export const isCompanyAdmin = (role: string | null | undefined) => { const r = normalize(role).replace(/ /g, '_'); return isSuperAdmin(role) || ['company_admin','companyadmin','admin','administrator'].includes(r); };
export const isBranchAdmin = (role: string | null | undefined) => ['branch_admin','branchadmin'].includes(normalize(role).replace(/ /g, '_'));

function requireSupabase(): AnySupabase {
  if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmamış. .env dosyasındaki VITE_SUPABASE_URL ve VITE_SUPABASE_PUBLISHABLE_KEY değerlerini kontrol edin.');
  return supabase;
}

const pick = (row: AnyRow, keys: string[], fallback: any = null) => { for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && String(row[key]) !== '') return row[key]; return fallback; };
const text = (row: AnyRow, keys: string[], fallback = '') => String(pick(row, keys, fallback) ?? fallback);
const num = (row: AnyRow, keys: string[], fallback = 0) => { const v = Number(pick(row, keys, fallback)); return Number.isFinite(v) ? v : fallback; };
const bool = (row: AnyRow, keys: string[], fallback = true) => { const v = pick(row, keys, fallback); if (typeof v === 'boolean') return v; const s = normalize(v); return ['true','1','evet','aktif'].includes(s); };
const uuid = (row: AnyRow, keys: string[]) => { const v = pick(row, keys, null); return v == null || v === '' ? null : String(v); };
const localDateKey = (value: Date | string) => { const d = value instanceof Date ? value : new Date(value); if (Number.isNaN(d.getTime())) return ''; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const formatDate = (value: string | null | undefined) => { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('tr-TR'); };

async function resolveTable(sb: AnySupabase, candidates: readonly string[], label: string): Promise<string> {
  const cacheKey = candidates.join('|');
  const cached = tableCache.get(cacheKey);
  if (cached) return cached;
  for (const name of candidates) {
    const { error } = await db((sb as any).from(name).select('*', { head: true, count: 'exact' }), `${label} bağlantısı`, 7000);
    if (!error) { tableCache.set(cacheKey, name); return name; }
    const code = String(error.code ?? '');
    const message = String(error.message ?? '').toLowerCase();
    const notFound = code === 'PGRST205' || code === '42P01' || message.includes('does not exist') || message.includes('could not find the table');
    if (!notFound) throw new Error(`${label}: ${error.message}`);
  }
  throw new Error(`${label} tablosu bulunamadı. Aranan tablolar: ${candidates.join(', ')}`);
}

async function fetchRows(sb: AnySupabase, candidates: readonly string[], label: string, limit = 5000): Promise<AnyRow[]> {
  const t = await resolveTable(sb, candidates, label);
  const { data, error } = await db((sb as any).from(t).select('*').range(0, limit - 1), label);
  if (error) throw new Error(`${label}: ${error.message}`);
  return (data ?? []) as AnyRow[];
}

function filterRowsByUserBranch(rows: AnyRow[], user: UserContext) {
  // SUPER_ADMIN kapsam seçmişse artık tüm kayıtları döndürme; seçilen işletme/şubeyi uygula.
  if (isSuperAdmin(user.role) && !user.companyId && !user.branchIds.length) return rows;
  if (user.branchIds.length) return rows.filter(r => { const bid = uuid(r,['branch_id','şube_id','sube_id']); return !bid || user.branchIds.includes(bid); });
  if (user.companyId) return rows.filter(r => { const cid = uuid(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id']); return !cid || cid === user.companyId; });
  return rows;
}

export async function getUserContext(): Promise<UserContext> {
  const sb = requireSupabase();
  const { data: auth, error: authError } = await db(sb.auth.getUser(), 'Oturum bilgisi');
  if (authError || !auth.user) throw new Error('Oturum bulunamadı.');
  const uid = auth.user.id;
  const metadata = auth.user.user_metadata ?? {} as AnyRow;
  const appMetadata = auth.user.app_metadata ?? {} as AnyRow;
  const [{ data: profile, error: profileError }, roleRows] = await Promise.all([
    db(sb.from('profiles').select('*').eq('id', uid).maybeSingle(), 'Profil bilgisi'),
    db(fetchRows(sb, TABLES.roles, 'Rol ve şube bilgisi', 1000), 'Rol ve şube bilgisi'),
  ]);
  if (profileError) throw profileError;
  const rows = roleRows.filter(r => String(pick(r,['user_id','kullanici_id','kullanıcı_id'],'')) === uid);
  const profileRecord = (profile ?? {}) as AnyRow;
  if (profileRecord.is_active === false || profileRecord.aktif === false) { await db(sb.auth.signOut(), 'Oturum kapatma'); throw new Error('Kullanıcı hesabı pasif.'); }
  const profileRole = text(profileRecord,['role','rol'], '');
  const metadataRole = text(appMetadata,['role'], '') || text(metadata,['role'], '');
  const roleValues: string[] = [
    profileRole,
    metadataRole,
    ...rows.map((r: AnyRow) => text(r, ['role', 'rol', 'kullanici_rolu', 'kullanıcı_rolü']))
  ];
  const superAdminRole = roleValues.find((value: string) => isSuperAdmin(value));
  const adminRow = rows.find((r: AnyRow) => isAdminRole(text(r, ['role', 'rol'])));
  const role = superAdminRole || profileRole || (adminRow ? text(adminRow, ['role', 'rol']) : '') || (rows.length ? text(rows[0], ['role', 'rol']) : '') || metadataRole || null;
  const superAdmin = isSuperAdmin(role);
  const companyId = superAdmin ? null : (text(profileRecord,['company_id','şirket_id','sirket_id','işletme_id','isletme_id'],'') || text(rows[0] ?? {},['company_id','şirket_id','sirket_id','işletme_id','isletme_id'],'') || text(metadata,['company_id'],'' ) || null);
