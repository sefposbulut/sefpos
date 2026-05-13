/*
  # Feature Requests Table

  Plan-bazlı ücretli özellikler (Online entegrasyon, vb.) için müşterinin
  ŞefPOS yöneticisine talep göndermesini sağlar. AdminPanel (`/ayka-admin`) bu
  talepleri görür, çözer (planı yükseltir / addon açar) ve `status` günceller.

  Tablolar:
  - `feature_requests` — tenant'ın talep ettiği özellik kayıtları.

  Politikalar:
  - INSERT: Tenant'ın owner/admin'i kendi tenant_id'si için yeni talep ekleyebilir.
  - SELECT: Aynı tenant'ın owner/admin'i veya AYKA superadmin görür.
  - UPDATE: Sadece AYKA superadmin (auth_users.email = aykaroot@sefpos.com) güncelleyebilir.
*/

create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_code text not null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_email text,
  requested_phone text,
  message text,
  status text not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint feature_requests_status_chk check (status in ('pending', 'approved', 'rejected', 'resolved'))
);

create index if not exists feature_requests_tenant_idx on public.feature_requests (tenant_id, status, created_at desc);
create index if not exists feature_requests_status_idx on public.feature_requests (status, created_at desc);

alter table public.feature_requests enable row level security;

-- Tenant owner/admin: kendi tenant'ı için INSERT.
drop policy if exists feature_requests_insert_own on public.feature_requests;
create policy feature_requests_insert_own
  on public.feature_requests
  for insert
  to authenticated
  with check (
    tenant_id in (
      select tenant_id from public.profiles
      where id = auth.uid()
        and role in ('owner', 'sahip', 'admin')
    )
  );

-- Tenant owner/admin: kendi tenant kayıtlarını görür.
drop policy if exists feature_requests_select_own on public.feature_requests;
create policy feature_requests_select_own
  on public.feature_requests
  for select
  to authenticated
  using (
    tenant_id in (
      select tenant_id from public.profiles
      where id = auth.uid()
        and role in ('owner', 'sahip', 'admin')
    )
  );

-- AYKA superadmin: hepsini görür ve günceller.
drop policy if exists feature_requests_select_ayka on public.feature_requests;
create policy feature_requests_select_ayka
  on public.feature_requests
  for select
  to authenticated
  using (
    exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and lower(coalesce(u.email, '')) = 'aykaroot@sefpos.com'
    )
  );

drop policy if exists feature_requests_update_ayka on public.feature_requests;
create policy feature_requests_update_ayka
  on public.feature_requests
  for update
  to authenticated
  using (
    exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and lower(coalesce(u.email, '')) = 'aykaroot@sefpos.com'
    )
  );

comment on table public.feature_requests is 'Tenant tarafından AYKA yöneticisine gönderilen ücretli özellik aktivasyon talepleri.';
comment on column public.feature_requests.feature_code is 'Talep edilen özellik kodu (örn: online_integrations).';
comment on column public.feature_requests.status is 'pending | approved | rejected | resolved';
