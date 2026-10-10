-- KASA PRO V19.37 - ONE-FILE DATABASE INSTALL
-- Apply only after confirming the existing V19 helper/RPC foundation is installed.
-- All operations are inside one transaction; an error rolls back the whole feature install.
BEGIN;

DO $preflight$
DECLARE missing text[] := ARRAY[]::text[]; item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'public.v19_pick_table(text[])',
    'public.v19_column_name(text,text[])',
    'public.v19_norm_role(text)',
    'public.v19_is_super_admin()',
    'public.v19_insert_json(text[],jsonb)',
    'public.v19_update_json(text[],uuid,jsonb)',
    'public.v19_save_permission(uuid,text,boolean)',
    'public.can_access_branch(uuid)',
    'public.can_access_company(uuid)',
    'public.can_manage_branch(uuid)',
    'public.kasa_create_transaction_v24(uuid,text,text,numeric,text,text,uuid,text)',
    'public.kasa_update_transaction_v24(uuid,uuid,text,text,numeric,text,text,uuid)',
    'public.kasa_delete_transaction_v24(uuid,uuid)',
    'public.kasa_create_invoice_v24(uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,text,uuid,text)',
    'public.kasa_update_invoice_v24(uuid,jsonb,uuid)',
    'public.kasa_delete_invoice_v24(uuid,uuid)',
    'public.kasa_create_cari_v24(uuid,text,text,numeric,text,text,uuid,text)',
    'public.kasa_update_cari_v24(uuid,jsonb,uuid)',
    'public.kasa_delete_cari_v24(uuid,uuid)',
    'public.v19_record_invoice_payment(uuid,uuid,numeric,date,text,uuid,text)'
  ] LOOP
    IF to_regprocedure(item) IS NULL THEN missing := array_append(missing, item); END IF;
  END LOOP;
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'V19.37 kurulumu durduruldu. Önkoşul fonksiyonları eksik: %. Önce mevcut V19 temel SQL/RPC kurulumunu doğrulayın; tüm veritabanına ait eski SQL dosyalarını körlemesine çalıştırmayın.', array_to_string(missing, ', ');
  END IF;
END;
$preflight$;

-- Stage 1: Help Center admin notifications, read receipts, and notification cleanup.
create or replace function public.submit_help_request(p_subject text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  sender jsonb;
  role_table text;
  user_col text;
  role_col text;
  branch_col text;
  company_col text;
  scope_sql text := 'false';
  branch_scope_sql text := 'false';
  company_scope_sql text := 'false';
  q text;
  recipients uuid[] := array[]::uuid[];
  recipient uuid;
  sent_count integer := 0;
  payload text;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Konu zorunludur.'; end if;
  if coalesce(trim(p_message), '') = '' then raise exception 'Mesaj zorunludur.'; end if;

  select to_jsonb(p) into sender from public.profiles p where p.id = auth.uid();
  payload := '[KASA_HELP_V3]' || json_build_object(
    'sender_id', auth.uid(),
    'sender_name', coalesce(sender->>'full_name', sender->>'ad_soyad', sender->>'name', ''),
    'sender_email', coalesce(sender->>'email', sender->>'e_posta', sender->>'eposta', ''),
    'sender_phone', coalesce(sender->>'phone', sender->>'telefon', ''),
    'subject', left(trim(p_subject), 160),
    'message', left(trim(p_message), 5000)
  )::text;

  -- Resolve English/Turkish table and column names via the existing compatibility layer.
  role_table := public.v19_pick_table(array[
    'kullanıcı_şubesi_rolleri','Kullanıcı_Şubesi_Rolleri',
    'kullanici_subesi_rolleri','Kullanici_Subesi_Rolleri',
    'user_branch_roles','User_Branch_Roles'
  ]);
  if role_table is null then
    raise exception 'Yönetici atamalarının tablosu bulunamadı. V19.33 uyumluluk kurulumunu kontrol edin.';
  end if;
  user_col := public.v19_column_name(role_table, array['user_id','kullanici_id','kullanıcı_id']);
  role_col := public.v19_column_name(role_table, array['role','rol','kullanici_rolu','kullanıcı_rolü']);
  branch_col := public.v19_column_name(role_table, array['branch_id','şube_id','sube_id']);
  company_col := public.v19_column_name(role_table, array['company_id','şirket_id','sirket_id','işletme_id','isletme_id']);
  if user_col is null or role_col is null then
    raise exception 'Yönetici atama tablosunda kullanıcı/rol alanları bulunamadı.';
  end if;

  if branch_col is not null then
    branch_scope_sql := format(
      '(target.%1$I is not null and exists (select 1 from public.%2$I mine where mine.%3$I = auth.uid() and mine.%1$I::text = target.%1$I::text))',
      branch_col, role_table, user_col
    );
  end if;
  if company_col is not null then
    company_scope_sql := format(
      '(target.%1$I is not null and exists (select 1 from public.%2$I mine where mine.%3$I = auth.uid() and mine.%1$I::text = target.%1$I::text))',
      company_col, role_table, user_col
    );
  end if;
  scope_sql := '(' || branch_scope_sql || ' or ' || company_scope_sql || ')';

  q := format($query$
    select coalesce(array_agg(distinct nullif(to_jsonb(target)->>%1$L, '')::uuid), array[]::uuid[])
    from public.%2$I target
    where nullif(to_jsonb(target)->>%1$L, '') is not null
      and nullif(to_jsonb(target)->>%1$L, '')::uuid <> auth.uid()
      and public.v19_norm_role(coalesce(to_jsonb(target)->>%3$L, '')) in
        ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR',
         'ADMIN','ADMINISTRATOR','COMPANY_ADMIN','BRANCH_ADMIN','YONETICI','Y_NETICI')
      and (
        public.v19_is_super_admin()
        or public.v19_norm_role(coalesce(to_jsonb(target)->>%3$L, '')) in
          ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR')
        or %4$s
      )
  $query$, user_col, role_table, role_col, scope_sql);
  execute q into recipients;
  recipients := coalesce(recipients, array[]::uuid[]);
  if coalesce(array_length(recipients, 1), 0) = 0 then
    raise exception 'Bu şirket/şube kapsamında bildirim alabilecek başka bir yönetici bulunamadı.';
  end if;

  foreach recipient in array recipients loop
    perform public.v19_insert_json(
      array['bildirimler','Bildirimler','notifications','Notifications'],
      jsonb_build_object(
        'user_id', recipient, 'kullanici_id', recipient, 'kullanıcı_id', recipient,
        'recipient_id', recipient, 'alici_id', recipient, 'alıcı_id', recipient,
        'title', 'Yönetici bildirimi: ' || left(trim(p_subject), 120),
        'baslik', 'Yönetici bildirimi: ' || left(trim(p_subject), 120),
        'başlık', 'Yönetici bildirimi: ' || left(trim(p_subject), 120),
        'bildirim_basligi', 'Yönetici bildirimi: ' || left(trim(p_subject), 120),
        'bildirim_başlığı', 'Yönetici bildirimi: ' || left(trim(p_subject), 120),
        'message', payload, 'mesaj', payload, 'mesaj_metin', payload,
        'mesaj_metni', payload, 'icerik', payload, 'içerik', payload,
        'is_read', false, 'okundu', false, 'okunuyor', false, 'okundu_mu', false,
        'created_at', now(), 'oluşturulma_tarihi', now(),
        'olusturulma_tarihi', now(), 'tarih', now(),
        'type', 'HELP_CENTER', 'kategori', 'YARDIM'
      )
    );
    sent_count := sent_count + 1;
  end loop;

  return jsonb_build_object('sent_to', sent_count);
end;
$$;

grant execute on function public.submit_help_request(text, text) to authenticated;

-- All admins can read only notifications addressed to their own account.
-- Older installations returned an empty list for every non-SUPER_ADMIN user.
-- The return type changed from an older V19 definition; PostgreSQL requires dropping
-- the no-argument function before recreating it with the new JSONB return type.
drop function if exists public.v19_load_notifications();
create function public.v19_load_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  notification_table text;
  role_table text;
  recipient_col text;
  role_user_col text;
  role_col text;
  profile_row jsonb;
  profile_role text := '';
  admin_allowed boolean := false;
  q text;
  result_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;

  if public.v19_is_super_admin() then
    admin_allowed := true;
  else
    begin
      select to_jsonb(p) into profile_row from public.profiles p where p.id = auth.uid();
      profile_role := coalesce(profile_row->>'role', profile_row->>'rol', profile_row->>'kullanici_rolu', profile_row->>'kullanıcı_rolü', '');
      admin_allowed := public.v19_norm_role(profile_role) in
        ('ADMIN','ADMINISTRATOR','COMPANY_ADMIN','BRANCH_ADMIN','YONETICI','Y_NETICI');
    exception when others then
      admin_allowed := false;
    end;

    if not admin_allowed then
      role_table := public.v19_pick_table(array[
        'kullanıcı_şubesi_rolleri','Kullanıcı_Şubesi_Rolleri',
        'kullanici_subesi_rolleri','Kullanici_Subesi_Rolleri',
        'user_branch_roles','User_Branch_Roles'
      ]);
      if role_table is not null then
        role_user_col := public.v19_column_name(role_table, array['user_id','kullanici_id','kullanıcı_id']);
        role_col := public.v19_column_name(role_table, array['role','rol','kullanici_rolu','kullanıcı_rolü']);
        if role_user_col is not null and role_col is not null then
          q := format(
            'select exists(select 1 from public.%1$I r where r.%2$I = $1 and public.v19_norm_role(r.%3$I::text) in (''ADMIN'',''ADMINISTRATOR'',''COMPANY_ADMIN'',''BRANCH_ADMIN'',''YONETICI'',''Y_NETICI''))',
            role_table, role_user_col, role_col
          );
          execute q into admin_allowed using auth.uid();
        end if;
      end if;
    end if;
  end if;

  if not admin_allowed then return '[]'::jsonb; end if;

  notification_table := public.v19_pick_table(array['bildirimler','Bildirimler','notifications','Notifications']);
  if notification_table is null then return '[]'::jsonb; end if;
  recipient_col := public.v19_column_name(notification_table, array['user_id','kullanici_id','kullanıcı_id','recipient_id','alici_id','alıcı_id']);
  if recipient_col is null then return '[]'::jsonb; end if;

  q := format($query$
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', coalesce(s.n->>'id', s.n->>'kimlik', s.n->>'kimlik_id'),
        'title', coalesce(s.n->>'title', s.n->>'baslik', s.n->>'başlık', s.n->>'konu', 'Bildirim'),
        'message', coalesce(s.n->>'message', s.n->>'mesaj', s.n->>'mesaj_metin', s.n->>'mesaj_metni', s.n->>'icerik', s.n->>'içerik', ''),
        'is_read', case when lower(coalesce(s.n->>'is_read', s.n->>'okundu', s.n->>'okunuyor', s.n->>'okundu_mu', 'false')) in ('true','1','t','evet','okundu') then true else false end,
        'created_at', coalesce(s.n->>'created_at', s.n->>'oluşturulma_tarihi', s.n->>'olusturulma_tarihi', s.n->>'tarih', '')
      ) order by coalesce(s.n->>'created_at', s.n->>'oluşturulma_tarihi', s.n->>'olusturulma_tarihi', s.n->>'tarih', '') desc
    ), '[]'::jsonb)
    from (select to_jsonb(x) as n from public.%1$I x) s
    where s.n->>%2$L = auth.uid()::text
  $query$, notification_table, recipient_col);
  execute q into result_rows;
  return coalesce(result_rows, '[]'::jsonb);
end;
$$;

grant execute on function public.v19_load_notifications() to authenticated;

-- A user may mark only their own notification as read; both schemas are supported.
create or replace function public.v19_mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  notification_table text;
  recipient_col text;
  id_col text;
  q text;
  owns_notification boolean;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  notification_table := public.v19_pick_table(array['bildirimler','Bildirimler','notifications','Notifications']);
  if notification_table is null then raise exception 'Bildirim tablosu bulunamadı.'; end if;
  recipient_col := public.v19_column_name(notification_table, array['user_id','kullanici_id','kullanıcı_id','recipient_id','alici_id','alıcı_id']);
  id_col := public.v19_column_name(notification_table, array['id','kimlik','kimlik_id']);
  if recipient_col is null or id_col is null then raise exception 'Bildirim alıcısı/kimlik alanı bulunamadı.'; end if;
  q := format('select exists(select 1 from public.%1$I n where n.%2$I::text = $1 and n.%3$I::text = $2)', notification_table, id_col, recipient_col);
  execute q into owns_notification using p_id::text, auth.uid()::text;
  if not owns_notification then raise exception 'Bildirim bulunamadı veya bu bildirim size ait değil.'; end if;
  perform public.v19_update_json(
    array['bildirimler','Bildirimler','notifications','Notifications'], p_id,
    jsonb_build_object('is_read', true, 'okundu', true, 'okunuyor', true, 'okundu_mu', true)
  );
end;
$$;

grant execute on function public.v19_mark_notification_read(uuid) to authenticated;

-- Administrators may delete only their own already-read notifications.
create or replace function public.v19_delete_read_notifications()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  notification_table text;
  role_table text;
  recipient_col text;
  read_col text;
  role_user_col text;
  role_col text;
  profile_row jsonb;
  profile_role text := '';
  admin_allowed boolean := false;
  q text;
  deleted_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  if public.v19_is_super_admin() then
    admin_allowed := true;
  else
    begin
      select to_jsonb(p) into profile_row from public.profiles p where p.id = auth.uid();
      profile_role := coalesce(profile_row->>'role', profile_row->>'rol', profile_row->>'kullanici_rolu', profile_row->>'kullanıcı_rolü', '');
      admin_allowed := public.v19_norm_role(profile_role) in
        ('ADMIN','ADMINISTRATOR','COMPANY_ADMIN','BRANCH_ADMIN','YONETICI','Y_NETICI');
    exception when others then
      admin_allowed := false;
    end;
    if not admin_allowed then
      role_table := public.v19_pick_table(array[
        'kullanıcı_şubesi_rolleri','Kullanıcı_Şubesi_Rolleri',
        'kullanici_subesi_rolleri','Kullanici_Subesi_Rolleri',
        'user_branch_roles','User_Branch_Roles'
      ]);
      if role_table is not null then
        role_user_col := public.v19_column_name(role_table, array['user_id','kullanici_id','kullanıcı_id']);
        role_col := public.v19_column_name(role_table, array['role','rol','kullanici_rolu','kullanıcı_rolü']);
        if role_user_col is not null and role_col is not null then
          q := format(
            'select exists(select 1 from public.%1$I r where r.%2$I = $1 and public.v19_norm_role(r.%3$I::text) in (''ADMIN'',''ADMINISTRATOR'',''COMPANY_ADMIN'',''BRANCH_ADMIN'',''YONETICI'',''Y_NETICI''))',
            role_table, role_user_col, role_col
          );
          execute q into admin_allowed using auth.uid();
        end if;
      end if;
    end if;
  end if;
  if not admin_allowed then raise exception 'Okunmuş bildirimleri temizleme yetkisi yönetici hesaplarıyla sınırlıdır.'; end if;

  notification_table := public.v19_pick_table(array['bildirimler','Bildirimler','notifications','Notifications']);
  if notification_table is null then return 0; end if;
  recipient_col := public.v19_column_name(notification_table, array['user_id','kullanici_id','kullanıcı_id','recipient_id','alici_id','alıcı_id']);
  read_col := public.v19_column_name(notification_table, array['is_read','okundu','okunuyor','okundu_mu']);
  if recipient_col is null or read_col is null then
    raise exception 'Bildirim tablosunda alıcı/okunma alanları bulunamadı.';
  end if;
  q := format(
    'delete from public.%1$I n where n.%2$I::text = $1 and lower(coalesce(n.%3$I::text, ''false'')) in (''true'',''1'',''t'',''evet'',''okundu'')',
    notification_table, recipient_col, read_col
  );
  execute q using auth.uid()::text;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.v19_delete_read_notifications() to authenticated;

notify pgrst, 'reload schema';

-- Stage 2: controlled POSMIST permissions, granular finance permissions and idempotent offline sync.
create table if not exists public.v19_offline_sync_events (
  event_id uuid primary key,
  user_id uuid not null,
  operation text not null,
  result jsonb,
  created_at timestamptz not null default now()
);
alter table public.v19_offline_sync_events enable row level security;
revoke all on public.v19_offline_sync_events from public, anon, authenticated;

-- Tek yetki karar noktası. Yetki satırı açıkça true değilse erişim verilmez.
-- Süper yönetici, mevcut sunucu tarafı SUPER_ADMIN doğrulamasıyla tüm izinleri korur.
create or replace function public.v19_user_has_app_permission(p_permission text)
returns boolean
language plpgsql stable security definer
set search_path = public, auth, pg_catalog
as $$
declare t text; uid_col text; perm_col text; val_col text; allowed boolean; q text; k text;
begin
  if auth.uid() is null or nullif(trim(p_permission),'') is null then return false; end if;
  if public.v19_is_super_admin() then return true; end if;
  t := public.v19_pick_table(array['kullanıcı_izinleri','kullanici_izinleri','user_permissions']);
  if t is null then return false; end if;
  uid_col := public.v19_column_name(t,array['user_id','kullanici_id','kullanıcı_id']);
  perm_col := public.v19_column_name(t,array['permission','izin','yetki']);
  val_col := public.v19_column_name(t,array['value','deger','değer','aktif','enabled']);
  if uid_col is null or perm_col is null or val_col is null then return false; end if;
  q := format(
    'select case when lower(coalesce(to_jsonb(p)->>%1$L,''false'')) in (''true'',''1'',''t'',''evet'',''aktif'',''yes'') then true else false end from public.%2$I p where p.%3$I::text=$1 and upper(p.%4$I::text)=upper($2) order by coalesce(to_jsonb(p)->>''updated_at'',to_jsonb(p)->>''created_at'','''') desc limit 1',
    val_col,t,uid_col,perm_col
  );
  execute q into allowed using auth.uid()::text,p_permission;
  if allowed is null then return false; end if;
  return allowed;
end;
$$;
grant execute on function public.v19_user_has_app_permission(text) to authenticated;

-- Read-only POSMIST data for users explicitly assigned POSMIST_GOR or POSMIST_YONET.
-- All key-like columns are stripped from the response.
create or replace function public.v19_load_posmist()
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $$
declare t text; q text; result_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  if not (public.v19_user_has_app_permission('POSMIST_GOR') or public.v19_user_has_app_permission('POSMIST_YONET')) then
    raise exception 'POSMIST görüntüleme izniniz yok.';
  end if;
  t := public.v19_pick_table(array['posmist_entegrasyonları','posmist_entegrasyonlari','posmist_integrations']);
  if t is null then raise exception 'POSMIST entegrasyon tablosu bulunamadı.'; end if;
  q := format($query$
    select coalesce(jsonb_agg(
      (to_jsonb(x) - array['api_key','apiKey','api_key_secret','api_anahtari','api_anahtarı','api_anahtar','api_token','api_secret','secret_key','secret','token','access_token','authorization','bearer_token','apikey','api_password','client_secret','client_secret_key','password','refresh_token','private_key','connection_string','secret_value']::text[])
      order by coalesce(to_jsonb(x)->>'business_id',to_jsonb(x)->>'id','')
    ), '[]'::jsonb)
    from public.%1$I x
    where coalesce(to_jsonb(x)->>'deleted_at',to_jsonb(x)->>'silindi_at','') = ''
      and (
        public.v19_is_super_admin()
        or (nullif(coalesce(to_jsonb(x)->>'branch_id',to_jsonb(x)->>'şube_id',to_jsonb(x)->>'sube_id'),'') is not null
            and public.can_access_branch(nullif(coalesce(to_jsonb(x)->>'branch_id',to_jsonb(x)->>'şube_id',to_jsonb(x)->>'sube_id'),'')::uuid))
        or (nullif(coalesce(to_jsonb(x)->>'company_id',to_jsonb(x)->>'şirket_id',to_jsonb(x)->>'sirket_id',to_jsonb(x)->>'işletme_id',to_jsonb(x)->>'isletme_id'),'') is not null
            and public.can_access_company(nullif(coalesce(to_jsonb(x)->>'company_id',to_jsonb(x)->>'şirket_id',to_jsonb(x)->>'sirket_id',to_jsonb(x)->>'işletme_id',to_jsonb(x)->>'isletme_id'),'')::uuid))
      )
  $query$,t);
  execute q into result_rows;
  return coalesce(result_rows,'[]'::jsonb);
end;
$$;
grant execute on function public.v19_load_posmist() to authenticated;

create or replace function public.v19_save_posmist(p_id uuid,p_payload jsonb)
returns uuid
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $$
declare t text; c_id uuid; b_id uuid; clean jsonb; existing_rows jsonb; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  if not public.v19_user_has_app_permission('POSMIST_YONET') then raise exception 'POSMIST yönetim izniniz yok.'; end if;
  if coalesce(trim(p_payload->>'business_id'),trim(p_payload->>'işletme_kodu'), '') = '' then raise exception 'Business ID zorunludur.'; end if;
  if coalesce(trim(p_payload->>'api_url'),trim(p_payload->>'api_adresi'), '') = '' then raise exception 'API URL zorunludur.'; end if;
  c_id := nullif(coalesce(p_payload->>'company_id',p_payload->>'şirket_id',p_payload->>'sirket_id',p_payload->>'isletme_id'),'')::uuid;
  b_id := nullif(coalesce(p_payload->>'branch_id',p_payload->>'şube_id',p_payload->>'sube_id'),'')::uuid;
  if not public.v19_is_super_admin() then
    if c_id is null or not public.can_access_company(c_id) then raise exception 'Bu işletme için POSMIST yönetim yetkiniz yok.'; end if;
    if b_id is not null and not public.can_access_branch(b_id) then raise exception 'Bu şube için POSMIST yönetim yetkiniz yok.'; end if;
  end if;
  t := public.v19_pick_table(array['posmist_entegrasyonları','posmist_entegrasyonlari','posmist_integrations']);
  if t is null then raise exception 'POSMIST entegrasyon tablosu bulunamadı.'; end if;
  clean := p_payload;
  if p_id is not null then
    existing_rows := public.v19_load_posmist();
    if not exists (select 1 from jsonb_array_elements(existing_rows) x where x->>'id'=p_id::text or x->>'kimlik'=p_id::text) then
      raise exception 'POSMIST kaydı bulunamadı veya kapsamınıza ait değil.';
    end if;
    -- Empty/missing API key means keep the stored secret unchanged.
    if nullif(trim(coalesce(p_payload->>'api_key',p_payload->>'apiKey','')),'') is null then
      clean := clean - 'api_key' - 'apiKey' - 'api_key_secret' - 'secret_key';
    end if;
    perform public.v19_update_json(array['posmist_entegrasyonları','posmist_entegrasyonlari','posmist_integrations'],p_id,clean || jsonb_build_object('updated_at',now()));
    return p_id;
  end if;
  v_id := public.v19_insert_json(array['posmist_entegrasyonları','posmist_entegrasyonlari','posmist_integrations'],clean || jsonb_build_object('created_at',now(),'deleted_at',null,'silindi_at',null));
  return v_id;
end;
$$;
grant execute on function public.v19_save_posmist(uuid,jsonb) to authenticated;

create or replace function public.v19_delete_posmist(p_id uuid)
returns void
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $$
declare existing_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  if not public.v19_user_has_app_permission('POSMIST_YONET') then raise exception 'POSMIST yönetim izniniz yok.'; end if;
  existing_rows := public.v19_load_posmist();
  if not exists (select 1 from jsonb_array_elements(existing_rows) x where x->>'id'=p_id::text or x->>'kimlik'=p_id::text) then
    raise exception 'POSMIST kaydı bulunamadı veya kapsamınıza ait değil.';
  end if;
  perform public.v19_update_json(array['posmist_entegrasyonları','posmist_entegrasyonlari','posmist_integrations'],p_id,jsonb_build_object('deleted_at',now(),'silindi_at',now(),'enabled',false,'aktif',false,'is_active',false));
end;
$$;
grant execute on function public.v19_delete_posmist(uuid) to authenticated;

-- The sync event ledger and each mutation execute in one DB transaction. Retrying the same
-- event UUID returns the stored result and does not repeat the financial mutation.
create or replace function public.v19_sync_offline_mutation(p_event_id uuid,p_operation text,p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $$
declare inserted_count integer; prior public.v19_offline_sync_events%rowtype; out_result jsonb; uid uuid; operation_key text; payload jsonb; old_invoice jsonb; old_record jsonb; old_type text; new_type text; old_branch uuid; inv_branch uuid; clean jsonb; record_table text; record_id_col text; query_sql text;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Oturum gerekli.'; end if;
  if p_event_id is null then raise exception 'Senkronizasyon olay kimliği zorunludur.'; end if;
  operation_key := coalesce(trim(p_operation),'');
  payload := coalesce(p_payload,'{}'::jsonb);
  if nullif(payload->>'user_id','')::uuid is distinct from uid then raise exception 'Kullanıcı doğrulaması başarısız.'; end if;
  insert into public.v19_offline_sync_events(event_id,user_id,operation,result) values(p_event_id,uid,operation_key,null) on conflict(event_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    select * into prior from public.v19_offline_sync_events where event_id=p_event_id;
    if prior.user_id<>uid or prior.operation<>operation_key then raise exception 'Senkronizasyon kimliği farklı bir işleme ait.'; end if;
    return coalesce(prior.result,jsonb_build_object('duplicate',true,'event_id',p_event_id));
  end if;

  case operation_key
    when 'transaction.create' then
      new_type := coalesce(payload->>'type','');
      if not public.v19_user_has_app_permission(case when public.v19_norm_role(new_type) in ('GELIR','INCOME','TAHSILAT') then 'GELIR_EKLE' else 'GIDER_EKLE' end) then raise exception 'Bu işlem türünü ekleme yetkiniz yok.'; end if;
      out_result := jsonb_build_object('id',public.kasa_create_transaction_v24((payload->>'branch_id')::uuid,payload->>'branch_name',new_type,(payload->>'amount')::numeric,payload->>'description',payload->>'date',uid,payload->>'user_name'));
    when 'transaction.update' then
      new_type := coalesce(payload->>'type','');
      if not public.v19_user_has_app_permission(case when public.v19_norm_role(new_type) in ('GELIR','INCOME','TAHSILAT') then 'GELIR_DUZENLE' else 'GIDER_DUZENLE' end) then raise exception 'Bu işlem türünü düzenleme yetkiniz yok.'; end if;
      record_table := public.v19_pick_table(array['uygulama_islemleri','uygulama_işlemleri','app_transactions','kasa_hareketleri']);
      if record_table is null then raise exception 'Finans işlemleri tablosu bulunamadı.'; end if;
      record_id_col := public.v19_column_name(record_table,array['id','kimlik','kimlik_id']);
      if record_id_col is null then raise exception 'Finans işlemi kimlik alanı bulunamadı.'; end if;
      query_sql := format('select to_jsonb(t) from public.%1$I t where t.%2$I::text=$1 and coalesce(to_jsonb(t)->>''deleted_at'',to_jsonb(t)->>''silindi_at'','''')='''' limit 1',record_table,record_id_col);
      execute query_sql into old_record using payload->>'id';
      old_type := coalesce(old_record->>'tur',old_record->>'tür',old_record->>'type',old_record->>'islem_turu',old_record->>'işlem_türü','');
      old_branch := nullif(coalesce(old_record->>'branch_id',old_record->>'şube_id',old_record->>'sube_id'),'')::uuid;
      if old_record is null then raise exception 'İşlem bulunamadı.'; end if;
      if old_branch is null or not public.can_manage_branch(old_branch) then raise exception 'Mevcut işlemin şubesinde yetkiniz yok.'; end if;
      if not public.v19_user_has_app_permission(case when public.v19_norm_role(old_type) in ('GELIR','INCOME','TAHSILAT') then 'GELIR_DUZENLE' else 'GIDER_DUZENLE' end) then raise exception 'Mevcut işlem türünü düzenleme yetkiniz yok.'; end if;
      if not public.can_manage_branch((payload->>'branch_id')::uuid) then raise exception 'Hedef şubede işlem düzenleme yetkiniz yok.'; end if;
      perform public.kasa_update_transaction_v24((payload->>'id')::uuid,(payload->>'branch_id')::uuid,payload->>'branch_name',new_type,(payload->>'amount')::numeric,payload->>'description',payload->>'date',uid);
      out_result := jsonb_build_object('updated',true,'id',payload->>'id');
    when 'transaction.delete' then
      record_table := public.v19_pick_table(array['uygulama_islemleri','uygulama_işlemleri','app_transactions','kasa_hareketleri']);
      if record_table is null then raise exception 'Finans işlemleri tablosu bulunamadı.'; end if;
      record_id_col := public.v19_column_name(record_table,array['id','kimlik','kimlik_id']);
      if record_id_col is null then raise exception 'Finans işlemi kimlik alanı bulunamadı.'; end if;
      query_sql := format('select to_jsonb(t) from public.%1$I t where t.%2$I::text=$1 and coalesce(to_jsonb(t)->>''deleted_at'',to_jsonb(t)->>''silindi_at'','''')='''' limit 1',record_table,record_id_col);
      execute query_sql into old_record using payload->>'id';
      old_type := coalesce(old_record->>'tur',old_record->>'tür',old_record->>'type',old_record->>'islem_turu',old_record->>'işlem_türü','');
      old_branch := nullif(coalesce(old_record->>'branch_id',old_record->>'şube_id',old_record->>'sube_id'),'')::uuid;
      if old_record is null then raise exception 'İşlem bulunamadı.'; end if;
      if old_branch is null or not public.can_manage_branch(old_branch) then raise exception 'Mevcut işlemin şubesinde silme yetkiniz yok.'; end if;
      if not public.v19_user_has_app_permission(case when public.v19_norm_role(old_type) in ('GELIR','INCOME','TAHSILAT') then 'GELIR_SIL' else 'GIDER_SIL' end) then raise exception 'Bu işlem türünü silme yetkiniz yok.'; end if;
      perform public.kasa_delete_transaction_v24((payload->>'id')::uuid,uid);
      out_result := jsonb_build_object('deleted',true,'id',payload->>'id');
    when 'invoice.create' then
      if not public.v19_user_has_app_permission('FATURA_EKLE') then raise exception 'Fatura ekleme yetkiniz yok.'; end if;
      out_result := jsonb_build_object('id',public.kasa_create_invoice_v24((payload->>'branch_id')::uuid,payload->>'branch_name',payload->>'firma',payload->>'serial',payload->>'content',(payload->>'amount')::numeric,coalesce((payload->>'paid')::numeric,0),payload->>'kdv',payload->>'note',payload->>'date',payload->>'due',payload->>'status',payload->>'currency',uid,payload->>'user_name'));
    when 'invoice.update' then
      if not public.v19_user_has_app_permission('FATURA_DUZENLE') then raise exception 'Fatura düzenleme yetkiniz yok.'; end if;
      record_table := public.v19_pick_table(array['uygulama_faturaları','uygulama_faturalar','app_invoices','faturalar']);
      if record_table is null then raise exception 'Fatura tablosu bulunamadı.'; end if;
      record_id_col := public.v19_column_name(record_table,array['id','kimlik','kimlik_id']);
      if record_id_col is null then raise exception 'Fatura kimlik alanı bulunamadı.'; end if;
      query_sql := format('select to_jsonb(i) from public.%1$I i where i.%2$I::text=$1 and coalesce(to_jsonb(i)->>''deleted_at'',to_jsonb(i)->>''silindi_at'','''')='''' limit 1',record_table,record_id_col);
      execute query_sql into old_invoice using payload->>'id';
      if old_invoice is null then raise exception 'Fatura bulunamadı.'; end if;
      old_branch := nullif(coalesce(old_invoice->>'branch_id',old_invoice->>'şube_id',old_invoice->>'sube_id'),'')::uuid;
      if old_branch is null or not public.can_manage_branch(old_branch) then raise exception 'Mevcut faturanın şubesinde yetkiniz yok.'; end if;
      inv_branch := coalesce(nullif(payload->'payload'->>'branch_id','')::uuid,old_branch);
      if not public.can_manage_branch(inv_branch) then raise exception 'Bu şubede fatura düzenleme yetkiniz yok.'; end if;
      clean := coalesce(payload->'payload','{}'::jsonb) || jsonb_build_object('odenen',coalesce(nullif(old_invoice->>'odenen','')::numeric,0),'paid',coalesce(nullif(old_invoice->>'odenen','')::numeric,0));
      perform public.kasa_update_invoice_v24((payload->>'id')::uuid,clean,uid);
      out_result := jsonb_build_object('updated',true,'id',payload->>'id');
    when 'invoice.delete' then
      if not public.v19_user_has_app_permission('FATURA_SIL') then raise exception 'Fatura silme yetkiniz yok.'; end if;
      perform public.kasa_delete_invoice_v24((payload->>'id')::uuid,uid);
      out_result := jsonb_build_object('deleted',true,'id',payload->>'id');
    when 'invoice.payment' then
      if not public.v19_user_has_app_permission('FATURA_ODEME') then raise exception 'Fatura ödeme yetkiniz yok.'; end if;
      inv_branch := nullif(payload->>'branch_id','')::uuid;
      if inv_branch is null or not public.can_manage_branch(inv_branch) then raise exception 'Bu şubede fatura ödemesi yapma yetkiniz yok.'; end if;
      record_table := public.v19_pick_table(array['uygulama_faturaları','uygulama_faturalar','app_invoices','faturalar']);
      if record_table is null then raise exception 'Fatura tablosu bulunamadı.'; end if;
      record_id_col := public.v19_column_name(record_table,array['id','kimlik','kimlik_id']);
      if record_id_col is null then raise exception 'Fatura kimlik alanı bulunamadı.'; end if;
      query_sql := format('select to_jsonb(i) from public.%1$I i where i.%2$I::text=$1 and coalesce(to_jsonb(i)->>''deleted_at'',to_jsonb(i)->>''silindi_at'','''')='''' limit 1',record_table,record_id_col);
      execute query_sql into old_invoice using payload->>'invoice_id';
      if old_invoice is null then raise exception 'Fatura bulunamadı.'; end if;
      old_branch := nullif(coalesce(old_invoice->>'branch_id',old_invoice->>'şube_id',old_invoice->>'sube_id'),'')::uuid;
      if old_branch is distinct from inv_branch then raise exception 'Fatura şubesi ile ödeme şubesi uyuşmuyor.'; end if;
      if payload->>'method'='Kasa' and not public.v19_user_has_app_permission('GIDER_EKLE') then raise exception 'Kasa üzerinden fatura ödemesi için gider ekleme izni gerekir.'; end if;
      out_result := public.v19_record_invoice_payment((payload->>'invoice_id')::uuid,inv_branch,(payload->>'amount')::numeric,(payload->>'date')::date,payload->>'method',uid,payload->>'user_name');
    when 'cari.create' then
      if not public.v19_user_has_app_permission('CARI_EKLE') then raise exception 'Cari hareket ekleme yetkiniz yok.'; end if;
      out_result := jsonb_build_object('id',public.kasa_create_cari_v24((payload->>'branch_id')::uuid,payload->>'branch_name',payload->>'firma',(payload->>'amount')::numeric,payload->>'description',payload->>'date',uid,payload->>'user_name'));
    when 'cari.update' then
      if not public.v19_user_has_app_permission('CARI_DUZENLE') then raise exception 'Cari hareket düzenleme yetkiniz yok.'; end if;
      perform public.kasa_update_cari_v24((payload->>'id')::uuid,coalesce(payload->'payload','{}'::jsonb),uid);
      out_result := jsonb_build_object('updated',true,'id',payload->>'id');
    when 'cari.delete' then
      if not public.v19_user_has_app_permission('CARI_SIL') then raise exception 'Cari hareket silme yetkiniz yok.'; end if;
      perform public.kasa_delete_cari_v24((payload->>'id')::uuid,uid);
      out_result := jsonb_build_object('deleted',true,'id',payload->>'id');
    when 'notification.read' then
      perform public.v19_mark_notification_read((payload->>'id')::uuid);
      out_result := jsonb_build_object('read',true,'id',payload->>'id');
    when 'notification.clear_read' then
      out_result := jsonb_build_object('deleted_count',public.v19_delete_read_notifications());
    when 'help.submit' then
      out_result := public.submit_help_request(payload->>'subject',payload->>'message');
    else raise exception 'Desteklenmeyen senkronizasyon işlemi: %',operation_key;
  end case;

  update public.v19_offline_sync_events set result=coalesce(out_result,'{}'::jsonb) where event_id=p_event_id and user_id=uid;
  return coalesce(out_result,'{}'::jsonb) || jsonb_build_object('event_id',p_event_id,'queued',false);
end;
$$;
grant execute on function public.v19_sync_offline_mutation(uuid,text,jsonb) to authenticated;

-- Prevent clients from bypassing the checked idempotent RPC by calling legacy mutation RPCs directly.
-- The SECURITY DEFINER sync RPC remains able to invoke the functions as their owner.
revoke execute on function public.kasa_create_transaction_v24(uuid,text,text,numeric,text,text,uuid,text) from public, anon, authenticated;
revoke execute on function public.kasa_update_transaction_v24(uuid,uuid,text,text,numeric,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.kasa_delete_transaction_v24(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.kasa_create_invoice_v24(uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,text,uuid,text) from public, anon, authenticated;
revoke execute on function public.kasa_update_invoice_v24(uuid,jsonb,uuid) from public, anon, authenticated;
revoke execute on function public.kasa_delete_invoice_v24(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.kasa_create_cari_v24(uuid,text,text,numeric,text,text,uuid,text) from public, anon, authenticated;
revoke execute on function public.kasa_update_cari_v24(uuid,jsonb,uuid) from public, anon, authenticated;
revoke execute on function public.kasa_delete_cari_v24(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.v19_record_invoice_payment(uuid,uuid,numeric,date,text,uuid,text) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- The low-level JSON helpers are implementation details for SECURITY DEFINER RPCs, not client APIs.

-- Security-definer endpoints are callable only by authenticated sessions.
revoke all on function public.v19_user_has_app_permission(text) from public, anon;
revoke all on function public.v19_load_posmist() from public, anon;
revoke all on function public.v19_save_posmist(uuid,jsonb) from public, anon;
revoke all on function public.v19_delete_posmist(uuid) from public, anon;
revoke all on function public.v19_sync_offline_mutation(uuid,text,jsonb) from public, anon;
grant execute on function public.v19_user_has_app_permission(text) to authenticated;
grant execute on function public.v19_load_posmist() to authenticated;
grant execute on function public.v19_save_posmist(uuid,jsonb) to authenticated;
grant execute on function public.v19_delete_posmist(uuid) to authenticated;
grant execute on function public.v19_sync_offline_mutation(uuid,text,jsonb) to authenticated;

revoke execute on function public.v19_insert_json(text[],jsonb) from public, anon, authenticated;
revoke execute on function public.v19_update_json(text[],uuid,jsonb) from public, anon, authenticated;

COMMIT;
