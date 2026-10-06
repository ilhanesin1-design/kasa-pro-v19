-- KASA PRO V19 - CANLI ŞEMA UYUMLULUK KATMANI
-- Güvenli: otomatik DROP/TRUNCATE yok. Mevcut iş verileri kendiliğinden silinmez/değiştirilmez.
-- Bu fonksiyonlar yalnızca uygulamadaki kullanıcı eylemleri çağrıldığında veri yazar/günceller.

create or replace function public.v19_norm_role(p_value text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(trim(coalesce(p_value,'')), '[^A-Za-z0-9]+', '_', 'g'));
$$;

create or replace function public.v19_pick_table(p_candidates text[])
returns text
language plpgsql stable security definer
set search_path = public, pg_catalog
as $$
declare v text;
begin
  select c.relname into v
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname = any(p_candidates)
  order by array_position(p_candidates,c.relname)
  limit 1;
  return v;
end;
$$;
grant execute on function public.v19_pick_table(text[]) to authenticated;

create or replace function public.v19_column_name(p_table text, p_candidates text[])
returns text
language plpgsql stable security definer
set search_path = public, pg_catalog
as $$
declare v text;
begin
  select c.column_name into v
  from information_schema.columns c
  where c.table_schema='public' and c.table_name=p_table and c.column_name=any(p_candidates)
  order by array_position(p_candidates,c.column_name), c.ordinal_position
  limit 1;
  return v;
end;
$$;
grant execute on function public.v19_column_name(text,text[]) to authenticated;

create or replace function public.v19_is_super_admin()
returns boolean
language plpgsql stable security definer
set search_path = public, auth, pg_catalog
as $$
declare
  role_table text;
  user_col text;
  role_col text;
  q text;
  ok boolean := false;
  profile_role text;
  metadata_role text;
begin
  if auth.uid() is null then return false; end if;

  begin
    select coalesce(to_jsonb(p)->>'role',to_jsonb(p)->>'rol',to_jsonb(p)->>'kullanici_rolu',to_jsonb(p)->>'kullanıcı_rolü','') into profile_role
    from public.profiles p where p.id=auth.uid();
  exception when others then profile_role := '';
  end;
  if public.v19_norm_role(profile_role) in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR') then return true; end if;

  select public.v19_norm_role(coalesce(auth.jwt()->'app_metadata'->>'role', auth.jwt()->'user_metadata'->>'role','')) into metadata_role;
  if metadata_role in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR') then return true; end if;

  role_table := public.v19_pick_table(array['kullanıcı_şubesi_rolleri','kullanici_subesi_rolleri','user_branch_roles']);
  if role_table is null then return false; end if;
  user_col := public.v19_column_name(role_table,array['user_id','kullanici_id','kullanıcı_id']);
  role_col := public.v19_column_name(role_table,array['role','rol','kullanici_rolu','kullanıcı_rolü']);
  if user_col is null or role_col is null then return false; end if;
  q := format('select exists(select 1 from public.%I r where r.%I=$1 and public.v19_norm_role(r.%I::text) in (''SUPER_ADMIN'',''SUPERADMIN'',''PLATFORM_ADMIN'',''SUPER_ADMINISTRATOR''))', role_table,user_col,role_col);
  execute q into ok using auth.uid();
  return coalesce(ok,false);
end;
$$;
grant execute on function public.v19_is_super_admin() to authenticated;

-- JSON -> mevcut tabloya dinamik INSERT. Yalnızca tabloda gerçekten bulunan kolonlar kullanılır.
create or replace function public.v19_insert_json(p_candidates text[], p_payload jsonb)
returns uuid
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  t text;
  cols text;
  vals text;
  q text;
  v_id uuid;
  id_col text;
begin
  t := public.v19_pick_table(p_candidates);
  if t is null then raise exception 'Tablo bulunamadı: %', array_to_string(p_candidates, ', '); end if;

  select string_agg(format('%I',c.column_name),',' order by c.ordinal_position),
         string_agg(
           case
             when c.data_type='uuid' then format('NULLIF($1->>%L,'''')::uuid',c.column_name)
             when c.data_type='date' then format('NULLIF($1->>%L,'''')::date',c.column_name)
             when c.data_type like 'timestamp%' then format('NULLIF($1->>%L,'''')::timestamp',c.column_name)
             when c.data_type='boolean' then format('case when nullif($1->>%L,'''') is null then null else lower($1->>%L) in (''true'',''1'',''t'',''evet'') end',c.column_name,c.column_name)
             when c.data_type in ('numeric','decimal','real','double precision','integer','bigint','smallint') then format('NULLIF($1->>%L,'''')::%s',c.column_name,c.udt_name)
             when c.data_type='json' then format('$1->%L',c.column_name)
             when c.data_type='jsonb' then format('$1->%L',c.column_name)
             when c.data_type='USER-DEFINED' then format('NULLIF($1->>%L,'''')::%I.%I',c.column_name,c.udt_schema,c.udt_name)
             else format('$1->>%L',c.column_name)
           end
         ,',' order by c.ordinal_position)
  into cols, vals
  from information_schema.columns c
  where c.table_schema='public'
    and c.table_name=t
    and c.is_generated='NEVER'
    and exists (select 1 from jsonb_object_keys(p_payload) k(key) where k.key=c.column_name);

  if cols is null then raise exception 'Uygun INSERT alanı bulunamadı: %', t; end if;
  q := format('insert into public.%I (%s) values (%s)',t,cols,vals);
  id_col := public.v19_column_name(t,array['id','kimlik','kimlik_id']);
  if id_col is not null then q := q || format(' returning %I',id_col); end if;
  if id_col is not null then execute q into v_id using p_payload; else execute q using p_payload; v_id := null; end if;
  return v_id;
end;
$$;
grant execute on function public.v19_insert_json(text[],jsonb) to authenticated;

create or replace function public.v19_update_json(p_candidates text[], p_id uuid, p_payload jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  t text;
  id_col text;
  sets text;
  q text;
begin
  t := public.v19_pick_table(p_candidates);
  if t is null then raise exception 'Tablo bulunamadı: %', array_to_string(p_candidates, ', '); end if;
  id_col := public.v19_column_name(t,array['id','kimlik']);
  if id_col is null then raise exception 'ID alanı bulunamadı: %', t; end if;

  select string_agg(format('%I = %s',c.column_name,
           case
             when c.data_type='uuid' then format('NULLIF($1->>%L,'''')::uuid',c.column_name)
             when c.data_type='date' then format('NULLIF($1->>%L,'''')::date',c.column_name)
             when c.data_type like 'timestamp%' then format('NULLIF($1->>%L,'''')::timestamp',c.column_name)
             when c.data_type='boolean' then format('case when nullif($1->>%L,'''') is null then null else lower($1->>%L) in (''true'',''1'',''t'',''evet'') end',c.column_name,c.column_name)
             when c.data_type in ('numeric','decimal','real','double precision','integer','bigint','smallint') then format('NULLIF($1->>%L,'''')::%s',c.column_name,c.udt_name)
             when c.data_type='json' or c.data_type='jsonb' then format('$1->%L',c.column_name)
             when c.data_type='USER-DEFINED' then format('NULLIF($1->>%L,'''')::%I.%I',c.column_name,c.udt_schema,c.udt_name)
             else format('$1->>%L',c.column_name)
           end),',' order by c.ordinal_position)
    into sets
  from information_schema.columns c
  where c.table_schema='public' and c.table_name=t and c.column_name<>id_col
    and c.is_generated='NEVER'
    and exists (select 1 from jsonb_object_keys(p_payload) k(key) where k.key=c.column_name);

  if sets is null then raise exception 'Güncellenecek alan bulunamadı: %', t; end if;
  q := format('update public.%I set %s where %I=$2',t,sets,id_col);
  execute q using p_payload,p_id;
end;
$$;
grant execute on function public.v19_update_json(text[],uuid,jsonb) to authenticated;

-- SUPER_ADMIN işletme / şube kapsamı
create or replace function public.v19_get_companies()
returns jsonb
language plpgsql stable security definer
set search_path=public,pg_catalog
as $$
declare t text; q text; out jsonb;
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  t:=public.v19_pick_table(array['şirketler','sirketler','companies']);
  if t is null then return '[]'::jsonb; end if;
  q:=format($f$
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', j->>'id',
      'name', coalesce(j->>'name',j->>'şirket_adi',j->>'sirket_adi',j->>'işletme_adi',j->>'isletme_adi',j->>'ad',j->>'isim',j->>'firma',j->>'company_name',j->>'unvan',j->>'ticari_unvan',j->>'ticari_unvanı','İsimsiz işletme'),
      'tax_number',coalesce(j->>'tax_number',j->>'vergi_no',j->>'vergi_numarasi',j->>'vergi_numarası'),
      'phone',coalesce(j->>'phone',j->>'telefon'),
      'email',coalesce(j->>'email',j->>'eposta',j->>'e_posta'),
      'address',coalesce(j->>'address',j->>'adres'),
      'is_active',case when lower(coalesce(j->>'is_active',j->>'aktif','')) in ('true','1','t','evet','aktif') then true when lower(coalesce(j->>'is_active',j->>'aktif','')) in ('false','0','f','hayir','hayır','pasif') then false else true end
    ) order by lower(coalesce(j->>'name',j->>'şirket_adi',j->>'sirket_adi',j->>'işletme_adi',j->>'isletme_adi',j->>'ad',j->>'isim',j->>'firma',''))),'[]'::jsonb)
    from (select to_jsonb(c) j from public.%I c) s
  $f$,t);
  execute q into out; return coalesce(out,'[]'::jsonb);
end;
$$;
grant execute on function public.v19_get_companies() to authenticated;

create or replace function public.v19_get_branches()
returns jsonb
language plpgsql stable security definer
set search_path=public,pg_catalog
as $$
declare t text; q text; out jsonb;
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  t:=public.v19_pick_table(array['şubeler','subeler','branches','dallar']);
  if t is null then return '[]'::jsonb; end if;
  q:=format($f$
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',j->>'id',
      'company_id',coalesce(j->>'company_id',j->>'şirket_id',j->>'sirket_id',j->>'işletme_id',j->>'isletme_id'),
      'name',coalesce(j->>'name',j->>'şube_adi',j->>'sube_adi',j->>'ad',j->>'isim',j->>'branch_name','Şube'),
      'code',coalesce(j->>'code',j->>'kod'),
      'phone',coalesce(j->>'phone',j->>'telefon'),
      'email',coalesce(j->>'email',j->>'eposta',j->>'e_posta'),
      'address',coalesce(j->>'address',j->>'adres'),
      'city',coalesce(j->>'city',j->>'şehir',j->>'sehir'),
      'district',coalesce(j->>'district',j->>'ilçe',j->>'ilce'),
      'latitude',coalesce(j->>'latitude',j->>'enlem'),
      'longitude',coalesce(j->>'longitude',j->>'boylam'),
      'is_active',case when lower(coalesce(j->>'is_active',j->>'aktif','')) in ('true','1','t','evet','aktif') then true when lower(coalesce(j->>'is_active',j->>'aktif','')) in ('false','0','f','hayir','hayır','pasif') then false else true end
    ) order by lower(coalesce(j->>'name',j->>'şube_adi',j->>'sube_adi',j->>'ad',j->>'isim',''))),'[]'::jsonb)
    from (select to_jsonb(b) j from public.%I b) s
  $f$,t);
  execute q into out; return coalesce(out,'[]'::jsonb);
end;
$$;
grant execute on function public.v19_get_branches() to authenticated;

create or replace function public.v19_get_users()
returns jsonb
language plpgsql stable security definer
set search_path=public,auth,pg_catalog
as $$
declare t text; u text; c text; b text; r text; q text; out jsonb;
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  t:=public.v19_pick_table(array['kullanıcı_şubesi_rolleri','kullanici_subesi_rolleri','user_branch_roles']);
  if t is null then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',coalesce(p.username,''),'full_name',coalesce(p.full_name,''),'email',coalesce(p.email,''),'is_active',coalesce(p.is_active,true),'role',coalesce(to_jsonb(p)->>'role',''),'company_id',coalesce(to_jsonb(p)->>'company_id',''),'branch_id',coalesce(to_jsonb(p)->>'branch_id',''))),'[]'::jsonb) into out from public.profiles p;
    return out;
  end if;
  u:=public.v19_column_name(t,array['user_id','kullanici_id','kullanıcı_id']);
  c:=public.v19_column_name(t,array['company_id','şirket_id','sirket_id','işletme_id','isletme_id']);
  b:=public.v19_column_name(t,array['branch_id','şube_id','sube_id']);
  r:=public.v19_column_name(t,array['role','rol','kullanici_rolu','kullanıcı_rolü']);
  q:=format($f$
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'username',coalesce(p.username,''),'full_name',coalesce(p.full_name,''),'email',coalesce(p.email,''),'is_active',coalesce(p.is_active,true),
      'role_id',x->>'id','company_id',coalesce(x->>%L,''),'branch_id',coalesce(x->>%L,''),'role',coalesce(x->>%L,'')
    ) order by p.full_name nulls last,p.username nulls last),'[]'::jsonb)
    from public.profiles p
    left join lateral (
      select to_jsonb(z) x from public.%I z where z.%I=p.id
    ) roles on true
  $f$,c,b,r,t,u);
  execute q into out; return coalesce(out,'[]'::jsonb);
end;
$$;
grant execute on function public.v19_get_users() to authenticated;

create or replace function public.v19_create_company(p_name text,p_tax_number text default null,p_phone text default null,p_email text default null,p_address text default null)
returns uuid
language plpgsql security definer
set search_path=public,pg_catalog
as $$
declare v_id uuid;
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'İşletme adı zorunludur.'; end if;
  v_id:=public.v19_insert_json(array['şirketler','sirketler','companies'],jsonb_build_object(
    'name',trim(p_name),'şirket_adi',trim(p_name),'sirket_adi',trim(p_name),'işletme_adi',trim(p_name),'isletme_adi',trim(p_name),'ad',trim(p_name),'isim',trim(p_name),'firma',trim(p_name),'unvan',trim(p_name),'ticari_unvan',trim(p_name),'ticari_unvanı',trim(p_name),
    'tax_number',nullif(trim(p_tax_number),''),'vergi_no',nullif(trim(p_tax_number),''),'vergi_numarasi',nullif(trim(p_tax_number),''),'vergi_numarası',nullif(trim(p_tax_number),''),
    'phone',nullif(trim(p_phone),''),'telefon',nullif(trim(p_phone),''),'email',nullif(trim(p_email),''),'eposta',nullif(trim(p_email),''),'e_posta',nullif(trim(p_email),''),
    'address',nullif(trim(p_address),''),'adres',nullif(trim(p_address),'')
  ));
  return v_id;
end;
$$;
grant execute on function public.v19_create_company(text,text,text,text,text) to authenticated;

create or replace function public.v19_update_company(p_id uuid,p_name text,p_tax_number text default null,p_phone text default null,p_email text default null,p_address text default null,p_is_active boolean default true)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  perform public.v19_update_json(array['şirketler','sirketler','companies'],p_id,jsonb_build_object('name',trim(p_name),'şirket_adi',trim(p_name),'sirket_adi',trim(p_name),'işletme_adi',trim(p_name),'isletme_adi',trim(p_name),'ad',trim(p_name),'isim',trim(p_name),'firma',trim(p_name),'tax_number',nullif(trim(p_tax_number),''),'vergi_no',nullif(trim(p_tax_number),''),'phone',nullif(trim(p_phone),''),'telefon',nullif(trim(p_phone),''),'email',nullif(trim(p_email),''),'eposta',nullif(trim(p_email),''),'address',nullif(trim(p_address),''),'adres',nullif(trim(p_address),''),'is_active',p_is_active,'aktif',p_is_active));
end; $$;
grant execute on function public.v19_update_company(uuid,text,text,text,text,text,boolean) to authenticated;

create or replace function public.v19_create_branch(p_company_id uuid,p_name text,p_code text default null,p_phone text default null,p_email text default null,p_address text default null,p_city text default null,p_district text default null)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id uuid;
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  if not exists (select 1 from jsonb_array_elements(public.v19_get_companies()) x where x->>'id'=p_company_id::text) then raise exception 'İşletme bulunamadı.'; end if;
  v_id:=public.v19_insert_json(array['şubeler','subeler','branches','dallar'],jsonb_build_object('company_id',p_company_id,'şirket_id',p_company_id,'sirket_id',p_company_id,'işletme_id',p_company_id,'isletme_id',p_company_id,'name',trim(p_name),'şube_adi',trim(p_name),'sube_adi',trim(p_name),'ad',trim(p_name),'isim',trim(p_name),'branch_name',trim(p_name),'sube',trim(p_name),'code',nullif(trim(p_code),''),'kod',nullif(trim(p_code),''),'phone',nullif(trim(p_phone),''),'telefon',nullif(trim(p_phone),''),'email',nullif(trim(p_email),''),'eposta',nullif(trim(p_email),''),'address',nullif(trim(p_address),''),'adres',nullif(trim(p_address),''),'city',nullif(trim(p_city),''),'şehir',nullif(trim(p_city),''),'sehir',nullif(trim(p_city),''),'district',nullif(trim(p_district),''),'ilçe',nullif(trim(p_district),''),'ilce',nullif(trim(p_district),''),'is_active',true,'aktif',true));
  return v_id;
end; $$;
grant execute on function public.v19_create_branch(uuid,text,text,text,text,text,text,text) to authenticated;

create or replace function public.v19_update_branch(p_id uuid,p_company_id uuid,p_name text,p_code text default null,p_phone text default null,p_email text default null,p_address text default null,p_city text default null,p_district text default null,p_is_active boolean default true)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  perform public.v19_update_json(array['şubeler','subeler','branches','dallar'],p_id,jsonb_build_object('company_id',p_company_id,'şirket_id',p_company_id,'sirket_id',p_company_id,'işletme_id',p_company_id,'isletme_id',p_company_id,'name',trim(p_name),'şube_adi',trim(p_name),'sube_adi',trim(p_name),'ad',trim(p_name),'isim',trim(p_name),'code',nullif(trim(p_code),''),'kod',nullif(trim(p_code),''),'phone',nullif(trim(p_phone),''),'telefon',nullif(trim(p_phone),''),'email',nullif(trim(p_email),''),'eposta',nullif(trim(p_email),''),'address',nullif(trim(p_address),''),'adres',nullif(trim(p_address),''),'city',nullif(trim(p_city),''),'şehir',nullif(trim(p_city),''),'district',nullif(trim(p_district),''),'ilçe',nullif(trim(p_district),''),'is_active',p_is_active,'aktif',p_is_active));
end; $$;
grant execute on function public.v19_update_branch(uuid,uuid,text,text,text,text,text,text,text,boolean) to authenticated;

create or replace function public.v19_assign_user(p_user_id uuid,p_company_id uuid,p_branch_id uuid,p_role text)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare t text; u text; c text; b text; r text; q text; existing_id uuid; v_id uuid;
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Kullanıcı bulunamadı.'; end if;
  t:=public.v19_pick_table(array['kullanıcı_şubesi_rolleri','kullanici_subesi_rolleri','user_branch_roles']);
  if t is null then raise exception 'Kullanıcı/şube/rol tablosu bulunamadı.'; end if;
  u:=public.v19_column_name(t,array['user_id','kullanici_id','kullanıcı_id']); c:=public.v19_column_name(t,array['company_id','şirket_id','sirket_id','işletme_id','isletme_id']); b:=public.v19_column_name(t,array['branch_id','şube_id','sube_id']); r:=public.v19_column_name(t,array['role','rol','kullanici_rolu','kullanıcı_rolü']);
  if u is null or c is null or r is null then raise exception 'Atama tablosunda beklenen alanlar bulunamadı.'; end if;
  q:=format('select r.id from public.%I r where r.%I=$1 and r.%I=$2 and (%s) and public.v19_norm_role(r.%I::text)=public.v19_norm_role($4) limit 1',t,u,c,case when b is null then 'true' else format('r.%I=$3',b) end,r);
  execute q into existing_id using p_user_id,p_company_id,p_branch_id,p_role;
  if existing_id is not null then return existing_id; end if;
  v_id:=public.v19_insert_json(array['kullanıcı_şubesi_rolleri','kullanici_subesi_rolleri','user_branch_roles'],jsonb_build_object('user_id',p_user_id,'kullanici_id',p_user_id,'kullanıcı_id',p_user_id,'company_id',p_company_id,'şirket_id',p_company_id,'sirket_id',p_company_id,'işletme_id',p_company_id,'isletme_id',p_company_id,'branch_id',p_branch_id,'şube_id',p_branch_id,'sube_id',p_branch_id,'role',p_role,'rol',p_role,'kullanici_rolu',p_role,'kullanıcı_rolü',p_role));
  return v_id;
end; $$;
grant execute on function public.v19_assign_user(uuid,uuid,uuid,text) to authenticated;

create or replace function public.v19_finalize_user_creation(p_user_id uuid,p_full_name text,p_username text,p_email text,p_company_id uuid,p_branch_id uuid,p_role text)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  if exists(select 1 from public.profiles where id=p_user_id) then
    perform public.v19_update_json(array['profiles'],p_user_id,jsonb_build_object('full_name',trim(p_full_name),'ad_soyad',trim(p_full_name),'username',lower(trim(p_username)),'kullanici_adi',lower(trim(p_username)),'email',lower(trim(p_email)),'e_posta',lower(trim(p_email)),'is_active',true,'aktif',true));
  else
    perform public.v19_insert_json(array['profiles'],jsonb_build_object('id',p_user_id,'full_name',trim(p_full_name),'ad_soyad',trim(p_full_name),'username',lower(trim(p_username)),'kullanici_adi',lower(trim(p_username)),'email',lower(trim(p_email)),'e_posta',lower(trim(p_email)),'is_active',true,'aktif',true));
  end if;
  perform public.v19_assign_user(p_user_id,p_company_id,p_branch_id,p_role);
  return p_user_id;
end; $$;
grant execute on function public.v19_finalize_user_creation(uuid,text,text,text,uuid,uuid,text) to authenticated;

create or replace function public.v19_save_permission(p_user_id uuid,p_permission text,p_value boolean)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare t text; uid text; perm text; val text; q text; existing uuid; v uuid;
begin
  if not public.v19_is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  t:=public.v19_pick_table(array['kullanıcı_izinleri','kullanici_izinleri','user_permissions']); if t is null then raise exception 'Kullanıcı izinleri tablosu bulunamadı.'; end if;
  uid:=public.v19_column_name(t,array['user_id','kullanici_id','kullanıcı_id']); perm:=public.v19_column_name(t,array['permission','izin','yetki']); val:=public.v19_column_name(t,array['value','deger','değer','aktif','enabled']);
  if uid is null or perm is null or val is null then raise exception 'Kullanıcı izinleri alanları bulunamadı.'; end if;
  q:=format('select id from public.%I where %I=$1 and %I=$2 limit 1',t,uid,perm); execute q into existing using p_user_id,p_permission;
  if existing is not null then perform public.v19_update_json(array['kullanıcı_izinleri','kullanici_izinleri','user_permissions'],existing,jsonb_build_object('value',p_value,'deger',p_value,'değer',p_value,'aktif',p_value,'enabled',p_value)); return existing; end if;
  v:=public.v19_insert_json(array['kullanıcı_izinleri','kullanici_izinleri','user_permissions'],jsonb_build_object('user_id',p_user_id,'kullanici_id',p_user_id,'kullanıcı_id',p_user_id,'permission',p_permission,'izin',p_permission,'yetki',p_permission,'value',p_value,'deger',p_value,'değer',p_value,'aktif',p_value,'enabled',p_value)); return v;
end; $$;
grant execute on function public.v19_save_permission(uuid,text,boolean) to authenticated;

-- Finans: gerçek tablo adlarını otomatik bulur; kolon isimleri Türkçe/İngilizce olabilir.
create or replace function public.v19_create_transaction(p_branch_id uuid,p_branch_name text,p_type text,p_amount numeric,p_description text,p_date date,p_user_id uuid,p_user_name text)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v uuid;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Oturum doğrulaması başarısız.'; end if;
  if p_amount<=0 then raise exception 'Tutar 0''dan büyük olmalıdır.'; end if;
  v:=public.v19_insert_json(array['uygulama_islemleri','uygulama_işlemleri','app_transactions','kasa_hareketleri'],jsonb_build_object('branch_id',p_branch_id,'şube_id',p_branch_id,'sube_id',p_branch_id,'sube',p_branch_name,'şube',p_branch_name,'tur',p_type,'tür',p_type,'type',p_type,'islem_turu',p_type,'işlem_türü',p_type,'miktar',p_amount,'tutar',p_amount,'amount',p_amount,'tl_karsiligi',p_amount,'tl_karşiligi',p_amount,'tl_miktar',p_amount,'para_birimi','TRY','para_birim','TRY','kur',1,'aciklama',coalesce(nullif(trim(p_description),''),p_type||' işlemi'),'açıklama',coalesce(nullif(trim(p_description),''),p_type||' işlemi'),'description',coalesce(nullif(trim(p_description),''),p_type||' işlemi'),'tarih',p_date,'date',p_date,'islem_zamani',now(),'işlem_zamanı',now(),'created_at',now(),'kullanici',p_user_name,'kullanıcı',p_user_name,'user_name',p_user_name,'created_by',p_user_id,'updated_by',p_user_id,'deleted_at',null));
  return v;
end; $$;
grant execute on function public.v19_create_transaction(uuid,text,text,numeric,text,date,uuid,text) to authenticated;

create or replace function public.v19_update_transaction(p_id uuid,p_branch_id uuid,p_branch_name text,p_type text,p_amount numeric,p_description text,p_date date,p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if auth.uid()<>p_user_id then raise exception 'Oturum doğrulaması başarısız.'; end if;
  perform public.v19_update_json(array['uygulama_islemleri','uygulama_işlemleri','app_transactions','kasa_hareketleri'],p_id,jsonb_build_object('branch_id',p_branch_id,'şube_id',p_branch_id,'sube_id',p_branch_id,'sube',p_branch_name,'şube',p_branch_name,'tur',p_type,'tür',p_type,'type',p_type,'miktar',p_amount,'tutar',p_amount,'amount',p_amount,'tl_karsiligi',p_amount,'tl_karşiligi',p_amount,'tl_miktar',p_amount,'aciklama',coalesce(nullif(trim(p_description),''),p_type||' işlemi'),'açıklama',coalesce(nullif(trim(p_description),''),p_type||' işlemi'),'tarih',p_date,'date',p_date,'updated_by',p_user_id,'updated_at',now()));
end; $$;
grant execute on function public.v19_update_transaction(uuid,uuid,text,text,numeric,text,date,uuid) to authenticated;

create or replace function public.v19_soft_delete_transaction(p_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform public.v19_update_json(array['uygulama_islemleri','uygulama_işlemleri','app_transactions','kasa_hareketleri'],p_id,jsonb_build_object('deleted_at',now(),'silindi_at',now(),'aktif',false,'is_active',false));
end; $$;
grant execute on function public.v19_soft_delete_transaction(uuid) to authenticated;

create or replace function public.v19_create_invoice(p_branch_id uuid,p_branch_name text,p_firma text,p_serial text,p_content text,p_amount numeric,p_paid numeric,p_kdv text,p_note text,p_date date,p_due date,p_status text,p_currency text,p_user_id uuid,p_user_name text)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v uuid; inv_t text; duplicate boolean := false; q text;
begin
  if auth.uid()<>p_user_id then raise exception 'Oturum doğrulaması başarısız.'; end if;
  if p_amount<=0 then raise exception 'Fatura toplamı 0''dan büyük olmalıdır.'; end if;
  inv_t:=public.v19_pick_table(array['uygulama_faturaları','uygulama_faturalar','app_invoices','faturalar']); if inv_t is null then raise exception 'Fatura tablosu bulunamadı.'; end if;
  q:=format('select exists(select 1 from public.%I i where coalesce(i.firma::text,'''')=$1 and coalesce(i.tarih::text,'''')=$2 and abs(coalesce(i.miktar,0)-$3)<0.0001 and ($4='''' or coalesce(i.seri_no::text,'''')=$4))',inv_t);
  execute q into duplicate using trim(p_firma),p_date::text,p_amount,trim(p_serial);
  if duplicate then raise exception 'Aynı fatura zaten kayıtlı. Mevcut faturayı düzenleyebilirsiniz.'; end if;
  v:=public.v19_insert_json(array['uygulama_faturaları','uygulama_faturalar','app_invoices','faturalar'],jsonb_build_object('branch_id',p_branch_id,'şube_id',p_branch_id,'sube_id',p_branch_id,'sube',p_branch_name,'şube',p_branch_name,'firma',trim(p_firma),'company_name',trim(p_firma),'fatura_adi',trim(p_firma),'invoice_name',trim(p_firma),'seri_no',trim(p_serial),'fatura_no',trim(p_serial),'invoice_number',trim(p_serial),'icerik',trim(p_content),'içerik',trim(p_content),'miktar',p_amount,'tutar',p_amount,'amount',p_amount,'genel_toplam',p_amount,'odenen',greatest(0,p_paid),'paid',greatest(0,p_paid),'kalan',greatest(0,p_amount-greatest(0,p_paid)),'remaining',greatest(0,p_amount-greatest(0,p_paid)),'kdv',trim(p_kdv),'fatura_notu',trim(p_note),'note',trim(p_note),'tarih',p_date,'date',p_date,'vade_tarihi',p_due,'due_date',p_due,'fatura_durumu',p_status,'invoice_status',p_status,'para_birimi',coalesce(nullif(trim(p_currency),''),'TRY'),'created_by',p_user_id,'updated_by',p_user_id,'kullanici',p_user_name,'kullanıcı',p_user_name,'created_at',now(),'islem_zamani',now(),'deleted_at',null));
  return v;
end; $$;
grant execute on function public.v19_create_invoice(uuid,text,text,text,text,numeric,numeric,text,text,date,date,text,text,uuid,text) to authenticated;

create or replace function public.v19_update_invoice(p_id uuid,p_payload jsonb,p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if auth.uid()<>p_user_id then raise exception 'Oturum doğrulaması başarısız.'; end if;
  perform public.v19_update_json(array['uygulama_faturaları','uygulama_faturalar','app_invoices','faturalar'],p_id,p_payload || jsonb_build_object('updated_by',p_user_id,'updated_at',now()));
end; $$;
grant execute on function public.v19_update_invoice(uuid,jsonb,uuid) to authenticated;

create or replace function public.v19_soft_delete_invoice(p_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.v19_is_super_admin() and auth.uid()<>p_user_id then raise exception 'Bu faturayı silme yetkiniz yok.'; end if;
  perform public.v19_update_json(array['uygulama_faturaları','uygulama_faturalar','app_invoices','faturalar'],p_id,jsonb_build_object('deleted_at',now(),'silindi_at',now(),'aktif',false,'is_active',false,'fatura_durumu','Silindi','invoice_status','Silindi','updated_by',p_user_id,'updated_at',now()));
end; $$;
grant execute on function public.v19_soft_delete_invoice(uuid,uuid) to authenticated;

create or replace function public.v19_create_cari(p_branch_id uuid,p_branch_name text,p_firma text,p_amount numeric,p_description text,p_date date,p_user_id uuid,p_user_name text)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v uuid;
begin
  if auth.uid()<>p_user_id then raise exception 'Oturum doğrulaması başarısız.'; end if;
  v:=public.v19_insert_json(array['uygulama_cari_ödemeleri','uygulama_cari_odemeleri','app_cari_payments','cari_kart_odemeleri'],jsonb_build_object('branch_id',p_branch_id,'şube_id',p_branch_id,'sube_id',p_branch_id,'sube',p_branch_name,'şube',p_branch_name,'firma',trim(p_firma),'company_name',trim(p_firma),'miktar',p_amount,'tutar',p_amount,'amount',p_amount,'aciklama',trim(p_description),'açıklama',trim(p_description),'tarih',p_date,'date',p_date,'kullanici',p_user_name,'kullanıcı',p_user_name,'created_by',p_user_id,'updated_by',p_user_id,'created_at',now(),'islem_zamani',now(),'deleted_at',null));
  return v;
end; $$;
grant execute on function public.v19_create_cari(uuid,text,text,numeric,text,date,uuid,text) to authenticated;

create or replace function public.v19_update_cari(p_id uuid,p_payload jsonb,p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if auth.uid()<>p_user_id then raise exception 'Oturum doğrulaması başarısız.'; end if;
  perform public.v19_update_json(array['uygulama_cari_ödemeleri','uygulama_cari_odemeleri','app_cari_payments','cari_kart_odemeleri'],p_id,p_payload || jsonb_build_object('updated_by',p_user_id,'updated_at',now()));
end; $$;
grant execute on function public.v19_update_cari(uuid,jsonb,uuid) to authenticated;

create or replace function public.v19_soft_delete_cari(p_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform public.v19_update_json(array['uygulama_cari_ödemeleri','uygulama_cari_odemeleri','app_cari_payments','cari_kart_odemeleri'],p_id,jsonb_build_object('deleted_at',now(),'silindi_at',now(),'aktif',false,'is_active',false));
end; $$;
grant execute on function public.v19_soft_delete_cari(uuid) to authenticated;

-- Fatura ödemesi: yalnızca Kasa / Kart. Kasa seçilirse finans hareketine Gider düşer.
create or replace function public.v19_record_invoice_payment(p_invoice_id uuid,p_branch_id uuid,p_amount numeric,p_date date,p_method text,p_user_id uuid,p_user_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  inv_t text; pay_t text; tx_t text; invoice jsonb; v_remaining numeric; v_paid numeric; v_new_paid numeric; v_new_remaining numeric; firm text; serial text; sube text; inv_branch text; payment_id uuid; tx_id uuid; q text;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Oturum doğrulaması başarısız.'; end if;
  if p_amount<=0 then raise exception 'Ödeme tutarı 0''dan büyük olmalıdır.'; end if;
  if p_method not in ('Kasa','Kart') then raise exception 'Geçersiz ödeme yöntemi. Yalnızca Kasa veya Kart kullanılabilir.'; end if;
  inv_t:=public.v19_pick_table(array['uygulama_faturaları','uygulama_faturalar','app_invoices','faturalar']);
  pay_t:=public.v19_pick_table(array['uygulama_fatura_ödemeleri','uygulama_fatura_odemeleri','app_invoice_payments','fatura_odeme_gecmisi']);
  tx_t:=public.v19_pick_table(array['uygulama_islemleri','uygulama_işlemleri','app_transactions','kasa_hareketleri']);
  if inv_t is null or pay_t is null then raise exception 'Fatura veya fatura ödeme tablosu bulunamadı.'; end if;
  q:=format('select to_jsonb(i) from public.%I i where i.id=$1 for update',inv_t); execute q into invoice using p_invoice_id;
  if invoice is null then raise exception 'Fatura bulunamadı.'; end if;
  inv_branch:=coalesce(invoice->>'branch_id',invoice->>'şube_id',invoice->>'sube_id','');
  if inv_branch<>'' and inv_branch<>p_branch_id::text then raise exception 'Fatura şubesi ile ödeme şubesi uyuşmuyor.'; end if;
  v_paid:=coalesce(nullif(invoice->>'odenen','')::numeric, nullif(invoice->>'paid','')::numeric, 0);
  v_remaining:=coalesce(nullif(invoice->>'kalan','')::numeric, nullif(invoice->>'remaining','')::numeric, greatest(0,coalesce(nullif(invoice->>'miktar','')::numeric,0)-v_paid));
  if p_amount>v_remaining+0.009 then raise exception 'Ödeme tutarı kalan bakiyeden fazla olamaz. Kalan: %',to_char(v_remaining,'FM999G999G999D00'); end if;
  firm:=coalesce(invoice->>'firma',invoice->>'company_name',invoice->>'fatura_adi','Firma'); serial:=coalesce(invoice->>'seri_no',invoice->>'fatura_no',invoice->>'invoice_number','Fatura'); sube:=coalesce(invoice->>'sube',invoice->>'şube',invoice->>'branch_name','Şube');
  payment_id:=public.v19_insert_json(array['uygulama_fatura_ödemeleri','uygulama_fatura_odemeleri','app_invoice_payments','fatura_odeme_gecmisi'],jsonb_build_object('invoice_id',p_invoice_id,'fatura_id',p_invoice_id,'branch_id',p_branch_id,'şube_id',p_branch_id,'sube_id',p_branch_id,'tarih',p_date,'date',p_date,'miktar',p_amount,'tutar',p_amount,'amount',p_amount,'tur',p_method,'tür',p_method,'odeme_turu',p_method,'ödemetürü',p_method,'kullanici',p_user_name,'kullanıcı',p_user_name,'created_by',p_user_id,'created_at',now()));
  v_new_paid:=v_paid+p_amount; v_new_remaining:=greatest(0,coalesce(nullif(invoice->>'miktar','')::numeric, v_remaining+v_paid)-v_new_paid);
  perform public.v19_update_json(array['uygulama_faturaları','uygulama_faturalar','app_invoices','faturalar'],p_invoice_id,jsonb_build_object('odenen',v_new_paid,'paid',v_new_paid,'kalan',v_new_remaining,'remaining',v_new_remaining,'fatura_durumu',case when v_new_remaining<=0 then 'Ödendi' else 'Açık' end,'invoice_status',case when v_new_remaining<=0 then 'Ödendi' else 'Açık' end,'updated_by',p_user_id,'updated_at',now()));
  if p_method='Kasa' then
    if tx_t is null then raise exception 'Kasa hareketleri tablosu bulunamadı.'; end if;
    tx_id:=public.v19_insert_json(array['uygulama_islemleri','uygulama_işlemleri','app_transactions','kasa_hareketleri'],jsonb_build_object('branch_id',p_branch_id,'şube_id',p_branch_id,'sube_id',p_branch_id,'sube',sube,'şube',sube,'tur','Gider','tür','Gider','type','Gider','islem_turu','Gider','işlem_türü','Gider','miktar',p_amount,'tutar',p_amount,'amount',p_amount,'tl_karsiligi',p_amount,'tl_karşiligi',p_amount,'tl_miktar',p_amount,'para_birimi','TRY','kur',1,'aciklama','Fatura Ödemesi - '||firm||' - '||serial,'açıklama','Fatura Ödemesi - '||firm||' - '||serial,'tarih',p_date,'islem_zamani',now(),'işlem_zamanı',now(),'kullanici',p_user_name,'kullanıcı',p_user_name,'created_by',p_user_id,'updated_by',p_user_id,'created_at',now(),'deleted_at',null));
  end if;
  return jsonb_build_object('payment_id',payment_id,'transaction_id',tx_id,'remaining',v_new_remaining,'method',p_method);
end; $$;
grant execute on function public.v19_record_invoice_payment(uuid,uuid,numeric,date,text,uuid,text) to authenticated;

-- Yardım -> SUPER_ADMIN bildirimleri. Gerçek tablo: bildirimler / notifications.
create or replace function public.v19_submit_help_request(p_subject text,p_message text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare
  t text; sender jsonb; recipient uuid; recipients uuid[] := ARRAY[]::uuid[]; role_table text; user_col text; role_col text; q text; role_recipients uuid[]; count_sent integer:=0; payload text;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  if nullif(trim(p_subject),'') is null then raise exception 'Konu zorunludur.'; end if;
  if nullif(trim(p_message),'') is null then raise exception 'Mesaj zorunludur.'; end if;
  t:=public.v19_pick_table(array['bildirimler','notifications']); if t is null then raise exception 'Bildirim tablosu bulunamadı.'; end if;
  select to_jsonb(p) into sender from public.profiles p where p.id=auth.uid();
  payload:='[KASA_HELP_V2]' || json_build_object(
    'sender_id',auth.uid(),
    'sender_name',coalesce(sender->>'full_name',sender->>'ad_soyad',sender->>'name',''),
    'sender_email',coalesce(sender->>'email',sender->>'e_posta',sender->>'eposta',''),
    'sender_phone',coalesce(sender->>'phone',sender->>'telefon',''),
    'subject',left(trim(p_subject),160),
    'message',left(trim(p_message),5000)
  )::text;

  -- Profil ve Auth metadata üzerinden SUPER_ADMIN bul.
  select array_agg(x.id) into recipients from (
    select p.id
    from public.profiles p
    where public.v19_norm_role(coalesce(to_jsonb(p)->>'role',to_jsonb(p)->>'rol',to_jsonb(p)->>'kullanici_rolu',to_jsonb(p)->>'kullanıcı_rolü','')) in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR')
    union
    select u.id
    from auth.users u
    where public.v19_norm_role(coalesce(u.raw_app_meta_data->>'role',u.raw_user_meta_data->>'role','')) in ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR')
  ) x;

  -- Gerçek rol tablosu Türkçe ise dinamik olarak kullan; İngilizce tablo adına bağımlı olma.
  role_table:=public.v19_pick_table(array['kullanıcı_şubesi_rolleri','kullanici_subesi_rolleri','user_branch_roles']);
  if role_table is not null then
    user_col:=public.v19_column_name(role_table,array['user_id','kullanici_id','kullanıcı_id']);
    role_col:=public.v19_column_name(role_table,array['role','rol','kullanici_rolu','kullanıcı_rolü']);
    if user_col is not null and role_col is not null then
      q:=format('select coalesce(array_agg(distinct r.%I), ARRAY[]::uuid[]) from public.%I r where public.v19_norm_role(r.%I::text) in (''SUPER_ADMIN'',''SUPERADMIN'',''PLATFORM_ADMIN'',''SUPER_ADMINISTRATOR'')',user_col,role_table,role_col);
      execute q into role_recipients;
      recipients:=recipients || coalesce(role_recipients,ARRAY[]::uuid[]);
    end if;
  end if;

  select coalesce(array_agg(distinct x), ARRAY[]::uuid[]) into recipients from unnest(recipients) x;
  if coalesce(array_length(recipients,1),0)=0 then raise exception 'SUPER_ADMIN hesabı bulunamadı.'; end if;

  foreach recipient in array recipients loop
    perform public.v19_insert_json(array['bildirimler','notifications'],jsonb_build_object(
      'user_id',recipient,'kullanici_id',recipient,'kullanıcı_id',recipient,'recipient_id',recipient,'alici_id',recipient,'alıcı_id',recipient,
      'title','Yeni yardım talebi','baslik','Yeni yardım talebi','başlık','Yeni yardım talebi','bildirim_basligi','Yeni yardım talebi','bildirim_başlığı','Yeni yardım talebi',
      'message',payload,'mesaj',payload,'mesaj_metin',payload,'mesaj_metni',payload,'icerik',payload,'içerik',payload,
      'is_read',false,'okundu',false,'okunuyor',false,'okundu_mu',false,
      'created_at',now(),'oluşturulma_tarihi',now(),'olusturulma_tarihi',now(),'tarih',now(),
      'type','HELP_CENTER','kategori','YARDIM'
    ));
    count_sent:=count_sent+1;
  end loop;
  return jsonb_build_object('sent_to',count_sent);
end; $$;
grant execute on function public.v19_submit_help_request(text,text) to authenticated;

create or replace function public.v19_load_notifications()
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare t text; recipient text; q text; out jsonb;
begin
  if not public.v19_is_super_admin() then return '[]'::jsonb; end if;
  t:=public.v19_pick_table(array['bildirimler','notifications']); if t is null then return '[]'::jsonb; end if;
  recipient:=public.v19_column_name(t,array['user_id','kullanici_id','kullanıcı_id','recipient_id','alici_id','alıcı_id']);
  if recipient is null then
    q:=format($f$select coalesce(jsonb_agg(jsonb_build_object('id',n->>'id','title',coalesce(n->>'title',n->>'baslik',n->>'başlık',n->>'konu','Bildirim')),'message',coalesce(n->>'message',n->>'mesaj',n->>'mesaj_metin',n->>'mesaj_metni',n->>'icerik',n->>'içerik',''),'is_read',case when lower(coalesce(n->>'is_read',n->>'okundu',n->>'okunuyor',n->>'okundu_mu','false')) in ('true','1','t','evet','okundu') then true else false end,'created_at',coalesce(n->>'created_at',n->>'oluşturulma_tarihi',n->>'olusturulma_tarihi',n->>'tarih','')) order by coalesce(n->>'created_at',n->>'oluşturulma_tarihi',n->>'olusturulma_tarihi',n->>'tarih','') desc),'[]'::jsonb) from (select to_jsonb(x) n from public.%I x) s$f$,t);
  else
    q:=format($f$select coalesce(jsonb_agg(jsonb_build_object('id',n->>'id','title',coalesce(n->>'title',n->>'baslik',n->>'başlık',n->>'konu','Bildirim')),'message',coalesce(n->>'message',n->>'mesaj',n->>'mesaj_metin',n->>'mesaj_metni',n->>'icerik',n->>'içerik',''),'is_read',case when lower(coalesce(n->>'is_read',n->>'okundu',n->>'okunuyor',n->>'okundu_mu','false')) in ('true','1','t','evet','okundu') then true else false end,'created_at',coalesce(n->>'created_at',n->>'oluşturulma_tarihi',n->>'olusturulma_tarihi',n->>'tarih','')) order by coalesce(n->>'created_at',n->>'oluşturulma_tarihi',n->>'olusturulma_tarihi',n->>'tarih','') desc),'[]'::jsonb) from (select to_jsonb(x) n from public.%I x) s where (s.n->>%L)=auth.uid()::text$f$,t,recipient);
  end if;
  execute q into out; return coalesce(out,'[]'::jsonb);
end; $$;
grant execute on function public.v19_load_notifications() to authenticated;

create or replace function public.v19_mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare t text; recipient text; q text; owned boolean;
begin
  if not public.v19_is_super_admin() then raise exception 'Yetkisiz.'; end if;
  t:=public.v19_pick_table(array['bildirimler','notifications']); if t is null then return; end if;
  recipient:=public.v19_column_name(t,array['user_id','kullanici_id','kullanıcı_id','recipient_id','alici_id','alıcı_id']);
  if recipient is not null then q:=format('select exists(select 1 from public.%I where id=$1 and %I=auth.uid())',t,recipient); execute q into owned using p_id; if not owned then raise exception 'Bildirim bulunamadı.'; end if; end if;
  perform public.v19_update_json(array['bildirimler','notifications'],p_id,jsonb_build_object('is_read',true,'okundu',true,'okunuyor',true,'okundu_mu',true));
end; $$;
grant execute on function public.v19_mark_notification_read(uuid) to authenticated;

notify pgrst, 'reload schema';
