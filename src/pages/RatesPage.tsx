import { useEffect, useState } from 'react';
import { Landmark, RefreshCw, Save, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useOutletContext } from 'react-router-dom';
import type { AppOutletContext } from '../layouts/AppLayout';
import { loadRatesFromTransactions } from '../lib/app';

type Rate = { code:string; name:string; buy:number; sell:number; source:string };

function parseXml(xml:string): Rate[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return ['USD','EUR'].map((code) => {
    const currency = doc.querySelector(`Currency[CurrencyCode="${code}"]`);
    return {
      code,
      name: currency?.querySelector('Isim')?.textContent || currency?.querySelector('CurrencyName')?.textContent || code,
      buy: Number((currency?.querySelector('ForexBuying')?.textContent || '0').replace(',','.')),
      sell: Number((currency?.querySelector('ForexSelling')?.textContent || '0').replace(',','.')),
      source: 'TCMB',
    };
  }).filter((r) => r.buy > 0 || r.sell > 0);
}

export function RatesPage(){
  const {user} = useOutletContext<AppOutletContext>();
  const [rates,setRates]=useState<Rate[]>([{code:'USD',name:'ABD Doları',buy:0,sell:0,source:'Hazırlanıyor'},{code:'EUR',name:'Euro',buy:0,sell:0,source:'Hazırlanıyor'}]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [updated,setUpdated]=useState('');
  const [manual,setManual]=useState<Rate|null>(null);

  const updateDb = async () => {
    setLoading(true); setError('');
    try {
      const dbRates=await loadRatesFromTransactions(user);
      if(!dbRates.length) throw new Error('Supabase işlem kayıtlarında kullanılabilir USD/EUR kuru bulunamadı.');
      setRates(dbRates.map(r=>({code:r.code,name:r.name,buy:r.buy,sell:r.sell,source:r.source})));
      setUpdated(new Date().toLocaleString('tr-TR'));
    } catch(e) { setError(e instanceof Error?e.message:'Kur verisi alınamadı.'); }
    finally { setLoading(false); }
  };

  const updateTcmb = async () => {
    setLoading(true); setError('');
    try {
      let xml='';
      try {
        xml=await invoke<string>('fetch_tcmb_xml');
      } catch {
        const response=await fetch('https://www.tcmb.gov.tr/kurlar/today.xml',{cache:'no-store'});
        if(!response.ok) throw new Error(`TCMB yanıtı: ${response.status}`);
        xml=await response.text();
      }
      const out=parseXml(xml);
      if(out.length<2) throw new Error('TCMB USD/EUR verisi okunamadı.');
      setRates(out);
      localStorage.setItem('kasa-pro-rates',JSON.stringify(out));
      setUpdated(new Date().toLocaleString('tr-TR'));
    } catch(e) {
      const cached=localStorage.getItem('kasa-pro-rates');
      if(cached) { try{setRates(JSON.parse(cached) as Rate[]);setUpdated('Önbellek');setError('TCMB bağlantısı şu anda kullanılamıyor; son gerçek kurlar gösteriliyor.');}catch{setError(e instanceof Error?e.message:'Kur verisi alınamadı.');} }
      else { try{await updateDb();}catch{setError(e instanceof Error?e.message:'Kur verisi alınamadı.');} }
    } finally { setLoading(false); }
  };

  useEffect(()=>{
    const cached=localStorage.getItem('kasa-pro-rates');
    if(cached){try{setRates(JSON.parse(cached) as Rate[]);setUpdated('Önbellek');return;}catch{/* fall through */}}
    void updateTcmb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const saveManual=()=>{
    if(!manual) return;
    if(!(manual.buy>0)||!(manual.sell>0)){setError('Alış ve satış kuru 0’dan büyük olmalıdır.');return;}
    const next=[...rates.filter(r=>r.code!==manual.code),{...manual,source:'Manuel'}];
    setRates(next);localStorage.setItem('kasa-pro-rates',JSON.stringify(next));setManual(null);setUpdated(new Date().toLocaleString('tr-TR'));
  };

  return <div>
    <div className="page-title">
      <div>
        <div className="eyebrow">FİNANS · KURLAR</div>
        <h1>Kur Merkezi</h1>
        <p>TCMB kurlarını güvenli masaüstü bağlantısıyla alın ve işlem kayıtlarıyla ilişkilendirin.</p>
      </div>
      <div className="title-actions">
        <button className="secondary" disabled={loading} onClick={updateDb}><RefreshCw size={16}/> Supabase'den al</button>
        <button className="primary" disabled={loading} onClick={updateTcmb}><RefreshCw size={16}/>{loading ? "Güncelleniyor..." : "TCMB'den güncelle"}</button>
      </div>
    </div>
    {error && <div className="notice warning"><span>{error}</span></div>}
    <div className="rate-toolbar"><strong>{updated ? `Son güncelleme: ${updated}` : 'Kur verisi hazırlanıyor...'}</strong><span>Kaynak: {rates[0]?.source || '—'}</span></div>
    <section className="rate-grid">
      {rates.map(r => (
        <article className="rate-card" key={r.code}>
          <div className="rate-code">{r.code}</div>
          <h3>{r.name}</h3>
          <div><span>Alış</span><strong>{r.buy.toLocaleString('tr-TR',{minimumFractionDigits:4,maximumFractionDigits:4})} ₺</strong></div>
          <div><span>Satış</span><strong>{r.sell.toLocaleString('tr-TR',{minimumFractionDigits:4,maximumFractionDigits:4})} ₺</strong></div>
          <small>Kaynak: {r.source}</small>
          <button className="secondary full" onClick={()=>setManual(r)}><Save size={15}/> Düzenle</button>
        </article>
      ))}
    </section>
    {rates.every((r) => r.buy <= 0 && r.sell <= 0) && !loading && <div className="empty-module"><Landmark/><h3>Kur verisi yok</h3><p>TCMB'yi güncelleyin veya Supabase'deki eski gerçek kur kayıtlarını kullanın.</p></div>}
    {manual && (
      <div className="modal-backdrop">
        <div className="modal-card">
          <div className="modal-head">
            <div><div className="eyebrow">KUR DÜZENLE</div><h2>{manual.code}</h2></div>
            <button className="icon-btn" onClick={()=>setManual(null)}><X/></button>
          </div>
          <div className="form-grid">
            <label>Alış<input type="number" step="0.0001" value={manual.buy} onChange={e=>setManual(v=>v?{...v,buy:Number(e.target.value)}:v)}/></label>
            <label>Satış<input type="number" step="0.0001" value={manual.sell} onChange={e=>setManual(v=>v?{...v,sell:Number(e.target.value)}:v)}/></label>
          </div>
          <div className="modal-actions"><button className="secondary" onClick={()=>setManual(null)}>Vazgeç</button><button className="primary" onClick={saveManual}>Kaydet</button></div>
        </div>
      </div>
    )}

  </div>
}
