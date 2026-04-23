create extension if not exists "pgcrypto";

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.employees add column if not exists is_active boolean not null default true;
alter table public.employees add column if not exists sort_order integer not null default 1;
alter table public.employees add column if not exists created_at timestamptz not null default now();

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  open_checklist_template text not null default '',
  always_checklist_template text not null default '',
  close_checklist_template text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.spaces add column if not exists open_checklist_template text not null default '';
alter table public.spaces add column if not exists always_checklist_template text not null default '';
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
  last_daily_archive_date date,
  updated_at timestamptz not null default now()
);

alter table public.app_settings add column if not exists history_limit integer not null default 10;
alter table public.app_settings add column if not exists timezone text not null default 'Asia/Seoul';
alter table public.app_settings add column if not exists show_employee_name boolean not null default true;
alter table public.app_settings add column if not exists admin_password text not null default '8883';
alter table public.app_settings add column if not exists last_daily_archive_date date;
alter table public.app_settings add column if not exists updated_at timestamptz not null default now();

create table if not exists public.current_checks (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  checklist_type text not null,
  space_id uuid not null references public.spaces(id) on delete cascade,
  space_name text not null,
  checked boolean not null default false,
  comment text not null default '',
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null default '',
  comment_employee_id uuid references public.employees(id) on delete set null,
  comment_employee_name text not null default '',
  updated_at timestamptz not null default now(),
  unique (work_date, checklist_type, space_id)
);

alter table public.current_checks drop constraint if exists current_checks_checklist_type_check;
alter table public.current_checks
  add constraint current_checks_checklist_type_check
  check (checklist_type in ('open', 'always', 'close'));

alter table public.current_checks add column if not exists comment text not null default '';
alter table public.current_checks add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.current_checks add column if not exists employee_name text not null default '';
alter table public.current_checks add column if not exists comment_employee_id uuid references public.employees(id) on delete set null;
alter table public.current_checks add column if not exists comment_employee_name text not null default '';
alter table public.current_checks add column if not exists updated_at timestamptz not null default now();

create table if not exists public.current_category_checks (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  checklist_type text not null,
  space_id uuid not null references public.spaces(id) on delete cascade,
  space_name text not null,
  category_key text not null,
  category_label text not null default '',
  checked boolean not null default false,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null default '',
  updated_at timestamptz not null default now(),
  unique (work_date, checklist_type, space_id, category_key)
);

alter table public.current_category_checks drop constraint if exists current_category_checks_checklist_type_check;
alter table public.current_category_checks
  add constraint current_category_checks_checklist_type_check
  check (checklist_type in ('open', 'close'));

alter table public.current_category_checks add column if not exists category_key text not null default '';
alter table public.current_category_checks add column if not exists category_label text not null default '';
alter table public.current_category_checks add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.current_category_checks add column if not exists employee_name text not null default '';
alter table public.current_category_checks add column if not exists updated_at timestamptz not null default now();
create unique index if not exists idx_current_category_checks_unique
on public.current_category_checks (work_date, checklist_type, space_id, category_key);

create table if not exists public.current_comments (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  checklist_type text not null,
  space_id uuid not null references public.spaces(id) on delete cascade,
  space_name text not null,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.current_comments drop constraint if exists current_comments_checklist_type_check;
alter table public.current_comments
  add constraint current_comments_checklist_type_check
  check (checklist_type in ('open', 'always', 'close', 'shared'));

alter table public.current_comments add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.current_comments add column if not exists employee_name text not null default '';
alter table public.current_comments add column if not exists content text not null default '';
alter table public.current_comments add column if not exists created_at timestamptz not null default now();
alter table public.current_comments add column if not exists updated_at timestamptz not null default now();

create table if not exists public.archived_checks (
  id uuid primary key default gen_random_uuid(),
  archive_date date not null,
  checklist_type text not null,
  space_id uuid references public.spaces(id) on delete cascade,
  space_name text not null,
  checked boolean not null default false,
  comment text not null default '',
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null default '',
  comment_employee_id uuid references public.employees(id) on delete set null,
  comment_employee_name text not null default '',
  sort_order integer not null default 1,
  archived_at timestamptz not null default now()
);

alter table public.archived_checks drop constraint if exists archived_checks_checklist_type_check;
alter table public.archived_checks
  add constraint archived_checks_checklist_type_check
  check (checklist_type in ('open', 'always', 'close'));

alter table public.archived_checks add column if not exists comment text not null default '';
alter table public.archived_checks add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.archived_checks add column if not exists employee_name text not null default '';
alter table public.archived_checks add column if not exists comment_employee_id uuid references public.employees(id) on delete set null;
alter table public.archived_checks add column if not exists comment_employee_name text not null default '';
alter table public.archived_checks add column if not exists sort_order integer not null default 1;
alter table public.archived_checks add column if not exists archived_at timestamptz not null default now();

create table if not exists public.archived_comments (
  id uuid primary key default gen_random_uuid(),
  archive_date date not null,
  checklist_type text not null,
  space_id uuid references public.spaces(id) on delete cascade,
  space_name text not null,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null default '',
  content text not null default '',
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz not null default now()
);

alter table public.archived_comments drop constraint if exists archived_comments_checklist_type_check;
alter table public.archived_comments
  add constraint archived_comments_checklist_type_check
  check (checklist_type in ('open', 'always', 'close', 'shared'));

alter table public.archived_comments add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.archived_comments add column if not exists employee_name text not null default '';
alter table public.archived_comments add column if not exists content text not null default '';
alter table public.archived_comments add column if not exists sort_order integer not null default 1;
alter table public.archived_comments add column if not exists created_at timestamptz not null default now();
alter table public.archived_comments add column if not exists updated_at timestamptz not null default now();
alter table public.archived_comments add column if not exists archived_at timestamptz not null default now();

drop table if exists public.activity_logs;

insert into public.app_settings (history_limit, timezone, show_employee_name, admin_password)
select 10, 'Asia/Seoul', true, '8883'
where not exists (select 1 from public.app_settings);

update public.app_settings
set show_employee_name = coalesce(show_employee_name, true),
    admin_password = coalesce(admin_password, '8883'),
    updated_at = coalesce(updated_at, now());

update public.employees
set sort_order = coalesce(sort_order, 1),
    created_at = coalesce(created_at, now());

with ordered_employees as (
  select id, row_number() over (order by sort_order, created_at, id) as next_order
  from public.employees
  where is_active = true
)
update public.employees employees
set sort_order = ordered_employees.next_order
from ordered_employees
where employees.id = ordered_employees.id;

update public.spaces
set open_checklist_template = coalesce(open_checklist_template, ''),
    always_checklist_template = coalesce(always_checklist_template, ''),
    close_checklist_template = coalesce(close_checklist_template, ''),
    sort_order = coalesce(sort_order, 1),
    created_at = coalesce(created_at, now());

with ordered_spaces as (
  select id, row_number() over (order by sort_order, created_at, id) as next_order
  from public.spaces
  where is_active = true
)
update public.spaces spaces
set sort_order = ordered_spaces.next_order
from ordered_spaces
where spaces.id = ordered_spaces.id;

insert into public.current_comments (
  work_date,
  checklist_type,
  space_id,
  space_name,
  employee_id,
  employee_name,
  content,
  created_at,
  updated_at
)
select
  current_checks.work_date,
  'shared',
  current_checks.space_id,
  current_checks.space_name,
  current_checks.comment_employee_id,
  coalesce(current_checks.comment_employee_name, ''),
  current_checks.comment,
  coalesce(current_checks.updated_at, now()),
  coalesce(current_checks.updated_at, now())
from public.current_checks
where coalesce(trim(current_checks.comment), '') <> ''
  and not exists (
    select 1
    from public.current_comments
    where public.current_comments.work_date = current_checks.work_date
      and public.current_comments.space_id = current_checks.space_id
      and public.current_comments.content = current_checks.comment
  );

insert into public.archived_comments (
  archive_date,
  checklist_type,
  space_id,
  space_name,
  employee_id,
  employee_name,
  content,
  sort_order,
  created_at,
  updated_at,
  archived_at
)
select
  archived_checks.archive_date,
  'shared',
  archived_checks.space_id,
  archived_checks.space_name,
  archived_checks.comment_employee_id,
  coalesce(archived_checks.comment_employee_name, ''),
  archived_checks.comment,
  coalesce(archived_checks.sort_order, 1),
  coalesce(archived_checks.archived_at, now()),
  coalesce(archived_checks.archived_at, now()),
  coalesce(archived_checks.archived_at, now())
from public.archived_checks
where coalesce(trim(archived_checks.comment), '') <> ''
  and not exists (
    select 1
    from public.archived_comments
    where public.archived_comments.archive_date = archived_checks.archive_date
      and public.archived_comments.space_id = archived_checks.space_id
      and public.archived_comments.content = archived_checks.comment
  );

alter table public.employees enable row level security;
alter table public.spaces enable row level security;
alter table public.app_settings enable row level security;
alter table public.current_checks enable row level security;
alter table public.current_category_checks enable row level security;
alter table public.current_comments enable row level security;
alter table public.archived_checks enable row level security;
alter table public.archived_comments enable row level security;

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

drop policy if exists "public update employees" on public.employees;
create policy "public update employees"
on public.employees
for update
to anon, authenticated
using (true)
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

drop policy if exists "public read current category checks" on public.current_category_checks;
create policy "public read current category checks"
on public.current_category_checks
for select
to anon, authenticated
using (true);

drop policy if exists "public insert current category checks" on public.current_category_checks;
create policy "public insert current category checks"
on public.current_category_checks
for insert
to anon, authenticated
with check (true);

drop policy if exists "public update current category checks" on public.current_category_checks;
create policy "public update current category checks"
on public.current_category_checks
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public delete current category checks" on public.current_category_checks;
create policy "public delete current category checks"
on public.current_category_checks
for delete
to anon, authenticated
using (true);

drop policy if exists "public read current comments" on public.current_comments;
create policy "public read current comments"
on public.current_comments
for select
to anon, authenticated
using (true);

drop policy if exists "public insert current comments" on public.current_comments;
create policy "public insert current comments"
on public.current_comments
for insert
to anon, authenticated
with check (true);

drop policy if exists "public update current comments" on public.current_comments;
create policy "public update current comments"
on public.current_comments
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public delete current comments" on public.current_comments;
create policy "public delete current comments"
on public.current_comments
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

drop policy if exists "public read archived comments" on public.archived_comments;
create policy "public read archived comments"
on public.archived_comments
for select
to anon, authenticated
using (true);

drop policy if exists "public insert archived comments" on public.archived_comments;
create policy "public insert archived comments"
on public.archived_comments
for insert
to anon, authenticated
with check (true);

drop policy if exists "public delete archived comments" on public.archived_comments;
create policy "public delete archived comments"
on public.archived_comments
for delete
to anon, authenticated
using (true);

create index if not exists idx_employees_sort_order on public.employees (sort_order);
create index if not exists idx_spaces_sort_order on public.spaces (sort_order);
create index if not exists idx_current_checks_date_type on public.current_checks (work_date, checklist_type);
create index if not exists idx_current_category_checks_date_type on public.current_category_checks (work_date, checklist_type);
create index if not exists idx_current_comments_date_type on public.current_comments (work_date, checklist_type);
create index if not exists idx_archived_checks_date_type on public.archived_checks (archive_date, checklist_type);
create index if not exists idx_archived_comments_date_type on public.archived_comments (archive_date, checklist_type);
