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
alter table public.app_settings add column if not exists use_employee_feature boolean not null default true;
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

-- 실시간 동기화: 다른 기기에서 바꾼 내용을 새로고침 없이 받습니다.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'employees', 'spaces', 'app_settings', 'current_checks', 'current_category_checks', 'current_comments'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

-- 채널톡 결과 알림
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.notification_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  channel_access_key text not null default '',
  channel_access_secret text not null default '',
  channel_group_id text not null default '',
  bot_name text not null default 'DD 체크리스트',
  open_report_time time not null default '10:00',
  close_report_time time not null default '20:00',
  updated_at timestamptz not null default now()
);

insert into public.notification_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.notification_logs (
  id bigint generated always as identity primary key,
  work_date date not null,
  checklist_type text not null check (checklist_type in ('open', 'close')),
  trigger text not null check (trigger in ('complete', 'scheduled', 'manual')),
  message text not null default '',
  request_id bigint,
  created_at timestamptz not null default now()
);

-- 자동 발송은 날짜/종류별로 한 번만 보냅니다.
create unique index if not exists idx_notification_logs_auto_once
on public.notification_logs (work_date, checklist_type)
where trigger in ('complete', 'scheduled');

-- 키가 담긴 테이블은 정책 없이 RLS만 켜서 브라우저에서 직접 읽을 수 없게 합니다.
alter table public.notification_settings enable row level security;
alter table public.notification_logs enable row level security;

create or replace function public.ddc_assert_admin(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select admin_password from public.app_settings limit 1), '8883') <> coalesce(p_password, '') then
    raise exception '비밀번호가 올바르지 않습니다.';
  end if;
end $$;

-- 앱의 parseTemplateData와 같은 규칙으로 대분류 id 목록을 구합니다.
create or replace function public.ddc_template_group_ids(p_template text, p_type text)
returns text[]
language plpgsql
immutable
as $$
declare
  parsed jsonb;
  groups jsonb;
  result text[];
begin
  if coalesce(trim(p_template), '') = '' then
    return array[]::text[];
  end if;

  begin
    parsed := p_template::jsonb;
  exception when others then
    return array['legacy_' || p_type || '_group'];
  end;

  if jsonb_typeof(parsed) = 'array' then
    groups := parsed;
  elsif jsonb_typeof(parsed) = 'object' and jsonb_typeof(parsed -> 'groups') = 'array' then
    groups := parsed -> 'groups';
  else
    return array['legacy_' || p_type || '_group'];
  end if;

  select coalesce(
    array_agg(coalesce(g.node ->> 'id', 'legacy_' || p_type || '_root_' || (g.ord - 1)) order by g.ord),
    array[]::text[]
  )
  into result
  from jsonb_array_elements(groups) with ordinality as g(node, ord)
  where coalesce(trim(coalesce(g.node ->> 'title', g.node ->> 'name')), '') <> ''
     or (jsonb_typeof(g.node -> 'children') = 'array' and jsonb_array_length(g.node -> 'children') > 0);

  return result;
end $$;

create or replace function public.ddc_build_checklist_report(p_type text, p_work_date date, p_trigger text)
returns table (is_complete boolean, space_total integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  space_row record;
  comment_row record;
  pending text[] := array[]::text[];
  employee_names text[];
  comment_lines text[] := array[]::text[];
  done_count integer := 0;
  total_count integer := 0;
  comment_count integer := 0;
  use_employee boolean;
  timezone_name text;
  local_now timestamp;
  type_label text := case when p_type = 'open' then '오픈' else '마감' end;
  trigger_label text;
  lines text[];
begin
  select coalesce(settings.use_employee_feature, true), coalesce(settings.timezone, 'Asia/Seoul')
  into use_employee, timezone_name
  from public.app_settings settings
  limit 1;
  use_employee := coalesce(use_employee, true);
  timezone_name := coalesce(timezone_name, 'Asia/Seoul');
  local_now := now() at time zone timezone_name;

  for space_row in
    select
      spaces.name,
      ids.group_ids,
      (
        select count(*)
        from unnest(ids.group_ids) as group_keys(group_key)
        where exists (
          select 1 from public.current_category_checks checks
          where checks.work_date = p_work_date
            and checks.checklist_type = p_type
            and checks.space_id = spaces.id
            and checks.category_key = group_keys.group_key
            and checks.checked
        )
      )::integer as checked_count,
      exists (
        select 1 from public.current_checks summary
        where summary.work_date = p_work_date
          and summary.checklist_type = p_type
          and summary.space_id = spaces.id
          and summary.checked
      ) as summary_checked
    from public.spaces spaces
    cross join lateral (
      select public.ddc_template_group_ids(
        case when p_type = 'open' then spaces.open_checklist_template else spaces.close_checklist_template end,
        p_type
      ) as group_ids
    ) ids
    where spaces.is_active
    order by spaces.sort_order, spaces.created_at
  loop
    if cardinality(space_row.group_ids) = 0 then
      continue;
    end if;
    total_count := total_count + 1;
    if space_row.summary_checked or space_row.checked_count >= cardinality(space_row.group_ids) then
      done_count := done_count + 1;
    else
      pending := pending || format('%s(%s/%s)', space_row.name, space_row.checked_count, cardinality(space_row.group_ids));
    end if;
  end loop;

  if use_employee then
    select array_agg(distinct checks.employee_name order by checks.employee_name)
    into employee_names
    from public.current_category_checks checks
    where checks.work_date = p_work_date
      and checks.checklist_type = p_type
      and checks.checked
      and coalesce(checks.employee_name, '') <> '';
  end if;

  for comment_row in
    select comments.space_name, comments.employee_name, comments.content
    from public.current_comments comments
    where comments.work_date = p_work_date
    order by comments.created_at
  loop
    comment_count := comment_count + 1;
    if comment_count <= 10 then
      comment_lines := comment_lines || format(
        '- %s: %s%s',
        comment_row.space_name,
        left(regexp_replace(comment_row.content, '\s+', ' ', 'g'), 80),
        case when use_employee and coalesce(comment_row.employee_name, '') <> ''
          then ' (' || comment_row.employee_name || ')' else '' end
      );
    end if;
  end loop;

  trigger_label := case p_trigger
    when 'complete' then to_char(local_now, 'HH24:MI') || ' 전체 완료'
    when 'scheduled' then to_char(local_now, 'HH24:MI') || ' 기준'
    else to_char(local_now, 'HH24:MI') || ' 기준 · 테스트 발송'
  end;

  lines := array[
    format('[DD 체크리스트] %s 체크 결과', type_label),
    format(
      '%s(%s) %s',
      to_char(p_work_date, 'YYYY-MM-DD'),
      (array['일', '월', '화', '수', '목', '금', '토'])[extract(dow from p_work_date)::integer + 1],
      trigger_label
    )
  ];

  if total_count = 0 then
    lines := lines || format('등록된 %s 체크 항목이 없습니다.', type_label);
  else
    lines := lines || format('완료 %s / %s곳', done_count, total_count);
    if cardinality(pending) > 0 then
      lines := lines || ('미완료: ' || array_to_string(pending, ', '));
    else
      lines := lines || '미완료: 없음'::text;
    end if;
  end if;

  if use_employee and coalesce(cardinality(employee_names), 0) > 0 then
    lines := lines || ('확인 직원: ' || array_to_string(employee_names, ', '));
  end if;

  if comment_count > 0 then
    lines := lines || format('오늘 메모 %s건', comment_count);
    lines := lines || comment_lines;
    if comment_count > 10 then
      lines := lines || format('외 %s건', comment_count - 10);
    end if;
  end if;

  is_complete := total_count > 0 and done_count = total_count;
  space_total := total_count;
  message := array_to_string(lines, E'\n');
  return next;
end $$;

-- 채널톡 Open API로 팀챗 그룹에 메시지를 보냅니다. pg_net 요청 id를 돌려줍니다.
create or replace function public.ddc_send_channel_message(p_text text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  config public.notification_settings;
  request_id bigint;
begin
  select * into config from public.notification_settings where id = 1;
  if not found
    or config.channel_access_key = ''
    or config.channel_access_secret = ''
    or config.channel_group_id = '' then
    raise exception '채널톡 Access Key, Access Secret, 팀챗 그룹 ID를 먼저 저장해 주세요.';
  end if;

  select net.http_post(
    url := 'https://api.channel.io/open/v5/groups/' || config.channel_group_id || '/messages',
    body := jsonb_build_object(
      'blocks',
      (
        select jsonb_agg(jsonb_build_object('type', 'text', 'value', line) order by ord)
        from regexp_split_to_table(p_text, E'\n') with ordinality as split(line, ord)
        where line <> ''
      )
    ),
    params := case
      when config.bot_name <> '' then jsonb_build_object('botName', config.bot_name)
      else '{}'::jsonb
    end,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-access-key', config.channel_access_key,
      'x-access-secret', config.channel_access_secret
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end $$;

-- 매분 실행됩니다. 일요일 제외, 정해진 시각이 되었거나 그 전에 모두 체크되면 한 번 보냅니다.
create or replace function public.ddc_run_checklist_notifications(p_only_type text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  config public.notification_settings;
  timezone_name text;
  local_now timestamp;
  local_date date;
  local_time time;
  v_type text;
  report_time time;
  report record;
  send_trigger text;
  log_id bigint;
begin
  select * into config from public.notification_settings where id = 1;
  if not found or not config.enabled then
    return;
  end if;

  timezone_name := coalesce((select timezone from public.app_settings limit 1), 'Asia/Seoul');
  local_now := now() at time zone timezone_name;
  local_date := local_now::date;
  local_time := local_now::time;

  if extract(dow from local_now) = 0 then
    return;
  end if;

  foreach v_type in array array['open', 'close'] loop
    if p_only_type is not null and v_type <> p_only_type then
      continue;
    end if;

    if exists (
      select 1 from public.notification_logs logs
      where logs.work_date = local_date
        and logs.checklist_type = v_type
        and logs.trigger in ('complete', 'scheduled')
    ) then
      continue;
    end if;

    report_time := case when v_type = 'open' then config.open_report_time else config.close_report_time end;

    if local_time >= report_time then
      -- 서버가 멈춰 있다가 늦게 깨어난 경우 엉뚱한 시간에 보내지 않도록 3시간 안에서만 보냅니다.
      if local_time - report_time >= interval '3 hours' then
        continue;
      end if;
      send_trigger := 'scheduled';
    else
      select * into report from public.ddc_build_checklist_report(v_type, local_date, 'complete');
      if not report.is_complete then
        continue;
      end if;
      send_trigger := 'complete';
    end if;

    select * into report from public.ddc_build_checklist_report(v_type, local_date, send_trigger);

    insert into public.notification_logs (work_date, checklist_type, trigger, message)
    values (local_date, v_type, send_trigger, report.message)
    on conflict (work_date, checklist_type) where trigger in ('complete', 'scheduled') do nothing
    returning id into log_id;

    if log_id is null then
      continue;
    end if;

    update public.notification_logs
    set request_id = public.ddc_send_channel_message(report.message)
    where id = log_id;
  end loop;
end $$;

-- 앱에서 체크 직후 호출합니다. 조건이 맞을 때만 보내므로 누구나 호출해도 안전합니다.
create or replace function public.ddc_notify_if_complete(p_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_type not in ('open', 'close') then
    return;
  end if;
  perform public.ddc_run_checklist_notifications(p_type);
end $$;

create or replace function public.ddc_get_notification_settings(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  config public.notification_settings;
  logs jsonb;
begin
  perform public.ddc_assert_admin(p_password);
  select * into config from public.notification_settings where id = 1;

  select coalesce(jsonb_agg(item order by (item ->> 'created_at') desc), '[]'::jsonb)
  into logs
  from (
    select jsonb_build_object(
      'id', recent.id,
      'work_date', recent.work_date,
      'checklist_type', recent.checklist_type,
      'trigger', recent.trigger,
      'created_at', recent.created_at,
      'request_id', recent.request_id,
      'status_code', response.status_code,
      'error', coalesce(response.error_msg, case when response.status_code >= 300 then left(response.content, 300) end)
    ) as item
    from (
      select * from public.notification_logs order by created_at desc limit 10
    ) recent
    left join net._http_response response on response.id = recent.request_id
  ) log_rows;

  return jsonb_build_object(
    'enabled', coalesce(config.enabled, false),
    'channel_group_id', coalesce(config.channel_group_id, ''),
    'bot_name', coalesce(config.bot_name, ''),
    'open_report_time', to_char(coalesce(config.open_report_time, '10:00'::time), 'HH24:MI'),
    'close_report_time', to_char(coalesce(config.close_report_time, '20:00'::time), 'HH24:MI'),
    'has_access_key', coalesce(config.channel_access_key, '') <> '',
    'has_access_secret', coalesce(config.channel_access_secret, '') <> '',
    'access_key_hint', case when coalesce(config.channel_access_key, '') = '' then ''
      else '••••' || right(config.channel_access_key, 4) end,
    'logs', logs
  );
end $$;

create or replace function public.ddc_save_notification_settings(p_password text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  next_group_id text := trim(coalesce(p_settings ->> 'channel_group_id', ''));
begin
  perform public.ddc_assert_admin(p_password);
  if next_group_id <> '' and next_group_id !~ '^[0-9]+$' then
    raise exception '팀챗 그룹 ID는 숫자만 입력해 주세요.';
  end if;

  insert into public.notification_settings (id) values (1) on conflict (id) do nothing;

  update public.notification_settings
  set enabled = coalesce((p_settings ->> 'enabled')::boolean, enabled),
      channel_access_key = case
        when coalesce(trim(p_settings ->> 'channel_access_key'), '') = '' then channel_access_key
        else trim(p_settings ->> 'channel_access_key') end,
      channel_access_secret = case
        when coalesce(trim(p_settings ->> 'channel_access_secret'), '') = '' then channel_access_secret
        else trim(p_settings ->> 'channel_access_secret') end,
      channel_group_id = next_group_id,
      bot_name = left(trim(coalesce(p_settings ->> 'bot_name', bot_name)), 30),
      open_report_time = coalesce(nullif(p_settings ->> 'open_report_time', '')::time, open_report_time),
      close_report_time = coalesce(nullif(p_settings ->> 'close_report_time', '')::time, close_report_time),
      updated_at = now()
  where id = 1;
end $$;

-- 수동 테스트 발송: 자동 발송 기록과 별개로 남기므로 정기 발송에는 영향을 주지 않습니다.
create or replace function public.ddc_send_test_report(p_password text, p_type text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  report record;
  local_date date;
  v_request_id bigint;
begin
  perform public.ddc_assert_admin(p_password);
  if p_type not in ('open', 'close') then
    raise exception '알 수 없는 체크리스트 종류입니다.';
  end if;

  local_date := (now() at time zone coalesce((select timezone from public.app_settings limit 1), 'Asia/Seoul'))::date;
  select * into report from public.ddc_build_checklist_report(p_type, local_date, 'manual');
  v_request_id := public.ddc_send_channel_message(report.message);

  insert into public.notification_logs (work_date, checklist_type, trigger, message, request_id)
  values (local_date, p_type, 'manual', report.message, v_request_id);

  return v_request_id;
end $$;

-- 저장된 키로 팀챗 그룹 목록을 요청합니다. 결과는 ddc_get_http_response로 확인합니다.
create or replace function public.ddc_request_channel_groups(p_password text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  config public.notification_settings;
  request_id bigint;
begin
  perform public.ddc_assert_admin(p_password);
  select * into config from public.notification_settings where id = 1;
  if not found or config.channel_access_key = '' or config.channel_access_secret = '' then
    raise exception 'Access Key와 Access Secret을 먼저 저장해 주세요.';
  end if;

  select net.http_get(
    url := 'https://api.channel.io/open/v5/groups',
    params := jsonb_build_object('limit', '500'),
    headers := jsonb_build_object(
      'x-access-key', config.channel_access_key,
      'x-access-secret', config.channel_access_secret
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end $$;

create or replace function public.ddc_get_http_response(p_password text, p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  response record;
begin
  perform public.ddc_assert_admin(p_password);
  select status_code, content, error_msg, timed_out
  into response
  from net._http_response
  where id = p_request_id;

  if not found then
    return jsonb_build_object('pending', true);
  end if;

  return jsonb_build_object(
    'pending', false,
    'status_code', response.status_code,
    'content', left(response.content, 20000),
    'error', response.error_msg,
    'timed_out', response.timed_out
  );
end $$;

revoke all on function public.ddc_assert_admin(text) from public, anon, authenticated;
revoke all on function public.ddc_build_checklist_report(text, date, text) from public, anon, authenticated;
revoke all on function public.ddc_send_channel_message(text) from public, anon, authenticated;
revoke all on function public.ddc_run_checklist_notifications(text) from public, anon, authenticated;

grant execute on function public.ddc_notify_if_complete(text) to anon, authenticated;
grant execute on function public.ddc_get_notification_settings(text) to anon, authenticated;
grant execute on function public.ddc_save_notification_settings(text, jsonb) to anon, authenticated;
grant execute on function public.ddc_send_test_report(text, text) to anon, authenticated;
grant execute on function public.ddc_request_channel_groups(text) to anon, authenticated;
grant execute on function public.ddc_get_http_response(text, bigint) to anon, authenticated;

select cron.schedule(
  'ddc-checklist-notify',
  '* * * * *',
  $$select public.ddc_run_checklist_notifications()$$
);
