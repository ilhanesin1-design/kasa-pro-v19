import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Download, Edit3, Filter, Plus, Search, Trash2, X, WalletCards } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import type { AppOutletContext } from '../layouts/AppLayout';
import { createTransaction, deleteTransaction, loadModuleBranches, loadModuleTransactions, money, updateTransaction, type ModuleBranch, type ModuleTransaction, type TransactionInput, type UserContext } from '../lib/app';

export function ModulePage({path}:{path:string}){
 const {user}=useOutletContext<AppOutletContext>(); const cash=path==='/cash';
 const [rows,setRows]=useState<ModuleTransaction[]>([]),[branches,setBranches]=useState<ModuleBranch[]>([]),[q,setQ]=useState(''),[tab,setTab]=useState<'Tümü'|'Gelir'|'Gider'>('Tümü'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[branch,setBranch]=useState(''),[filters,setFilters]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[modal,setModal]=useState<ModuleTransaction|null|undefined>(undefined),[saving,setSaving]=useState(false);
 const load=async()=>{setLoading(true);setError('');try{const [tx,b]=await Promise.all([loadModuleTransactions(user),loadModuleBranches(user)]);setRows(tx);setBranches(b)}catch(e){setError(e instanceof Error?e.message:'Finans kayıtları alınamadı.')}finally{setLoading(false)}};useEffect(()=>{void load()},[user]);
 const list=useMemo(()=>rows.filter(r=>{const search=`${r.title} ${r.branch} ${r.category} ${r.id}`.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR'));const typ=tab==='Tümü'||(tab==='Gelir'?r.type==='income':r.type==='expense');const br=!branch||r.branch===branch;const d=r.date.slice(0,10);return search&&typ&&br&&(!from||d>=from)&&(!to||d<=to)}),[rows,q,tab,branch,from,to]);
 const total=list.reduce((s,r)=>s+(r.type==='income'?r.amount:-r.amount),0);return <div><div className="page-title"><div><div className="eyebrow">FİNANS · {cash?'KASA':'GELİR / GİDER'}</div><h1>{cash?'Kasa Yönetimi':'Gelir / Gider'}</h1><p>{cash?'Kasa hareketlerini ve gerçek bakiyeleri yönetin.':'Tüm finansal hareketleri gerçek Supabase verileriyle yönetin.'}</p></div><button className="primary" onClick={()=>setModal(null)}><Plus size={17}/>{cash?'Kasa işlemi':'Yeni işlem'}</button></div>
 <div className="module-summary"><div><span>Görünen kayıt</span><strong>{list.length}</strong></div><div><span>Net</span><strong>{money(total)}</strong></div><div><span>Gelir</span><strong>{money(list.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount,0))}</strong></div><div><span>Gider</span><strong>{money(list.filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount,0))}</strong></div></div>
 {error&&<div className="error-panel"><strong>Finans verileri alınamadı</strong><p>{error}</p><button className="primary" onClick={load}>Tekrar dene</button></div>}
 {!error&&<section className="panel module-panel"><div className="module-tools"><div className="search-box"><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Gerçek kayıtlarda ara..."/></div><div className="tabs">{(['Tümü','Gelir','Gider'] as const).map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</div><button className={`secondary ${filters?'active':''}`} onClick={()=>setFilters(v=>!v)}><Filter size={16}/> Filtrele</button><button className="secondary icon-only" title="CSV" onClick={()=>exportCsv(list)}><Download size={16}/></button></div>{filters&&<div className="filter-panel"><label>Şube<select value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Tüm şubeler</option>{[...new Set(rows.map(r=>r.branch))].filter(Boolean).map(x=><option key={x}>{x}</option>)}</select></label><label>Başlangıç<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Bitiş<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button className="secondary" onClick={()=>{setBranch('');setFrom('');setTo('')}}>Temizle</button></div>}
 {loading?<div className="loading-panel">Gerçek finans verileri yükleniyor...</div>:!list.length?<div className="empty-module"><WalletCards/><h3>Kayıt bulunamadı</h3><p>Seçilen filtrelerde Supabase'den gelen finansal kayıt yok.</p></div>:<div className="table-wrap"><table><thead><tr><th>İşlem</th><th>Şube</th><th>Tür</th><th>Tarih</th><th>İşlemi Yapan</th><th className="right">Tutar</th><th/></tr></thead><tbody>{list.map(r=><tr key={r.id}><td><div className="tx-name"><span className={`tx-icon ${r.type}`}>{r.type==='income'?<ArrowUpRight size={16}/>:<ArrowDownRight size={16}/>}</span><div><strong>{r.title}</strong><small>{r.id}</small></div></div></td><td>{r.branch}</td><td>{r.category}</td><td>{r.date}</td><td>{r.userName||'—'}</td><td className={`right amount ${r.type}`}>{r.type==='income'?'+':'−'} {money(r.amount)}</td><td className="right"><button className="icon-btn inline" title="Düzenle" onClick={()=>setModal(r)}><Edit3 size={16}/></button><button className="icon-btn inline" title="Pasifleştir" onClick={async()=>{if(!confirm('Bu işlem pasifleştirilsin mi?'))return;try{await deleteTransaction(r.id);await load()}catch(e){alert(e instanceof Error?e.message:'İşlem pasifleştirilemedi.')}}}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>}</section>}{modal!==undefined&&<TransactionModal row={modal} branches={branches} user={user} onClose={()=>setModal(undefined)} onSaved={()=>{setModal(undefined);void load().catch(()=>undefined)}}/>}</div>
}

function exportCsv(rows:ModuleTransaction[]){
  const esc=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
  const data=[['İşlem','Şube','Tür','Tarih','İşlemi Yapan','Tutar'],...rows.map(r=>[r.title,r.branch,r.type==='income'?'Gelir':'Gider',r.date,r.userName||'—',r.amount])].map(r=>r.map(esc).join(';')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\ufeff'+data],{type:'text/csv;charset=utf-8'}));
  a.download=`kasa-pro-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function TransactionModal({row,branches,user,onClose,onSaved}:{row:ModuleTransaction|null;branches:ModuleBranch[];user:UserContext;onClose:()=>void;onSaved:()=>void}){
  const [saving,setSaving]=useState(false);
  const [type,setType]=useState<'income'|'expense'>(row?.type==='expense'?'expense':'income');
  const [branch,setBranch]=useState(user.branchIds[0]||branches[0]?.id||'');
  const [amount,setAmount]=useState(String(row?.amount??''));
  const [description,setDescription]=useState(row?.title||'');
  const [date,setDate]=useState(()=>{const raw=row?.date?String(row.date).slice(0,10):'';return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:new Date().toISOString().slice(0,10)});
  
  return <div className="modal-backdrop"><div className="modal-card"><div className="modal-head"><div><div className="eyebrow">{row?'DÜZENLE':'YENİ İŞLEM'}</div><h2>{row?'Finansal işlemi düzenle':'Yeni finansal işlem'}</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="form-grid">
    <label>Tür
      <select value={type} onChange={e=>setType(e.target.value as 'income'|'expense')}>
        <option value="income">Gelir</option>
        <option value="expense">Gider</option>
      </select>
    </label>
    <label>Şube<select value={branch} onChange={e=>setBranch(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Tutar<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <label>Tarih<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
    <label>Açıklama<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="İşlem açıklaması"/></label>
  </div><div className="modal-actions"><button className="secondary" onClick={onClose}>Vazgeç</button><button className="primary" disabled={saving} onClick={async()=>{setSaving(true);try{const input:TransactionInput={branchId:branch,type,amount:Number(amount),description,date};if(row)await updateTransaction(row.id,input,user);else await createTransaction(input,user);onSaved()}catch(e){alert(e instanceof Error?e.message:'İşlem kaydedilemedi.')}finally{setSaving(false)}}}>{saving?'Kaydediliyor...':'Kaydet'}</button></div></div></div>
}
```[cite: 5]
