import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { loginWithUsername, registerUser } from '../lib/app';
import { supabase } from '../lib/supabase';
import hero01 from '../assets/hero/01.png';
import hero02 from '../assets/hero/02.png';
import hero03 from '../assets/hero/03.png';
import hero04 from '../assets/hero/04.png';
import hero05 from '../assets/hero/05.png';

const HERO_IMAGES = [hero01, hero02, hero03, hero04, hero05];

export function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [heroIndex, setHeroIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setHeroIndex((value) => (value + 1) % HERO_IMAGES.length), 5500);
    return () => window.clearInterval(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setMsg('Supabase bağlantısı yapılandırılmamış. .env dosyasındaki VITE_SUPABASE_URL ve VITE_SUPABASE_PUBLISHABLE_KEY değerlerini kontrol edin.');
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const form = event.currentTarget;
      if (mode === 'login') {
        const identity = (form.elements.namedItem('identity') as HTMLInputElement).value.trim();
        const password = (form.elements.namedItem('password') as HTMLInputElement).value;
        await loginWithUsername(identity, password);
        navigate('/', { replace: true });
        return;
      }
      if (mode === 'register') {
        const fullName = (form.elements.namedItem('full_name') as HTMLInputElement).value;
        const username = (form.elements.namedItem('username') as HTMLInputElement).value;
        const email = (form.elements.namedItem('email') as HTMLInputElement).value;
        const password = (form.elements.namedItem('password') as HTMLInputElement).value;
        const password2 = (form.elements.namedItem('password2') as HTMLInputElement).value;
        if (password !== password2) throw new Error('Şifreler aynı olmalıdır.');
        await registerUser({ username, fullName, email, password });
        setMode('login');
        setMsg('Hesap oluşturuldu. E-posta doğrulama kapalıysa mevcut bilgilerinizle giriş yapabilirsiniz.');
        return;
      }
      const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim().toLowerCase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
      if (error) throw error;
      setMsg('Şifre yenileme bağlantısı gönderildi.');
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'İşlem tamamlanamadı.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-art">
        {HERO_IMAGES.map((image, index) => (
          <div
            className={`auth-art-slide ${heroIndex === index ? 'active' : ''}`}
            key={image}
            style={{ backgroundImage: `linear-gradient(90deg, rgba(7,15,30,.76), rgba(7,15,30,.54)), url("${image}")` }}
          />
        ))}
        <div className="auth-brand"><div className="brand-mark">K</div><div><strong>KASA PRO V19 · BY İLHAN EŞİN</strong><span>CORPORATE</span></div></div>
        <div className="auth-copy">
          <span className="pill"><ShieldCheck size={14} /> Güvenli finans yönetimi</span>
          <h1>İşletmenizi<br /><em>tek merkezden</em> yönetin.</h1>
          <p>Şube, kasa, gelir-gider, cari ve rapor süreçlerini tek bir kurumsal deneyimde yönetin.</p>
          <div className="auth-features"><span>● Supabase güvenliği</span><span>● Rol & yetki sistemi</span><span>● Şube bazlı erişim</span></div>
          <div className="hero-dots" aria-label="Tanıtım görselleri">{HERO_IMAGES.map((_, index) => <span key={index} className={heroIndex === index ? 'active' : ''} />)}</div>
        </div>
      </div>
      <div className="auth-card">
        <div className="auth-card-head"><div className="brand-mark small">K</div><div><h2>{mode === 'login' ? 'Tekrar hoş geldiniz' : mode === 'register' ? 'Yeni hesap oluştur' : 'Şifrenizi yenileyin'}</h2><p>{mode === 'login' ? 'Hesabınıza güvenli şekilde giriş yapın.' : mode === 'register' ? 'KASA PRO hesabınızı oluşturun.' : 'E-posta adresinizi girin.'}</p></div></div>
        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && <label>Ad Soyad<div className="input"><UserRound size={18} /><input name="full_name" required placeholder="Ad Soyad" autoComplete="name" /></div></label>}
          {mode !== 'forgot' && <label>{mode === 'login' ? 'Kullanıcı Adı veya E-posta' : 'Kullanıcı Adı'}<div className="input"><UserRound size={18} /><input name={mode === 'login' ? 'identity' : 'username'} required autoComplete="username" placeholder={mode === 'login' ? 'kullaniciadi veya e-posta' : 'kullaniciadi'} /></div></label>}
          {mode !== 'login' && <label>E-posta<div className="input"><Mail size={18} /><input name="email" type="email" required placeholder="ornek@sirket.com" autoComplete="email" /></div></label>}
          {mode !== 'forgot' && <label>Şifre<div className="input"><LockKeyhole size={18} /><input name="password" type="password" required minLength={6} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div></label>}
          {mode === 'register' && <label>Şifre Tekrar<div className="input"><LockKeyhole size={18} /><input name="password2" type="password" required minLength={6} placeholder="••••••••" autoComplete="new-password" /></div></label>}
          <button className="primary full auth-submit" disabled={loading}>{loading ? 'İşleniyor...' : mode === 'login' ? 'Giriş yap' : mode === 'register' ? 'Hesap oluştur' : 'Bağlantı gönder'} <ArrowRight size={18} /></button>
        </form>
        <div className="auth-links">{mode === 'login' ? <><button type="button" onClick={() => { setMode('forgot'); setMsg(''); }}>Şifremi unuttum</button><button type="button" onClick={() => { setMode('register'); setMsg(''); }}>Üye ol</button></> : <button type="button" onClick={() => { setMode('login'); setMsg(''); }}>Giriş ekranına dön</button>}</div>
        {msg && <div className={`auth-msg ${msg.toLocaleLowerCase('tr-TR').includes('oluşturuldu') || msg.toLocaleLowerCase('tr-TR').includes('gönderildi') ? 'success' : ''}`}>{msg}</div>}
      </div>
    </div>
  );
}
