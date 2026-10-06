import { BrowserRouter, Navigate, Route, Routes, useOutletContext } from 'react-router-dom';
import React, { type ReactNode, useEffect, useState } from 'react';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { ModulePage } from './pages/ModulePage';
import { InvoicePage } from './pages/InvoicePage';
import { PosmistPage } from './pages/PosmistPage';
import { CompaniesPage, BranchesPage, UsersPage, PermissionsPage, ReportsPage } from './pages/AdminPages';
import { RatesPage } from './pages/RatesPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFound } from './pages/NotFound';
import { HelpCenterPage } from './pages/HelpCenterPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { supabase } from './lib/supabase';
import { getUserContext, isAdminRole, isSuperAdmin, type UserContext } from './lib/app';
import { AppLayout } from './layouts/AppLayout';

function Protected(){const [ready,setReady]=useState(false);const [session,setSession]=useState<any>(null);useEffect(()=>{if(!supabase){setReady(true);return}let alive=true;supabase.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setReady(true)}});const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>{alive=false;data.subscription.unsubscribe()}},[]);if(!ready)return <div className="loading-screen">KASA PRO yükleniyor...</div>;if(!supabase)return <Navigate to="/login" replace/>;return session?<AppLayout/>:<Navigate to="/login" replace/>}
function SuperAdminOnly({children}:{children:ReactNode}){const {user}=useOutletContext<{user:UserContext}>();if(!isSuperAdmin(user.role, user.email))return <div className="error-panel"><strong>Bu bölüme erişim yetkiniz yok.</strong><p>Yalnızca SUPER_ADMIN bu bölümü kullanabilir.</p></div>;return children;}
function AdminOnly({children}:{children:ReactNode}){const {user}=useOutletContext<{user:UserContext}>();if(!isAdminRole(user.role)&&!isSuperAdmin(user.role,user.email))return <div className="error-panel"><strong>Bu bölüme erişim yetkiniz yok.</strong><p>Yalnızca yönetici hesapları bu bölümü kullanabilir.</p></div>;return children;}
class AppErrorBoundary extends React.Component<{children:ReactNode},{error:string|null}>{state: {error:string|null} = {error:null};static getDerivedStateFromError(error:unknown){return {error:error instanceof Error?error.message:String(error)}}componentDidCatch(error:unknown){console.error('KASA PRO UI error',error)}render(){if(this.state.error)return <div className="error-panel" style={{margin:'32px'}}><strong>Bu ekran yüklenemedi</strong><p>{this.state.error}</p><button className="primary" onClick={()=>location.reload()}>Sayfayı yenile</button></div>;return this.props.children;}}

export default function App(){return <AppErrorBoundary><BrowserRouter><Routes><Route path="/login" element={<Auth/>}/><Route path="/" element={<Protected/>}><Route index element={<Dashboard/>}/><Route path="transactions" element={<ModulePage path="/transactions"/>}/><Route path="cash" element={<ModulePage path="/cash"/>}/><Route path="invoices" element={<InvoicePage/>}/><Route path="reports" element={<ReportsPage/>}/><Route path="rates" element={<RatesPage/>}/><Route path="branches" element={<BranchesPage/>}/><Route path="companies" element={<AdminOnly><CompaniesPage/></AdminOnly>}/><Route path="users" element={<SuperAdminOnly><UsersPage/></SuperAdminOnly>}/><Route path="personnel" element={<AdminOnly><UsersPage/></AdminOnly>}/><Route path="permissions" element={<AdminOnly><PermissionsPage/></AdminOnly>}/><Route path="posmist" element={<SuperAdminOnly><PosmistPage/></SuperAdminOnly>}/><Route path="settings" element={<SettingsPage/>}/><Route path="help" element={<HelpCenterPage/>}/><Route path="notifications" element={<SuperAdminOnly><NotificationsPage/></SuperAdminOnly>}/></Route><Route path="*" element={<NotFound/>}/></Routes></BrowserRouter></AppErrorBoundary>}
