create extension if not exists "pgcrypto";

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  open_checklist_template text not null default '',
  close_checklist_template text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.spaces add column if not exists open_checklist_template text not null default '';
alter table public.spaces add column if not exists close_checklist_template text not null default '';
alter table public.spaces add column if not exists is_active boolean not null default true;
alter table public.spaces add column if not exists sort_order integer not null default 1;
alter table public.spaces add column if not exists created_at timestamptz not null default now();

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  history_limit integer not null default 10 check (history_limit > 0),
  timezone text not null default 'Asia/Seoul',
  show_employee_name boolean not null default true,
  admin_password text not null default '8883',
  updated_at timestamptz not null default now()
);

alter table public.app_settings add column if not exists history_limit integer not null default 10;
alter table public.app_settings add column if not exists timezone text not null default 'Asia/Seoul';
alter table public.app_settings add column if not exists show_employee_name boolean not null default true;
alter table public.app_settings add column if not exists admin_password text not null default '8883';
alter table public.app_settings add column if not exists updated_at timestamptz not null default now();

create table if not exists public.current_checks (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  checklist_type text not null check (checklist_type in ('open', 'close')),
  space_id uuid not null references public.spaces(id) on delete cascade,
  space_name text not null,
  checked boolean not null default false,
  comment text not null default '',
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null default '',
  updated_at timestamptz not null default now(),
  unique (work_date, checklist_type, space_id)
);

create table if not exists public.archived_checks (
  id uuid primary key default gen_random_uuid(),
  archive_date date not null,
  checklist_type text not null check (checklist_type in ('open', 'close')),
  space_id uuid references public.spaces(id) on delete cascade,
  space_name text not null,
  checked boolean not null default false,
  comment text not null default '',
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null default '',
  sort_order integer not null default 1,
  archived_at timestamptz not null default now()
);

drop table if exists public.activity_logs;

insert into public.app_settings (history_limit, timezone, show_employee_name, admin_password)
select 10, 'Asia/Seoul', true, '8883'
where not exists (select 1 from public.app_settings);

update public.app_settings
set show_employee_name = coalesce(show_employee_name, true),
    admin_password = coalesce(admin_password, '8883'),
    updated_at = coalesce(updated_at, now());

update public.spaces
set open_checklist_template = coalesce(open_checklist_template, ''),
    close_checklist_template = coalesce(close_checklist_template, ''),
    sort_order = coalesce(sort_order, 1);

alter table public.employees enable row level security;
alter table public.spaces enable row level security;
alter table public.app_settings enable row level security;
alter table public.current_checks enable row level security;
alter table public.archived_checks enable row level security;

drop policy if exists "public read employees" on public.employees;
create policy "public read employees"
on public.employees
for select
to anon, authenticated
using (true);

drop policy if exists "public write employees" on public.employees;
create policy "public write employees"
on public.employees
for insert
to anon, authenticated
with check (true);

drop policy if exists "public delete employees" on public.employees;
create policy "public delete employees"
on public.employees
for delete
to anon, authenticated
using (true);

drop policy if exists "public read spaces" on public.spaces;
create policy "public read spaces"
on public.spaces
for select
to anon, authenticated
using (true);

drop policy if exists "public insert spaces" on public.spaces;
create policy "public insert spaces"
on public.spaces
for insert
to anon, authenticated
with check (true);

drop policy if exists "public update spaces" on public.spaces;
create policy "public update spaces"
on public.spaces
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public delete spaces" on public.spaces;
create policy "public delete spaces"
on public.spaces
for delete
to anon, authenticated
using (true);

drop policy if exists "public read settings" on public.app_settings;
create policy "public read settings"
on public.app_settings
for select
to anon, authenticated
using (true);

drop policy if exists "public insert settings" on public.app_settings;
create policy "public insert settings"
on public.app_settings
for insert
to anon, authenticated
with check (true);

drop policy if exists "public update settings" on public.app_settings;
create policy "public update settings"
on public.app_settings
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public read current checks" on public.current_checks;
create policy "public read current checks"
on public.current_checks
for select
to anon, authenticated
using (true);

drop policy if exists "public insert current checks" on public.current_checks;
create policy "public insert current checks"
on public.current_checks
for insert
to anon, authenticated
with check (true);

drop policy if exists "public update current checks" on public.current_checks;
create policy "public update current checks"
on public.current_checks
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public delete current checks" on public.current_checks;
create policy "public delete current checks"
on public.current_checks
for delete
to anon, authenticated
using (true);

drop policy if exists "public read archived checks" on public.archived_checks;
create policy "public read archived checks"
on public.archived_checks
for select
to anon, authenticated
using (true);

drop policy if exists "public insert archived checks" on public.archived_checks;
create policy "public insert archived checks"
on public.archived_checks
for insert
to anon, authenticated
with check (true);

drop policy if exists "public delete archived checks" on public.archived_checks;
create policy "public delete archived checks"
on public.archived_checks
for delete
to anon, authenticated
using (true);

create index if not exists idx_spaces_sort_order on public.spaces (sort_order);
create index if not exists idx_current_checks_date_type on public.current_checks (work_date, checklist_type);
create index if not exists idx_archived_checks_date_type on public.archived_checks (archive_date, checklist_type);
