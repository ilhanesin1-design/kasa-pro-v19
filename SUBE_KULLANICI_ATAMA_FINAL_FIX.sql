-- KASA PRO V19 FINAL - SUPER_ADMIN ŞUBE KULLANICI ATAMA
-- Bu dosyayı Supabase SQL Editor'da bir kez çalıştırın.
-- Aynı kullanıcı aynı şubede yalnızca tek rol taşır.

create or replace function public.superadmin_set_branch_user(
  p_user_id uuid, p_company_id uuid, p_branch_id uuid, p_role text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Yalnızca SUPER_ADMIN kullanıcı atayabilir.'; end if;
  if p_branch_id is null then raise exception 'Şube seçilmelidir.'; end if;
  if not exists (select 1 from public.profiles where id=p_user_id) then raise exception 'Kullanıcı bulunamadı.'; end if;
  if not exists (select 1 from public.companies where id=p_company_id and is_active=true) then raise exception 'İşletme bulunamadı veya pasif.'; end if;
  if not exists (select 1 from public.branches where id=p_branch_id and company_id=p_company_id and is_active=true) then raise exception 'Şube seçilen işletmeye ait değil veya pasif.'; end if;
  delete from public.user_branch_roles where user_id=p_user_id and company_id=p_company_id and branch_id=p_branch_id;
  insert into public.user_branch_roles(user_id,company_id,branch_id,role) values(p_user_id,p_company_id,p_branch_id,p_role::public.app_role) returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.superadmin_set_branch_user(uuid,uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
