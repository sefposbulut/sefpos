-- Permanent deletion support for admin panel notifications
-- Grants super-admin DELETE access on support_notifications.

alter table if exists public.support_notifications enable row level security;

drop policy if exists "Super admin can delete all notifications" on public.support_notifications;
create policy "Super admin can delete all notifications"
on public.support_notifications
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_super_admin = true
  )
);

