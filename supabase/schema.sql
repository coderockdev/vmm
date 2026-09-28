-- VMM — Supabase schema.
-- Run this once in your Supabase project's SQL editor (Database > SQL Editor)
-- before setting DB_PROVIDER=supabase. Mirrors src/core/db.ts's SQLite schema.

create table if not exists channels (
  id text primary key,
  name text not null,
  niche text not null,
  cover_color text not null,
  dna_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_plans (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null references channels(id) on delete cascade,
  topic text not null,
  quantity integer not null,
  duration_minutes numeric not null,
  format text not null,
  created_at timestamptz not null default now()
);

create table if not exists content_ideas (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references content_plans(id) on delete cascade,
  title text not null,
  angle text not null,
  objective text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists video_projects (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null references channels(id) on delete cascade,
  content_idea_id uuid,
  title text not null,
  topic text not null,
  duration_minutes numeric not null,
  format text not null,
  status text not null,
  error_message text,
  seed bigint not null,
  tts_provider_override text,
  script_id uuid,
  audio_asset_id uuid,
  render_path text,
  render_duration_seconds numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scripts (
  id uuid primary key default gen_random_uuid(),
  video_project_id uuid not null references video_projects(id) on delete cascade,
  raw_text text not null,
  lines_json jsonb not null,
  word_count integer not null,
  created_at timestamptz not null default now()
);

create table if not exists audio_assets (
  id uuid primary key default gen_random_uuid(),
  video_project_id uuid not null references video_projects(id) on delete cascade,
  file_path text not null,
  duration_seconds numeric not null,
  provider text not null,
  created_at timestamptz not null default now()
);

create table if not exists production_jobs (
  id uuid primary key default gen_random_uuid(),
  video_project_id uuid not null references video_projects(id) on delete cascade,
  channel_id text not null references channels(id) on delete cascade,
  status text not null,
  progress integer not null default 0,
  status_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_plans_channel on content_plans(channel_id);
create index if not exists idx_content_ideas_plan on content_ideas(plan_id);
create index if not exists idx_video_projects_channel on video_projects(channel_id);
create index if not exists idx_scripts_project on scripts(video_project_id);
create index if not exists idx_audio_assets_project on audio_assets(video_project_id);
create index if not exists idx_production_jobs_project on production_jobs(video_project_id);

-- This app is single-user/local and talks to Supabase with the service role
-- key from the server only, so RLS stays disabled here. If you later expose
-- these tables to browser clients directly, add RLS policies first.
alter table channels disable row level security;
alter table content_plans disable row level security;
alter table content_ideas disable row level security;
alter table video_projects disable row level security;
alter table scripts disable row level security;
alter table audio_assets disable row level security;
alter table production_jobs disable row level security;
