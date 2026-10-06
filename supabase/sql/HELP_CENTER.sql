-- KASA PRO V19 - Yardım Merkezi
-- Güvenli, veri silmeden yalnızca kullanıcının gönderdiği yardım talebini
-- SUPER_ADMIN hesaplarının notifications tablosuna iletir.
-- Bu script mevcut finansal kayıtları değiştirmez.

create or replace function public.submit_help_request(p_subject text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
  recipient uuid;
  sent_count integer := 0;
  payload text;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli.';
  end if;
  if coalesce(trim(p_subject),'') = '' then
    raise exception 'Konu zorunludur.';
  end if;
  if coalesce(trim(p_message),'') = '' then
    raise exception 'Mesaj zorunludur.';
  end if;

  select * into me from public.profiles where id = auth.uid();

  payload := '[KASA_HELP_V1]' || json_build_object(
    'sender_id', auth.uid(),
    'sender_name', coalesce(me.full_name, ''),
    'sender_email', coalesce(me.email, ''),
    'sender_phone', coalesce(me.phone, ''),
    'subject', left(trim(p_subject), 160),
    'message', left(trim(p_message), 5000)
  )::text;

  for recipient in
    select distinct user_id
    from public.user_branch_roles
    where role = 'SUPER_ADMIN'
  loop
    insert into public.notifications(user_id, title, message, is_read)
    values (recipient, 'Yeni yardım talebi', payload, false);
    sent_count := sent_count + 1;
  end loop;

  if sent_count = 0 then
    raise exception 'SUPER_ADMIN hesabı bulunamadı.';
  end if;

  return jsonb_build_object('sent_to', sent_count);
end;
$$;

grant execute on function public.submit_help_request(text,text) to authenticated;
