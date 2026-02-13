-- Run this only if you already applied 20260213120000_add_billings_module.sql before it had client_id and overdue trigger.
-- Adds client_id FK, index, and auto-overdue trigger.

alter table public.billings
  add column if not exists client_id uuid null references public.clients(id) on delete set null;

create index if not exists idx_billings_client_id on public.billings(client_id);

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

update public.billings
set status = 'overdue'
where status = 'pending' and due_date is not null and due_date::date < current_date;
