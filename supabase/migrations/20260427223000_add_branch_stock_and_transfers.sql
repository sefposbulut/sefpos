-- Branch-based stock balances and inter-branch transfer fields

create table if not exists public.branch_product_stocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(10,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch_id, product_id)
);

create index if not exists idx_branch_product_stocks_tenant_branch
  on public.branch_product_stocks (tenant_id, branch_id);

create index if not exists idx_branch_product_stocks_product
  on public.branch_product_stocks (product_id);

alter table public.branch_product_stocks enable row level security;

drop policy if exists "Anyone can read branch stocks" on public.branch_product_stocks;
drop policy if exists "Anyone can write branch stocks" on public.branch_product_stocks;

create policy "Anyone can read branch stocks"
  on public.branch_product_stocks for select
  using (true);

create policy "Anyone can write branch stocks"
  on public.branch_product_stocks for all
  using (true)
  with check (true);

alter table public.stock_movements
  add column if not exists source_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists target_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists reference_type text,
  add column if not exists reference_no text;

create index if not exists idx_stock_movements_source_branch
  on public.stock_movements (source_branch_id, created_at desc);

create index if not exists idx_stock_movements_target_branch
  on public.stock_movements (target_branch_id, created_at desc);
