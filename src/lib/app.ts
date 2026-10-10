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

const db = <T,>(promiseLike: PromiseLike<T>, label: string, timeoutMs = DB_TIMEOUT_MS): Promise<T> => withTimeout<T>(promiseLike, label, timeoutMs);
type AnySupabase = NonNullable<typeof supabase>;
type AnyRow = Record<string, any>;

const OFFLINE_CACHE_VERSION = 'v2';
const OFFLINE_OUTBOX_KEY = 'kasa-pro-v19-offline-outbox-v2';
let offlineCacheUsed = false;
export const isUsingOfflineCache = () => offlineCacheUsed;
type OfflineMutation = { id: string; userId: string; operation: string; payload: AnyRow; createdAt: string; lastError?: string };
const localAvailable = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
const makeId = () => {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); });
};
const activeCacheUser = () => localAvailable() ? (localStorage.getItem('kasa-pro-v19-active-user') || 'unknown') : 'unknown';
function cacheKey(dataset: string | null, candidates: readonly string[]) { return `kasa-pro-v19-cache-${OFFLINE_CACHE_VERSION}:${activeCacheUser()}:${dataset || candidates.join('_')}`; }
function saveCachedRows(dataset: string | null, candidates: readonly string[], rows: AnyRow[]) {
  if (!localAvailable()) return;
  try {
    const capped = rows.slice(0, 1500);
    const payload = JSON.stringify({ savedAt: new Date().toISOString(), rows: capped });
    if (payload.length > 1_750_000) return;
    localStorage.setItem(cacheKey(dataset, candidates), payload);
  } catch { }
}
function readCachedRows(dataset: string | null, candidates: readonly string[]): AnyRow[] | null {
  if (!localAvailable()) return null;
  try {
    const raw = localStorage.getItem(cacheKey(dataset, candidates));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.rows) ? parsed.rows as AnyRow[] : null;
  } catch { return null; }
}
function isNetworkFailure(error: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return ['failed to fetch','networkerror','network request failed','fetch failed','connection refused','connection reset','offline','zaman aşımına uğradı','timed out','load failed'].some(x => message.includes(x));
}
function readOfflineQueue(): OfflineMutation[] {
  if (!localAvailable()) return [];
  try { const rows = JSON.parse(localStorage.getItem(OFFLINE_OUTBOX_KEY) || '[]'); return Array.isArray(rows) ? rows : []; } catch { return []; }
}
function writeOfflineQueue(rows: OfflineMutation[]) {
  if (!localAvailable()) throw new Error('Bu tarayıcıda çevrimdışı kayıt alanı kullanılamıyor.');
  try { localStorage.setItem(OFFLINE_OUTBOX_KEY, JSON.stringify(rows)); }
  catch { throw new Error('Çevrimdışı kayıt tarayıcıya kaydedilemedi. Tarayıcı depolama alanını kontrol edin.'); }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kasa-pro-v19-outbox-change'));
}
export function getOfflineMutationQueue(userId?: string) { const rows = readOfflineQueue(); return userId ? rows.filter(r => r.userId === userId) : rows; }
function queueOfflineMutation(userId: string, operation: string, payload: AnyRow, id = makeId()) {
  const queue = readOfflineQueue();
  if (!queue.some(item => item.id === id)) queue.push({ id, userId, operation, payload, createdAt: new Date().toISOString() });
  writeOfflineQueue(queue);
  return { queued: true, eventId: id };
}

function updateQueuedCreate(userId: string, entity: 'transaction'|'invoice'|'cari', offlineId: string, patch: AnyRow) {
  if (!offlineId.startsWith('offline:')) return false;
  const eventId = offlineId.slice('offline:'.length);
  const queue = readOfflineQueue();
  const index = queue.findIndex(item => item.id === eventId && item.userId === userId && item.operation === `${entity}.create`);
  if (index < 0) return false;
  const item = queue[index];
  if (entity === 'transaction') {
    item.payload = { ...item.payload, ...patch };
  } else if (entity === 'invoice') {
    const p = patch.payload || {};
    item.payload = { ...item.payload,
      branch_id: p.branch_id ?? item.payload.branch_id,
      firma: p.firma ?? p.company_name ?? p.fatura_adi ?? item.payload.firma,
      serial: p.seri_no ?? p.fatura_no ?? p.invoice_number ?? item.payload.serial,
      content: p.icerik ?? p.content ?? item.payload.content,
      amount: Number(p.miktar ?? p.tutar ?? p.amount ?? item.payload.amount),
      date: p.tarih ?? p.date ?? item.payload.date,
      due: p.vade_tarihi ?? p.due_date ?? item.payload.due,
      status: p.fatura_durumu ?? p.invoice_status ?? item.payload.status,
      currency: p.para_birimi ?? item.payload.currency,
      note: p.fatura_notu ?? p.note ?? item.payload.note,
      kdv: p.kdv ?? item.payload.kdv,
    };
  } else {
    const p = patch.payload || {};
    item.payload = { ...item.payload,
      branch_id: p.branch_id ?? item.payload.branch_id,
      firma: p.firma ?? item.payload.firma,
      amount: p.amount ?? p.miktar ?? p.tutar ?? item.payload.amount,
      description: p.aciklama ?? p.açıklama ?? item.payload.description,
      date: p.tarih ?? p.date ?? item.payload.date,
    };
  }
  queue[index] = item;
  writeOfflineQueue(queue);
  return true;
}
function cancelQueuedCreate(userId: string, entity: 'transaction'|'invoice'|'cari', offlineId: string) {
  if (!offlineId.startsWith('offline:')) return false;
  const eventId = offlineId.slice('offline:'.length);
  const queue = readOfflineQueue();
  if (!queue.some(item => item.id === eventId && item.userId === userId && item.operation === `${entity}.create`)) return false;
  writeOfflineQueue(queue.filter(item => !(item.userId === userId && (item.id === eventId || item.operation === `${entity}.payment` && String(item.payload.invoice_id || '') === offlineId))));
  return true;
}

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
export const normalizeRoleKey = (role: string | null | undefined) => normalize(role).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const SUPER_ADMIN_EMAILS = new Set(['ilhanesin1@gmail.com']);
export const isSuperAdmin = (role: string | null | undefined, email?: string | null) => {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  if (normalizedEmail && SUPER_ADMIN_EMAILS.has(normalizedEmail)) return true;
  const r = normalizeRoleKey(role);
  return ['super_admin','superadmin','platform_admin','superadministrator','super_adminstrator','super_admin_role','root_admin'].includes(r)
    || /^super_?admin(?:_?istrator)?$/.test(r);
};
export const isAdminRole = (role: string | null | undefined) => { const r = normalize(role).replace(/ /g, '_'); return isSuperAdmin(role) || ['admin','administrator','company_admin','companyadmin','branch_admin','branchadmin','yonetici','yönetici'].includes(r) || r.startsWith('admin_'); };
export const isCompanyAdmin = (role: string | null | undefined) => { const r = normalize(role).replace(/ /g, '_'); return isSuperAdmin(role) || ['company_admin','companyadmin','admin','administrator'].includes(r); };
export const isBranchAdmin = (role: string | null | undefined) => ['branch_admin','branchadmin'].includes(normalize(role).replace(/ /g, '_'));

function requireSupabase(): AnySupabase {
  if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmamış. .env dosyasındaki VITE_SUPABASE_URL ve VITE_SUPABASE_PUBLISHABLE_KEY değerlerini kontrol edin.');
  return supabase;
}

async function runMutation(userId: string, operation: string, payload: AnyRow, legacyCall: () => PromiseLike<any>, label: string) {
  const sb = requireSupabase();
  const eventId = makeId();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return queueOfflineMutation(userId, operation, payload, eventId);
  }
  try {
    const result = await db(sb.rpc('v19_sync_offline_mutation', { p_event_id: eventId, p_operation: operation, p_payload: payload }), `${label} (tekilleştirilmiş kayıt)`);
    if (!result.error) return { queued: false, data: result.data, eventId };
    if (!isMissingRpc(result.error)) {
      if (isNetworkFailure(result.error)) return queueOfflineMutation(userId, operation, payload, eventId);
      throw new Error(result.error.message || `${label} başarısız.`);
    }
  } catch (error) {
    if (isNetworkFailure(error)) return queueOfflineMutation(userId, operation, payload, eventId);
    const msg = String((error as any)?.message ?? error).toLowerCase();
    if (!(msg.includes('could not find the function') || msg.includes('schema cache') || msg.includes('pgrst202') || msg.includes('42883') || msg.includes('v19_sync_offline_mutation'))) throw error;
  }
  const legacy = await db(legacyCall(), label);
  if (legacy.error) throw new Error(legacy.error.message || `${label} başarısız.`);
  return { queued: false, data: legacy.data, eventId: null };
}

export async function syncOfflineMutations(user: UserContext) {
  const sb = requireSupabase();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { synced: 0, pending: getOfflineMutationQueue(user.id).length, error: 'Çevrimdışı.' };
  let synced = 0;
  let queueError: string | undefined = undefined;
  const candidates = getOfflineMutationQueue(user.id).map(item => item.id);
  
  for (const id of candidates) {
    const item = readOfflineQueue().find(row => row.id === id && row.userId === user.id);
    if (!item) continue;
    try {
      const result = await db(sb.rpc('v19_sync_offline_mutation', { p_event_id: item.id, p_operation: item.operation, p_payload: item.payload }), 'Çevrimdışı kayıt senkronizasyonu');
      if (result.error) throw result.error;
      const current = readOfflineQueue();
      let remaining = current;
      if (item.operation === 'invoice.create') {
        const data: any = result.data ?? {};
        const remoteId = String((typeof data === 'string' ? (() => { try { return JSON.parse(data); } catch { return {}; } })() : data)?.id
          ?? (typeof data === 'object' ? data?.result?.id ?? data?.data?.id : '') ?? '');
        if (!remoteId || remoteId.startsWith('offline:')) throw new Error('Fatura sunucuya ulaştı ancak gerçek fatura kimliği doğrulanamadı. Kuyruk korundu, aynı olay kimliğiyle tekrar denenecek.');
        const offlineId = `offline:${item.id}`;
        remaining = current.map(row => {
          if (row.userId !== user.id) return row;
          if (row.operation === 'invoice.payment' && String(row.payload.invoice_id) === offlineId)
            return { ...row, payload: { ...row.payload, invoice_id: remoteId } };
          if ((row.operation === 'invoice.update' || row.operation === 'invoice.delete') && String(row.payload.id) === offlineId)
            return { ...row, payload: { ...row.payload, id: remoteId } };
          return row;
        });
      }
      writeOfflineQueue(remaining.filter(row => row.id !== item.id));
      synced++;
    } catch (error) {
      const message = String((error as any)?.message ?? error);
      const current = readOfflineQueue();
      writeOfflineQueue(current.map(row => row.id === item.id ? { ...row, lastError: message } : row));
      queueError = message; 
      // Head-of-Line blocking hatası giderildi: Hata alsa bile kuyruğu tıkamadan diğer işlemleri dener.
    }
  }
  return { synced, pending: getOfflineMutationQueue(user.id).length, error: queueError };
}

export async function userHasPermission(user: UserContext, permission: string): Promise<boolean> {
  if (isSuperAdmin(user.role, user.email)) return true;
  try {
    const result = await db(requireSupabase().rpc('v19_user_has_app_permission', { p_permission: permission }), 'Yetki kontrolü');
    if (!result.error && typeof result.data === 'boolean') return result.data;
  } catch { }
  try {
    const rows = await loadPermissions(user.id);
    const row = rows.find(item => item.permission.toLocaleUpperCase('tr-TR') === permission.toLocaleUpperCase('tr-TR'));
    if (row) return row.value;
  } catch { }
  return false;
}

const pick = (row: AnyRow, keys: string[], fallback: any = null) => { for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && String(row[key]) !== '') return row[key]; return fallback; };
const text = (row: AnyRow, keys: string[], fallback = '') => String(pick(row, keys, fallback) ?? fallback);
const num = (row: AnyRow, keys: string[], fallback = 0) => { const v = Number(pick(row, keys, fallback)); return Number.isFinite(v) ? v : fallback; };
const bool = (row: AnyRow, keys: string[], fallback = true) => { const v = pick(row, keys, fallback); if (typeof v === 'boolean') return v; const s = normalize(v); return ['true','1','evet','aktif'].includes(s); };
const uuid = (row: AnyRow, keys: string[]) => { const v = pick(row, keys, null); return v == null || v === '' ? null : String(v); };
export const localDateKey = (value: Date | string) => { const d = value instanceof Date ? value : new Date(value); if (Number.isNaN(d.getTime())) return ''; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const formatDate = (value: string | null | undefined) => { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('tr-TR'); };

async function resolveTable(sb: AnySupabase, candidates: readonly string[], label: string): Promise<string> {
  const cacheKey = candidates.join('|');
  const cached = tableCache.get(cacheKey);
  if (cached) return cached;
  let lastMissing = '';
  for (const name of candidates) {
    try {
      const result = await db((sb as any).from(name).select('*', { head: true, count: 'exact' }), `${label} bağlantısı`, 7000);
      const error = result?.error;
      if (!error) { tableCache.set(cacheKey, name); return name; }
      const code = String(error.code ?? '');
      const message = String(error.message ?? '').toLowerCase();
      const notFound = code === 'PGRST205' || code === '42P01' || message.includes('does not exist') || message.includes('could not find the table') || message.includes('schema cache');
      if (notFound) { lastMissing = String(error.message ?? ''); continue; }
      throw new Error(`${label}: ${error.message}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const lower = message.toLowerCase();
      if (lower.includes('could not find the table') || lower.includes('schema cache') || lower.includes('does not exist')) { lastMissing = message; continue; }
      throw e;
    }
  }
  throw new Error(`${label} tablosu bulunamadı. Denenen tablolar: ${candidates.join(', ')}${lastMissing ? ` · Son hata: ${lastMissing}` : ''}`);
}

function datasetForCandidates(candidates: readonly string[]): string | null {
  const signature = candidates.join('|');
  const keys: Record<string, string> = {
    profiles: 'profiles', roles: 'roles', companies: 'companies', branches: 'branches',
    transactions: 'transactions', invoices: 'invoices', invoicePayments: 'invoice_payments',
    cari: 'cari', permissions: 'permissions', notifications: 'notifications', posmist: 'posmist',
  };
  for (const [key, values] of Object.entries(TABLES)) {
    if (values.join('|') === signature) return keys[key] ?? null;
  }
  return null;
}

function isMissingRpc(error: AnyRow): boolean {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return ['PGRST202', 'PGRST203', '42883'].includes(code)
    || message.includes('could not find the function')
    || message.includes('v19 veri kaynağı bulunamadı')
    || message.includes('kasa_v19_dataset_not_found')
    || message.includes('could not find the table')
    || message.includes('schema cache');
}

async function fetchRowsOnline(sb: AnySupabase, candidates: readonly string[], label: string, limit = 5000): Promise<AnyRow[]> {
  const dataset = datasetForCandidates(candidates);
  if (dataset) {
    try {
      const rpc = await db((sb as any).rpc('kasa_v19_read_rows', {
        p_dataset: dataset, p_limit: Math.max(0, Math.min(limit, 10000)), p_offset: 0,
      }), `${label} (RPC veri okuma)`);
      if (!rpc.error) {
        if (Array.isArray(rpc.data)) return rpc.data as AnyRow[];
        throw new Error(`${label}: veri RPC'si geçerli bir liste döndürmedi.`);
      }
      if (!isMissingRpc(rpc.error)) throw new Error(`${label}: ${rpc.error.message}`);
    } catch (e) {
      const message = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
      const canFallback = message.includes('could not find the function')
        || message.includes('v19 veri kaynağı bulunamadı')
        || message.includes('kasa_v19_dataset_not_found')
        || message.includes('could not find the table')
        || message.includes('schema cache')
        || message.includes('pgrst202') || message.includes('pgrst203')
        || message.includes('42883');
      if (!canFallback) throw e;
    }
  }

  const t = await resolveTable(sb, candidates, label);
  const pageSize = 500;
  const rows: AnyRow[] = [];
  let from = 0;
  let total: number | null = null;
  while (rows.length < limit) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    const result = await db((sb as any).from(t).select('*', { count: 'exact' }).range(from, to), label);
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
    const page = (result.data ?? []) as AnyRow[];
    rows.push(...page);
    if (typeof result.count === 'number') total = result.count;
    if (!page.length) break;
    from += page.length;
    if (total !== null && from >= Math.min(total, limit)) break;
    if (page.length < pageSize && total === null) break;
  }
  return rows.slice(0, limit);
}

async function fetchRows(sb: AnySupabase, candidates: readonly string[], label: string, limit = 5000): Promise<AnyRow[]> {
  const dataset = datasetForCandidates(candidates);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const cached = readCachedRows(dataset, candidates);
    if (cached) { offlineCacheUsed = true; return cached.slice(0, limit); }
    throw new Error(`${label}: İnternet yok ve bu veri için yerel kopya bulunamadı.`);
  }
  try {
    const rows = await fetchRowsOnline(sb, candidates, label, limit);
    saveCachedRows(dataset, candidates, rows);
    return rows;
  } catch (error) {
    if (isNetworkFailure(error)) {
      const cached = readCachedRows(dataset, candidates);
      if (cached) { offlineCacheUsed = true; return cached.slice(0, limit); }
    }
    throw error;
  }
}

function filterRowsByUserBranch(rows: AnyRow[], user: UserContext) {
  if (isSuperAdmin(user.role, user.email) && !user.companyId && !user.branchIds.length) return rows;
  // Boş (null) şube ID veri sızıntısını engelleyen yetki yaması eklendi (!bid ve !cid kaldırıldı)
  if (user.branchIds.length) return rows.filter(r => { const bid = uuid(r,['branch_id','şube_id','sube_id']); return bid && user.branchIds.includes(bid); });
  if (user.companyId) return rows.filter(r => { const cid = uuid(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id']); return cid && cid === user.companyId; });
  return rows;
}

export async function getUserContext(): Promise<UserContext> {
  const sb = requireSupabase();
  const sessionResult = await db(sb.auth.getSession(), 'Yerel oturum');
  let authUser = sessionResult.data.session?.user ?? null;
  if (!authUser) throw new Error('Oturum bulunamadı. Çevrimdışı kullanmak için önce çevrimiçiyken giriş yapın.');
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try { const verified = await db(sb.auth.getUser(), 'Oturum bilgisi'); if (verified.data.user) authUser = verified.data.user; }
    catch (error) { if (!isNetworkFailure(error)) throw error; }
  }
  const uid = authUser.id;
  if (localAvailable()) { try { localStorage.setItem('kasa-pro-v19-active-user', uid); } catch {} }
  const metadata = authUser.user_metadata ?? {} as AnyRow;
  const appMetadata = authUser.app_metadata ?? {} as AnyRow;
  const [profileRecord, roleRows] = await Promise.all([
    (async (): Promise<AnyRow> => {
      try {
        const result = await db(sb.from('profiles').select('*').eq('id', uid).maybeSingle(), 'Profil bilgisi');
        if (!result.error) { const profile=(result.data ?? {}) as AnyRow; if(Object.keys(profile).length)saveCachedRows('profiles',TABLES.profiles,[profile]); return profile; }
        throw result.error;
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        const cached = await fetchRows(sb, TABLES.profiles, 'Profil bilgisi', 3000);
        return cached.find(r => String(pick(r, ['id'], '')) === uid) ?? {};
      }
    })(),
    fetchRows(sb, TABLES.roles, 'Rol ve şube bilgisi', 1000),
  ]);
  const rows = roleRows.filter(r => String(pick(r,['user_id','kullanici_id','kullanıcı_id'],'')) === uid);
  if (profileRecord.is_active === false || profileRecord.aktif === false) {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) { await sb.auth.signOut(); throw new Error('Kullanıcı hesabı pasif.'); }
  }
  const profileRole = text(profileRecord,['role','rol','user_role','kullanici_rolu','kullanıcı_rolü','account_role'], '');
  const metadataRole = text(appMetadata,['role','user_role','kullanici_rolu','kullanıcı_rolü'], '') || text(metadata,['role','user_role','kullanici_rolu','kullanıcı_rolü'], '');
  const roleValues = [profileRole, metadataRole, ...rows.map(r => text(r,['role','rol','user_role','kullanici_rolu','kullanıcı_rolü','account_role']))];
  let detectedSuperAdmin = isSuperAdmin(profileRole, authUser.email) || isSuperAdmin(metadataRole, authUser.email) || roleValues.some(r => isSuperAdmin(r));
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    const checks = await Promise.allSettled([sb.rpc('v19_is_super_admin'), sb.rpc('is_super_admin')]);
    detectedSuperAdmin = detectedSuperAdmin || checks.some(v => v.status === 'fulfilled' && v.value.data === true);
  }
  const role = detectedSuperAdmin || String(authUser.email ?? '').trim().toLowerCase() === 'ilhanesin1@gmail.com' ? 'SUPER_ADMIN' : (profileRole || rows.find(r => isAdminRole(text(r,['role','rol','user_role','kullanici_rolu','kullanıcı_rolü'])))?.role || rows[0]?.role || metadataRole || null);
  const superAdmin = isSuperAdmin(String(role ?? ''), authUser.email);
  const companyId = superAdmin ? null : (text(profileRecord,['company_id','şirket_id','sirket_id','işletme_id','isletme_id'],'') || text(rows[0] ?? {},['company_id','şirket_id','sirket_id','işletme_id','isletme_id'],'') || text(metadata,['company_id'],'' ) || null);
  const branchIds = superAdmin ? [] : [...new Set(rows.map(r => uuid(r,['branch_id','şube_id','sube_id'])).filter(Boolean) as string[])];
  let branchNames: string[] = [];
  if (branchIds.length || companyId) {
    const branchRows = await fetchRows(sb, TABLES.branches, 'Şube bilgileri', 3000);
    const allowed = branchRows.filter(r => branchIds.length ? branchIds.includes(String(pick(r,['id'],''))) : String(pick(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id'],'')) === String(companyId));
    branchNames = allowed.map(r => text(r,['name','şube_adi','sube_adi','ad','isim','branch_name'],'Şube'));
  }
  return { id: uid, username: text(profileRecord,['username','kullanici_adi'], text(metadata,['username'],'')), fullName: text(profileRecord,['full_name','ad_soyad'], text(metadata,['full_name'], authUser.email ?? '')), email: text(profileRecord,['email','e_posta','eposta'], authUser.email ?? ''), companyId, role: String(role ?? ''), branchIds, branchNames, phone: text(profileRecord,['phone','telefon'],'') };
}

export async function loginWithUsername(username: string, password: string) {
  const sb = requireSupabase();
  const clean = username.trim();
  if (!clean || !password) throw new Error('Kullanıcı adı/e-posta ve şifre zorunludur.');
  let loginEmail = clean.toLowerCase();
  if (!clean.includes('@')) {
    let resolved = '';
    try { const result = await db(sb.rpc('get_login_email',{p_username:clean}),'Kullanıcı adı çözümleme'); if (!result.error) resolved = String(result.data ?? ''); } catch { }
    if (!resolved) {
      const profiles = await fetchRows(sb, TABLES.profiles, 'Kullanıcı hesabı', 2000);
      resolved = text(profiles.find(r => normalize(pick(r,['username','kullanici_adi'])) === normalize(clean)) ?? {}, ['email','e_posta','eposta'], '');
    }
    if (!resolved) throw new Error('Kullanıcı adı bulunamadı. Kullanıcı adını kontrol edin.');
    loginEmail = resolved.toLowerCase();
  }
  const { data, error } = await db(sb.auth.signInWithPassword({ email: loginEmail, password }), 'Supabase giriş işlemi');
  if (error || !data.session) throw new Error(error?.message || 'Kullanıcı/e-posta veya şifre hatalı.');
  const { data: verified } = await db(sb.auth.getSession(), 'Oturum doğrulama');
  if (!verified.session?.user) throw new Error('Giriş tamamlandı ancak oturum doğrulanamadı.');
}

export async function registerUser(input:{username:string;fullName:string;email:string;password:string}) {
  const sb=requireSupabase(); const username=input.username.trim(), fullName=input.fullName.trim(), email=input.email.trim().toLowerCase();
  if(!username||!fullName||!email||input.password.length<6) throw new Error('Ad, kullanıcı adı, e-posta ve en az 6 karakterli şifre zorunludur.');
  const {data,error}=await db(sb.auth.signUp({email,password:input.password,options:{data:{username,full_name:fullName}}}),'Kullanıcı kaydı');
  if(error) throw error; if(!data.user) throw new Error('Kullanıcı oluşturulamadı.');
  const {error:pe}=await db(sb.from('profiles').upsert({id:data.user.id,username,full_name:fullName,email},{onConflict:'id'}),'Profil kaydı'); if(pe) throw new Error(`Profil oluşturulamadı: ${pe.message}`); return data;
}

export type DashboardData={incomeToday:number;expenseToday:number;netToday:number;totalNet:number;invoiceTotal:number;expenseMonthTotal:number;activeBranches:number;chart:{d:string;g:number;c:number}[];branches:{id:string;name:string;city:string;balance:number}[];transactions:ModuleTransaction[];expenseCategories:{name:string;value:number;pct:number}[];user:UserContext};
export type ModuleTransaction={id:string;title:string;branch:string;category:string;date:string;dateKey:string;amount:number;type:'income'|'expense';userName:string;branchId?:string;pending?:boolean};
export type ModuleBranch={id:string;name:string;city:string;is_active:boolean;balance:number};
export type TransactionInput={branchId:string;type:'Gelir'|'Gider';amount:number;description:string;date:string};
export type InvoiceRow=Record<string,unknown>&{id:string};
export type CariRow=Record<string,unknown>&{id:string};
export type InvoicePaymentRow=Record<string,unknown>&{id:string;invoice_id:string};
export type CompanyRow={id:string;name:string;tax_number:string|null;phone:string|null;email:string|null;address:string|null;is_active:boolean};
export type BranchRow={id:string;company_id:string;name:string;code:string|null;phone:string|null;email:string|null;address:string|null;city:string|null;district:string|null;latitude:number|null;longitude:number|null;is_active:boolean};
export type UserRow={id:string;username:string;full_name:string;email:string;is_active:boolean;roles:{id:string;company_id:string;branch_id:string|null;role:string}[]};
export type PermissionRow={id?:string;user_id:string;permission:string;value:boolean};

type NormalizedTransaction = { raw: AnyRow; id: string; branch_id: string; sube: string; tur: string; miktar: number; aciklama: string; kategori: string; tarih: string; islem_zamani: string; created_by: string | null; kullanici: string; pending?: boolean };
async function normalizedTransactions(user:UserContext, limit=5000): Promise<NormalizedTransaction[]> {
  const sb=requireSupabase(); const rows=filterRowsByUserBranch(await fetchRows(sb,TABLES.transactions,'Finans hareketleri',limit),user);
  return rows.filter(r=>!pick(r,['deleted_at','silindi_at'])) .map(r=>({
    raw:r,id:text(r,['id']),branch_id:uuid(r,['branch_id','şube_id','sube_id'])||'',sube:text(r,['sube','şube','branch_name'],'Şube'),tur:text(r,['tur','tür','type','islem_turu','işlem_türü']),miktar:num(r,['miktar','tutar','amount','tl_karsiligi','tl_karşiligi','tl_miktar']),aciklama:text(r,['aciklama','açıklama','description']),kategori:text(r,['kategori','category','gider_kategorisi','expense_category'],'Diğer'),tarih:text(r,['tarih','date']),islem_zamani:text(r,['islem_zamani','işlem_zamanı','created_at','createdAt']),created_by:uuid(r,['created_by','oluşturan_id','olusturan_id','user_id','kullanici_id']),kullanici:text(r,['kullanici','kullanıcı','user_name'],'')
  }));
}

function applyQueuedNormalizedTransactions(rows: NormalizedTransaction[], user: UserContext): NormalizedTransaction[] {
  let result = [...rows];
  for (const item of getOfflineMutationQueue(user.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))) {
    if (!item.operation.startsWith('transaction.')) continue;
    const p = item.payload || {};
    const target = String(p.id || '');
    if (item.operation === 'transaction.delete') { result = result.filter(r => r.id !== target); continue; }
    if (item.operation === 'transaction.update') {
      const index = result.findIndex(r => r.id === target);
      if (index >= 0) result[index] = { ...result[index], tur:String(p.type ?? result[index].tur), miktar:Number(p.amount ?? result[index].miktar), aciklama:String(p.description ?? result[index].aciklama), branch_id:String(p.branch_id ?? result[index].branch_id), sube:String(p.branch_name ?? result[index].sube), tarih:String(p.date ?? result[index].tarih), islem_zamani:String(p.date ?? result[index].islem_zamani), kategori:String(p.category ?? p.type ?? result[index].kategori), pending:true };
      continue;
    }
    if (item.operation === 'transaction.create') result.unshift({ raw:p, id:`offline:${item.id}`, branch_id:String(p.branch_id || ''), sube:String(p.branch_name || 'Şube'), tur:String(p.type || 'Gider'), miktar:Number(p.amount || 0), aciklama:String(p.description || `${p.type || 'Finans'} işlemi`), kategori:String(p.category || p.type || 'Diğer'), tarih:String(p.date || item.createdAt), islem_zamani:String(p.date || item.createdAt), created_by:String(p.user_id || user.id), kullanici:String(p.user_name || user.fullName || user.username), pending:true });
  }
  return result;
}

async function resolveUserNames(ids:string[]) { const sb=requireSupabase(); const uniq=[...new Set(ids.filter(Boolean))]; const map=new Map<string,string>(); if(!uniq.length)return map; try{const rows=await fetchRows(sb,TABLES.profiles,'İşlem kullanıcıları',5000); for(const r of rows){const id=text(r,['id']);if(uniq.includes(id))map.set(id,text(r,['username','kullanici_adi','full_name','ad_soyad','email'],'—'));}}catch{ } return map; }

export async function loadDashboard(user:UserContext):Promise<DashboardData>{
  offlineCacheUsed = false;
  // Dashboard Cache Yaması: Çevrimdışı durumda 1500 limitine takılıp bakiyelerin yanlış çıkmasını engeller
  if (typeof navigator !== 'undefined' && navigator.onLine === false && localAvailable()) {
    try { const cached = localStorage.getItem('kasa-dashboard-cache'); if(cached) { offlineCacheUsed = true; return JSON.parse(cached); } } catch {}
  }

  const [rawTx,branches,invoices]=await Promise.all([normalizedTransactions(user,5000),loadModuleBranches(user),loadInvoices(user)]); const tx=applyQueuedNormalizedTransactions(rawTx,user); const today=new Date(); const todayKey=localDateKey(today); const start=new Date(today.getFullYear(),today.getMonth(),today.getDate()); const seven=new Date(start); seven.setDate(seven.getDate()-6); const map=new Map<string,{g:number;c:number}>(); for(let i=0;i<7;i++){const d=new Date(seven);d.setDate(seven.getDate()+i);map.set(localDateKey(d),{g:0,c:0});}
  let incomeToday=0,expenseToday=0,totalNet=0; for(const r of tx){const a=r.miktar;const inc=isIncome(r.tur);const key=localDateKey(r.tarih||r.islem_zamani);if(key===todayKey){if(inc)incomeToday+=a;else expenseToday+=a;}const p=map.get(key);if(p){if(inc)p.g+=a/1000;else p.c+=a/1000;}totalNet+=inc?a:-a;}
  const ids=tx.slice(0,20).map(r=>r.created_by||''); const names=await resolveUserNames(ids); const branchMap=new Map(branches.map(b=>[b.id,b])); const recent:ModuleTransaction[]=tx.slice(0,8).map(r=>({id:r.id,title:r.aciklama||(isIncome(r.tur)?'Gelir işlemi':'Gider işlemi'),branch:r.sube||branchMap.get(r.branch_id)?.name||'Şube',category:r.tur,date:formatDate(r.islem_zamani||r.tarih),dateKey:localDateKey(r.tarih||r.islem_zamani),amount:r.miktar,type:isIncome(r.tur)?'income':'expense',userName:names.get(String(r.created_by||''))||r.kullanici||'—',branchId:r.branch_id,pending:r.pending}));
  const balances=new Map<string,number>(); for(const r of tx)balances.set(r.branch_id,(balances.get(r.branch_id)||0)+(isIncome(r.tur)?r.miktar:-r.miktar));
  const invoiceTotal=invoices.reduce((sum,r)=>sum+Number(r.miktar??r.genel_toplam??r.total??0),0);
  const monthKey=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`; const expenseMap=new Map<string,number>(); for(const r of tx){const key=localDateKey(r.tarih||r.islem_zamani);if(!isIncome(r.tur)&&key.startsWith(monthKey)){const category=r.kategori?.trim()||'Diğer';expenseMap.set(category,(expenseMap.get(category)||0)+r.miktar);}} const expenseMonthTotal=[...expenseMap.values()].reduce((a,b)=>a+b,0); const expenseSum=expenseMonthTotal||1; const expenseCategories=[...expenseMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value])=>({name,value,pct:value/expenseSum*100}));
  
  const result = {incomeToday,expenseToday,netToday:incomeToday-expenseToday,totalNet,invoiceTotal,expenseMonthTotal,activeBranches:branches.length,chart:[...map.entries()].map(([d,v])=>({d:d.slice(8,10),g:Math.round(v.g),c:Math.round(v.c)})),branches:branches.map(b=>({id:b.id,name:b.name,city:b.city,balance:balances.get(b.id)||0})),transactions:recent,expenseCategories,user};
  if (localAvailable()) try { localStorage.setItem('kasa-dashboard-cache', JSON.stringify(result)); } catch {}
  return result;
}

export async function loadModuleTransactions(user:UserContext):Promise<ModuleTransaction[]>{
  const tx=await normalizedTransactions(user,7000);const branches=await loadModuleBranches(user);const map=new Map(branches.map(b=>[b.id,b.name]));const names=await resolveUserNames(tx.map(r=>r.created_by||''));
  const rows:ModuleTransaction[]=tx.sort((a,b)=>String(b.islem_zamani||b.tarih).localeCompare(String(a.islem_zamani||a.tarih))).map(r=>({id:r.id,title:r.aciklama||(isIncome(r.tur)?'Gelir işlemi':'Gider işlemi'),branch:r.sube||map.get(r.branch_id)||'Şube',category:r.tur,date:formatDate(r.islem_zamani||r.tarih),dateKey:localDateKey(r.tarih||r.islem_zamani),amount:r.miktar,type:(isIncome(r.tur)?'income':'expense') as 'income'|'expense',userName:names.get(String(r.created_by||''))||r.kullanici||'—',branchId:r.branch_id}));
  const pending=getOfflineMutationQueue(user.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  for(const item of pending){const p=item.payload||{};const target=String(p.id||'');
    if(item.operation==='transaction.delete'){const i=rows.findIndex(r=>r.id===target);if(i>=0)rows.splice(i,1);continue;}
    if(item.operation==='transaction.update'){const i=rows.findIndex(r=>r.id===target);if(i>=0)rows[i]={...rows[i],title:String(p.description||rows[i].title),branch:String(p.branch_name||rows[i].branch),category:String(p.type||rows[i].category),amount:Number(p.amount||rows[i].amount),type:isIncome(p.type)?'income':'expense',dateKey:String(p.date||rows[i].dateKey).slice(0,10),pending:true};continue;}
    if(item.operation==='transaction.create'){rows.unshift({id:`offline:${item.id}`,title:String(p.description||`${p.type||'Finans'} işlemi`),branch:String(p.branch_name||'Şube'),category:String(p.type||''),date:String(p.date||item.createdAt),dateKey:String(p.date||item.createdAt).slice(0,10),amount:Number(p.amount||0),type:isIncome(p.type)?'income':'expense',userName:String(p.user_name||user.fullName||user.username),branchId:String(p.branch_id||''),pending:true});}
  }
  return rows;
}

export async function loadModuleBranches(user:UserContext):Promise<ModuleBranch[]>{
  const branchRows=await loadBranches(user);
  const tx=await normalizedTransactions(user,7000);
  const balances=new Map<string,number>();
  for(const r of tx) balances.set(r.branch_id,(balances.get(r.branch_id)||0)+(isIncome(r.tur)?r.miktar:-r.miktar));
  return branchRows.filter(r=>r.is_active).map(r=>({id:r.id,name:r.name,city:r.city||'',is_active:r.is_active,balance:balances.get(r.id)||0}));
}

export async function createTransaction(input:TransactionInput,user:UserContext){if(!input.branchId)throw new Error('Şube seçmelisiniz.');if(!(input.amount>0))throw new Error('Tutar 0’dan büyük olmalıdır.');const sb=requireSupabase();const branches=await loadModuleBranches({...user,branchIds:[]});const branch=branches.find(b=>b.id===input.branchId);if(!branch)throw new Error('Şube bulunamadı veya erişiminiz yok.');const userName=user.fullName||user.username||user.email;const payload={branch_id:input.branchId,branch_name:branch.name,type:input.type,amount:input.amount,description:input.description,date:input.date,user_id:user.id,user_name:userName};return runMutation(user.id,'transaction.create',payload,()=>sb.rpc('kasa_create_transaction_v24',{p_branch_id:input.branchId,p_branch_name:branch.name,p_type:input.type,p_amount:input.amount,p_description:input.description,p_date:input.date,p_user_id:user.id,p_user_name:userName}),'İşlem kaydı');}

// Veritabanı çökmesi koruma yamaları uygulandı
export async function updateTransaction(id:string,input:TransactionInput,user:UserContext){
  if(id.startsWith('offline:')){
    const branches=await loadModuleBranches({...user,branchIds:[]});
    const br=branches.find(b=>b.id===input.branchId);if(!br)throw new Error('Şube bulunamadı.');
    if(updateQueuedCreate(user.id,'transaction',id,{branch_id:input.branchId,branch_name:br.name,type:input.type,amount:input.amount,description:input.description,date:input.date,user_id:user.id,user_name:user.fullName||user.username||user.email})) return {queued:true,eventId:id.slice(8),updatedPending:true};
    throw new Error('Çevrimdışı işlem bulunamadı veya senkronize edildi. Sayfayı yenileyin.');
  }
  if(!input.branchId)throw new Error('Şube seçmelisiniz.');if(!(input.amount>0))throw new Error('Tutar 0’dan büyük olmalıdır.');
  const sb=requireSupabase();const branches=await loadModuleBranches({...user,branchIds:[]});const branch=branches.find(b=>b.id===input.branchId);if(!branch)throw new Error('Şube bulunamadı veya erişiminiz yok.');
  const userName=user.fullName||user.username||user.email;
  const payload={id,branch_id:input.branchId,branch_name:branch.name,type:input.type,amount:input.amount,description:input.description,date:input.date,user_id:user.id,user_name:userName};
  return runMutation(user.id,'transaction.update',payload,()=>sb.rpc('kasa_update_transaction_v24',{p_id:id,p_branch_id:input.branchId,p_branch_name:branch.name,p_type:input.type,p_amount:input.amount,p_description:input.description,p_date:input.date,p_user_id:user.id}),'İşlem güncelleme');
}
export async function deleteTransaction(id:string,user:UserContext){
  if(id.startsWith('offline:')){
    if(cancelQueuedCreate(user.id,'transaction',id)) return {queued:false,cancelledPending:true};
    throw new Error('Çevrimdışı işlem bulunamadı veya senkronize edildi. Sayfayı yenileyin.');
  }
  const sb=requireSupabase();
  return runMutation(user.id,'transaction.delete',{id,user_id:user.id},()=>sb.rpc('kasa_delete_transaction_v24',{p_id:id,p_user_id:user.id}),'İşlem silme');
}

const invoiceAliasPayload=(p:AnyRow)=>{const o={...p}; if(p.firma!==undefined)Object.assign(o,{firma:p.firma,company_name:p.firma,fatura_adi:p.firma,invoice_name:p.firma});if(p.seri_no!==undefined)Object.assign(o,{seri_no:p.seri_no,fatura_no:p.seri_no,invoice_number:p.seri_no});if(p.icerik!==undefined)Object.assign(o,{icerik:p.icerik,içerik:p.icerik});if(p.miktar!==undefined)Object.assign(o,{miktar:p.miktar,tutar:p.miktar,amount:p.miktar,genel_toplam:p.miktar});if(p.odenen!==undefined)Object.assign(o,{odenen:p.odenen,paid:p.odenen});if(p.kalan!==undefined)Object.assign(o,{kalan:p.kalan,remaining:p.kalan});if(p.fatura_notu!==undefined)Object.assign(o,{fatura_notu:p.fatura_notu,note:p.fatura_notu});if(p.tarih!==undefined)Object.assign(o,{tarih:p.tarih,date:p.tarih});if(p.vade_tarihi!==undefined)Object.assign(o,{vade_tarihi:p.vade_tarihi,due_date:p.vade_tarihi});if(p.fatura_durumu!==undefined)Object.assign(o,{fatura_durumu:p.fatura_durumu,invoice_status:p.fatura_durumu});return o;};
export async function loadInvoices(user:UserContext){
  let rows=await fetchRows(requireSupabase(),TABLES.invoices,'Faturalar',7000);
  rows=filterRowsByUserBranch(rows,user);
  rows=rows.filter(r=>{
    const deleted=pick(r,['deleted_at','silindi_at']);
    const status=normalize(pick(r,['fatura_durumu','invoice_status'],''));
    return !deleted && status!=='silindi';
  });
  const pending=getOfflineMutationQueue(user.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  for(const item of pending){const p=item.payload||{};const target=String(p.id||'');
    if(item.operation==='invoice.delete'){rows=rows.filter(r=>String(pick(r,['id'],''))!==target);continue;}
    if(item.operation==='invoice.update'){const i=rows.findIndex(r=>String(pick(r,['id'],''))===target);if(i>=0)rows[i]={...rows[i],...(p.payload||{}),pending_offline:true};continue;}
    if(item.operation==='invoice.create'){rows.unshift({id:`offline:${item.id}`,branch_id:p.branch_id,sube:p.branch_name,firma:p.firma,seri_no:p.serial,icerik:p.content,miktar:p.amount,odenen:p.paid,kalan:Math.max(0,Number(p.amount||0)-Number(p.paid||0)),tarih:p.date,vade_tarihi:p.due,fatura_durumu:p.status,para_birimi:p.currency,pending_offline:true} as AnyRow);continue;}
    if(item.operation==='invoice.payment'){const i=rows.findIndex(r=>String(pick(r,['id'],''))===String(p.invoice_id));if(i>=0){const paid=Number(pick(rows[i],['odenen','paid'],0))+Number(p.amount||0);const total=Number(pick(rows[i],['miktar','tutar','amount','genel_toplam'],0));rows[i]={...rows[i],odenen:paid,paid,kalan:Math.max(0,total-paid),remaining:Math.max(0,total-paid),fatura_durumu:Math.max(0,total-paid)<=0?'Ödendi':'Açık',pending_offline:true};}}
  }
  rows.sort((a,b)=>String(pick(b,['tarih','date','created_at'],'')).localeCompare(String(pick(a,['tarih','date','created_at'],''))));
  return rows as InvoiceRow[];
}
export async function createInvoice(input:AnyRow,user:UserContext){const sb=requireSupabase();const branchId=String(input.branch_id||'');const branches=await loadModuleBranches({...user,branchIds:[]});const branch=branches.find(b=>b.id===branchId);if(!branch)throw new Error('Şube bulunamadı.');const amount=Number(input.miktar??0);const paid=Number(input.odenen??0);const userName=user.fullName||user.username||user.email;const payload={branch_id:branchId,branch_name:branch.name,firma:text(input,['firma','fatura_adi']),serial:text(input,['seri_no','fatura_no']),content:text(input,['icerik']),amount,paid,kdv:text(input,['kdv']),note:text(input,['fatura_notu']),date:String(input.tarih),due:input.vade_tarihi?String(input.vade_tarihi):null,status:text(input,['fatura_durumu'],'Açık'),currency:text(input,['para_birimi'],'TRY'),user_id:user.id,user_name:userName};return runMutation(user.id,'invoice.create',payload,()=>sb.rpc('kasa_create_invoice_v24',{p_branch_id:branchId,p_branch_name:branch.name,p_firma:payload.firma,p_serial:payload.serial,p_content:payload.content,p_amount:amount,p_paid:paid,p_kdv:payload.kdv,p_note:payload.note,p_date:payload.date,p_due:payload.due,p_status:payload.status,p_currency:payload.currency,p_user_id:user.id,p_user_name:userName}),'Fatura kaydı');}

// Fatura Offline Koruması
export async function updateInvoice(id:string,patch:AnyRow,user:UserContext){
  if(id.startsWith('offline:')) {
    if(updateQueuedCreate(user.id,'invoice',id,{id,payload:invoiceAliasPayload(patch)})) return {queued:true,eventId:id.slice(8),updatedPending:true};
    throw new Error('Çevrimdışı fatura bulunamadı veya senkronize edildi. Sayfayı yenileyin.');
  }
  const sb=requireSupabase();const clean=invoiceAliasPayload(patch);return runMutation(user.id,'invoice.update',{id,payload:clean,user_id:user.id},()=>sb.rpc('kasa_update_invoice_v24',{p_id:id,p_payload:clean,p_user_id:user.id}),'Fatura güncelleme');
}
export async function deleteInvoice(id:string,user:UserContext){
  if(id.startsWith('offline:')){
    if(cancelQueuedCreate(user.id,'invoice',id)) return {queued:false,cancelledPending:true};
    throw new Error('Çevrimdışı fatura bulunamadı veya senkronize edildi. Sayfayı yenileyin.');
  }
  const sb=requireSupabase();return runMutation(user.id,'invoice.delete',{id,user_id:user.id},()=>sb.rpc('kasa_delete_invoice_v24',{p_id:id,p_user_id:user.id}),'Fatura silme');
}

export async function loadInvoicePayments(invoiceId:string){
  const rows=await fetchRows(requireSupabase(),TABLES.invoicePayments,'Fatura ödemeleri',3000);
  const out=rows.filter(r=>String(pick(r,['invoice_id','fatura_id']))===invoiceId) as AnyRow[];
  const currentUser=activeCacheUser();
  for(const item of getOfflineMutationQueue(currentUser))if(item.operation==='invoice.payment'&&String(item.payload.invoice_id)===invoiceId){out.unshift({id:`offline:${item.id}`,invoice_id:invoiceId,branch_id:item.payload.branch_id,tarih:item.payload.date,created_at:item.createdAt,miktar:item.payload.amount,amount:item.payload.amount,tur:item.payload.method,method:item.payload.method,pending_offline:true});}
  return out.sort((a,b)=>String(pick(b,['tarih','created_at'],'')).localeCompare(String(pick(a,['tarih','created_at'],'')))) as InvoicePaymentRow[];
}
export async function createInvoicePayment(input:{invoice_id:string;branch_id:string;miktar:number;tarih:string;tur:'Kasa'|'Kart';aciklama?:string},user:UserContext){if(input.tur!=='Kasa'&&input.tur!=='Kart')throw new Error('Yalnızca Kasa veya Kart kullanılabilir.');if(!(input.miktar>0))throw new Error('Ödeme tutarı 0’dan büyük olmalıdır.');const sb=requireSupabase();const userName=user.fullName||user.username||user.email;const payload={invoice_id:input.invoice_id,branch_id:input.branch_id,amount:input.miktar,date:input.tarih,method:input.tur,user_id:user.id,user_name:userName};if(input.invoice_id.startsWith('offline:')){const eventId=input.invoice_id.slice('offline:'.length);const queuedInvoice=getOfflineMutationQueue(user.id).some(row=>row.id===eventId&&row.operation==='invoice.create');if(!queuedInvoice)throw new Error('Çevrimdışı fatura kaydı bulunamadı. Faturayı yenileyip tekrar deneyin.');return queueOfflineMutation(user.id,'invoice.payment',payload);}return runMutation(user.id,'invoice.payment',payload,()=>sb.rpc('v19_record_invoice_payment',{p_invoice_id:input.invoice_id,p_branch_id:input.branch_id,p_amount:input.miktar,p_date:input.tarih,p_method:input.tur,p_user_id:user.id,p_user_name:userName}),'Fatura ödemesi');}

export async function loadCari(user:UserContext){let rows=await fetchRows(requireSupabase(),TABLES.cari,'Cari hesaplar',5000);rows=filterRowsByUserBranch(rows,user);rows=rows.filter(r=>!pick(r,['deleted_at','silindi_at']));for(const item of getOfflineMutationQueue(user.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){const p=item.payload||{};const target=String(p.id||'');if(item.operation==='cari.delete'){rows=rows.filter(r=>String(pick(r,['id'],''))!==target);continue;}if(item.operation==='cari.update'){const i=rows.findIndex(r=>String(pick(r,['id'],''))===target);if(i>=0)rows[i]={...rows[i],...(p.payload||{}),pending_offline:true};continue;}if(item.operation==='cari.create')rows.unshift({id:`offline:${item.id}`,branch_id:p.branch_id,sube:p.branch_name,firma:p.firma,miktar:p.amount,tutar:p.amount,amount:p.amount,aciklama:p.description,tarih:p.date,pending_offline:true});}return rows as CariRow[];}
export async function createCari(input:{branch_id:string;firma:string;miktar:number;aciklama:string;tarih:string;islem_turu:'Alacak'|'Borç'},user:UserContext){const branches=await loadModuleBranches({...user,branchIds:[]});const branch=branches.find(b=>b.id===input.branch_id);if(!branch)throw new Error('Şube bulunamadı.');const signed=input.islem_turu==='Alacak'?Math.abs(input.miktar):-Math.abs(input.miktar);const userName=user.fullName||user.username||user.email;const payload={branch_id:input.branch_id,branch_name:branch.name,firma:input.firma,amount:signed,description:input.aciklama,date:input.tarih,user_id:user.id,user_name:userName};return runMutation(user.id,'cari.create',payload,()=>requireSupabase().rpc('kasa_create_cari_v24',{p_branch_id:input.branch_id,p_branch_name:branch.name,p_firma:input.firma,p_amount:signed,p_description:input.aciklama,p_date:input.tarih,p_user_id:user.id,p_user_name:userName}),'Cari kaydı');}

// Cari Offline Koruması
export async function updateCari(id:string,input:{branch_id:string;firma:string;miktar:number;aciklama:string;tarih:string;islem_turu:'Alacak'|'Borç'},user:UserContext){
  if(id.startsWith('offline:')){
    const branches=await loadModuleBranches({...user,branchIds:[]});
    const br=branches.find(b=>b.id===input.branch_id);if(!br)throw new Error('Şube bulunamadı.');
    const signedOffline=input.islem_turu==='Alacak'?Math.abs(input.miktar):-Math.abs(input.miktar);
    if(updateQueuedCreate(user.id,'cari',id,{payload:{branch_id:input.branch_id,firma:input.firma,miktar:signedOffline,tutar:signedOffline,amount:signedOffline,aciklama:input.aciklama,açıklama:input.aciklama,tarih:input.tarih,date:input.tarih}})) return {queued:true,eventId:id.slice(8),updatedPending:true};
    throw new Error('Çevrimdışı cari hesap bulunamadı veya senkronize edildi. Sayfayı yenileyin.');
  }
  const signed=input.islem_turu==='Alacak'?Math.abs(input.miktar):-Math.abs(input.miktar);const payload={branch_id:input.branch_id,firma:input.firma,miktar:signed,tutar:signed,amount:signed,aciklama:input.aciklama,açıklama:input.aciklama,tarih:input.tarih,date:input.tarih};return runMutation(user.id,'cari.update',{id,payload,user_id:user.id},()=>requireSupabase().rpc('kasa_update_cari_v24',{p_id:id,p_payload:payload,p_user_id:user.id}),'Cari güncelleme');
}
export async function deleteCari(id:string,user:UserContext){
  if(id.startsWith('offline:')){
    if(cancelQueuedCreate(user.id,'cari',id)) return {queued:false,cancelledPending:true};
    throw new Error('Çevrimdışı cari hesap bulunamadı veya senkronize edildi. Sayfayı yenileyin.');
  }
  return runMutation(user.id,'cari.delete',{id,user_id:user.id},()=>requireSupabase().rpc('kasa_delete_cari_v24',{p_id:id,p_user_id:user.id}),'Cari silme');
}

export type CompanyInput={name:string;tax_number?:string;phone?:string;email?:string;address?:string};
export async function loadCompanies(user:UserContext):Promise<CompanyRow[]> {
  const sb=requireSupabase();
  const mapRows=(rows:AnyRow[])=>rows.map(r=>({id:text(r,['id']),name:text(r,['name','şirket_adi','sirket_adi','işletme_adi','isletme_adi','ad','isim','firma','company_name','unvan','ticari_unvan','ticari_unvanı'],'İşletme'),tax_number:text(r,['tax_number','vergi_no','vergi_numarasi','vergi_numarası'])||null,phone:text(r,['phone','telefon'])||null,email:text(r,['email','eposta','e_posta'])||null,address:text(r,['address','adres'])||null,is_active:bool(r,['is_active','aktif'],true)}));
  if(isSuperAdmin(user.role, user.email)){
    try { const rpc=await db(sb.rpc('v19_get_companies'),'SUPER_ADMIN işletmeleri'); if(!rpc.error&&Array.isArray(rpc.data)&&(rpc.data as AnyRow[]).length) return mapRows(rpc.data as AnyRow[]); } catch {}
    try { const rpc=await db(sb.rpc('get_superadmin_companies'),'SUPER_ADMIN işletmeleri yedek'); if(!rpc.error&&Array.isArray(rpc.data)&&(rpc.data as AnyRow[]).length) return mapRows(rpc.data as AnyRow[]); } catch {}
  }
  let rows=await fetchRows(sb,TABLES.companies,'İşletmeler',5000);
  if(user.companyId)rows=rows.filter(r=>String(pick(r,['id'],''))===user.companyId);
  return mapRows(rows);
}
export async function createCompany(input:CompanyInput){const rpc=await db(requireSupabase().rpc('superadmin_create_company',{p_name:input.name,p_tax_number:input.tax_number||null,p_phone:input.phone||null,p_email:input.email||null,p_address:input.address||null}),'İşletme kaydı');if(rpc.error)throw new Error(rpc.error.message);return String(rpc.data);}
export async function updateCompany(id:string,patch:Partial<CompanyRow>){const rpc=await db(requireSupabase().rpc('superadmin_update_company',{p_id:id,p_name:patch.name??'',p_tax_number:patch.tax_number??null,p_phone:patch.phone??null,p_email:patch.email??null,p_address:patch.address??null,p_is_active:patch.is_active??true}),'İşletme güncelleme');if(rpc.error)throw new Error(rpc.error.message);}
export async function deleteCompany(id:string){const rpc=await db(requireSupabase().rpc('superadmin_delete_company',{p_id:id}),'İşletme silme');if(rpc.error)throw new Error(rpc.error.message);}
export async function loadBranches(user:UserContext):Promise<BranchRow[]> {
  const sb=requireSupabase();
  const mapRows=(rows:AnyRow[])=>rows.map(r=>({id:text(r,['id']),company_id:text(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id']),name:text(r,['name','şube_adi','sube_adi','ad','isim','branch_name'],'Şube'),code:text(r,['code','kod'])||null,phone:text(r,['phone','telefon'])||null,email:text(r,['email','eposta','e_posta'])||null,address:text(r,['address','adres'])||null,city:text(r,['city','şehir','sehir'])||null,district:text(r,['district','ilçe','ilce'])||null,latitude:Number(pick(r,['latitude','enlem'],NaN))||null,longitude:Number(pick(r,['longitude','boylam'],NaN))||null,is_active:bool(r,['is_active','aktif'],true)}));
  if(isSuperAdmin(user.role, user.email)){
    try { const rpc=await db(sb.rpc('v19_get_branches'),'SUPER_ADMIN şubeleri'); if(!rpc.error&&Array.isArray(rpc.data)&&(rpc.data as AnyRow[]).length) return mapRows(rpc.data as AnyRow[]); } catch {}
    try { const rpc=await db(sb.rpc('get_superadmin_branches'),'SUPER_ADMIN şubeleri yedek'); if(!rpc.error&&Array.isArray(rpc.data)&&(rpc.data as AnyRow[]).length) return mapRows(rpc.data as AnyRow[]); } catch {}
  }
  try {
    let rows=await fetchRows(sb,TABLES.branches,'Şubeler',5000);
    rows=filterRowsByUserBranch(rows,user);
    if(user.companyId)rows=rows.filter(r=>String(pick(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id'],''))===user.companyId);
    return mapRows(rows);
  } catch (directError) {
    try {
      const roleRows=await fetchRows(sb,TABLES.roles,'Kullanıcı şube rolleri',5000);
      const branchMap=new Map<string,AnyRow>();
      const superAdmin=isSuperAdmin(user.role,user.email);
      for(const r of roleRows){
        const bid=uuid(r,['branch_id','şube_id','sube_id']);
        if(!bid) continue;
        const cid=text(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id'],'');
        if(!superAdmin && user.companyId && cid!==user.companyId) continue;
        if(!superAdmin && user.branchIds.length && !user.branchIds.includes(bid)) continue;
        if(!branchMap.has(bid)) branchMap.set(bid,{id:bid,company_id:cid,name:text(r,['branch_name','şube_adi','sube_adi','branch','sube','şube'],`Şube ${bid.slice(0,8)}`),city:text(r,['city','şehir','sehir']),phone:text(r,['phone','telefon']),is_active:true});
      }
      const fallback=mapRows([...branchMap.values()]);
      if(fallback.length) return fallback;
    } catch {}
    const raw=directError instanceof Error ? directError.message : String(directError);
    if(/schema cache|could not find the table|does not exist/i.test(raw)) throw new Error('Şube verisi Supabase REST katmanında görünmüyor. SUPABASE_1_SEFER_FINAL_GUVENLI.sql dosyasını Supabase SQL Editor’da bir kez çalıştırın; bu kurulum SUPER_ADMIN için şubeleri doğrudan veritabanından okuyan RPC katmanını kurar.');
    throw directError;
  }
}
export async function createBranch(input:{company_id:string;name:string;code?:string;phone?:string;email?:string;address?:string;city?:string;district?:string}){const rpc=await db(requireSupabase().rpc('v19_create_branch',{p_company_id:input.company_id,p_name:input.name,p_code:input.code||null,p_phone:input.phone||null,p_email:input.email||null,p_address:input.address||null,p_city:input.city||null,p_district:input.district||null}),'Şube kaydı');if(rpc.error)throw new Error(rpc.error.message);return String(rpc.data);}
export async function updateBranch(id:string,patch:Partial<BranchRow>){const rpc=await db(requireSupabase().rpc('v19_update_branch',{p_id:id,p_company_id:patch.company_id??null,p_name:patch.name??'',p_code:patch.code??null,p_phone:patch.phone??null,p_email:patch.email??null,p_address:patch.address??null,p_city:patch.city??null,p_district:patch.district??null,p_is_active:patch.is_active??true}),'Şube güncelleme');if(rpc.error)throw new Error(rpc.error.message);}

export async function loadSuperAdminScope(){const user=await getUserContext();if(!isSuperAdmin(user.role,user.email))throw new Error('İşletme/şube kapsamı yalnızca SUPER_ADMIN tarafından görüntülenebilir.');const [companies,branches]=await Promise.all([loadCompanies(user),loadBranches(user)]);return {companies,branches};}
export async function loadSuperAdminUsers():Promise<UserRow[]>{
 const sb=requireSupabase();
 try{
  const rpc=await db(sb.rpc('v19_get_users'),'SUPER_ADMIN kullanıcıları');
  if(!rpc.error && Array.isArray(rpc.data)){
   const rows=(rpc.data??[]) as AnyRow[]; const map=new Map<string,UserRow>();
   for(const r of rows){const id=text(r,['id']); const item=map.get(id)??{id,username:text(r,['username']),full_name:text(r,['full_name']),email:text(r,['email']),is_active:bool(r,['is_active','aktif'],true),roles:[]}; const roleId=uuid(r,['role_id','id']); const cid=uuid(r,['company_id','şirket_id','isletme_id'])||''; const bid=uuid(r,['branch_id','şube_id','sube_id']); const role=text(r,['role','rol']); if(roleId&&role) item.roles.push({id:roleId,company_id:cid,branch_id:bid,role}); map.set(id,item); }
   return [...map.values()];
  }
 }catch{}
 const profiles=await fetchRows(sb,TABLES.profiles,'Kullanıcılar',5000); const roles=await fetchRows(sb,TABLES.roles,'Kullanıcı rolleri',10000); const map=new Map<string,UserRow>();
 for(const p of profiles){const id=text(p,['id']); map.set(id,{id,username:text(p,['username','kullanici_adi']),full_name:text(p,['full_name','ad_soyad']),email:text(p,['email','e_posta','eposta']),is_active:bool(p,['is_active','aktif'],true),roles:[]});}
 for(const r of roles){const id=text(r,['user_id','kullanici_id','kullanıcı_id']); const item=map.get(id); if(!item)continue; const role=text(r,['role','rol']); if(role)item.roles.push({id:text(r,['id']),company_id:uuid(r,['company_id','şirket_id','sirket_id','isletme_id'])||'',branch_id:uuid(r,['branch_id','şube_id','sube_id']),role});}
 return [...map.values()];
}

export async function loadUsers(user:UserContext){if(isSuperAdmin(user.role, user.email))return loadSuperAdminUsers();const sb=requireSupabase();const profiles=await fetchRows(sb,TABLES.profiles,'Kullanıcılar',3000);const roleRows=await fetchRows(sb,TABLES.roles,'Kullanıcı rolleri',5000);const allowed=roleRows.filter(r=>String(pick(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id'],''))===String(user.companyId));return profiles.map(p=>{const id=text(p,['id']);return {id,username:text(p,['username','kullanici_adi']),full_name:text(p,['full_name','ad_soyad']),email:text(p,['email','e_posta','eposta']),is_active:bool(p,['is_active','aktif'],true),roles:allowed.filter(r=>String(pick(r,['user_id','kullanici_id','kullanıcı_id'],''))===id).map(r=>({id:text(r,['id']),company_id:uuid(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id'])||'',branch_id:uuid(r,['branch_id','şube_id','sube_id']),role:text(r,['role','rol'])}))};}).filter(u=>isSuperAdmin(user.role, user.email)||u.roles.length>0);}
export type CreateUserInput={full_name:string;username:string;email:string;password:string;company_id:string;branch_id:string|null;role:string};
export async function createAuthUser(input:CreateUserInput){const sb=requireSupabase();const caller=await getUserContext();if(!isSuperAdmin(caller.role,caller.email))throw new Error('Bu işlem yalnızca SUPER_ADMIN tarafından yapılabilir.');const eph=createEphemeralSupabase();if(!eph)throw new Error('Supabase bağlantısı yapılandırılmamış.');const authResult=await db(eph.auth.signUp({email:input.email.trim().toLowerCase(),password:input.password,options:{data:{username:input.username.trim().toLowerCase(),full_name:input.full_name.trim(),role:input.role,company_id:input.company_id,branch_id:input.branch_id}}}),'Auth kullanıcı oluşturma');if(authResult.error)throw authResult.error;if(!authResult.data.user)throw new Error('Auth kullanıcısı oluşturulamadı.');const rpc=await db(sb.rpc('superadmin_finalize_user_creation',{p_user_id:authResult.data.user.id,p_full_name:input.full_name,p_username:input.username,p_email:input.email,p_company_id:input.company_id,p_branch_id:input.branch_id,p_role:input.role}),'Kullanıcı ataması');if(rpc.error)throw new Error(`Kullanıcı oluşturuldu fakat atama tamamlanamadı: ${rpc.error.message}`);return {id:authResult.data.user.id,email:input.email,username:input.username};}
export async function resetUserPassword(userId:string,newPassword:string){
 const sb=requireSupabase();
 const caller=await getUserContext();
 if(!isSuperAdmin(caller.role,caller.email))throw new Error('Bu işlem yalnızca SUPER_ADMIN tarafından yapılabilir.');
 const cleanUserId=String(userId||'').trim();
 const cleanPassword=String(newPassword||'');
 if(!cleanUserId)throw new Error('Kullanıcı seçilmedi.');
 if(cleanPassword.length<6)throw new Error('Yeni şifre en az 6 karakter olmalıdır.');
 const {data,error}=await db(sb.functions.invoke('admin-create-user',{body:{action:'reset_password',user_id:cleanUserId,new_password:cleanPassword}}),'Kullanıcı şifresi');
 if(error)throw new Error(error.message);
 if((data as any)?.error)throw new Error(String((data as any).error));
 return data;
}

export async function requestPasswordResetNotification(email:string){
 const sb=requireSupabase();
 const clean=String(email||'').trim().toLowerCase();
 if(!clean)throw new Error('E-posta zorunludur.');
 const {data,error}=await db(sb.functions.invoke('help-center',{body:{action:'password_reset',email:clean}}),'Şifre sıfırlama bildirimi',9000);
 if(error)throw new Error(error.message);
 if((data as any)?.error)throw new Error(String((data as any).error));
 return data;
}

export async function assignUser(input:{user_id:string;company_id:string;branch_id:string|null;role:string}){const rpc=await db(requireSupabase().rpc('superadmin_assign_user',{p_user_id:input.user_id,p_company_id:input.company_id,p_branch_id:input.branch_id,p_role:input.role}),'Kullanıcı ataması');if(rpc.error)throw rpc.error;}
export async function assignUserMany(userId:string,companyId:string,branchIds:string[],role:string){if(!branchIds.length){await assignUser({user_id:userId,company_id:companyId,branch_id:null,role});return;}for(const branchId of branchIds)await assignUser({user_id:userId,company_id:companyId,branch_id:branchId,role});}
export async function setBranchUser(userId:string,companyId:string,branchId:string,role:string){const rpc=await db(requireSupabase().rpc('superadmin_set_branch_user',{p_user_id:userId,p_company_id:companyId,p_branch_id:branchId,p_role:role}),'Şube kullanıcı ataması');if(rpc.error)throw rpc.error;}
export async function removeUserAssignment(id:string){const rpc=await db(requireSupabase().rpc('superadmin_remove_user_assignment',{p_id:id}),'Kullanıcı ataması kaldırma');if(rpc.error)throw rpc.error;}

export const APP_PERMISSIONS=[['GELIR_EKLE','Gelir ekleme'],['GELIR_DUZENLE','Gelir düzenleme'],['GELIR_SIL','Gelir pasifleştirme'],['GIDER_EKLE','Gider ekleme'],['GIDER_DUZENLE','Gider düzenleme'],['GIDER_SIL','Gider pasifleştirme'],['CARI_EKLE','Cari hareket ekleme'],['CARI_DUZENLE','Cari hareket düzenleme'],['CARI_SIL','Cari hareket pasifleştirme'],['FATURA_EKLE','Fatura ekleme'],['FATURA_DUZENLE','Fatura düzenleme'],['FATURA_SIL','Fatura pasifleştirme'],['FATURA_ODEME','Fatura ödeme'],['POSMIST_GOR','POSMIST ekranını görme'],['POSMIST_YONET','POSMIST ayarlarını düzenleme'],['KULLANICI_YONET','Kullanıcı yönetimi'],['SUBE_YONET','Şube yönetimi'],['RAPOR_GOR','Rapor görüntüleme']] as const;
export async function loadPermissions(userId:string){const rows=await fetchRows(requireSupabase(),TABLES.permissions,'Kullanıcı yetkileri',3000);return rows.filter(r=>String(pick(r,['user_id','kullanici_id','kullanıcı_id']))===userId).map(r=>({id:text(r,['id']),user_id:userId,permission:text(r,['permission','izin','yetki']),value:bool(r,['value','deger','değer','aktif','enabled'],false)}));}
export async function savePermission(userId:string,permission:string,value:boolean){const rpc=await db(requireSupabase().rpc('v19_save_permission',{p_user_id:userId,p_permission:permission,p_value:value}),'Yetki kaydı');if(rpc.error)throw rpc.error;}
export async function updateProfile(userId:string,patch:{full_name?:string;phone?:string}){const {error}=await db(requireSupabase().from('profiles').update(patch).eq('id',userId),'Profil güncelleme');if(error)throw error;}

export async function loadRatesFromTransactions(user:UserContext){const tx=await normalizedTransactions(user,7000);let usd=0,eur=0;for(const r of tx){usd=usd||num(r.raw,['dolar_kur','usd_buy','usd_kur']);eur=eur||num(r.raw,['euro_kur','eur_buy','eur_kur']);if(usd&&eur)break;}return [{code:'USD',name:'ABD Doları',buy:usd,sell:usd,source:'Gerçek finans kaydı'},{code:'EUR',name:'Euro',buy:eur,sell:eur,source:'Gerçek finans kaydı'}].filter(r=>r.buy>0);}
export type ReportData={transactions:ModuleTransaction[];invoices:InvoiceRow[];cari:CariRow[]};
export async function loadReportData(user:UserContext,from:string,to:string,branchId?:string):Promise<ReportData>{const [tx,inv,cari]=await Promise.all([loadModuleTransactions(user),loadInvoices(user),loadCari(user)]);const inRange=(v:string)=>{const k=v.slice(0,10);return (!from||k>=from)&&(!to||k<=to)};const inScopeBranch=(bid:string|null)=>branchId?bid===branchId:(user.companyId&&user.branchIds.length?user.branchIds.includes(String(bid||'')):true);const txFiltered=tx.filter(r=>inRange(r.dateKey||r.date)&&inScopeBranch(r.branchId||null));const invFiltered=inv.filter(r=>inRange(text(r,['tarih','date']))&&inScopeBranch(uuid(r,['branch_id','şube_id','sube_id'])));const cariFiltered=cari.filter(r=>inRange(text(r,['tarih','date']))&&inScopeBranch(uuid(r,['branch_id','şube_id','sube_id'])));return {transactions:txFiltered,invoices:invFiltered,cari:cariFiltered};}

export type PosmistRow={id:string;company_id:string;branch_id:string|null;business_id:string;api_url:string;api_key?:string|null;endpoint_path?:string|null;json_path?:string|null;enabled:boolean;daily_time:string};
export async function loadPosmist(user:UserContext){
  const sb=requireSupabase();
  try {
    const rpc=await db(sb.rpc('v19_load_posmist'),'POSMIST güvenli okuma');
    if(rpc.error)throw rpc.error;
    if(!Array.isArray(rpc.data))throw new Error('POSMIST güvenli okuma geçerli kayıt listesi döndürmedi.');
    return (rpc.data as AnyRow[]).map(r=>({id:text(r,['id']),company_id:text(r,['company_id','şirket_id','sirket_id','işletme_id']),branch_id:uuid(r,['branch_id','şube_id','sube_id']),business_id:text(r,['business_id','işletme_kodu','business']),api_url:text(r,['api_url','api_adresi']),api_key:null,endpoint_path:text(r,['endpoint_path','endpoint']),json_path:text(r,['json_path'],'data.cash_total'),enabled:bool(r,['enabled','aktif'],true),daily_time:text(r,['daily_time','günlük_saat','gunluk_saat'],'23:59')})).filter(r=>!r.id?false:true);
  } catch(error) {
    if(isSuperAdmin(user.role,user.email)&&isMissingRpc(error as AnyRow)) {
      const rows=await fetchRows(sb,TABLES.posmist,'POSMIST',3000);
      return rows.filter(r=>!pick(r,['deleted_at','silindi_at'])).map(r=>({id:text(r,['id']),company_id:text(r,['company_id','şirket_id','sirket_id','işletme_id']),branch_id:uuid(r,['branch_id','şube_id','sube_id']),business_id:text(r,['business_id','işletme_kodu','business']),api_url:text(r,['api_url','api_adresi']),api_key:null,endpoint_path:text(r,['endpoint_path','endpoint']),json_path:text(r,['json_path'],'data.cash_total'),enabled:bool(r,['enabled','aktif'],true),daily_time:text(r,['daily_time','günlük_saat','gunluk_saat'],'23:59')}));
    }
    throw new Error(`POSMIST güvenli okuma başarısız. Supabase SQL Editor içinde supabase/sql/INSTALL_V19_37_ALL_FEATURES.sql dosyasının kurulumunu doğrulayın. ${String((error as any)?.message??error)}`);
  }
}
export async function savePosmist(input:{id?:string;company_id:string;branch_id:string|null;business_id:string;api_url:string;api_key:string;endpoint_path:string;json_path:string;enabled:boolean;daily_time:string}){const sb=requireSupabase();const payload:AnyRow={company_id:input.company_id,şirket_id:input.company_id,sirket_id:input.company_id,isletme_id:input.company_id,branch_id:input.branch_id,şube_id:input.branch_id,sube_id:input.branch_id,business_id:input.business_id,api_url:input.api_url,endpoint_path:input.endpoint_path,json_path:input.json_path||'data.cash_total',enabled:input.enabled,aktif:input.enabled,daily_time:input.daily_time};if(input.api_key.trim())payload.api_key=input.api_key.trim();const rpc=await db(sb.rpc('v19_save_posmist',{p_id:input.id??null,p_payload:payload}),'POSMIST kaydı');if(rpc.error)throw new Error(rpc.error.message||'POSMIST kaydedilemedi.');}
export async function deletePosmist(id:string){const rpc=await db(requireSupabase().rpc('v19_delete_posmist',{p_id:id}),'POSMIST kaldırma');if(rpc.error)throw new Error(rpc.error.message||'POSMIST silinemedi.');}


export type AppNotification={id:string;title:string;message:string;is_read:boolean;created_at:string;help:{sender_id:string;sender_name:string;sender_email:string;sender_phone:string;subject:string;message:string}|null};
const parseHelpMessage=(message:string):AppNotification['help']=>{for(const prefix of ['[KASA_HELP_V3]','[KASA_HELP_V2]','[KASA_HELP_V1]']){if(message.startsWith(prefix)){try{return JSON.parse(message.slice(prefix.length)) as AppNotification['help'];}catch{return null;}}}return null;};
export async function submitHelpRequest(input:{subject:string;message:string},user:UserContext){const sb=requireSupabase();const payload={subject:input.subject.trim(),message:input.message.trim(),user_id:user.id};const result=await runMutation(user.id,'help.submit',payload,()=>sb.rpc('submit_help_request',{p_subject:payload.subject,p_message:payload.message}),'Yardım talebi');if(!(result as any)?.queued&&!(result as any)?.data)throw new Error('Bildirim oluşturulamadı.');return result;}
export async function loadNotifications(user:UserContext){
  if(!isAdminRole(user.role))return [] as AppNotification[];
  const sb=requireSupabase();
  const mapRows=(rows:AnyRow[])=>rows.map(r=>({id:text(r,['id']),title:text(r,['title','baslik','başlık','konu'],'Bildirim'),message:text(r,['message','mesaj','mesaj_metin','mesaj_metni','icerik','içerik']),is_read:bool(r,['is_read','okundu','okunuyor','okundu_mu'],false),created_at:text(r,['created_at','oluşturulma_tarihi','olusturulma_tarihi','tarih']),help:parseHelpMessage(text(r,['message','mesaj','mesaj_metin','mesaj_metni','icerik','içerik'],' '))}));
  const applyNotificationOutbox=(input:AppNotification[])=>{
    let rows=[...input];
    for(const item of getOfflineMutationQueue(user.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){
      if(item.operation==='notification.read') rows=rows.map(n=>n.id===String(item.payload.id)?{...n,is_read:true}:n);
      if(item.operation==='notification.clear_read') rows=rows.filter(n=>!n.is_read);
    }
    return rows.sort((a,b)=>b.created_at.localeCompare(a.created_at));
  };
  const cached = readCachedRows('notifications-ui', []);
  if(typeof navigator!=='undefined'&&navigator.onLine===false){
    if(cached) return applyNotificationOutbox(cached as AppNotification[]);
    try {
      const rows=await fetchRows(sb,TABLES.notifications,'Bildirimler',1000);
      const recipientKeys=['user_id','kullanici_id','kullanıcı_id','recipient_id','alici_id','alıcı_id'];
      const filtered=rows.filter(r=>recipientKeys.some(k=>r?.[k]!==undefined&&r?.[k]!==null&&String(r[k])===user.id));
      const mapped=mapRows(filtered); saveCachedRows('notifications-ui',[],mapped as unknown as AnyRow[]); return applyNotificationOutbox(mapped);
    } catch { return []; }
  }
  try {
    const rpc=await db(sb.rpc('v19_load_notifications'),'Bildirimler RPC');
    if(!rpc.error && Array.isArray(rpc.data)) {
      const mapped=mapRows(rpc.data as AnyRow[]);
      if(mapped.length>0 || isSuperAdmin(user.role,user.email)) { saveCachedRows('notifications-ui',[],mapped as unknown as AnyRow[]); return applyNotificationOutbox(mapped); }
    }
  } catch {}
  const rows=await fetchRows(sb,TABLES.notifications,'Bildirimler',1000);
  const recipientKeys=['user_id','kullanici_id','kullanıcı_id','recipient_id','alici_id','alıcı_id'];
  const filtered=rows.filter(r=>recipientKeys.some(k=>r?.[k]!==undefined&&r?.[k]!==null&&String(r[k])===user.id));
  const mapped=mapRows(filtered); saveCachedRows('notifications-ui',[],mapped as unknown as AnyRow[]); return applyNotificationOutbox(mapped);
}

export async function markNotificationRead(id:string,user?:UserContext){
  const me=user??await getUserContext();
  const sb=requireSupabase();
  const payload={id,user_id:me.id};
  return runMutation(me.id,'notification.read',payload,()=>sb.rpc('v19_mark_notification_read',{p_id:id}),'Bildirim okundu');
}

export async function deleteReadNotifications(user?:UserContext){
  const me=user??await getUserContext();
  const sb=requireSupabase();
  return runMutation(me.id,'notification.clear_read',{user_id:me.id},()=>sb.rpc('v19_delete_read_notifications'),'Okunmuş bildirimleri temizleme');
}
