-- Stock movement log for purchase/entry tracking

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('in', 'out', 'adjustment')),
  quantity numeric(10,2) not null,
  unit_cost numeric(10,2),
  total_cost numeric(12,2),
  supplier_name text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_tenant_created
  on public.stock_movements (tenant_id, created_at desc);

create index if not exists idx_stock_movements_product
  on public.stock_movements (product_id, created_at desc);

alter table public.stock_movements enable row level security;

drop policy if exists "Anyone can read stock movements" on public.stock_movements;
drop policy if exists "Anyone can write stock movements" on public.stock_movements;

create policy "Anyone can read stock movements"
  on public.stock_movements for select
  using (true);

create policy "Anyone can write stock movements"
  on public.stock_movements for all
  using (true)
  with check (true);
