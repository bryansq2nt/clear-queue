-- Billing tracking module (bookkeeping only)
create table if not exists public.billings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  title text not null,
  client_name text null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  due_date date null,
  paid_at timestamptz null,
  notes text null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_billings_owner_id on public.billings(owner_id);
create index if not exists idx_billings_project_id on public.billings(project_id);
create index if not exists idx_billings_status on public.billings(status);
create index if not exists idx_billings_due_date on public.billings(due_date);

drop trigger if exists update_billings_updated_at on public.billings;
create trigger update_billings_updated_at
  before update on public.billings
  for each row execute function public.update_updated_at_column();

alter table public.billings enable row level security;

create policy "Users can view own billings"
  on public.billings for select
  using (auth.uid() = owner_id);

create policy "Users can create own billings"
  on public.billings for insert
  with check (auth.uid() = owner_id);

create policy "Users can update own billings"
  on public.billings for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete own billings"
  on public.billings for delete
  using (auth.uid() = owner_id);
