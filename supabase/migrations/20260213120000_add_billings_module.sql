-- Billing tracking module (bookkeeping only)
-- client_id: optional FK to clients (when user selects existing client)
-- client_name: used when client_id is null (custom/client not in system)
-- project_id: optional FK to projects (can charge to project or leave as custom charge)
create table if not exists public.billings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid null references public.clients(id) on delete set null,
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

-- Add client_id if table was created by an earlier version (before client relation)
alter table public.billings
  add column if not exists client_id uuid null references public.clients(id) on delete set null;

create index if not exists idx_billings_owner_id on public.billings(owner_id);
create index if not exists idx_billings_client_id on public.billings(client_id);
create index if not exists idx_billings_project_id on public.billings(project_id);
create index if not exists idx_billings_status on public.billings(status);
create index if not exists idx_billings_due_date on public.billings(due_date);

drop trigger if exists update_billings_updated_at on public.billings;
create trigger update_billings_updated_at
  before update on public.billings
  for each row execute function public.update_updated_at_column();

-- Auto-set status to overdue when due_date has passed (on insert and update)
create or replace function public.set_billing_overdue_if_due()
returns trigger as $$
begin
  if new.status = 'pending' and new.due_date is not null and new.due_date::date < current_date then
    new.status := 'overdue';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_billing_overdue_trigger on public.billings;
create trigger set_billing_overdue_trigger
  before insert or update on public.billings
  for each row execute function public.set_billing_overdue_if_due();

-- Fix existing rows that are past due
update public.billings
set status = 'overdue'
where status = 'pending' and due_date is not null and due_date::date < current_date;

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
