-- KASA PRO V19 - KULLANICI ATAMA FIX
-- Mevcut verileri silmez.
-- SUPER_ADMIN kullanıcının işletme/şube/rol atamasını düzeltir.

create or replace function public.superadmin_assign_user(
  p_user_id uuid,
  p_company_id uuid,
  p_branch_id uuid,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Yalnızca SUPER_ADMIN kullanıcı atayabilir.';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Kullanıcı bulunamadı.';
  end if;

  if not exists (select 1 from public.companies where id = p_company_id and is_active = true) then
    raise exception 'İşletme bulunamadı veya pasif.';
  end if;

  if p_branch_id is not null
     and not exists (
       select 1 from public.branches
       where id = p_branch_id
         and company_id = p_company_id
         and is_active = true
     ) then
    raise exception 'Şube seçilen işletmeye ait değil veya pasif.';
  end if;

  insert into public.user_branch_roles(user_id, company_id, branch_id, role)
  values (p_user_id, p_company_id, p_branch_id, p_role::public.app_role)
  on conflict (user_id, company_id, branch_id, role)
  do update set role = excluded.role
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.superadmin_assign_user(uuid,uuid,uuid,text) to authenticated;

-- SUPER_ADMIN için tek şube / tek rol ataması. Aynı kullanıcı bu şubede farklı role sahipse eski rolü kaldırır.
create or replace function public.superadmin_set_branch_user(
  p_user_id uuid,
  p_company_id uuid,
  p_branch_id uuid,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN kullanıcı atayabilir.'; end if;
  if p_branch_id is null then raise exception 'Şube seçilmelidir.'; end if;
  if not exists (select 1 from public.profiles where id=p_user_id) then raise exception 'Kullanıcı bulunamadı.'; end if;
  if not exists (select 1 from public.branches where id=p_branch_id and company_id=p_company_id and is_active=true) then raise exception 'Şube seçilen işletmeye ait değil veya pasif.'; end if;
  delete from public.user_branch_roles where user_id=p_user_id and company_id=p_company_id and branch_id=p_branch_id;
  insert into public.user_branch_roles(user_id,company_id,branch_id,role) values(p_user_id,p_company_id,p_branch_id,p_role::public.app_role) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.superadmin_set_branch_user(uuid,uuid,uuid,text) to authenticated;


create or replace function public.superadmin_remove_user_assignment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Yalnızca SUPER_ADMIN atama kaldırabilir.';
  end if;

  delete from public.user_branch_roles
  where id = p_id;
end;
$$;

grant execute on function public.superadmin_remove_user_assignment(uuid) to authenticated;

-- Eski uygulama sürümleri için geriye dönük uyumluluk.
create or replace function public.v19_assign_user(
  p_user_id uuid,
  p_company_id uuid,
  p_branch_id uuid,
  p_role text
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.superadmin_assign_user(p_user_id,p_company_id,p_branch_id,p_role);
$$;

grant execute on function public.v19_assign_user(uuid,uuid,uuid,text) to authenticated;

create or replace function public.v19_remove_user_assignment(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select public.superadmin_remove_user_assignment(p_id);
$$;

grant execute on function public.v19_remove_user_assignment(uuid) to authenticated;

notify pgrst, 'reload schema';
