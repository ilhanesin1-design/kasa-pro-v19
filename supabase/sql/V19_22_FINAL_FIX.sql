-- KASA PRO V19.22 FINAL FIX
-- 1) create branch no longer calls jsonb_array_elements() on a RECORD-returning function.
-- 2) SUPER_ADMIN can manage every company/branch.
-- 3) branch user assignment functions remain available.

create or replace function public.v19_create_branch(
  p_company_id uuid,p_name text,p_code text default null,p_phone text default null,
  p_email text default null,p_address text default null,p_city text default null,p_district text default null
)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id uuid; t text; c text; q text; ok boolean:=false;
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Şube adı zorunludur.'; end if;
  t:=public.v19_pick_table(array['şirketler','sirketler','companies']);
  if t is null then raise exception 'İşletme tablosu bulunamadı.'; end if;
  q:=format('select exists(select 1 from public.%I x where (to_jsonb(x)->>''id'')=$1)',t);
  execute q using p_company_id::text into ok;
  if not ok then raise exception 'İşletme bulunamadı.'; end if;
  v_id:=public.v19_insert_json(array['şubeler','subeler','branches','dallar'],jsonb_build_object(
    'company_id',p_company_id,'şirket_id',p_company_id,'sirket_id',p_company_id,'işletme_id',p_company_id,'isletme_id',p_company_id,
    'name',trim(p_name),'şube_adi',trim(p_name),'sube_adi',trim(p_name),'ad',trim(p_name),'isim',trim(p_name),'branch_name',trim(p_name),'sube',trim(p_name),
    'code',nullif(trim(p_code),''),'kod',nullif(trim(p_code),''),'phone',nullif(trim(p_phone),''),'telefon',nullif(trim(p_phone),''),
    'email',nullif(trim(p_email),''),'eposta',nullif(trim(p_email),''),'address',nullif(trim(p_address),''),'adres',nullif(trim(p_address),''),
    'city',nullif(trim(p_city),''),'şehir',nullif(trim(p_city),''),'sehir',nullif(trim(p_city),''),'district',nullif(trim(p_district),''),'ilçe',nullif(trim(p_district),''),'ilce',nullif(trim(p_district),''),
    'is_active',true,'aktif',true));
  return v_id;
end; $$;
grant execute on function public.v19_create_branch(uuid,text,text,text,text,text,text,text) to authenticated;

-- Explicit SUPER_ADMIN company management function. Avoid ambiguous return types.
create or replace function public.v19_superadmin_companies()
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare t text; q text; out jsonb;
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  t:=public.v19_pick_table(array['şirketler','sirketler','companies']);
  if t is null then return '[]'::jsonb; end if;
  q:=format('select coalesce(jsonb_agg(to_jsonb(x) order by lower(coalesce(to_jsonb(x)->>''name'',to_jsonb(x)->>''şirket_adi'',to_jsonb(x)->>''sirket_adi'',to_jsonb(x)->>''işletme_adi'',to_jsonb(x)->>''isletme_adi'',to_jsonb(x)->>''ad'',to_jsonb(x)->>''isim'',to_jsonb(x)->>''firma'',''''))),''[]''::jsonb) from public.%I x',t);
  execute q into out; return coalesce(out,'[]'::jsonb);
end; $$;
grant execute on function public.v19_superadmin_companies() to authenticated;
