-- Permanent cleanup rules for waiter/courier deactivation/deletion.
-- This migration supports both schemas:
-- 1) profiles-based waiter users
-- 2) legacy waiters table

create or replace function public.cleanup_waiter_device_access_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trigger only for waiter/courier profile deactivation or deletion.
  if tg_op = 'UPDATE' then
    if coalesce(new.role, '') not in ('waiter', 'courier') then
      return new;
    end if;
    if coalesce(old.is_active, true) = true and coalesce(new.is_active, true) = false then
      if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'device_bindings') then
        update public.device_bindings
        set status = 'inactive'
        where tenant_id = new.tenant_id
          and waiter_id = new.id
          and status = 'active';
      end if;

      if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'device_binding_requests') then
        update public.device_binding_requests
        set status = 'rejected'
        where tenant_id = new.tenant_id
          and waiter_id = new.id
          and status in ('pending', 'accepted');
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if coalesce(old.role, '') not in ('waiter', 'courier') then
      return old;
    end if;

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'device_bindings') then
      update public.device_bindings
      set status = 'inactive'
      where tenant_id = old.tenant_id
        and waiter_id = old.id
        and status = 'active';
    end if;

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'device_binding_requests') then
      update public.device_binding_requests
      set status = 'rejected'
      where tenant_id = old.tenant_id
        and waiter_id = old.id
        and status in ('pending', 'accepted');
    end if;

    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_cleanup_waiter_device_access_on_profile_update on public.profiles;
create trigger trg_cleanup_waiter_device_access_on_profile_update
after update of is_active, role on public.profiles
for each row
execute function public.cleanup_waiter_device_access_on_profile_change();

drop trigger if exists trg_cleanup_waiter_device_access_on_profile_delete on public.profiles;
create trigger trg_cleanup_waiter_device_access_on_profile_delete
after delete on public.profiles
for each row
execute function public.cleanup_waiter_device_access_on_profile_change();

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'device_bindings') then
    create or replace function public.guard_active_waiter_binding()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    declare
      v_profile record;
    begin
      if new.status <> 'active' then
        return new;
      end if;

      -- If this waiter_id belongs to profiles schema, block active binding for inactive profile.
      if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
        select id, role, is_active
          into v_profile
        from public.profiles
        where id = new.waiter_id
        limit 1;

        if v_profile.id is not null then
          if coalesce(v_profile.role, '') in ('waiter', 'courier') and coalesce(v_profile.is_active, true) = false then
            raise exception 'Cannot activate binding: waiter/courier profile is inactive';
          end if;
        end if;
      end if;

      return new;
    end;
    $fn$;

    drop trigger if exists trg_guard_active_waiter_binding on public.device_bindings;
    create trigger trg_guard_active_waiter_binding
    before insert or update of status on public.device_bindings
    for each row
    execute function public.guard_active_waiter_binding();
  end if;
end $$;
