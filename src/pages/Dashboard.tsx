import { ArrowDown, ArrowUp, Building2, CalendarDays, ChevronRight, FileText, Plus, ReceiptText, RefreshCw, UsersRound, WalletCards } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { KpiCard } from '../components/KpiCard';
import { loadDashboard, money, DashboardData } from '../lib/app';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { AppOutletContext } from '../layouts/AppLayout';

export function Dashboard(){
 const navigate=useNavigate();
 const {user}=useOutletContext<AppOutletContext>();
 const [data,setData]=useState<DashboardData|null>(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(true); const [refreshing,setRefreshing]=useState(false);
 const load=async()=>{try{setError('');const d=await loadDashboard(user);setData(d)}catch(e){setError(e instanceof Error?e.message:'Veriler alınamadı.')}finally{setLoading(false);setRefreshing(false)}};
 useEffect(()=>{void load()},[user]);
 const categories=useMemo(()=>{const map=new Map<string,number>();(data?.transactions??[]).filter(t=>t.type==='expense').forEach(t=>map.set(t.category,(map.get(t.category)||0)+t.amount));const total=[...map.values()].reduce((a,b)=>a+b,0)||1;return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value])=>({name,value,pct:value/total*100}))},[data]);
 const maxBranch=Math.max(...(data?.branches??[]).map(b=>Math.abs(b.balance)),1);
 if(loading)return <div className="loading-panel">Yönetici Kontrol Merkezi yükleniyor...</div>;
 if(error)return <div className="error-panel"><strong>Veritabanı bağlantısı tamamlanamadı</strong><p>{error}</p><button className="primary" onClick={()=>{setLoading(true);void load()}}>Tekrar dene</button></div>;
 if(!data)return null;
 const today=new Date().toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric'});
 return <div className="dashboard-page">
   <div className="dashboard-command"><div><div className="eyebrow">GENEL BAKIŞ · YÖNETİCİ KONTROL MERKEZİ</div><h1>Yönetici Kontrol Merkezi</h1><p>Finansal durum, işlem hareketleri ve şube performansınız</p></div><div className="dashboard-filters"><select className="dashboard-select" aria-label="Şube"><option>Şube: Tümü</option>{data.branches.map(b=><option key={b.id}>{b.name}</option>)}</select><div className="dashboard-date"><CalendarDays size={16}/>{today}</div><button className="primary dashboard-refresh" disabled={refreshing} onClick={()=>{setRefreshing(true);void load()}}><RefreshCw size={16}/>{refreshing?'Yenileniyor':'Yenile'}</button></div></div>
   <div className="kpi-grid dashboard-kpis">
     <KpiCard label="TOPLAM GELİR" value={money(data.incomeToday)} sub="Bugünkü gelir" icon={<ArrowUp/>} tone="green"/>
     <KpiCard label="TOPLAM GİDER" value={money(data.expenseToday)} sub="Bugünkü gider" icon={<ArrowDown/>} tone="red"/>
     <KpiCard label="NET BAKİYE" value={money(data.netToday)} sub="Son güncelleme" icon={<WalletCards/>} tone="blue"/>
     <KpiCard label="FATURA BORCU" value={money(data.invoiceTotal)} sub="Açık ve toplam fatura" icon={<ReceiptText/>} tone="purple"/>
   </div>
   <div className="dashboard-main-grid">
     <section className="dashboard-panel"><div className="panel-head"><div><h2>Gelir - Gider Grafiği</h2><p>Son 7 gün</p></div><button className="ghost" onClick={()=>navigate('/reports')}>Raporlar <ChevronRight size={15}/></button></div><div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.chart}><defs><linearGradient id="dashIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".20"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient><linearGradient id="dashExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity=".16"/><stop offset="100%" stopColor="#ef4444" stopOpacity="0"/></linearGradient></defs><CartesianGrid stroke="#e8edf4" vertical={false}/><XAxis dataKey="d" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false}/><Tooltip formatter={(v)=>`₺${v} bin`}/><Area type="monotone" dataKey="g" name="Gelir" stroke="#2563eb" strokeWidth={3} fill="url(#dashIncome)"/><Area type="monotone" dataKey="c" name="Gider" stroke="#ef4444" strokeWidth={2.5} fill="url(#dashExpense)"/></AreaChart></ResponsiveContainer></div></section>
     <section className="dashboard-panel category-panel"><div className="panel-head"><div><h2>Kategori Dağılımı (Gider)</h2><p>Bu ay</p></div></div><div className="donut-wrap"><div className="donut"></div><div className="donut-center"><strong>{money(data.expenseToday)}</strong><span>Toplam Gider</span></div></div><div className="category-legend">{categories.map((c,i)=><div key={c.name}><i style={{background:['#2563eb','#f59e0b','#ef4444','#8b5cf6','#94a3b8'][i]}}/><span>{c.name||'Diğer'}</span><b>{c.pct.toFixed(1)}%</b></div>)}</div></section>
     <section className="dashboard-panel quick-panel"><div className="panel-head"><div><h2>Hızlı İşlemler</h2><p>Sık kullandığınız işlemler</p></div></div><div className="quick-actions"><button onClick={()=>navigate('/transactions')}><ArrowUp/><span>Gelir Ekle</span></button><button onClick={()=>navigate('/transactions')}><ArrowDown/><span>Gider Ekle</span></button><button onClick={()=>navigate('/invoices')}><FileText/><span>Fatura Ekle</span></button><button onClick={()=>navigate('/personnel')}><UsersRound/><span>Personel</span></button><button onClick={()=>navigate('/invoices')}><ReceiptText/><span>Faturalar</span></button><button onClick={()=>navigate('/reports')}><FileText/><span>Raporlar</span></button></div></section>
   </div>
   <div className="dashboard-bottom-grid">
     <section className="dashboard-panel dashboard-table-panel"><div className="panel-head"><div><h2>Son İşlemler</h2><p>Finansal hareketlerin son kayıtları</p></div><button className="panel-link" onClick={()=>navigate('/transactions')}>Tümünü Gör <ChevronRight size={14}/></button></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Tarih</th><th>Şube</th><th>Tür</th><th>Açıklama</th><th className="right">Tutar</th><th>Kullanıcı</th></tr></thead><tbody>{data.transactions.slice(0,8).map((t,i)=><tr key={t.id}><td>{String(i+1).padStart(2,'0')}</td><td>{t.date}</td><td>{t.branch}</td><td><span className={`badge ${t.type==='income'?'success':'danger'}`}>{t.type==='income'?'Gelir':'Gider'}</span></td><td>{t.title}</td><td className={`right amount ${t.type}`}>{t.type==='income'?'+':'−'} {money(t.amount)}</td><td>{t.userName||'—'}</td></tr>)}</tbody></table></div></section>
     <div className="dashboard-side-stack">
       <section className="dashboard-panel"><div className="panel-head"><div><h2>Şube Performansı</h2><p>Bu ay</p></div><Building2 size={18}/></div><div className="performance-list">{data.branches.slice(0,5).map((b,i)=><div className="performance-item" key={b.id}><span className="rank">{i+1}</span><div className="performance-main"><strong>{b.name}</strong><div className="performance-bar"><span style={{width:`${Math.max(6,Math.round(Math.abs(b.balance)/maxBranch*100))}%`}}/></div></div><b>{money(b.balance)}</b></div>)}</div></section>
       <section className="dashboard-panel"><div className="panel-head"><div><h2>Sistem Durumu</h2><p>Servis bağlantıları</p></div><span className="badge success">Tüm Sistemler Aktif</span></div><div className="system-status"><div className="system-line"><i className="system-dot"/> Supabase Bağlantısı <strong>Aktif</strong></div><div className="system-line"><i className="system-dot"/> Finans Veri Servisi <strong>Aktif</strong></div><div className="system-line"><i className="system-dot"/> Son Veri Güncellemesi <strong>Şimdi</strong></div></div></section>
     </div>
   </div>
 </div>
}
