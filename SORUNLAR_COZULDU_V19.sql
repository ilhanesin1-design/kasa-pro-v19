-- KASA PRO V19 - TOPLU SORUN DÜZELTME
-- Güvenli: DROP / TRUNCATE / toplu DELETE yok.
-- Mevcut verileri silmez.

-- ============================================================
-- 1) KULLANICI ATAMA - benzersiz constraint gerektirmez
-- ============================================================
create or replace function public.superadmin_assign_user(
  p_user_id uuid,
  p_company_id uuid,
  p_branch_id uuid,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Yalnızca SUPER_ADMIN kullanıcı atayabilir.';
  end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'Kullanıcı bulunamadı.';
  end if;
  if not exists(select 1 from public.companies where id=p_company_id and is_active=true) then
    raise exception 'İşletme bulunamadı veya pasif.';
  end if;
  if p_branch_id is not null and not exists(
    select 1 from public.branches
    where id=p_branch_id and company_id=p_company_id and is_active=true
  ) then
    raise exception 'Şube seçilen işletmeye ait değil veya pasif.';
  end if;

  select id into v_id
  from public.user_branch_roles
  where user_id=p_user_id
    and company_id=p_company_id
    and branch_id is not distinct from p_branch_id
  order by created_at asc
  limit 1;

  if v_id is not null then
    update public.user_branch_roles
    set role=p_role::public.app_role
    where id=v_id;
    return v_id;
  end if;

  insert into public.user_branch_roles(user_id,company_id,branch_id,role)
  values(p_user_id,p_company_id,p_branch_id,p_role::public.app_role)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.superadmin_assign_user(uuid,uuid,uuid,text) to authenticated;

create or replace function public.superadmin_remove_user_assignment(p_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Yalnızca SUPER_ADMIN atama kaldırabilir.';
  end if;
  delete from public.user_branch_roles where id=p_id;
end;
$$;

grant execute on function public.superadmin_remove_user_assignment(uuid) to authenticated;

-- ============================================================
-- 2) FİNANS DÜZENLEME - gerçek tablo: app_transactions
-- ============================================================
create or replace function public.v19_update_transaction(
  p_id uuid,
  p_branch_id uuid,
  p_branch_name text,
  p_type text,
  p_amount numeric,
  p_description text,
  p_date date,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or auth.uid()<>p_user_id then
    raise exception 'Oturum doğrulaması başarısız.';
  end if;
  if p_amount<=0 then raise exception 'Tutar 0’dan büyük olmalıdır.'; end if;
  if not exists(select 1 from public.app_transactions where id=p_id) then
    raise exception 'Finans işlemi bulunamadı.';
  end if;

  update public.app_transactions
  set branch_id=p_branch_id,
      sube=p_branch_name,
      tur=p_type,
      miktar=p_amount,
      tl_karsiligi=p_amount,
      tl_miktar=p_amount,
      aciklama=coalesce(nullif(trim(p_description),''),p_type||' işlemi'),
      tarih=p_date,
      updated_by=p_user_id,
      updated_at=now()
  where id=p_id;
end;
$$;

grant execute on function public.v19_update_transaction(uuid,uuid,text,text,numeric,text,date,uuid) to authenticated;

-- ============================================================
-- 3) FATURA DÜZENLEME - mevcut v19_update_json katmanını kullanır
-- ============================================================
create or replace function public.v19_update_invoice(
  p_id uuid,
  p_payload jsonb,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if auth.uid() is null or auth.uid()<>p_user_id then
    raise exception 'Oturum doğrulaması başarısız.';
  end if;
  if not exists(select 1 from public.app_invoices where id=p_id) then
    raise exception 'Fatura bulunamadı.';
  end if;
  perform public.v19_update_json(
    array['app_invoices'],
    p_id,
    p_payload || jsonb_build_object('updated_by',p_user_id,'updated_at',now())
  );
end;
$$;

grant execute on function public.v19_update_invoice(uuid,jsonb,uuid) to authenticated;

-- ============================================================
-- 4) BİLDİRİMLER - gerçek tablo: notifications
-- ============================================================
create or replace function public.v19_submit_help_request(
  p_subject text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  me public.profiles%rowtype;
  recipient uuid;
  sent integer:=0;
  payload text;
begin
  if auth.uid() is null then raise exception 'Oturum gerekli.'; end if;
  if nullif(trim(p_subject),'') is null then raise exception 'Konu zorunludur.'; end if;
  if nullif(trim(p_message),'') is null then raise exception 'Mesaj zorunludur.'; end if;

  select * into me from public.profiles where id=auth.uid();

  payload := '[KASA_HELP_V3]' || json_build_object(
    'sender_id',auth.uid(),
    'sender_name',coalesce(me.full_name,''),
    'sender_email',coalesce(me.email,''),
    'sender_phone',coalesce(me.phone,''),
    'subject',left(trim(p_subject),160),
    'message',left(trim(p_message),5000)
  )::text;

  for recipient in
    select distinct p.id
    from public.profiles p
    where upper(regexp_replace(coalesce(p.role,''),'[^A-Za-z0-9]+','_','g')) in
      ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR')
    union
    select distinct r.user_id
    from public.user_branch_roles r
    where upper(regexp_replace(coalesce(r.role::text,''),'[^A-Za-z0-9]+','_','g')) in
      ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR')
    union
    select u.id
    from auth.users u
    where upper(regexp_replace(coalesce(u.raw_app_meta_data->>'role',u.raw_user_meta_data->>'role',''),'[^A-Za-z0-9]+','_','g')) in
      ('SUPER_ADMIN','SUPERADMIN','PLATFORM_ADMIN','SUPER_ADMINISTRATOR')
  loop
    insert into public.notifications(user_id,title,message,is_read,created_at)
    values(recipient,'Yeni yardım talebi',payload,false,now());
    sent:=sent+1;
  end loop;

  if sent=0 then raise exception 'SUPER_ADMIN hesabı bulunamadı.'; end if;
  return jsonb_build_object('sent_to',sent);
end;
$$;

grant execute on function public.v19_submit_help_request(text,text) to authenticated;

create or replace function public.v19_load_notifications()
returns jsonb
language sql
security definer
stable
set search_path=public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',n.id,
        'title',n.title,
        'message',n.message,
        'is_read',n.is_read,
        'created_at',n.created_at
      ) order by n.created_at desc
    ),
    '[]'::jsonb
  )
  from public.notifications n
  where n.user_id=auth.uid()
    and public.is_super_admin();
$$;

grant execute on function public.v19_load_notifications() to authenticated;

create or replace function public.v19_mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_super_admin() then raise exception 'Yetkisiz.'; end if;
  update public.notifications
  set is_read=true
  where id=p_id and user_id=auth.uid();
end;
$$;

grant execute on function public.v19_mark_notification_read(uuid) to authenticated;

-- ============================================================
-- 5) GEREKLİ RLS / ŞEMA YENİLEME
-- ============================================================
alter table if exists public.notifications enable row level security;

do $$
begin
  if not exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='notifications' and policyname='v19_notifications_select_self'
  ) then
    create policy v19_notifications_select_self
      on public.notifications for select to authenticated
      using (user_id=auth.uid());
  end if;

  if not exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='notifications' and policyname='v19_notifications_update_self'
  ) then
    create policy v19_notifications_update_self
      on public.notifications for update to authenticated
      using (user_id=auth.uid())
      with check (user_id=auth.uid());
  end if;
end $$;

notify pgrst, 'reload schema';
