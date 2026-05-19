-- Admin tasks panel — lightweight TODO list scoped per profile
do $$
begin
  if not exists (select 1 from pg_type where typname = 'admin_task_priority_t') then
    create type admin_task_priority_t as enum ('low', 'medium', 'high', 'urgent');
  end if;
end $$;

create table if not exists admin_tasks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  title        text not null,
  detail       text,
  priority     admin_task_priority_t not null default 'medium',
  due_date     date,
  related_url  text,
  is_done      boolean not null default false,
  created_at   timestamptz not null default now(),
  done_at      timestamptz
);

create index if not exists admin_tasks_owner_idx on admin_tasks (owner_id, is_done, due_date);
