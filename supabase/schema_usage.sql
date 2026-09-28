-- VMM — usage / cost tracking (run in Supabase SQL editor after schema.sql).
-- Captures per-stage API usage (tokens, chars, duration) + estimated USD snapshot.

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null references channels(id) on delete cascade,
  content_plan_id uuid references content_plans(id) on delete set null,
  content_idea_id uuid references content_ideas(id) on delete set null,
  video_project_id uuid references video_projects(id) on delete set null,
  stage text not null,
  provider text not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  characters integer,
  duration_seconds numeric,
  estimated_usd numeric not null default 0,
  raw_usage jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_events_channel on usage_events(channel_id);
create index if not exists idx_usage_events_project on usage_events(video_project_id);
create index if not exists idx_usage_events_plan on usage_events(content_plan_id);

alter table video_projects add column if not exists cost_usd_total numeric;
alter table video_projects add column if not exists cost_breakdown_json jsonb;

alter table usage_events disable row level security;
