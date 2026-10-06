-- KASA PRO V19 - SUPER_ADMIN KAPSAM + BİLDİRİM UYUMLULUK DÜZELTMESİ
-- Güvenli: DROP/TRUNCATE/DELETE yok.

-- 1) SUPER_ADMIN işletme listesi
create or replace function public.v19_get_companies()
returns table(id uuid,name text,tax_number text,phone text,email text,address text,is_active boolean)
language plpgsql security definer set search_path=public,auth
as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  return query
  select c.id,c.name,c.tax_number,c.phone,c.email,c.address,c.is_active
  from public.companies c
  order by c.name;
end;
$$;
grant execute on function public.v19_get_companies() to authenticated;

-- 2) SUPER_ADMIN şube listesi - her şube yalnızca bir kez döner
create or replace function public.v19_get_branches()
returns table(id uuid,company_id uuid,name text,code text,phone text,email text,address text,city text,district text,latitude numeric,longitude numeric,is_active boolean)
language plpgsql security definer set search_path=public,auth
as $$
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN.'; end if;
  return query
  select b.id,b.company_id,b.name,b.code,b.phone,b.email,b.address,b.city,b.district,b.latitude,b.longitude,b.is_active
  from public.branches b
  order by b.company_id,b.name;
end;
$$;
grant execute on function public.v19_get_branches() to authenticated;

-- 3) Uygulamanın kullandığı eski isimleri gerçek fonksiyonlara bağla
create or replace function public.v19_submit_help_request(p_subject text,p_message text)
returns jsonb
language sql security definer set search_path=public,auth
as $$
  select public.submit_help_request(p_subject,p_message);
$$;
grant execute on function public.v19_submit_help_request(text,text) to authenticated;

-- 4) Bildirimleri SUPER_ADMIN'in kendi hesabına gönderilen kayıtlar olarak oku
create or replace function public.v19_load_notifications()
returns table(id uuid,title text,message text,is_read boolean,created_at timestamptz)
language sql security definer stable set search_path=public,auth
as $$
  select n.id,n.title,n.message,n.is_read,n.created_at
  from public.notifications n
  where n.user_id=auth.uid()
  order by n.created_at desc
  limit 100;
$$;
grant execute on function public.v19_load_notifications() to authenticated;

create or replace function public.v19_mark_notification_read(p_id uuid)
returns void
language sql security definer set search_path=public,auth
as $$
  update public.notifications
  set is_read=true
  where id=p_id and user_id=auth.uid();
$$;
grant execute on function public.v19_mark_notification_read(uuid) to authenticated;

-- 5) Bildirim RLS: kullanıcının kendi bildirimlerini okumasına/güncellemesine izin ver.
alter table public.notifications enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_select_self') then
    create policy notifications_select_self on public.notifications
      for select to authenticated using (user_id=auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_update_self') then
    create policy notifications_update_self on public.notifications
      for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
  end if;
end $$;

notify pgrst, 'reload schema';
