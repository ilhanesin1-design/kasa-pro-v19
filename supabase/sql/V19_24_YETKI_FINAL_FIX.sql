-- KASA PRO V19.24 - YETKİ VE İŞLEM ERİŞİMİ FINAL FIX
-- Veri silmez. Mevcut kayıtları değiştirmez.
-- 1) ilhanesin1@gmail.com kesin SUPER_ADMIN
-- 2) SUPER_ADMIN tüm işletme/şube/finans işlemlerini yönetebilir.
-- 3) BRANCH_ADMIN yalnızca atandığı şubede finans işlemlerini tam yönetebilir.
-- 4) Kullanıcı atama / işletme / şube yönetimi SUPER_ADMIN ile sınırlıdır.

create or replace function public.is_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_auth_email text := lower(trim(coalesce(auth.jwt()->>'email','')));
  v_profile_email text := '';
  v_profile_role text := '';
  v_ok boolean := false;
begin
  if v_uid is null then return false; end if;

  -- Kullanıcının verdiği SUPER_ADMIN hesabı.
  if v_auth_email = 'ilhanesin1@gmail.com' then return true; end if;

  begin
    select lower(trim(coalesce(to_jsonb(p)->>'email',''))),
           upper(regexp_replace(coalesce(to_jsonb(p)->>'role',''),'[^A-Za-z0-9]+','_','g'))
      into v_profile_email, v_profile_role
    from public.profiles p
    where p.id=v_uid;
  exception when others then
    null;
  end;

  if v_profile_email = 'ilhanesin1@gmail.com' then return true; end if;
  if v_profile_role in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR') then return true; end if;

  if upper(regexp_replace(coalesce(auth.jwt()->'app_metadata'->>'role',''),'[^A-Za-z0-9]+','_','g'))
      in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR') then return true; end if;
  if upper(regexp_replace(coalesce(auth.jwt()->'user_metadata'->>'role',''),'[^A-Za-z0-9]+','_','g'))
      in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR') then return true; end if;

  select exists(
    select 1 from public.user_branch_roles r
    where r.user_id=v_uid
      and upper(regexp_replace(r.role::text,'[^A-Za-z0-9]+','_','g'))
          in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR')
  ) into v_ok;
  return coalesce(v_ok,false);
end;
$$;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.v19_is_super_admin()
returns boolean language sql stable security definer set search_path=public,auth,pg_catalog
as $$ select public.is_super_admin(); $$;
grant execute on function public.v19_is_super_admin() to authenticated;

create or replace function public.can_access_company(p_company_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
select public.is_super_admin()
 or exists(select 1 from public.user_branch_roles r where r.user_id=auth.uid() and r.company_id=p_company_id);
$$;
grant execute on function public.can_access_company(uuid) to authenticated;

create or replace function public.can_access_branch(p_branch_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
select public.is_super_admin()
 or exists(select 1 from public.user_branch_roles r where r.user_id=auth.uid() and r.branch_id=p_branch_id)
 or exists(select 1 from public.branches b join public.user_branch_roles r on r.company_id=b.company_id
           where b.id=p_branch_id and r.user_id=auth.uid() and r.branch_id is null);
$$;
grant execute on function public.can_access_branch(uuid) to authenticated;

create or replace function public.can_manage_branch(p_branch_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
select public.is_super_admin()
 or exists(select 1 from public.user_branch_roles r where r.user_id=auth.uid() and r.branch_id=p_branch_id
           and upper(regexp_replace(r.role::text,'[^A-Za-z0-9]+','_','g')) in ('BRANCH_ADMIN','ACCOUNTANT'))
 or exists(select 1 from public.branches b join public.user_branch_roles r on r.company_id=b.company_id
           where b.id=p_branch_id and r.user_id=auth.uid() and r.branch_id is null
           and upper(regexp_replace(r.role::text,'[^A-Za-z0-9]+','_','g'))='COMPANY_ADMIN');
$$;
grant execute on function public.can_manage_branch(uuid) to authenticated;

-- SUPER_ADMIN kullanıcı atama fonksiyonları
create or replace function public.superadmin_set_branch_user(p_user_id uuid,p_company_id uuid,p_branch_id uuid,p_role text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN kullanıcı atayabilir.'; end if;
  if p_user_id is null or p_company_id is null or p_branch_id is null then raise exception 'Kullanıcı, işletme ve şube zorunludur.'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Kullanıcı bulunamadı.'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id and is_active=true) then raise exception 'Şube işletmeye ait değil veya pasif.'; end if;
  delete from public.user_branch_roles where user_id=p_user_id and company_id=p_company_id and branch_id=p_branch_id;
  insert into public.user_branch_roles(user_id,company_id,branch_id,role)
  values(p_user_id,p_company_id,p_branch_id,p_role::public.app_role) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.superadmin_set_branch_user(uuid,uuid,uuid,text) to authenticated;

create or replace function public.superadmin_assign_user(p_user_id uuid,p_company_id uuid,p_branch_id uuid,p_role text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN kullanıcı atayabilir.'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Kullanıcı bulunamadı.'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'İşletme bulunamadı.'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id) then raise exception 'Şube işletmeye ait değil.'; end if;
  insert into public.user_branch_roles(user_id,company_id,branch_id,role)
  values(p_user_id,p_company_id,p_branch_id,p_role::public.app_role)
  on conflict(user_id,company_id,branch_id,role) do update set role=excluded.role
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.superadmin_assign_user(uuid,uuid,uuid,text) to authenticated;

create or replace function public.superadmin_remove_user_assignment(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  delete from public.user_branch_roles where id=p_id;
end; $$;
grant execute on function public.superadmin_remove_user_assignment(uuid) to authenticated;

create or replace function public.superadmin_finalize_user_creation(p_user_id uuid,p_full_name text,p_username text,p_email text,p_company_id uuid,p_branch_id uuid,p_role text)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  if p_user_id is null then raise exception 'Kullanıcı kimliği zorunludur.'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'İşletme bulunamadı.'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id) then raise exception 'Şube işletmeye ait değil.'; end if;
  insert into public.profiles(id,full_name,username,email,is_active)
  values(p_user_id,trim(p_full_name),lower(trim(p_username)),lower(trim(p_email)),true)
  on conflict(id) do update set full_name=excluded.full_name,username=excluded.username,email=excluded.email,is_active=true;
  insert into public.user_branch_roles(user_id,company_id,branch_id,role)
  values(p_user_id,p_company_id,p_branch_id,p_role::public.app_role)
  on conflict(user_id,company_id,branch_id,role) do update set role=excluded.role;
  return p_user_id;
end; $$;
grant execute on function public.superadmin_finalize_user_creation(uuid,text,text,text,uuid,uuid,text) to authenticated;

-- Şube yönetimi: yalnızca SUPER_ADMIN.
drop function if exists public.v19_create_branch(uuid,text,text,text,text,text,text,text);
create function public.v19_create_branch(p_company_id uuid,p_name text,p_code text default null,p_phone text default null,p_email text default null,p_address text default null,p_city text default null,p_district text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  if p_company_id is null or nullif(trim(p_name),'') is null then raise exception 'İşletme ve şube adı zorunludur.'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'İşletme bulunamadı.'; end if;
  insert into public.branches(company_id,name,code,phone,email,address,city,district,is_active)
  values(p_company_id,trim(p_name),nullif(trim(p_code),''),nullif(trim(p_phone),''),nullif(trim(p_email),''),nullif(trim(p_address),''),nullif(trim(p_city),''),nullif(trim(p_district),''),true)
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.v19_create_branch(uuid,text,text,text,text,text,text,text) to authenticated;

drop function if exists public.v19_update_branch(uuid,uuid,text,text,text,text,text,text,text,boolean);
create function public.v19_update_branch(p_id uuid,p_company_id uuid,p_name text,p_code text,p_phone text,p_email text,p_address text,p_city text,p_district text,p_is_active boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  update public.branches set company_id=coalesce(p_company_id,company_id),name=trim(p_name),code=nullif(trim(p_code),''),phone=nullif(trim(p_phone),''),email=nullif(trim(p_email),''),address=nullif(trim(p_address),''),city=nullif(trim(p_city),''),district=nullif(trim(p_district),''),is_active=coalesce(p_is_active,true),updated_at=now() where id=p_id;
  if not found then raise exception 'Şube bulunamadı.'; end if;
end; $$;
grant execute on function public.v19_update_branch(uuid,uuid,text,text,text,text,text,text,text,boolean) to authenticated;

-- Finans işlemleri: SUPER_ADMIN sınırsız; BRANCH_ADMIN atandığı şubede tam yetkili.
drop function if exists public.kasa_create_transaction_v24(uuid,text,text,numeric,text,text,uuid,text);
create function public.kasa_create_transaction_v24(p_branch_id uuid,p_branch_name text,p_type text,p_amount numeric,p_description text,p_date text,p_user_id uuid,p_user_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  if not public.can_manage_branch(p_branch_id) then raise exception 'Bu şubede işlem yapma yetkiniz yok.'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Tutar 0’dan büyük olmalıdır.'; end if;
  insert into public.app_transactions(branch_id,sube,tur,miktar,tl_karsiligi,tl_miktar,para_birimi,kur,aciklama,tarih,kullanici,islem_zamani,created_by,updated_by)
  values(p_branch_id,p_branch_name,p_type,p_amount,p_amount,p_amount,'TRY',1,p_description,p_date::date,p_user_name,now(),p_user_id,p_user_id)
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.kasa_create_transaction_v24(uuid,text,text,numeric,text,text,uuid,text) to authenticated;

drop function if exists public.kasa_update_transaction_v24(uuid,uuid,text,text,numeric,text,text,uuid);
create function public.kasa_update_transaction_v24(p_id uuid,p_branch_id uuid,p_branch_name text,p_type text,p_amount numeric,p_description text,p_date text,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  if not public.can_manage_branch(p_branch_id) then raise exception 'Bu şubede işlem düzenleme yetkiniz yok.'; end if;
  update public.app_transactions set branch_id=p_branch_id,sube=p_branch_name,tur=p_type,miktar=p_amount,tl_karsiligi=p_amount,tl_miktar=p_amount,aciklama=p_description,tarih=p_date::date,updated_by=p_user_id,updated_at=now() where id=p_id and deleted_at is null;
  if not found then raise exception 'İşlem bulunamadı.'; end if;
end; $$;
grant execute on function public.kasa_update_transaction_v24(uuid,uuid,text,text,numeric,text,text,uuid) to authenticated;

drop function if exists public.kasa_delete_transaction_v24(uuid,uuid);
create function public.kasa_delete_transaction_v24(p_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_branch uuid;
begin
  if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  select branch_id into v_branch from public.app_transactions where id=p_id;
  if v_branch is null or not public.can_manage_branch(v_branch) then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  update public.app_transactions set deleted_at=now(),updated_by=p_user_id,updated_at=now() where id=p_id and deleted_at is null;
  if not found then raise exception 'İşlem bulunamadı.'; end if;
end; $$;
grant execute on function public.kasa_delete_transaction_v24(uuid,uuid) to authenticated;

-- Faturalar: branch admin kendi şubesinde tam yönetim.
drop function if exists public.kasa_create_invoice_v24(uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,text,uuid,text);
create function public.kasa_create_invoice_v24(p_branch_id uuid,p_branch_name text,p_firma text,p_serial text,p_content text,p_amount numeric,p_paid numeric,p_kdv text,p_note text,p_date text,p_due text,p_status text,p_currency text,p_user_id uuid,p_user_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_remaining numeric;
begin
  if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  if not public.can_manage_branch(p_branch_id) then raise exception 'Bu şubede fatura oluşturma yetkiniz yok.'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Fatura tutarı geçersiz.'; end if;
  if coalesce(p_paid,0)<0 or coalesce(p_paid,0)>p_amount then raise exception 'Ödeme tutarı fatura tutarını aşamaz.'; end if;
  v_remaining:=greatest(0,p_amount-coalesce(p_paid,0));
  insert into public.app_invoices(branch_id,sube,firma,seri_no,icerik,miktar,odenen,kalan,kdv,fatura_notu,tarih,vade_tarihi,fatura_durumu,para_birimi,kullanici,created_by,updated_by,updated_at)
  values(p_branch_id,p_branch_name,p_firma,p_serial,p_content,p_amount,coalesce(p_paid,0),v_remaining,p_kdv,p_note,p_date::date,nullif(p_due,'')::date,case when v_remaining<=0 then 'Ödendi' else coalesce(p_status,'Açık') end,coalesce(p_currency,'TRY'),p_user_name,p_user_id,p_user_id,now())
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.kasa_create_invoice_v24(uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,text,uuid,text) to authenticated;

drop function if exists public.kasa_update_invoice_v24(uuid,jsonb,uuid);
create function public.kasa_update_invoice_v24(p_id uuid,p_payload jsonb,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_branch uuid; v_amount numeric; v_paid numeric; v_remaining numeric;
begin
  if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  select branch_id into v_branch from public.app_invoices where id=p_id and deleted_at is null;
  if v_branch is null or not public.can_manage_branch(v_branch) then raise exception 'Bu faturayı düzenleme yetkiniz yok.'; end if;
  v_amount:=coalesce(nullif(p_payload->>'miktar','')::numeric,nullif(p_payload->>'tutar','')::numeric,0);
  v_paid:=coalesce(nullif(p_payload->>'odenen','')::numeric,0);
  if v_amount<=0 then raise exception 'Fatura tutarı geçersiz.'; end if;
  if v_paid<0 or v_paid>v_amount then raise exception 'Ödeme tutarı geçersiz.'; end if;
  v_remaining:=greatest(0,v_amount-v_paid);
  update public.app_invoices set
    branch_id=coalesce(nullif(p_payload->>'branch_id','')::uuid,branch_id),
    firma=coalesce(nullif(p_payload->>'firma',''),firma),seri_no=coalesce(nullif(p_payload->>'seri_no',''),seri_no),
    icerik=coalesce(p_payload->>'icerik',icerik),miktar=v_amount,odenen=v_paid,kalan=v_remaining,
    kdv=coalesce(p_payload->>'kdv',kdv),fatura_notu=coalesce(p_payload->>'fatura_notu',fatura_notu),
    tarih=coalesce(nullif(p_payload->>'tarih','')::date,tarih),vade_tarihi=case when coalesce(p_payload->>'vade_tarihi','')='' then null else (p_payload->>'vade_tarihi')::date end,
    fatura_durumu=case when v_remaining<=0 then 'Ödendi' else coalesce(nullif(p_payload->>'fatura_durumu',''),'Açık') end,
    updated_by=p_user_id,updated_at=now()
  where id=p_id;
end; $$;
grant execute on function public.kasa_update_invoice_v24(uuid,jsonb,uuid) to authenticated;

drop function if exists public.kasa_delete_invoice_v24(uuid,uuid);
create function public.kasa_delete_invoice_v24(p_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_branch uuid;
begin
  if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  select branch_id into v_branch from public.app_invoices where id=p_id;
  if v_branch is null or not public.can_manage_branch(v_branch) then raise exception 'Bu faturayı silme yetkiniz yok.'; end if;
  update public.app_invoices set deleted_at=now(),updated_by=p_user_id,updated_at=now() where id=p_id and deleted_at is null;
end; $$;
grant execute on function public.kasa_delete_invoice_v24(uuid,uuid) to authenticated;

-- Cari hareketler.
drop function if exists public.kasa_create_cari_v24(uuid,text,text,numeric,text,text,uuid,text);
create function public.kasa_create_cari_v24(p_branch_id uuid,p_branch_name text,p_firma text,p_amount numeric,p_description text,p_date text,p_user_id uuid,p_user_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  if not public.can_manage_branch(p_branch_id) then raise exception 'Bu şubede cari işlem yetkiniz yok.'; end if;
  insert into public.app_cari_payments(branch_id,sube,firma,miktar,tutar,amount,aciklama,tarih,islem_turu,kullanici,created_by,updated_by,updated_at)
  values(p_branch_id,p_branch_name,p_firma,p_amount,p_amount,p_amount,p_description,p_date::date,case when p_amount>=0 then 'Alacak' else 'Borç' end,p_user_name,p_user_id,p_user_id,now())
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.kasa_create_cari_v24(uuid,text,text,numeric,text,text,uuid,text) to authenticated;

drop function if exists public.kasa_update_cari_v24(uuid,jsonb,uuid);
create function public.kasa_update_cari_v24(p_id uuid,p_payload jsonb,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_branch uuid; v_amount numeric;
begin
  if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  select branch_id into v_branch from public.app_cari_payments where id=p_id and deleted_at is null;
  if v_branch is null or not public.can_manage_branch(v_branch) then raise exception 'Bu cari kaydı düzenleme yetkiniz yok.'; end if;
  v_amount:=coalesce(nullif(p_payload->>'miktar','')::numeric,nullif(p_payload->>'tutar','')::numeric,nullif(p_payload->>'amount','')::numeric,0);
  update public.app_cari_payments set branch_id=coalesce(nullif(p_payload->>'branch_id','')::uuid,branch_id),firma=coalesce(p_payload->>'firma',firma),miktar=v_amount,tutar=v_amount,amount=v_amount,aciklama=coalesce(p_payload->>'aciklama',p_payload->>'açıklama',aciklama),tarih=coalesce(nullif(p_payload->>'tarih','')::date,tarih),updated_by=p_user_id,updated_at=now() where id=p_id;
end; $$;
grant execute on function public.kasa_update_cari_v24(uuid,jsonb,uuid) to authenticated;

drop function if exists public.kasa_delete_cari_v24(uuid,uuid);
create function public.kasa_delete_cari_v24(p_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_branch uuid;
begin
  if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  select branch_id into v_branch from public.app_cari_payments where id=p_id;
  if v_branch is null or not public.can_manage_branch(v_branch) then raise exception 'Bu cari kayıt için yetkiniz yok.'; end if;
  update public.app_cari_payments set deleted_at=now(),updated_by=p_user_id,updated_at=now() where id=p_id and deleted_at is null;
end; $$;
grant execute on function public.kasa_delete_cari_v24(uuid,uuid) to authenticated;

-- RLS okuma: SUPER_ADMIN tümünü, kullanıcı/şube yöneticisi yalnızca eriştiği şubeyi görür.
do $$ begin
  if to_regclass('public.app_transactions') is not null then
    alter table public.app_transactions enable row level security;
    drop policy if exists kasa_v24_tx_select on public.app_transactions;
    create policy kasa_v24_tx_select on public.app_transactions for select to authenticated using (public.can_access_branch(branch_id));
  end if;
  if to_regclass('public.app_invoices') is not null then
    alter table public.app_invoices enable row level security;
    drop policy if exists kasa_v24_invoice_select on public.app_invoices;
    create policy kasa_v24_invoice_select on public.app_invoices for select to authenticated using (public.can_access_branch(branch_id));
  end if;
  if to_regclass('public.app_invoice_payments') is not null then
    alter table public.app_invoice_payments enable row level security;
    drop policy if exists kasa_v24_invoice_payment_select on public.app_invoice_payments;
    create policy kasa_v24_invoice_payment_select on public.app_invoice_payments for select to authenticated using (public.can_access_branch(branch_id));
  end if;
  if to_regclass('public.app_cari_payments') is not null then
    alter table public.app_cari_payments enable row level security;
    drop policy if exists kasa_v24_cari_select on public.app_cari_payments;
    create policy kasa_v24_cari_select on public.app_cari_payments for select to authenticated using (public.can_access_branch(branch_id));
  end if;
  if to_regclass('public.branches') is not null then
    alter table public.branches enable row level security;
    drop policy if exists kasa_v24_branches_select on public.branches;
    create policy kasa_v24_branches_select on public.branches for select to authenticated using (public.is_super_admin() or public.can_access_branch(id));
  end if;
  if to_regclass('public.companies') is not null then
    alter table public.companies enable row level security;
    drop policy if exists kasa_v24_companies_select on public.companies;
    create policy kasa_v24_companies_select on public.companies for select to authenticated using (public.is_super_admin() or public.can_access_company(id));
  end if;
end $$;

notify pgrst,'reload schema';
