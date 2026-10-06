import { BrowserRouter, Navigate, Route, Routes, useOutletContext } from 'react-router-dom';
import React, { Suspense, type ReactNode, lazy, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { isAdminRole, isSuperAdmin, type UserContext } from './lib/app';

const Auth = lazy(() => import('./pages/Auth').then(m => ({ default: m.Auth })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const ModulePage = lazy(() => import('./pages/ModulePage').then(m => ({ default: m.ModulePage })));
const InvoicePage = lazy(() => import('./pages/InvoicePage').then(m => ({ default: m.InvoicePage })));
const PosmistPage = lazy(() => import('./pages/PosmistPage').then(m => ({ default: m.PosmistPage })));
const CompaniesPage = lazy(() => import('./pages/AdminPages').then(m => ({ default: m.CompaniesPage })));
const BranchesPage = lazy(() => import('./pages/AdminPages').then(m => ({ default: m.BranchesPage })));
const UsersPage = lazy(() => import('./pages/AdminPages').then(m => ({ default: m.UsersPage })));
const PermissionsPage = lazy(() => import('./pages/AdminPages').then(m => ({ default: m.PermissionsPage })));
const ReportsPage = lazy(() => import('./pages/AdminPages').then(m => ({ default: m.ReportsPage })));
const RatesPage = lazy(() => import('./pages/RatesPage').then(m => ({ default: m.RatesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));
const HelpCenterPage = lazy(() => import('./pages/HelpCenterPage').then(m => ({ default: m.HelpCenterPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const AppLayout = lazy(() => import('./layouts/AppLayout').then(m => ({ default: m.AppLayout })));

const PageFallback = () => <div className="loading-screen">KASA PRO yükleniyor...</div>;

function Protected(){
  const [ready,setReady]=useState(false);
  const [session,setSession]=useState<any>(null);
  useEffect(()=>{
    if(!supabase){setReady(true);return;}
    let alive=true;
    supabase.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setReady(true);}}).catch(()=>{if(alive){setSession(null);setReady(true);}});
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return()=>{alive=false;data.subscription.unsubscribe();};
  },[]);
  if(!ready) return <PageFallback/>;
  if(!supabase) return <Navigate to="/login" replace/>;
  return session ? <Suspense fallback={<PageFallback/>}><AppLayout/></Suspense> : <Navigate to="/login" replace/>;
}

function SuperAdminOnly({children}:{children:ReactNode}){
  const {user}=useOutletContext<{user:UserContext}>();
  if(!isSuperAdmin(user.role, user.email)) return <div className="error-panel"><strong>Bu bölüme erişim yetkiniz yok.</strong><p>Yalnızca SUPER_ADMIN bu bölümü kullanabilir.</p></div>;
  return children;
}

function AdminOnly({children}:{children:ReactNode}){
  const {user}=useOutletContext<{user:UserContext}>();
  if(!isAdminRole(user.role) && !isSuperAdmin(user.role,user.email)) return <div className="error-panel"><strong>Bu bölüme erişim yetkiniz yok.</strong><p>Yalnızca yönetici hesapları bu bölümü kullanabilir.</p></div>;
  return children;
}

class AppErrorBoundary extends React.Component<{children:ReactNode},{error:string|null}>{
  state:{error:string|null}={error:null};
  static getDerivedStateFromError(error:unknown){return {error:error instanceof Error?error.message:String(error)};}
  componentDidCatch(error:unknown){console.error('KASA PRO UI error',error);}
  render(){
    if(this.state.error) return <div className="error-panel" style={{margin:'32px'}}><strong>Bu ekran yüklenemedi</strong><p>{this.state.error}</p><button className="primary" onClick={()=>location.reload()}>Sayfayı yenile</button></div>;
    return this.props.children;
  }
}

export default function App(){
  return <AppErrorBoundary><BrowserRouter><Suspense fallback={<PageFallback/>}><Routes>
    <Route path="/login" element={<Auth/>}/>
    <Route path="/" element={<Protected/>}>
      <Route index element={<Dashboard/>}/>
      <Route path="transactions" element={<ModulePage path="/transactions"/>}/>
      <Route path="cash" element={<ModulePage path="/cash"/>}/>
      <Route path="invoices" element={<InvoicePage/>}/>
      <Route path="reports" element={<ReportsPage/>}/>
      <Route path="rates" element={<RatesPage/>}/>
      <Route path="branches" element={<BranchesPage/>}/>
      <Route path="companies" element={<AdminOnly><CompaniesPage/></AdminOnly>}/>
      <Route path="users" element={<SuperAdminOnly><UsersPage/></SuperAdminOnly>}/>
      <Route path="personnel" element={<AdminOnly><UsersPage/></AdminOnly>}/>
      <Route path="permissions" element={<AdminOnly><PermissionsPage/></AdminOnly>}/>
      <Route path="posmist" element={<SuperAdminOnly><PosmistPage/></SuperAdminOnly>}/>
      <Route path="settings" element={<SettingsPage/>}/>
      <Route path="help" element={<HelpCenterPage/>}/>
      <Route path="notifications" element={<SuperAdminOnly><NotificationsPage/></SuperAdminOnly>}/>
    </Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes></Suspense></BrowserRouter></AppErrorBoundary>;
}
