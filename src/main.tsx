import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('KASA PRO kök alanı bulunamadı.');

type AppComponent = React.ComponentType;

function Boot() {
  const [App, setApp] = useState<AppComponent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    import('./App')
      .then((module) => {
        if (active) setApp(() => module.default);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (active) setError(message || 'Uygulama modülü yüklenemedi.');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // Only mark boot successful after React has actually committed Boot.
    // This lets the index.html fallback expose module-load errors instead of a blank screen.
    if (App || error) window.__KASA_PRO_BOOTED__ = true;
  }, [App, error]);

  if (error) {
    return (
      <div className="error-panel" style={{ margin: 24 }}>
        <h2>KASA PRO başlatılamadı</h2>
        <p>{error}</p>
        <button className="primary" onClick={() => location.reload()}>Sayfayı yenile</button>
      </div>
    );
  }

  if (!App) return <div className="loading-screen">KASA PRO başlatılıyor...</div>;
  return <App />;
}

createRoot(root).render(<React.StrictMode><Boot /></React.StrictMode>);
