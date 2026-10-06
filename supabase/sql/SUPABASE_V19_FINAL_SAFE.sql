-- KASA PRO V19 - FINAL SAFE SCHEMA
-- Bu dosya veri silmek için kullanılmaz.
-- Yalnızca eksik şema elemanlarını oluşturur/günceller.
-- DROP TABLE / TRUNCATE / mevcut finansal veri silme yoktur.

create extension if not exists pgcrypto;

-- Giriş ve profil uyumluluğu
alter table if exists public.profiles add column if not exists username text;
alter table if exists public.profiles add column if not exists email text;

-- Eski V17 kurulumları için güvenli audit/soft-delete kolon uyumluluğu.
alter table if exists public.app_transactions add column if not exists deleted_at timestamptz;
alter table if exists public.app_transactions add column if not exists updated_at timestamptz default now();
alter table if exists public.app_invoices add column if not exists deleted_at timestamptz;
alter table if exists public.app_invoices add column if not exists updated_at timestamptz default now();
alter table if exists public.app_cari_payments add column if not exists deleted_at timestamptz;
alter table if exists public.app_cari_payments add column if not exists updated_at timestamptz default now();

-- Yetki tablosu (eksikse)
create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null,
  value boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, permission)
);
alter table public.user_permissions enable row level security;

-- Bildirim tablosu (eksikse)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_read_created on public.notifications(user_id,is_read,created_at desc);
alter table public.notifications enable row level security;

-- POSMIST tabloları (eksikse)
create table if not exists public.posmist_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  business_id text not null,
  api_url text not null,
  api_key text,
  endpoint_path text,
  json_path text default 'data.cash_total',
  enabled boolean not null default false,
  daily_time text not null default '23:59',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id)
);
create table if not exists public.posmist_daily_imports (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.posmist_integrations(id) on delete cascade,
  business_date date not null,
  amount numeric(14,2) not null default 0,
  status text not null default 'imported',
  raw_response jsonb,
  created_at timestamptz not null default now(),
  unique(integration_id,business_date)
);
alter table public.posmist_integrations enable row level security;
alter table public.posmist_daily_imports enable row level security;

-- SUPER_ADMIN tespiti: mevcut rol satırı + güvenli JWT metadata geri dönüşü
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_branch_roles r
    where r.user_id = auth.uid()
      and upper(regexp_replace(r.role::text, '[^A-Za-z0-9]+', '_', 'g')) = 'SUPER_ADMIN'
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and upper(regexp_replace(coalesce(to_jsonb(p)->>'role', ''), '[^A-Za-z0-9]+', '_', 'g')) = 'SUPER_ADMIN'
  )
  or upper(regexp_replace(coalesce(auth.jwt()->'app_metadata'->>'role',''), '[^A-Za-z0-9]+', '_', 'g')) = 'SUPER_ADMIN'
  or upper(regexp_replace(coalesce(auth.jwt()->'user_metadata'->>'role',''), '[^A-Za-z0-9]+', '_', 'g')) = 'SUPER_ADMIN';
$$;

create or replace function public.can_access_company(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_super_admin()
  or exists (select 1 from public.user_branch_roles r where r.user_id=auth.uid() and r.company_id=p_company_id);
$$;

create or replace function public.can_access_branch(p_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_super_admin()
  or exists (select 1 from public.user_branch_roles r where r.user_id=auth.uid() and r.branch_id=p_branch_id)
  or exists (
    select 1 from public.branches b
    join public.user_branch_roles r on r.company_id=b.company_id
    where b.id=p_branch_id and r.user_id=auth.uid() and r.branch_id is null
  );
$$;

create or replace function public.can_manage_branch(p_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_super_admin()
  or exists (select 1 from public.user_branch_roles r where r.user_id=auth.uid() and r.branch_id=p_branch_id and upper(r.role::text) in ('BRANCH_ADMIN','ACCOUNTANT'))
  or exists (
    select 1 from public.branches b
    join public.user_branch_roles r on r.company_id=b.company_id
    where b.id=p_branch_id and r.user_id=auth.uid() and r.branch_id is null and upper(r.role::text)='COMPANY_ADMIN'
  );
$$;

-- SUPER_ADMIN kapsam sorguları: RLS sorunlarını UI'dan bağımsız ve güvenli şekilde çözer.
create or replace function public.get_superadmin_companies()
returns table(id uuid,name text,tax_number text,phone text,email text,address text,is_active boolean)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  return query select c.id,c.name,c.tax_number,c.phone,c.email,c.address,c.is_active from public.companies c order by c.name;
end; $$;

create or replace function public.get_superadmin_branches()
returns table(id uuid,company_id uuid,name text,code text,phone text,email text,address text,city text,district text,latitude numeric,longitude numeric,is_active boolean)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  return query select b.id,b.company_id,b.name,b.code,b.phone,b.email,b.address,b.city,b.district,b.latitude,b.longitude,b.is_active from public.branches b order by b.name;
end; $$;

grant execute on function public.get_superadmin_companies() to authenticated;
grant execute on function public.get_superadmin_branches() to authenticated;

-- SUPER_ADMIN kullanıcı listesi; yalnızca mevcut veriyi okur.
create or replace function public.get_superadmin_users()
returns table(id uuid,username text,full_name text,email text,is_active boolean,role_id uuid,company_id uuid,branch_id uuid,role text)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  return query
  select p.id,p.username,p.full_name,p.email,p.is_active,r.id,r.company_id,r.branch_id,r.role::text
  from public.profiles p
  left join public.user_branch_roles r on r.user_id=p.id
  order by p.full_name nulls last,p.username nulls last;
end; $$;
grant execute on function public.get_superadmin_users() to authenticated;

-- Kullanıcı adıyla girişte mevcut veriyi sadece okur.
create or replace function public.get_login_email(p_username text)
returns text
language plpgsql security definer stable set search_path=public,auth
as $$
declare v_email text;
begin
  select email into v_email from public.profiles where lower(coalesce(username,''))=lower(trim(p_username)) limit 1;
  if v_email is null then
    select u.email into v_email from auth.users u where lower(coalesce(u.raw_user_meta_data->>'username',''))=lower(trim(p_username)) limit 1;
  end if;
  return v_email;
end; $$;
grant execute on function public.get_login_email(text) to anon,authenticated;


-- SUPER_ADMIN yönetim işlemleri: RLS'den bağımsız, güvenli ve veri korumalı.
create or replace function public.superadmin_create_company(p_name text,p_tax_number text default null,p_phone text default null,p_email text default null,p_address text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  insert into public.companies(name,tax_number,phone,email,address) values(trim(p_name),nullif(trim(p_tax_number),''),nullif(trim(p_phone),''),nullif(trim(p_email),''),nullif(trim(p_address),'')) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.superadmin_create_company(text,text,text,text,text) to authenticated;

create or replace function public.superadmin_update_company(p_id uuid,p_name text,p_tax_number text,p_phone text,p_email text,p_address text,p_is_active boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  update public.companies set name=trim(p_name),tax_number=nullif(trim(p_tax_number),''),phone=nullif(trim(p_phone),''),email=nullif(trim(p_email),''),address=nullif(trim(p_address),''),is_active=coalesce(p_is_active,true),updated_at=now() where id=p_id;
end; $$;
grant execute on function public.superadmin_update_company(uuid,text,text,text,text,text,boolean) to authenticated;

-- SUPER_ADMIN işletme silme: bağlı finans kayıtlarını ve şubeleri kontrollü şekilde kaldırır.
create or replace function public.superadmin_delete_company(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.v19_is_super_admin() then raise exception 'SUPER_ADMIN yetkisi bulunamadı.'; end if;
  if not exists(select 1 from public.companies where id=p_id) then raise exception 'İşletme bulunamadı.'; end if;
  if to_regclass('public.app_invoice_payments') is not null and to_regclass('public.app_invoices') is not null then
    execute 'delete from public.app_invoice_payments where invoice_id in (select id from public.app_invoices where company_id=$1)' using p_id;
  end if;
  if to_regclass('public.app_invoices') is not null then execute 'delete from public.app_invoices where company_id=$1' using p_id; end if;
  if to_regclass('public.app_cari_payments') is not null then execute 'delete from public.app_cari_payments where company_id=$1' using p_id; end if;
  if to_regclass('public.app_transactions') is not null then execute 'delete from public.app_transactions where company_id=$1' using p_id; end if;
  if to_regclass('public.posmist_daily_imports') is not null and to_regclass('public.posmist_integrations') is not null then
    execute 'delete from public.posmist_daily_imports where integration_id in (select id from public.posmist_integrations where company_id=$1)' using p_id;
    execute 'delete from public.posmist_integrations where company_id=$1' using p_id;
  end if;
  delete from public.user_branch_roles where company_id=p_id;
  delete from public.branches where company_id=p_id;
  delete from public.companies where id=p_id;
end; $$;
grant execute on function public.superadmin_delete_company(uuid) to authenticated;

create or replace function public.superadmin_create_branch(p_company_id uuid,p_name text,p_code text default null,p_phone text default null,p_email text default null,p_address text default null,p_city text default null,p_district text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'İşletme bulunamadı.'; end if;
  insert into public.branches(company_id,name,code,phone,email,address,city,district) values(p_company_id,trim(p_name),nullif(trim(p_code),''),nullif(trim(p_phone),''),nullif(trim(p_email),''),nullif(trim(p_address),''),nullif(trim(p_city),''),nullif(trim(p_district),'')) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.superadmin_create_branch(uuid,text,text,text,text,text,text,text) to authenticated;

create or replace function public.superadmin_update_branch(p_id uuid,p_company_id uuid,p_name text,p_code text,p_phone text,p_email text,p_address text,p_city text,p_district text,p_is_active boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  update public.branches set company_id=coalesce(p_company_id,company_id),name=trim(p_name),code=nullif(trim(p_code),''),phone=nullif(trim(p_phone),''),email=nullif(trim(p_email),''),address=nullif(trim(p_address),''),city=nullif(trim(p_city),''),district=nullif(trim(p_district),''),is_active=coalesce(p_is_active,true),updated_at=now() where id=p_id;
end; $$;
grant execute on function public.superadmin_update_branch(uuid,uuid,text,text,text,text,text,text,text,boolean) to authenticated;

create or replace function public.superadmin_finalize_user_creation(
  p_user_id uuid, p_full_name text, p_username text, p_email text,
  p_company_id uuid, p_branch_id uuid, p_role text
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  if p_user_id is null then raise exception 'Kullanıcı kimliği zorunludur.'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'İşletme bulunamadı.'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id) then raise exception 'Şube seçilen işletmeye ait değil.'; end if;
  if exists(select 1 from public.profiles where lower(username)=lower(trim(p_username)) and id<>p_user_id) then raise exception 'Bu kullanıcı adı zaten kullanılıyor.'; end if;
  insert into public.profiles(id,full_name,username,email,is_active)
  values(p_user_id,trim(p_full_name),lower(trim(p_username)),lower(trim(p_email)),true)
  on conflict(id) do update set full_name=excluded.full_name,username=excluded.username,email=excluded.email,is_active=true;
  insert into public.user_branch_roles(user_id,company_id,branch_id,role)
  values(p_user_id,p_company_id,p_branch_id,p_role::public.app_role)
  on conflict(user_id,company_id,branch_id,role) do update set role=excluded.role;
  return p_user_id;
end; $$;
grant execute on function public.superadmin_finalize_user_creation(uuid,text,text,text,uuid,uuid,text) to authenticated;

create or replace function public.superadmin_assign_user(p_user_id uuid,p_company_id uuid,p_branch_id uuid,p_role text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Kullanıcı bulunamadı.'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'İşletme bulunamadı.'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id) then raise exception 'Şube seçilen işletmeye ait değil.'; end if;
  insert into public.user_branch_roles(user_id,company_id,branch_id,role) values(p_user_id,p_company_id,p_branch_id,p_role::public.app_role)
  on conflict(user_id,company_id,branch_id,role) do update set role=excluded.role
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.superadmin_assign_user(uuid,uuid,uuid,text) to authenticated;

-- SUPER_ADMIN için tek şube / tek rol ataması. Aynı kullanıcı bu şubede farklı role sahipse eski rolü kaldırır.
create or replace function public.superadmin_set_branch_user(
  p_user_id uuid,
  p_company_id uuid,
  p_branch_id uuid,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN kullanıcı atayabilir.'; end if;
  if p_branch_id is null then raise exception 'Şube seçilmelidir.'; end if;
  if not exists (select 1 from public.profiles where id=p_user_id) then raise exception 'Kullanıcı bulunamadı.'; end if;
  if not exists (select 1 from public.branches where id=p_branch_id and company_id=p_company_id and is_active=true) then raise exception 'Şube seçilen işletmeye ait değil veya pasif.'; end if;
  delete from public.user_branch_roles where user_id=p_user_id and company_id=p_company_id and branch_id=p_branch_id;
  insert into public.user_branch_roles(user_id,company_id,branch_id,role) values(p_user_id,p_company_id,p_branch_id,p_role::public.app_role) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.superadmin_set_branch_user(uuid,uuid,uuid,text) to authenticated;


create or replace function public.superadmin_remove_user_assignment(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  delete from public.user_branch_roles where id=p_id;
end; $$;
grant execute on function public.superadmin_remove_user_assignment(uuid) to authenticated;


-- Fatura ödeme: Kasa seçilirse aynı işlem içinde Kasa'ya Gider kaydı oluşturur.
create or replace function public.record_invoice_payment_v19(
  p_invoice_id uuid,
  p_branch_id uuid,
  p_amount numeric,
  p_date date,
  p_method text,
  p_user_id uuid,
  p_user_name text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_invoice public.app_invoices%rowtype;
  v_remaining numeric;
  v_paid numeric;
  v_new_remaining numeric;
  v_payment_id uuid;
  v_tx_id uuid;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  if p_user_id <> auth.uid() then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  if p_method not in ('Kasa','Kart') then raise exception 'Geçersiz ödeme yöntemi.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Ödeme tutarı 0’dan büyük olmalıdır.'; end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'Bu şubeye ödeme yetkiniz yok.'; end if;

  select * into v_invoice from public.app_invoices where id=p_invoice_id and branch_id=p_branch_id for update;
  if not found then raise exception 'Fatura bulunamadı.'; end if;

  v_remaining := greatest(0, coalesce(v_invoice.kalan, coalesce(v_invoice.miktar,0)-coalesce(v_invoice.odenen,0)));
  if p_amount > v_remaining + 0.009 then raise exception 'Ödeme tutarı kalan bakiyeden fazla olamaz.'; end if;

  insert into public.app_invoice_payments(invoice_id,branch_id,tarih,miktar,tur,kullanici,created_by)
  values(p_invoice_id,p_branch_id,p_date,p_amount,p_method,p_user_name,p_user_id)
  returning id into v_payment_id;

  v_paid := coalesce(v_invoice.odenen,0)+p_amount;
  v_new_remaining := greatest(0,coalesce(v_invoice.miktar,0)-v_paid);
  update public.app_invoices
  set odenen=v_paid,
      kalan=v_new_remaining,
      fatura_durumu=case when v_new_remaining <= 0 then 'Ödendi' else 'Açık' end,
      updated_by=p_user_id,
      updated_at=now()
  where id=p_invoice_id;

  if p_method='Kasa' then
    insert into public.app_transactions(
      branch_id,sube,tur,miktar,tl_karsiligi,tl_miktar,para_birimi,kur,aciklama,tarih,kullanici,islem_zamani,created_by,updated_by
    )
    values(
      p_branch_id,
      coalesce(v_invoice.sube,(select name from public.branches where id=p_branch_id)),
      'Gider',p_amount,p_amount,p_amount,'TRY',1,
      'Fatura Ödemesi - ' || coalesce(v_invoice.firma,'Firma') || ' - ' || coalesce(v_invoice.seri_no::text,'Fatura'),
      p_date,p_user_name,now(),p_user_id,p_user_id
    )
    returning id into v_tx_id;
  end if;

  return jsonb_build_object('payment_id',v_payment_id,'transaction_id',v_tx_id,'remaining',v_new_remaining,'method',p_method);
end;
$$;
grant execute on function public.record_invoice_payment_v19(uuid,uuid,numeric,date,text,uuid,text) to authenticated;

-- Yardım talebini SUPER_ADMIN bildirimlerine iletir.
create or replace function public.submit_help_request(p_subject text,p_message text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare me public.profiles%rowtype; recipient uuid; count_sent integer:=0; payload text;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  if coalesce(trim(p_subject),'')='' then raise exception 'Konu zorunludur.'; end if;
  if coalesce(trim(p_message),'')='' then raise exception 'Mesaj zorunludur.'; end if;
  select * into me from public.profiles where id=auth.uid();
  payload := '[KASA_HELP_V1]' || json_build_object(
    'sender_id',auth.uid(),
    'sender_name',coalesce(me.full_name,''),
    'sender_email',coalesce(me.email,''),
    'sender_phone',coalesce(me.phone,''),
    'subject',left(trim(p_subject),160),
    'message',left(trim(p_message),5000)
  )::text;
  for recipient in
    select distinct x.user_id
    from (
      select r.user_id from public.user_branch_roles r where upper(regexp_replace(r.role::text,'[^A-Za-z0-9]+','_','g'))='SUPER_ADMIN'
      union
      select p.id from public.profiles p where upper(regexp_replace(coalesce(p.role::text,''),'[^A-Za-z0-9]+','_','g'))='SUPER_ADMIN'
      union
      select u.id from auth.users u where upper(regexp_replace(coalesce(u.raw_app_meta_data->>'role',u.raw_user_meta_data->>'role',''),'[^A-Za-z0-9]+','_','g'))='SUPER_ADMIN'
    ) x
  loop
    insert into public.notifications(user_id,title,message,is_read) values(recipient,'Yeni yardım talebi',payload,false);
    count_sent:=count_sent+1;
  end loop;
  if count_sent=0 then raise exception 'SUPER_ADMIN hesabı bulunamadı. Kullanıcının rolü SUPER_ADMIN olarak atanmalı.'; end if;
  return jsonb_build_object('sent_to',count_sent);
end; $$;
grant execute on function public.submit_help_request(text,text) to authenticated;

-- Bildirim RLS: yalnızca sahibi okuyup okundu işaretler. Yardım RPC security-definer olarak yazar.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_select_self') then
    create policy notifications_select_self on public.notifications for select to authenticated using (user_id=auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_update_self') then
    create policy notifications_update_self on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
  end if;
end $$;

-- Yetki satırları: SUPER_ADMIN her kullanıcı için yönetebilir.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_permissions' and policyname='user_permissions_select_v19') then
    create policy user_permissions_select_v19 on public.user_permissions for select to authenticated using (user_id=auth.uid() or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_permissions' and policyname='user_permissions_write_v19') then
    create policy user_permissions_write_v19 on public.user_permissions for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
  end if;
end $$;

-- POSMIST sadece SUPER_ADMIN tarafından yönetilir.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='posmist_integrations' and policyname='posmist_select_v19') then
    create policy posmist_select_v19 on public.posmist_integrations for select to authenticated using (public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='posmist_integrations' and policyname='posmist_write_v19') then
    create policy posmist_write_v19 on public.posmist_integrations for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='posmist_daily_imports' and policyname='posmist_imports_select_v19') then
    create policy posmist_imports_select_v19 on public.posmist_daily_imports for select to authenticated using (public.is_super_admin());
  end if;
end $$;

-- Finans için hızlı indeksler
create index if not exists idx_app_transactions_v19_branch_date on public.app_transactions(branch_id,tarih desc) where deleted_at is null;
create index if not exists idx_app_invoices_v19_branch_date on public.app_invoices(branch_id,tarih desc) where deleted_at is null;
create index if not exists idx_app_cari_v19_branch_date on public.app_cari_payments(branch_id,tarih desc) where deleted_at is null;


-- V19 FINAL güvenlik/yönetim düzeltmesi
create or replace function public.v19_is_super_admin() returns boolean language sql stable security definer set search_path=public,auth as $$ select public.is_super_admin() or exists(select 1 from public.profiles p where p.id=auth.uid() and upper(regexp_replace(coalesce(to_jsonb(p)->>'role',''),'[^A-Za-z0-9]+','_','g')) in ('SUPER_ADMIN','SUPERADMIN')) or upper(regexp_replace(coalesce(auth.jwt()->'app_metadata'->>'role',auth.jwt()->'user_metadata'->>'role',''),'[^A-Za-z0-9]+','_','g')) in ('SUPER_ADMIN','SUPERADMIN'); $$;
grant execute on function public.v19_is_super_admin() to authenticated;
create or replace function public.superadmin_create_company(p_name text,p_tax_number text default null,p_phone text default null,p_email text default null,p_address text default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_id uuid; begin if not public.v19_is_super_admin() then raise exception 'SUPER_ADMIN yetkisi bulunamadı.'; end if; if nullif(trim(p_name),'') is null then raise exception 'İşletme adı zorunludur.'; end if; insert into public.companies(name,tax_number,phone,email,address) values(trim(p_name),nullif(trim(p_tax_number),''),nullif(trim(p_phone),''),nullif(trim(p_email),''),nullif(trim(p_address),'')) returning id into v_id; return v_id; end; $$;
grant execute on function public.superadmin_create_company(text,text,text,text,text) to authenticated;

-- Yardım bildirimleri için Supabase Realtime (varsa tekrar eklenmez).
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

-- V19.23 FINAL business management/delete override
-- KASA PRO V19.23 FINAL
-- SUPER_ADMIN işletme yönetimi + işletme silme
-- Bu dosyayı Supabase SQL Editor'da bir kez çalıştırın.

create or replace function public.superadmin_delete_company(p_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_branch_ids uuid[];
begin
  if not public.v19_is_super_admin() then
    raise exception 'SUPER_ADMIN yetkisi bulunamadı.';
  end if;
  if not exists(select 1 from public.companies where id=p_id) then
    raise exception 'İşletme bulunamadı.';
  end if;

  select coalesce(array_agg(id), '{}') into v_branch_ids from public.branches where company_id=p_id;

  -- Fatura ödemeleri önce silinir; faturalar sonra kaldırılır.
  if to_regclass('public.app_invoice_payments') is not null and to_regclass('public.app_invoices') is not null then
    execute 'delete from public.app_invoice_payments where invoice_id in (select id from public.app_invoices where ' ||
      case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_invoices' and column_name='company_id')
           then 'company_id=$1' else 'branch_id = any($2)' end || ')' using p_id, v_branch_ids;
  end if;

  if to_regclass('public.app_invoices') is not null then
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_invoices' and column_name='company_id') then
      execute 'delete from public.app_invoices where company_id=$1' using p_id;
    elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_invoices' and column_name='branch_id') then
      execute 'delete from public.app_invoices where branch_id = any($1)' using v_branch_ids;
    end if;
  end if;

  if to_regclass('public.app_cari_payments') is not null then
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_cari_payments' and column_name='company_id') then
      execute 'delete from public.app_cari_payments where company_id=$1' using p_id;
    elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_cari_payments' and column_name='branch_id') then
      execute 'delete from public.app_cari_payments where branch_id = any($1)' using v_branch_ids;
    end if;
  end if;

  if to_regclass('public.app_transactions') is not null then
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_transactions' and column_name='company_id') then
      execute 'delete from public.app_transactions where company_id=$1' using p_id;
    elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_transactions' and column_name='branch_id') then
      execute 'delete from public.app_transactions where branch_id = any($1)' using v_branch_ids;
    end if;
  end if;

  if to_regclass('public.posmist_daily_imports') is not null and to_regclass('public.posmist_integrations') is not null then
    execute 'delete from public.posmist_daily_imports where integration_id in (select id from public.posmist_integrations where company_id=$1)' using p_id;
    execute 'delete from public.posmist_integrations where company_id=$1' using p_id;
  end if;

  delete from public.user_branch_roles where company_id=p_id;
  delete from public.branches where company_id=p_id;
  delete from public.companies where id=p_id;
end;
$$;

grant execute on function public.superadmin_delete_company(uuid) to authenticated;

-- UI ile aynı güvenli yönetim fonksiyonlarını garanti altına al.
create or replace function public.superadmin_create_company(p_name text,p_tax_number text default null,p_phone text default null,p_email text default null,p_address text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.v19_is_super_admin() then raise exception 'SUPER_ADMIN yetkisi bulunamadı.'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'İşletme adı zorunludur.'; end if;
  insert into public.companies(name,tax_number,phone,email,address) values(trim(p_name),nullif(trim(p_tax_number),''),nullif(trim(p_phone),''),nullif(trim(p_email),''),nullif(trim(p_address),'')) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.superadmin_create_company(text,text,text,text,text) to authenticated;

create or replace function public.superadmin_update_company(p_id uuid,p_name text,p_tax_number text,p_phone text,p_email text,p_address text,p_is_active boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.v19_is_super_admin() then raise exception 'SUPER_ADMIN yetkisi bulunamadı.'; end if;
  update public.companies set name=trim(p_name),tax_number=nullif(trim(p_tax_number),''),phone=nullif(trim(p_phone),''),email=nullif(trim(p_email),''),address=nullif(trim(p_address),''),is_active=coalesce(p_is_active,true),updated_at=now() where id=p_id;
  if not found then raise exception 'İşletme bulunamadı.'; end if;
end; $$;
grant execute on function public.superadmin_update_company(uuid,text,text,text,text,text,boolean) to authenticated;
