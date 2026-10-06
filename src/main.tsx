import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/theme.css';

const root=document.getElementById('root');
if(!root) throw new Error('KASA PRO kök alanı bulunamadı.');

createRoot(root).render(<React.StrictMode><App/></React.StrictMode>);
window.__KASA_PRO_BOOTED__ = true;
