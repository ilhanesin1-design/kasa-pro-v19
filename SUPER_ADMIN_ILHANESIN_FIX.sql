-- KASA PRO V19 - SUPER_ADMIN kesin yetki düzeltmesi
-- Mevcut verileri silmez.
-- SUPER_ADMIN hesabı için hem veritabanı hem uygulama kontrolünü düzeltir.

do $do$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='role'
  ) then
    execute $sql$
      update public.profiles
      set role='SUPER_ADMIN'
      where lower(trim(coalesce(to_jsonb(profiles)->>'email',''))) = lower('ilhanesin1@gmail.com')
    $sql$;
  end if;
end
$do$;

create or replace function public.is_super_admin()
returns boolean
language plpgsql stable security definer
set search_path=public,auth,pg_catalog
as $fn$
declare
  v_uid uuid := auth.uid();
  v_email text := '';
  v_role text := '';
  v_role_table text;
  v_sql text;
  v_ok boolean := false;
begin
  if v_uid is null then return false; end if;

  begin
    select lower(trim(coalesce(to_jsonb(p)->>'email',''))),
           upper(replace(replace(coalesce(to_jsonb(p)->>'role',''),' ','_'),'-','_'))
      into v_email, v_role
    from public.profiles p
    where p.id=v_uid;
  exception when others then
    v_email := '';
    v_role := '';
  end;

  if v_email = lower('ilhanesin1@gmail.com') then return true; end if;
  if v_role in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR') then return true; end if;

  if upper(replace(replace(coalesce(auth.jwt()->'app_metadata'->>'role',''),' ','_'),'-','_'))
       in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR') then return true; end if;
  if upper(replace(replace(coalesce(auth.jwt()->'user_metadata'->>'role',''),' ','_'),'-','_'))
       in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR') then return true; end if;

  select coalesce((select table_name from information_schema.tables
                   where table_schema='public' and table_name in ('user_branch_roles','kullanici_subesi_rolleri','kullanıcı_şubesi_rolleri')
                   order by case table_name when 'user_branch_roles' then 1 when 'kullanici_subesi_rolleri' then 2 else 3 end
                   limit 1),'') into v_role_table;
  if v_role_table <> '' then
    v_sql := format($q$
      select exists(
        select 1 from public.%I r
        where r.user_id=$1
          and upper(replace(replace(coalesce(r.role::text,''),' ','_'),'-','_'))
            in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR')
      )
    $q$, v_role_table);
    begin
      execute v_sql into v_ok using v_uid;
      if coalesce(v_ok,false) then return true; end if;
    exception when others then
      null;
    end;
  end if;

  return false;
end;
$fn$;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.v19_is_super_admin()
returns boolean
language sql stable security definer
set search_path=public,auth,pg_catalog
as $fn$ select public.is_super_admin(); $fn$;
grant execute on function public.v19_is_super_admin() to authenticated;

notify pgrst, 'reload schema';
