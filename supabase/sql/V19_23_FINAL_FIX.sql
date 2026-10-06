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
