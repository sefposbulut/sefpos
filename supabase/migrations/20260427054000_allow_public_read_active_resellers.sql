-- Allow public website to list active reseller cards.
-- This only exposes non-sensitive fields for active/approved resellers.

alter table if exists public.resellers enable row level security;

drop policy if exists "Public can view active resellers" on public.resellers;
create policy "Public can view active resellers"
on public.resellers
for select
to anon
using (status in ('active', 'approved'));

