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
  const branchIds: string[] = superAdmin
    ? []
    : Array.from(
        new Set(
          rows
            .map((r: AnyRow) => uuid(r, ['branch_id', 'şube_id', 'sube_id']))
            .filter((value): value is string => Boolean(value))
        )
      );
  let branchNames: string[] = [];
  if (branchIds.length || companyId) {
    const branchRows = await fetchRows(sb, TABLES.branches, 'Şube bilgileri', 3000);
    const allowed = branchRows.filter((r: AnyRow) =>
      branchIds.length
        ? branchIds.includes(String(pick(r, ['id'], '')))
        : String(pick(r, ['company_id', 'şirket_id', 'sirket_id', 'işletme_id', 'isletme_id'], '')) === String(companyId)
    );
    branchNames = allowed.map((r: AnyRow) =>
      text(r, ['name', 'şube_adi', 'sube_adi', 'ad', 'isim', 'branch_name'], 'Şube')
    );
  }
  return { id: uid, username: text(profileRecord,['username','kullanici_adi'], text(metadata,['username'],'')), fullName: text(profileRecord,['full_name','ad_soyad'], text(metadata,['full_name'], auth.user.email ?? '')), email: text(profileRecord,['email','e_posta','eposta'], auth.user.email ?? ''), companyId, role: String(role ?? ''), branchIds, branchNames, phone: text(profileRecord,['phone','telefon'],'') };
}

export async function loginWithUsername(username: string, password: string) {
  const sb = requireSupabase();
  const clean = username.trim();
  if (!clean || !password) throw new Error('Kullanıcı adı/e-posta ve şifre zorunludur.');
  let loginEmail = clean.toLowerCase();
  if (!clean.includes('@')) {
    let resolved = '';
    try { const result = await db(sb.rpc('get_login_email',{p_username:clean}),'Kullanıcı adı çözümleme'); if (!result.error) resolved = String(result.data ?? ''); } catch { /* legacy RPC may be unavailable */ }
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

export type DashboardData={incomeToday:number;expenseToday:number;netToday:number;totalNet:number;activeBranches:number;chart:{d:string;g:number;c:number}[];branches:{id:string;name:string;city:string;balance:number}[];transactions:ModuleTransaction[];user:UserContext};
export type ModuleTransaction={id:string;title:string;branch:string;category:string;date:string;amount:number;type:'income'|'expense';userName:string;branchId?:string};
export type ModuleBranch={id:string;name:string;city:string;is_active:boolean;balance:number};
export type TransactionInput={branchId:string;type:'Gelir'|'Gider';amount:number;description:string;date:string};
export type InvoiceRow=Record<string,unknown>&{id:string};
export type CariRow=Record<string,unknown>&{id:string};
export type InvoicePaymentRow=Record<string,unknown>&{id:string;invoice_id:string};
export type CompanyRow={id:string;name:string;tax_number:string|null;phone:string|null;email:string|null;address:string|null;is_active:boolean};
export type BranchRow={id:string;company_id:string;name:string;code:string|null;phone:string|null;email:string|null;address:string|null;city:string|null;district:string|null;latitude:number|null;longitude:number|null;is_active:boolean};
export type UserRow={id:string;username:string;full_name:string;email:string;is_active:boolean;roles:{id:string;company_id:string;branch_id:string|null;role:string}[]};
export type PermissionRow={id?:string;user_id:string;permission:string;value:boolean};

async function normalizedTransactions(user:UserContext, limit=5000) {
  const sb=requireSupabase(); const rows=filterRowsByUserBranch(await fetchRows(sb,TABLES.transactions,'Finans hareketleri',limit),user);
  return rows.filter(r=>!pick(r,['deleted_at','silindi_at'])) .map(r=>({
    raw:r,id:text(r,['id']),branch_id:uuid(r,['branch_id','şube_id','sube_id'])||'',sube:text(r,['sube','şube','branch_name'],'Şube'),tur:text(r,['tur','tür','type','islem_turu','işlem_türü']),miktar:num(r,['miktar','tutar','amount','tl_karsiligi','tl_karşiligi','tl_miktar']),aciklama:text(r,['aciklama','açıklama','description']),tarih:text(r,['tarih','date']),islem_zamani:text(r,['islem_zamani','işlem_zamanı','created_at','createdAt']),created_by:uuid(r,['created_by','oluşturan_id','olusturan_id','user_id','kullanici_id']),kullanici:text(r,['kullanici','kullanıcı','user_name'],'')
  }));
}

async function resolveUserNames(ids:string[]) { const sb=requireSupabase(); const uniq=[...new Set(ids.filter(Boolean))]; const map=new Map<string,string>(); if(!uniq.length)return map; const rows=await fetchRows(sb,TABLES.profiles,'İşlem kullanıcıları',5000); for(const r of rows){const id=text(r,['id']);if(uniq.includes(id))map.set(id,text(r,['username','kullanici_adi','full_name','ad_soyad','email'],'—'));} return map; }

export async function loadDashboard(user:UserContext):Promise<DashboardData>{
  const [tx,branches]=await Promise.all([normalizedTransactions(user,5000),loadModuleBranches(user)]); const today=new Date(); const todayKey=localDateKey(today); const start=new Date(today.getFullYear(),today.getMonth(),today.getDate()); const seven=new Date(start); seven.setDate(seven.getDate()-6); const map=new Map<string,{g:number;c:number}>(); for(let i=0;i<7;i++){const d=new Date(seven);d.setDate(seven.getDate()+i);map.set(localDateKey(d),{g:0,c:0});}
  let incomeToday=0,expenseToday=0,totalNet=0; for(const r of tx){const a=r.miktar;const inc=isIncome(r.tur);const key=localDateKey(r.tarih||r.islem_zamani);if(key===todayKey){if(inc)incomeToday+=a;else expenseToday+=a;}const p=map.get(key);if(p){if(inc)p.g+=a/1000;else p.c+=a/1000;}totalNet+=inc?a:-a;}
  const ids=tx.slice(0,20).map(r=>r.created_by||''); const names=await resolveUserNames(ids); const branchMap=new Map(branches.map(b=>[b.id,b])); const recent:ModuleTransaction[]=tx.slice(0,8).map(r=>({id:r.id,title:r.aciklama||(isIncome(r.tur)?'Gelir işlemi':'Gider işlemi'),branch:r.sube||branchMap.get(r.branch_id)?.name||'Şube',category:r.tur,date:formatDate(r.islem_zamani||r.tarih),amount:r.miktar,type:isIncome(r.tur)?'income':'expense',userName:names.get(String(r.created_by||''))||r.kullanici||'—'}));
  const balances=new Map<string,number>(); for(const r of tx)balances.set(r.branch_id,(balances.get(r.branch_id)||0)+(isIncome(r.tur)?r.miktar:-r.miktar));
  return {incomeToday,expenseToday,netToday:incomeToday-expenseToday,totalNet,activeBranches:branches.length,chart:[...map.entries()].map(([d,v])=>({d:d.slice(8,10),g:Math.round(v.g),c:Math.round(v.c)})),branches:branches.map(b=>({id:b.id,name:b.name,city:b.city,balance:balances.get(b.id)||0})),transactions:recent,user};
}

export async function loadModuleTransactions(user: UserContext): Promise<ModuleTransaction[]> {
  const tx = await normalizedTransactions(user, 7000);
  const branches = await loadModuleBranches(user);
  const map = new Map(branches.map((b) => [b.id, b.name]));
  const names = await resolveUserNames(tx.map((r) => r.created_by || ''));

  return tx
    .sort((a, b) =>
      String(b.islem_zamani || b.tarih).localeCompare(
        String(a.islem_zamani || a.tarih)
      )
    )
    .map((r): ModuleTransaction => ({
      id: r.id,
      title: r.aciklama || (isIncome(r.tur) ? 'Gelir işlemi' : 'Gider işlemi'),
      branch: r.sube || map.get(r.branch_id) || 'Şube',
      category: r.tur,
      date: formatDate(r.islem_zamani || r.tarih),
      amount: r.miktar,
      type: isIncome(r.tur) ? 'income' : 'expense',
      userName: names.get(String(r.created_by || '')) || r.kullanici || '—',
      branchId: r.branch_id,
    }));
}

export async function loadModuleBranches(user:UserContext):Promise<ModuleBranch[]>{const sb=requireSupabase();let rows=await fetchRows(sb,TABLES.branches,'Şube listesi',3000);rows=filterRowsByUserBranch(rows,user);if(user.companyId)rows=rows.filter(r=>String(pick(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id'],''))===user.companyId);const tx=await normalizedTransactions(user,7000);const balances=new Map<string,number>();for(const r of tx)balances.set(r.branch_id,(balances.get(r.branch_id)||0)+(isIncome(r.tur)?r.miktar:-r.miktar));return rows.filter(r=>bool(r,['is_active','aktif'],true)).map(r=>({id:text(r,['id']),name:text(r,['name','şube_adi','sube_adi','ad','isim','branch_name'],'Şube'),city:text(r,['city','şehir','sehir']),is_active:bool(r,['is_active','aktif'],true),balance:balances.get(text(r,['id']))||0}));}

export async function createTransaction(input:TransactionInput,user:UserContext){const sb=requireSupabase();if(!input.branchId)throw new Error('Şube seçmelisiniz.');if(!(input.amount>0))throw new Error('Tutar 0’dan büyük olmalıdır.');const branches=await loadModuleBranches({...user,branchIds:[]});const branch=branches.find(b=>b.id===input.branchId);if(!branch)throw new Error('Şube bulunamadı veya erişiminiz yok.');const rpc=await db(sb.rpc('v19_create_transaction',{p_branch_id:input.branchId,p_branch_name:branch.name,p_type:input.type,p_amount:input.amount,p_description:input.description,p_date:input.date,p_user_id:user.id,p_user_name:user.fullName||user.username||user.email}),'İşlem kaydı');if(rpc.error)throw new Error(rpc.error.message);}
export async function updateTransaction(id:string,input:TransactionInput,user:UserContext){const sb=requireSupabase();const branches=await loadModuleBranches({...user,branchIds:[]});const branch=branches.find(b=>b.id===input.branchId);if(!branch)throw new Error('Şube bulunamadı veya erişiminiz yok.');const rpc=await db(sb.rpc('v19_update_transaction',{p_id:id,p_branch_id:input.branchId,p_branch_name:branch.name,p_type:input.type,p_amount:input.amount,p_description:input.description,p_date:input.date,p_user_id:user.id}),'İşlem güncelleme');if(rpc.error)throw new Error(rpc.error.message);}
export async function deleteTransaction(id:string){const sb=requireSupabase();const rpc=await db(sb.rpc('v19_soft_delete_transaction',{p_id:id}),'İşlem silme');if(rpc.error)throw new Error(rpc.error.message);}

const invoiceAliasPayload=(p:AnyRow)=>{const o={...p}; if(p.firma!==undefined)Object.assign(o,{firma:p.firma,company_name:p.firma,fatura_adi:p.firma,invoice_name:p.firma});if(p.seri_no!==undefined)Object.assign(o,{seri_no:p.seri_no,fatura_no:p.seri_no,invoice_number:p.seri_no});if(p.icerik!==undefined)Object.assign(o,{icerik:p.icerik,içerik:p.icerik});if(p.miktar!==undefined)Object.assign(o,{miktar:p.miktar,tutar:p.miktar,amount:p.miktar,genel_toplam:p.miktar});if(p.odenen!==undefined)Object.assign(o,{odenen:p.odenen,paid:p.odenen});if(p.kalan!==undefined)Object.assign(o,{kalan:p.kalan,remaining:p.kalan});if(p.fatura_notu!==undefined)Object.assign(o,{fatura_notu:p.fatura_notu,note:p.fatura_notu});if(p.tarih!==undefined)Object.assign(o,{tarih:p.tarih,date:p.tarih});if(p.vade_tarihi!==undefined)Object.assign(o,{vade_tarihi:p.vade_tarihi,due_date:p.vade_tarihi});if(p.fatura_durumu!==undefined)Object.assign(o,{fatura_durumu:p.fatura_durumu,invoice_status:p.fatura_durumu});return o;};
export async function loadInvoices(user:UserContext){
  let rows=await fetchRows(requireSupabase(),TABLES.invoices,'Faturalar',7000);
  rows=filterRowsByUserBranch(rows,user);
  rows=rows.filter(r=>{
    const deleted=pick(r,['deleted_at','silindi_at']);
    const status=normalize(pick(r,['fatura_durumu','invoice_status'],''));
    return !deleted && status!=='silindi';
  });
  rows.sort((a,b)=>String(pick(b,['tarih','date','created_at'],'')).localeCompare(String(pick(a,['tarih','date','created_at'],''))));
  return rows as InvoiceRow[];
}
export async function createInvoice(input:AnyRow,user:UserContext){const sb=requireSupabase();const branchId=String(input.branch_id||'');const branches=await loadModuleBranches({...user,branchIds:[]});const branch=branches.find(b=>b.id===branchId);if(!branch)throw new Error('Şube bulunamadı.');const amount=Number(input.miktar??0);const paid=Number(input.odenen??0);const rpc=await db(sb.rpc('v19_create_invoice',{p_branch_id:branchId,p_branch_name:branch.name,p_firma:text(input,['firma','fatura_adi']),p_serial:text(input,['seri_no','fatura_no']),p_content:text(input,['icerik']),p_amount:amount,p_paid:paid,p_kdv:text(input,['kdv']),p_note:text(input,['fatura_notu']),p_date:String(input.tarih),p_due:input.vade_tarihi?String(input.vade_tarihi):null,p_status:text(input,['fatura_durumu'],'Açık'),p_currency:text(input,['para_birimi'],'TRY'),p_user_id:user.id,p_user_name:user.fullName||user.username||user.email}),'Fatura kaydı');if(rpc.error)throw new Error(rpc.error.message);}
export async function updateInvoice(id:string,patch:AnyRow,user:UserContext){const sb=requireSupabase();const rpc=await db(sb.rpc('v19_update_invoice',{p_id:id,p_payload:invoiceAliasPayload(patch),p_user_id:user.id}),'Fatura güncelleme');if(rpc.error)throw new Error(rpc.error.message);}
export async function deleteInvoice(id:string){const sb=requireSupabase();const rpc=await db(sb.rpc('v19_soft_delete_invoice',{p_id:id,p_user_id:(await getUserContext()).id}),'Fatura silme');if(rpc.error)throw new Error(rpc.error.message);}
export async function loadInvoicePayments(invoiceId:string){
  const rows=await fetchRows(requireSupabase(),TABLES.invoicePayments,'Fatura ödemeleri',3000);
  return rows
    .filter(r=>String(pick(r,['invoice_id','fatura_id']))===invoiceId)
    .sort((a,b)=>String(pick(b,['tarih','created_at'],'')).localeCompare(String(pick(a,['tarih','created_at'],'')))) as InvoicePaymentRow[];
}
export async function createInvoicePayment(input:{invoice_id:string;branch_id:string;miktar:number;tarih:string;tur:'Kasa'|'Kart';aciklama?:string},user:UserContext){if(input.tur!=='Kasa'&&input.tur!=='Kart')throw new Error('Yalnızca Kasa veya Kart kullanılabilir.');const sb=requireSupabase();const rpc=await db(sb.rpc('v19_record_invoice_payment',{p_invoice_id:input.invoice_id,p_branch_id:input.branch_id,p_amount:input.miktar,p_date:input.tarih,p_method:input.tur,p_user_id:user.id,p_user_name:user.fullName||user.username||user.email}),'Fatura ödemesi');if(rpc.error)throw new Error(rpc.error.message);}

export async function loadCari(user:UserContext){let rows=await fetchRows(requireSupabase(),TABLES.cari,'Cari hesaplar',5000);rows=filterRowsByUserBranch(rows,user);return rows.filter(r=>!pick(r,['deleted_at','silindi_at'])) as CariRow[];}
export async function createCari(input:{branch_id:string;firma:string;miktar:number;aciklama:string;tarih:string;islem_turu:'Alacak'|'Borç'},user:UserContext){const branches=await loadModuleBranches({...user,branchIds:[]});const branch=branches.find(b=>b.id===input.branch_id);if(!branch)throw new Error('Şube bulunamadı.');const signed=input.islem_turu==='Alacak'?Math.abs(input.miktar):-Math.abs(input.miktar);const rpc=await db(requireSupabase().rpc('v19_create_cari',{p_branch_id:input.branch_id,p_branch_name:branch.name,p_firma:input.firma,p_amount:signed,p_description:input.aciklama,p_date:input.tarih,p_user_id:user.id,p_user_name:user.fullName||user.username||user.email}),'Cari kaydı');if(rpc.error)throw new Error(rpc.error.message);}
export async function updateCari(id:string,input:{branch_id:string;firma:string;miktar:number;aciklama:string;tarih:string;islem_turu:'Alacak'|'Borç'},user:UserContext){const signed=input.islem_turu==='Alacak'?Math.abs(input.miktar):-Math.abs(input.miktar);const rpc=await db(requireSupabase().rpc('v19_update_cari',{p_id:id,p_payload:{branch_id:input.branch_id,firma:input.firma,miktar:signed,tutar:signed,amount:signed,aciklama:input.aciklama,açıklama:input.aciklama,tarih:input.tarih,date:input.tarih},p_user_id:user.id}),'Cari güncelleme');if(rpc.error)throw new Error(rpc.error.message);}
export async function deleteCari(id:string){const rpc=await db(requireSupabase().rpc('v19_soft_delete_cari',{p_id:id}),'Cari silme');if(rpc.error)throw new Error(rpc.error.message);}

export type CompanyInput={name:string;tax_number?:string;phone?:string;email?:string;address?:string};
export async function loadCompanies(user:UserContext):Promise<CompanyRow[]>{const sb=requireSupabase();if(isSuperAdmin(user.role)){const rpc=await db(sb.rpc('v19_get_companies'),'SUPER_ADMIN işletmeleri');if(rpc.error)throw rpc.error;return ((rpc.data??[]) as CompanyRow[]).map(r=>({...r,id:String(r.id)}));}let rows=await fetchRows(sb,TABLES.companies,'İşletmeler',3000);if(user.companyId)rows=rows.filter(r=>String(pick(r,['id'],''))===user.companyId);return rows.map(r=>({id:text(r,['id']),name:text(r,['name','şirket_adi','sirket_adi','işletme_adi','isletme_adi','ad','isim','firma'],'İşletme'),tax_number:text(r,['tax_number','vergi_no','vergi_numarasi','vergi_numarası'])||null,phone:text(r,['phone','telefon'])||null,email:text(r,['email','eposta','e_posta'])||null,address:text(r,['address','adres'])||null,is_active:bool(r,['is_active','aktif'],true)}));}
export async function createCompany(input:CompanyInput){const rpc=await db(requireSupabase().rpc('v19_create_company',{p_name:input.name,p_tax_number:input.tax_number||null,p_phone:input.phone||null,p_email:input.email||null,p_address:input.address||null}),'İşletme kaydı');if(rpc.error)throw new Error(rpc.error.message);return String(rpc.data);}
export async function updateCompany(id:string,patch:Partial<CompanyRow>){const rpc=await db(requireSupabase().rpc('v19_update_company',{p_id:id,p_name:patch.name??'',p_tax_number:patch.tax_number??null,p_phone:patch.phone??null,p_email:patch.email??null,p_address:patch.address??null,p_is_active:patch.is_active??true}),'İşletme güncelleme');if(rpc.error)throw new Error(rpc.error.message);}
export async function loadBranches(user:UserContext):Promise<BranchRow[]>{if(isSuperAdmin(user.role)){const rpc=await db(requireSupabase().rpc('v19_get_branches'),'SUPER_ADMIN şubeleri');if(rpc.error)throw rpc.error;return ((rpc.data??[]) as BranchRow[]).map(r=>({...r,id:String(r.id),company_id:String(r.company_id)}));}let rows=await fetchRows(requireSupabase(),TABLES.branches,'Şubeler',3000);rows=filterRowsByUserBranch(rows,user);return rows.map(r=>({id:text(r,['id']),company_id:text(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id']),name:text(r,['name','şube_adi','sube_adi','ad','isim','branch_name'],'Şube'),code:text(r,['code','kod'])||null,phone:text(r,['phone','telefon'])||null,email:text(r,['email','eposta','e_posta'])||null,address:text(r,['address','adres'])||null,city:text(r,['city','şehir','sehir'])||null,district:text(r,['district','ilçe','ilce'])||null,latitude:Number(pick(r,['latitude','enlem'],NaN))||null,longitude:Number(pick(r,['longitude','boylam'],NaN))||null,is_active:bool(r,['is_active','aktif'],true)}));}
export async function createBranch(input:{company_id:string;name:string;code?:string;phone?:string;email?:string;address?:string;city?:string;district?:string}){const rpc=await db(requireSupabase().rpc('v19_create_branch',{p_company_id:input.company_id,p_name:input.name,p_code:input.code||null,p_phone:input.phone||null,p_email:input.email||null,p_address:input.address||null,p_city:input.city||null,p_district:input.district||null}),'Şube kaydı');if(rpc.error)throw new Error(rpc.error.message);return String(rpc.data);}
export async function updateBranch(id:string,patch:Partial<BranchRow>){const rpc=await db(requireSupabase().rpc('v19_update_branch',{p_id:id,p_company_id:patch.company_id??null,p_name:patch.name??'',p_code:patch.code??null,p_phone:patch.phone??null,p_email:patch.email??null,p_address:patch.address??null,p_city:patch.city??null,p_district:patch.district??null,p_is_active:patch.is_active??true}),'Şube güncelleme');if(rpc.error)throw new Error(rpc.error.message);}

export async function loadSuperAdminScope(){const sb=requireSupabase();const [c,b]=await Promise.all([db(sb.rpc('v19_get_companies'),'SUPER_ADMIN işletmeleri'),db(sb.rpc('v19_get_branches'),'SUPER_ADMIN şubeleri')]);if(c.error)throw c.error;if(b.error)throw b.error;return {companies:(c.data??[]) as CompanyRow[],branches:(b.data??[]) as BranchRow[]};}
export async function loadSuperAdminUsers():Promise<UserRow[]>{const rpc=await db(requireSupabase().rpc('v19_get_users'),'SUPER_ADMIN kullanıcıları');if(rpc.error)throw rpc.error;const rows=(rpc.data??[]) as AnyRow[];const map=new Map<string,UserRow>();for(const r of rows){const id=text(r,['id']);const item=map.get(id)??{id,username:text(r,['username']),full_name:text(r,['full_name']),email:text(r,['email']),is_active:bool(r,['is_active','aktif'],true),roles:[]};const roleId=uuid(r,['role_id','id']);const cid=uuid(r,['company_id','şirket_id','isletme_id'])||'';const bid=uuid(r,['branch_id','şube_id','sube_id']);const role=text(r,['role','rol']);if(roleId&&role) item.roles.push({id:roleId,company_id:cid,branch_id:bid,role});map.set(id,item);}return [...map.values()];}
export async function loadUsers(user:UserContext){if(isSuperAdmin(user.role))return loadSuperAdminUsers();const sb=requireSupabase();const profiles=await fetchRows(sb,TABLES.profiles,'Kullanıcılar',3000);const roleRows=await fetchRows(sb,TABLES.roles,'Kullanıcı rolleri',5000);const allowed=roleRows.filter(r=>String(pick(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id'],''))===String(user.companyId));return profiles.map(p=>{const id=text(p,['id']);return {id,username:text(p,['username','kullanici_adi']),full_name:text(p,['full_name','ad_soyad']),email:text(p,['email','e_posta','eposta']),is_active:bool(p,['is_active','aktif'],true),roles:allowed.filter(r=>String(pick(r,['user_id','kullanici_id','kullanıcı_id'],''))===id).map(r=>({id:text(r,['id']),company_id:uuid(r,['company_id','şirket_id','sirket_id','işletme_id','isletme_id'])||'',branch_id:uuid(r,['branch_id','şube_id','sube_id']),role:text(r,['role','rol'])}))};}).filter(u=>isSuperAdmin(user.role)||u.roles.length>0);}
export type CreateUserInput={full_name:string;username:string;email:string;password:string;company_id:string;branch_id:string|null;role:string};
export async function createAuthUser(input:CreateUserInput){const sb=requireSupabase();if(!isSuperAdmin((await getUserContext()).role))throw new Error('Bu işlem yalnızca SUPER_ADMIN tarafından yapılabilir.');const eph=createEphemeralSupabase();if(!eph)throw new Error('Supabase bağlantısı yapılandırılmamış.');const authResult=await db(eph.auth.signUp({email:input.email.trim().toLowerCase(),password:input.password,options:{data:{username:input.username.trim().toLowerCase(),full_name:input.full_name.trim(),role:input.role,company_id:input.company_id,branch_id:input.branch_id}}}),'Auth kullanıcı oluşturma');if(authResult.error)throw authResult.error;if(!authResult.data.user)throw new Error('Auth kullanıcısı oluşturulamadı.');const rpc=await db(sb.rpc('v19_finalize_user_creation',{p_user_id:authResult.data.user.id,p_full_name:input.full_name,p_username:input.username,p_email:input.email,p_company_id:input.company_id,p_branch_id:input.branch_id,p_role:input.role}),'Kullanıcı ataması');if(rpc.error)throw new Error(`Kullanıcı oluşturuldu fakat atama tamamlanamadı: ${rpc.error.message}`);return {id:authResult.data.user.id,email:input.email,username:input.username};}
export async function assignUser(input:{user_id:string;company_id:string;branch_id:string|null;role:string}){const rpc=await db(requireSupabase().rpc('v19_assign_user',{p_user_id:input.user_id,p_company_id:input.company_id,p_branch_id:input.branch_id,p_role:input.role}),'Kullanıcı ataması');if(rpc.error)throw rpc.error;}
export async function assignUserMany(userId:string,companyId:string,branchIds:string[],role:string){if(!branchIds.length){await assignUser({user_id:userId,company_id:companyId,branch_id:null,role});return;}for(const branchId of branchIds)await assignUser({user_id:userId,company_id:companyId,branch_id:branchId,role});}
export async function removeUserAssignment(id:string){const rpc=await db(requireSupabase().rpc('v19_remove_user_assignment',{p_id:id}),'Kullanıcı ataması kaldırma');if(rpc.error)throw rpc.error;}

export const APP_PERMISSIONS=[['GELIR_EKLE','Gelir ekleme'],['GELIR_DUZENLE','Gelir düzenleme'],['GELIR_SIL','Gelir pasifleştirme'],['GIDER_EKLE','Gider ekleme'],['GIDER_DUZENLE','Gider düzenleme'],['GIDER_SIL','Gider pasifleştirme'],['FATURA_EKLE','Fatura ekleme'],['FATURA_DUZENLE','Fatura düzenleme'],['FATURA_SIL','Fatura pasifleştirme'],['FATURA_ODEME','Fatura ödeme'],['KULLANICI_YONET','Kullanıcı yönetimi'],['SUBE_YONET','Şube yönetimi'],['RAPOR_GOR','Rapor görüntüleme']] as const;
export async function loadPermissions(userId:string){const rows=await fetchRows(requireSupabase(),TABLES.permissions,'Kullanıcı yetkileri',3000);return rows.filter(r=>String(pick(r,['user_id','kullanici_id','kullanıcı_id']))===userId).map(r=>({id:text(r,['id']),user_id:userId,permission:text(r,['permission','izin','yetki']),value:bool(r,['value','deger','değer','aktif','enabled'],false)}));}
export async function savePermission(userId:string,permission:string,value:boolean){const rpc=await db(requireSupabase().rpc('v19_save_permission',{p_user_id:userId,p_permission:permission,p_value:value}),'Yetki kaydı');if(rpc.error)throw rpc.error;}
export async function updateProfile(userId:string,patch:{full_name?:string;phone?:string}){const {error}=await db(requireSupabase().from('profiles').update(patch).eq('id',userId),'Profil güncelleme');if(error)throw error;}

export async function loadRatesFromTransactions(user:UserContext){const tx=await normalizedTransactions(user,7000);let usd=0,eur=0;for(const r of tx){usd=usd||num(r.raw,['dolar_kur','usd_buy','usd_kur']);eur=eur||num(r.raw,['euro_kur','eur_buy','eur_kur']);if(usd&&eur)break;}return [{code:'USD',name:'ABD Doları',buy:usd,sell:usd,source:'Gerçek finans kaydı'},{code:'EUR',name:'Euro',buy:eur,sell:eur,source:'Gerçek finans kaydı'}].filter(r=>r.buy>0);}
export type ReportData={transactions:ModuleTransaction[];invoices:InvoiceRow[];cari:CariRow[]};
export async function loadReportData(user:UserContext,from:string,to:string,branchId?:string):Promise<ReportData>{const [tx,inv,cari]=await Promise.all([loadModuleTransactions(user),loadInvoices(user),loadCari(user)]);const inRange=(v:string)=>{const k=v.slice(0,10);return (!from||k>=from)&&(!to||k<=to)};const inScopeBranch=(bid:string|null)=>branchId?bid===branchId:(user.companyId&&user.branchIds.length?user.branchIds.includes(String(bid||'')):true);const txFiltered=tx.filter(r=>inRange(r.date)&&inScopeBranch(r.branchId||null));const invFiltered=inv.filter(r=>inRange(text(r,['tarih','date']))&&inScopeBranch(uuid(r,['branch_id','şube_id','sube_id'])));const cariFiltered=cari.filter(r=>inRange(text(r,['tarih','date']))&&inScopeBranch(uuid(r,['branch_id','şube_id','sube_id'])));return {transactions:txFiltered,invoices:invFiltered,cari:cariFiltered};}

export type PosmistRow={id:string;company_id:string;branch_id:string|null;business_id:string;api_url:string;api_key?:string|null;endpoint_path?:string|null;json_path?:string|null;enabled:boolean;daily_time:string};
export async function loadPosmist(){const rows=await fetchRows(requireSupabase(),TABLES.posmist,'POSMIST',3000);return rows.filter(r=>!pick(r,['deleted_at','silindi_at'])).map(r=>({id:text(r,['id']),company_id:text(r,['company_id','şirket_id','sirket_id','işletme_id']),branch_id:uuid(r,['branch_id','şube_id','sube_id']),business_id:text(r,['business_id','işletme_kodu','business']),api_url:text(r,['api_url','api_adresi']),api_key:null,endpoint_path:text(r,['endpoint_path','endpoint']),json_path:text(r,['json_path'],'data.cash_total'),enabled:bool(r,['enabled','aktif'],true),daily_time:text(r,['daily_time','günlük_saat','gunluk_saat'],'23:59')}));}
export async function savePosmist(input:{id?:string;company_id:string;branch_id:string|null;business_id:string;api_url:string;api_key:string;endpoint_path:string;json_path:string;enabled:boolean;daily_time:string}){const sb=requireSupabase();const payload={company_id:input.company_id,şirket_id:input.company_id,sirket_id:input.company_id,isletme_id:input.company_id,branch_id:input.branch_id,şube_id:input.branch_id,sube_id:input.branch_id,business_id:input.business_id,api_url:input.api_url,endpoint_path:input.endpoint_path,json_path:input.json_path||'data.cash_total',enabled:input.enabled,aktif:input.enabled,daily_time:input.daily_time,api_key:input.api_key||null};if(input.id){const rpc=await db(sb.rpc('v19_update_json',{p_candidates:TABLES.posmist,p_id:input.id,p_payload:payload}),'POSMIST güncelleme');if(rpc.error)throw rpc.error;}else{const rpc=await db(sb.rpc('v19_insert_json',{p_candidates:TABLES.posmist,p_payload:payload}),'POSMIST kaydı');if(rpc.error)throw rpc.error;}}
export async function deletePosmist(id:string){const rpc=await db(requireSupabase().rpc('v19_update_json',{p_candidates:TABLES.posmist,p_id:id,p_payload:{deleted_at:new Date().toISOString(),silindi_at:new Date().toISOString(),aktif:false,is_active:false}}),'POSMIST kaldırma');if(rpc.error)throw rpc.error;}

export type AppNotification={id:string;title:string;message:string;is_read:boolean;created_at:string;help:{sender_id:string;sender_name:string;sender_email:string;sender_phone:string;subject:string;message:string}|null};
const parseHelpMessage=(message:string):AppNotification['help']=>{for(const prefix of ['[KASA_HELP_V2]','[KASA_HELP_V1]']){if(message.startsWith(prefix)){try{return JSON.parse(message.slice(prefix.length)) as AppNotification['help'];}catch{return null;}}}return null;};
export async function submitHelpRequest(input:{subject:string;message:string},_user:UserContext){const rpc=await db(requireSupabase().rpc('v19_submit_help_request',{p_subject:input.subject.trim(),p_message:input.message.trim()}),'Yardım talebi');if(rpc.error)throw new Error(rpc.error.message);if(!rpc.data)throw new Error('Bildirim oluşturulamadı.');return rpc.data;}
export async function loadNotifications(user:UserContext){if(!isSuperAdmin(user.role))return [] as AppNotification[];const rpc=await db(requireSupabase().rpc('v19_load_notifications'),'Bildirimler');if(rpc.error)throw rpc.error;return ((rpc.data??[]) as AnyRow[]).map(r=>({id:text(r,['id']),title:text(r,['title'],'Bildirim'),message:text(r,['message']),is_read:bool(r,['is_read','okundu','okunuyor','okundu_mu'],false),created_at:text(r,['created_at','oluşturulma_tarihi','olusturulma_tarihi','tarih']),help:parseHelpMessage(text(r,['message']))}));}
export async function markNotificationRead(id:string){const rpc=await db(requireSupabase().rpc('v19_mark_notification_read',{p_id:id}),'Bildirim okundu');if(rpc.error)throw rpc.error;}
