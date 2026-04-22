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
  checklist_template text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  history_limit integer not null default 10 check (history_limit > 0),
  timezone text not null default 'Asia/Seoul',
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('check', 'comment')),
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null,
  space_id uuid references public.spaces(id) on delete set null,
  space_name text not null,
  memo text not null default '',
  work_date date not null,
  created_at timestamptz not null default now()
);

insert into public.app_settings (history_limit, timezone)
select 10, 'Asia/Seoul'
where not exists (select 1 from public.app_settings);

alter table public.employees enable row level security;
alter table public.spaces enable row level security;
alter table public.app_settings enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "public read employees" on public.employees;
create policy "public read employees"
on public.employees
for select
to anon, authenticated
using (true);

drop policy if exists "public read spaces" on public.spaces;
create policy "public read spaces"
on public.spaces
for select
to anon, authenticated
using (true);

drop policy if exists "public read settings" on public.app_settings;
create policy "public read settings"
on public.app_settings
for select
to anon, authenticated
using (true);

drop policy if exists "public read logs" on public.activity_logs;
create policy "public read logs"
on public.activity_logs
for select
to anon, authenticated
using (true);

drop policy if exists "public insert employees" on public.employees;
create policy "public insert employees"
on public.employees
for insert
to anon, authenticated
with check (true);

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

drop policy if exists "public insert logs" on public.activity_logs;
create policy "public insert logs"
on public.activity_logs
for insert
to anon, authenticated
with check (true);

drop policy if exists "public delete logs" on public.activity_logs;
create policy "public delete logs"
on public.activity_logs
for delete
to anon, authenticated
using (true);

create index if not exists idx_activity_logs_created_at on public.activity_logs (created_at desc);
create index if not exists idx_activity_logs_space_id on public.activity_logs (space_id);
create index if not exists idx_activity_logs_employee_id on public.activity_logs (employee_id);

