-- TODO LISTS
create table if not exists public.todo_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid null references public.projects (id) on delete set null,
  title text not null,
  description text null,
  color text null,
  position int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TODO ITEMS
create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  list_id uuid not null references public.todo_lists (id) on delete cascade,
  content text not null,
  is_done boolean not null default false,
  due_date date null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_todo_lists_owner on public.todo_lists(owner_id);
create index if not exists idx_todo_lists_project on public.todo_lists(project_id);
create index if not exists idx_todo_items_list on public.todo_items(list_id);
create index if not exists idx_todo_items_owner on public.todo_items(owner_id);

-- updated_at triggers (reusing existing function)
create trigger if not exists trg_todo_lists_updated
before update on public.todo_lists
for each row execute function update_updated_at_column();

create trigger if not exists trg_todo_items_updated
before update on public.todo_items
for each row execute function update_updated_at_column();

-- RLS
alter table public.todo_lists enable row level security;
alter table public.todo_items enable row level security;

-- LISTS: solo dueño
create policy "todo_lists_select_own"
on public.todo_lists for select
using (owner_id = auth.uid());

create policy "todo_lists_insert_own"
on public.todo_lists for insert
with check (owner_id = auth.uid());

create policy "todo_lists_update_own"
on public.todo_lists for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "todo_lists_delete_own"
on public.todo_lists for delete
using (owner_id = auth.uid());

-- ITEMS: solo dueño + list pertenece al dueño (doble seguridad)
create policy "todo_items_select_own"
on public.todo_items for select
using (owner_id = auth.uid());

create policy "todo_items_insert_own"
on public.todo_items for insert
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.todo_lists l
    where l.id = todo_items.list_id
      and l.owner_id = auth.uid()
  )
);

create policy "todo_items_update_own"
on public.todo_items for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "todo_items_delete_own"
on public.todo_items for delete
using (owner_id = auth.uid());
