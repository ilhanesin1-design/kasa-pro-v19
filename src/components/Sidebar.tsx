import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, WalletCards, FileText, UsersRound, BarChart3, Building2, ShieldCheck, PlugZap, Settings, CircleHelp, LogOut, X, BriefcaseBusiness, Bell, Plus, Minus } from 'lucide-react';
import type { UserContext } from '../lib/app';
import { isAdminRole, isSuperAdmin } from '../lib/app';

function LinkItem({to,label,Icon,onClick,badge}:{to:string;label:string;Icon:any;onClick:()=>void;badge?:string}){return <NavLink to={to} end={to==='/' } onClick={onClick} className="sidebar-link"><Icon/><span>{label}</span>{badge&&<em>{badge}</em>}</NavLink>}
export function Sidebar({mobileOpen,onClose,user,scopeTitle,scopeSubtitle,onLogout}:{mobileOpen:boolean;onClose:()=>void;user:UserContext|null;scopeTitle?:string;scopeSubtitle?:string;onLogout:()=>void}){
 const admin=isAdminRole(user?.role); const superAdmin=isSuperAdmin(user?.role,user?.email); const [cashOpen,setCashOpen]=useState(true); const [manageOpen,setManageOpen]=useState(true);
 const label=scopeTitle || (superAdmin&&user?.companyId==null?'Tüm işletmeler':user?.branchNames?.length===1?user.branchNames[0]:user?.branchNames?.length?`${user.branchNames.length} şube`:'Şube atanmamış');
 const sublabel=scopeSubtitle || (user?.branchNames?.length?`${user.branchNames.length} şube`:'Şube atanmamış');
 return <aside className={`sidebar ${mobileOpen?'open':''}`}>
   <div className="brand"><div className="brand-mark">K</div><div><strong>KASA YÖNETİM SİSTEMİ</strong><span>Kurumsal Finans ve Şube Yönetimi</span></div><button className="mobile-close" onClick={onClose}><X/></button></div>
   <div className="workspace"><span>AKTİF KAPSAM</span><strong>{label}</strong><small>{sublabel}</small></div>
   <nav className="sidebar-nav">
    <LinkItem to="/" label="Ana Sayfa" Icon={LayoutDashboard} onClick={onClose}/>
    <button className="sidebar-section" onClick={()=>setCashOpen(v=>!v)}><span><WalletCards/> Kasa İşlemleri</span>{cashOpen?<Minus size={14}/>:<Plus size={14}/>}</button>
    {cashOpen&&<div className="sidebar-subnav"><LinkItem to="/transactions" label="Gelir / Gider" Icon={ArrowLeftRight} onClick={onClose}/><LinkItem to="/cash" label="Kasa" Icon={WalletCards} onClick={onClose}/><LinkItem to="/transactions" label="İşlem Listesi" Icon={ArrowLeftRight} onClick={onClose}/></div>}
    <LinkItem to="/invoices" label="Faturalar" Icon={FileText} onClick={onClose}/>
    <LinkItem to="/branches" label="Şubeler" Icon={Building2} onClick={onClose}/>
    {admin&&<LinkItem to="/personnel" label="Personel" Icon={UsersRound} onClick={onClose} badge="YÖNET"/>}
    <LinkItem to="/reports" label="Raporlar" Icon={BarChart3} onClick={onClose}/>
    {superAdmin&&<LinkItem to="/posmist" label="POSMIST Entegrasyonu" Icon={PlugZap} onClick={onClose} badge="YENİ"/>}
    {admin&&<button className="sidebar-section" onClick={()=>setManageOpen(v=>!v)}><span><ShieldCheck/> Yönetim</span>{manageOpen?<Minus size={14}/>:<Plus size={14}/>}</button>}
    {admin&&manageOpen&&<div className="sidebar-subnav"><LinkItem to="/companies" label="İşletmeler" Icon={BriefcaseBusiness} onClick={onClose}/>{superAdmin&&<LinkItem to="/users" label="Kullanıcılar" Icon={UsersRound} onClick={onClose}/>}<LinkItem to="/permissions" label="Yetki Merkezi" Icon={ShieldCheck} onClick={onClose}/></div>}
    {superAdmin&&<LinkItem to="/notifications" label="Bildirim Merkezi" Icon={Bell} onClick={onClose}/>} 
    <LinkItem to="/settings" label="Ayarlar" Icon={Settings} onClick={onClose}/>
   </nav>
   <div className="sidebar-bottom"><NavLink to="/help" onClick={onClose} className="help-nav"><CircleHelp/> Yardım Merkezi</NavLink><button className="user-mini" onClick={onLogout}><div className="avatar">{(user?.fullName||user?.username||'K').slice(0,2).toUpperCase()}</div><div><strong>{user?.fullName||user?.username||'Kullanıcı'}</strong><small>{user?.role||'Yetki bekleniyor'}</small></div><LogOut/></button></div>
 </aside>
}
