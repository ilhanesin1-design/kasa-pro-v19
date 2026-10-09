-- KASA PRO V19.34 - schema-cache-independent data reads
-- Run this migration once in Supabase SQL Editor.
-- It does not create, drop, truncate, or rewrite financial tables or their data.
-- Reads execute as the caller (SECURITY INVOKER), so underlying SELECT grants and RLS remain in effect.

create or replace function public.kasa_v19_read_rows(
  p_dataset text,
  p_limit integer default 5000,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_candidates text[];
  v_table text;
  v_query text;
  v_rows jsonb;
  v_limit integer := greatest(0, least(coalesce(p_limit, 5000), 10000));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null then
    raise exception 'KASA_V19_AUTH_REQUIRED: oturum açmanız gerekiyor.';
  end if;

  -- These are fixed allow-lists; the caller cannot name arbitrary database tables.
  case lower(trim(coalesce(p_dataset, '')))
    when 'profiles' then
      v_candidates := array['profiles'];
    when 'roles' then
      v_candidates := array['kullanıcı_şubesi_rolleri','Kullanıcı_Şubesi_Rolleri','kullanici_subesi_rolleri','Kullanici_Subesi_Rolleri','user_branch_roles','User_Branch_Roles'];
    when 'companies' then
      v_candidates := array['şirketler','Şirketler','sirketler','Sirketler','companies','Companies','company','işletmeler','İşletmeler','isletmeler'];
    when 'branches' then
      v_candidates := array['şubeler','Şubeler','subeler','Subeler','branches','Branches','dallar','Dallar','sube','Sube','branch','Branch'];
    when 'transactions' then
      v_candidates := array['uygulama_islemleri','uygulama_işlemleri','app_transactions','kasa_hareketleri','transactions','finance_transactions'];
    when 'invoices' then
      v_candidates := array['uygulama_faturaları','uygulama_faturalar','app_invoices','faturalar','invoices'];
    when 'invoice_payments' then
      v_candidates := array['uygulama_fatura_ödemeleri','uygulama_fatura_odemeleri','app_invoice_payments','fatura_odeme_gecmisi','invoice_payments'];
    when 'cari' then
      v_candidates := array['uygulama_cari_ödemeleri','uygulama_cari_odemeleri','app_cari_payments','cari_kart_odemeleri','cari_hareketleri','cari_payments'];
    when 'permissions' then
      v_candidates := array['kullanıcı_izinleri','Kullanıcı_İzinleri','kullanici_izinleri','Kullanici_Izinleri','user_permissions'];
    when 'notifications' then
      v_candidates := array['bildirimler','Bildirimler','notifications','Notifications'];
    when 'posmist' then
      v_candidates := array['posmist_entegrasyonları','posmist_entegrasyonlari','posmist_integrations'];
    else
      raise exception 'KASA_V19_INVALID_DATASET: tanınmayan veri kümesi.';
  end case;

  -- Resolve through PostgreSQL catalogs rather than PostgREST's table cache.
  select c.relname
    into v_table
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(v_candidates)
    and c.relkind in ('r','p','v','m','f')
  order by array_position(v_candidates, c.relname)
  limit 1;

  if v_table is null then
    raise exception 'KASA_V19_DATASET_NOT_FOUND: bu veri kümesine ait tablo bulunamadı (%).', lower(trim(p_dataset));
  end if;

  v_query := format(
    'select coalesce(jsonb_agg(to_jsonb(row_data)), ''[]''::jsonb) from (select * from public.%I limit $1 offset $2) as row_data',
    v_table
  );
  execute v_query into v_rows using v_limit, v_offset;
  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

revoke all on function public.kasa_v19_read_rows(text, integer, integer) from public;
revoke all on function public.kasa_v19_read_rows(text, integer, integer) from anon;
grant execute on function public.kasa_v19_read_rows(text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
