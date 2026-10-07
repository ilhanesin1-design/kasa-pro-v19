import { useEffect, useMemo, useState } from 'react';
import { Bell, Building2, Check, ChevronDown, Mail, MapPin, Menu, Search, X } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';
import { getUserContext, isSuperAdmin, loadBranches, loadCompanies, loadNotifications, loadSuperAdminScope, markNotificationRead, type AppNotification, type BranchRow, type CompanyRow, type UserContext } from '../lib/app';
import { supabase } from '../lib/supabase';

export type AppOutletContext = { user: UserContext };

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [baseUser, setBaseUser] = useState<UserContext | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [helpItem, setHelpItem] = useState<AppNotification['help']>(null);
  const [selectedCompany, setSelectedCompany] = useState(localStorage.getItem('kasa-pro-scope-company') || '');
  const [selectedBranch, setSelectedBranch] = useState(localStorage.getItem('kasa-pro-scope-branch') || '');
  const superAdmin = isSuperAdmin(baseUser?.role, baseUser?.email);

  const applyScopeData = (companyRows: CompanyRow[], branchRows: BranchRow[]) => {
    const normalizedCompanies = companyRows.map((c) => ({ ...c, id: String(c.id) }));
    const normalizedBranches = branchRows.map((b) => ({ ...b, id: String(b.id), company_id: String(b.company_id) }));
    setCompanies(normalizedCompanies);
    setBranches(normalizedBranches);

    // Eski oturumdan kalan kapsam ID'leri geçersizse temizle.
    // Aksi halde sağ üstte "Tüm işletmeler" görünürken Sidebar eski
    // işletme kapsamını göstermeye devam edebiliyordu.
    setSelectedCompany((current) => current && normalizedCompanies.some((c) => c.id === current) ? current : '');
    setSelectedBranch((current) => {
      if (!current) return '';
      const branch = normalizedBranches.find((b) => b.id === current);
      if (!branch) return '';
      setSelectedCompany((company) => company || branch.company_id);
      return current;
    });
  };

  const refreshScope = async (user: UserContext) => {
    try {
      const scope = await loadSuperAdminScope();
      applyScopeData(scope.companies, scope.branches);
    } catch {
      try {
        const [c, b] = await Promise.all([loadCompanies(user), loadBranches(user)]);
        applyScopeData(c, b);
      } catch {
        setCompanies([]);
        setBranches([]);
        setSelectedCompany('');
        setSelectedBranch('');
      }
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const user = await getUserContext();
        if (!alive) return;
        setBaseUser(user);
        if (isSuperAdmin(user.role, user.email)) {
          await refreshScope(user);
          try { setNotifications(await loadNotifications(user)); } catch { setNotifications([]); }
        }
      } catch {
        if (alive) navigate('/login', { replace: true });
      }
    })();
    return () => { alive = false; };
  }, [navigate]);


  useEffect(() => {
    setScopeOpen(false);
    setNoticeOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!baseUser || !isSuperAdmin(baseUser.role, baseUser.email)) return;
    let alive = true;
    const refresh = () => loadNotifications(baseUser).then((rows) => { if (alive) setNotifications(rows); }).catch(() => undefined);
    refresh();
    // The live database uses the Turkish `bildirimler` table and may not have Realtime enabled.
    // Polling keeps the notification center reliable even when the project is paused or Realtime is unavailable.
    const timer = window.setInterval(refresh, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [baseUser]);

  useEffect(() => {
    if (!superAdmin) return;
    if (selectedBranch) {
      const owner = branches.find((b) => b.id === selectedBranch)?.company_id;
      if (owner && selectedCompany !== owner) setSelectedCompany(owner);
    }
  }, [superAdmin, branches, selectedBranch, selectedCompany]);

  useEffect(() => {
    if (selectedCompany) localStorage.setItem('kasa-pro-scope-company', selectedCompany); else localStorage.removeItem('kasa-pro-scope-company');
    if (selectedBranch) localStorage.setItem('kasa-pro-scope-branch', selectedBranch); else localStorage.removeItem('kasa-pro-scope-branch');
  }, [selectedCompany, selectedBranch]);

  const scopedUser = useMemo<UserContext | null>(() => {
    if (!baseUser) return null;
    if (!isSuperAdmin(baseUser.role, baseUser.email)) return baseUser;
    const branchRows = selectedBranch
      ? branches.filter((b) => b.id === selectedBranch)
      : selectedCompany
        ? branches.filter((b) => b.company_id === selectedCompany)
        : branches;
    return {
      ...baseUser,
      companyId: selectedCompany || null,
      branchIds: branchRows.map((b) => b.id),
      branchNames: branchRows.map((b) => b.name),
    };
  }, [baseUser, branches, selectedBranch, selectedCompany]);

  if (!baseUser || !scopedUser) return <div className="loading-screen">KASA PRO kullanıcı bilgileri yükleniyor...</div>;

  const selectedCompanyName = companies.find((c) => c.id === selectedCompany)?.name;
  const selectedBranchName = branches.find((b) => b.id === selectedBranch)?.name;
  const selectedCompanyBranchCount = selectedCompany
    ? branches.filter((b) => b.company_id === selectedCompany).length
    : branches.length;
  const scopeLabel = selectedBranchName || selectedCompanyName || 'Tüm İşletmeler';
  const scopeTitle = selectedBranchName || selectedCompanyName || (superAdmin ? 'Tüm işletmeler' : 'Yetkili işletme');
  const scopeSubtitle = selectedBranchName
    ? '1 şube'
    : `${selectedCompanyBranchCount} şube`;
  const unread = notifications.filter((n) => !n.is_read).length;

  const logout = async () => { await supabase?.auth.signOut(); navigate('/login', { replace: true }); };
  const goSearch = () => {
    const q = globalSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return;
    if (q.includes('fatura')) navigate('/invoices'); else if (q.includes('rapor')) navigate('/reports'); else if (q.includes('kur')) navigate('/rates'); else if (q.includes('şube') || q.includes('sube')) navigate('/branches'); else if (q.includes('kullanıcı') || q.includes('kullanici')) navigate('/users'); else if (q.includes('posmist')) navigate('/posmist');
  };

  const markAndOpen = async (item: AppNotification) => {
    try { if (!item.is_read) await markNotificationRead(item.id); } catch { /* notification UI must stay responsive */ }
    setNotifications((list) => list.map((n) => n.id === item.id ? { ...n, is_read: true } : n));
    if (item.help) { setHelpItem(item.help); setNoticeOpen(false); }
  };

  return <div className={`app-shell ${mobileOpen ? 'mobile-nav-open' : ''}`}>
    <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} user={scopedUser} scopeTitle={scopeTitle} scopeSubtitle={scopeSubtitle} onLogout={logout} />
    {mobileOpen && <button className="mobile-overlay" aria-label="Menüyü kapat" onClick={() => setMobileOpen(false)} />}
    <main className="main">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Menü"><Menu /></button>
        <div className="search"><Search size={19} /><input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') goSearch(); }} placeholder="İşlem, fatura, personel veya şube ara..." /></div>
        <div className="top-actions"><div className="top-user"><div className="top-user-avatar">{(scopedUser.fullName||scopedUser.username||'K').slice(0,2).toUpperCase()}</div><div><strong>{scopedUser.fullName||scopedUser.username||'Kullanıcı'}</strong><small>{scopedUser.role||'Kullanıcı'}</small></div></div>
          <div className="notification-wrap">
            <button className="icon-btn" aria-label="Bildirimler" onClick={() => { setNoticeOpen((v) => !v); setScopeOpen(false); }}><Bell size={19} />{unread > 0 && <b>{unread}</b>}</button>
            {noticeOpen && <div className="notification-popover">
              <div className="popover-head"><div><strong>Bildirim Merkezi</strong><small>{unread} okunmamış bildirim</small></div><button className="icon-btn inline" onClick={() => setNoticeOpen(false)}><X size={16} /></button></div>
              {!superAdmin ? <div className="popover-empty">Bildirim merkezi SUPER_ADMIN bildirimleri için kullanılır.</div> : notifications.length ? notifications.slice(0, 12).map((n) => <button className={`notification-item ${n.is_read ? 'read' : ''}`} key={n.id} onClick={() => markAndOpen(n)}><span className="notification-dot" /><div><strong>{n.help?.subject || n.title}</strong><small>{n.help?.sender_name || 'Sistem'} · {new Date(n.created_at).toLocaleString('tr-TR')}</small><p>{n.help?.message || n.message}</p></div></button>) : <div className="popover-empty">Yeni bildirim yok.</div>}
              <button className="popover-link" onClick={() => { setNoticeOpen(false); navigate('/notifications'); }}>Tüm bildirimleri görüntüle</button>
            </div>}
          </div>
          <div className="branch-switch-wrap">
            <button className="branch-switch" onClick={() => { if (!superAdmin) return; setScopeOpen((v) => !v); setNoticeOpen(false); }} disabled={!superAdmin} title={superAdmin ? 'İşletme ve şube kapsamını seçin' : 'Kapsam seçimi yalnızca SUPER_ADMIN için açıktır'}>
              <span className="branch-avatar">{(selectedBranchName || selectedCompanyName || 'T').slice(0, 1).toUpperCase()}</span><span><small>{selectedBranchName ? 'ŞUBE' : selectedCompanyName ? 'İŞLETME' : 'KAPSAM'}</small><strong>{scopeLabel}</strong></span><ChevronDown size={15} />
            </button>
            {scopeOpen && superAdmin && <div className="scope-popover">
              <div className="popover-head"><div><strong>İşletme / Şube görünümü</strong><small>Bir kapsam seçtiğinizde finans ekranları buna göre filtrelenir.</small></div><button className="icon-btn inline" onClick={() => setScopeOpen(false)}><X size={16} /></button></div>
              <button className={`scope-option ${!selectedCompany && !selectedBranch ? 'selected' : ''}`} onClick={() => { setSelectedCompany(''); setSelectedBranch(''); setScopeOpen(false); }}><Building2 /><span><strong>Tüm işletmeler</strong><small>Tüm işletmeler ve tüm şubeler</small></span>{!selectedCompany && !selectedBranch && <Check size={16} />}</button>
              {companies.map((company) => <div className="scope-company-block" key={company.id}>
                <button className={`scope-option ${selectedCompany === company.id && !selectedBranch ? 'selected' : ''}`} onClick={() => { setSelectedCompany(company.id); setSelectedBranch(''); setScopeOpen(false); }}><Building2 /><span><strong>{company.name}</strong><small>İşletmenin tamamı</small></span>{selectedCompany === company.id && !selectedBranch && <Check size={16} />}</button>
                <div className="scope-children always">
                  {branches.filter((branch) => branch.company_id === company.id).map((branch) => <button className={`scope-child ${selectedBranch === branch.id ? 'selected' : ''}`} key={branch.id} onClick={() => { setSelectedCompany(company.id); setSelectedBranch(branch.id); setScopeOpen(false); }}><MapPin size={14} /><span>{branch.name}</span>{selectedBranch === branch.id && <Check size={14} />}</button>)}
                  {!branches.some((branch) => branch.company_id === company.id) && <span className="scope-no-branch">Bu işletmede aktif şube yok.</span>}
                </div>
              </div>)}
            </div>}
          </div>
        </div>
      </header>
      <div className="content"><Outlet context={{ user: scopedUser }} /></div>
    </main>
    {helpItem && <div className="modal-backdrop"><div className="modal-card help-detail-modal"><div className="modal-head"><div><div className="eyebrow">YARDIM MERKEZİ</div><h2>{helpItem.subject}</h2></div><button className="icon-btn" onClick={() => setHelpItem(null)}><X /></button></div><div className="help-detail"><div><strong>{helpItem.sender_name}</strong><small>{helpItem.sender_email}</small></div><p>{helpItem.message}</p><div className="help-contact"><a href={`mailto:${helpItem.sender_email}`}><Mail size={16} /> E-posta gönder</a>{helpItem.sender_phone && <a href={`tel:${helpItem.sender_phone}`}>{helpItem.sender_phone}</a>}</div></div></div></div>}
  </div>;
}
