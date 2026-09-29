-- VMM — Supabase schema.
-- Run this once in your Supabase project's SQL editor (Database > SQL Editor)
-- before setting DB_PROVIDER=supabase. Mirrors src/core/db.ts's SQLite schema.

create table if not exists channels (
  id text primary key,
  name text not null,
  niche text not null,
  cover_color text not null,
  dna_json jsonb not null,
  cover_ref text,
  channel_image_ref text,
  channel_banner_ref text,
  visual_reference_ref text,
  reference_links_json jsonb not null default '[]'::jsonb,
  visual_style_description text not null default '',
  script_skill text not null default '',
  creation_request_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table channels add column if not exists cover_ref text;
alter table channels add column if not exists channel_image_ref text;
alter table channels add column if not exists channel_banner_ref text;
alter table channels add column if not exists visual_reference_ref text;
alter table channels add column if not exists reference_links_json jsonb not null default '[]'::jsonb;
alter table channels add column if not exists visual_style_description text not null default '';
alter table channels add column if not exists script_skill text not null default '';
alter table channels add column if not exists creation_request_id uuid;
create unique index if not exists channels_creation_request_id_key
  on channels (creation_request_id)
  where creation_request_id is not null;

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
  tts_voice_id_override text,
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

-- Audiobook pipeline (Júlio Verne / chapter-mode channels)
create table if not exists books (
  id text primary key,
  channel_id text not null references channels(id) on delete cascade,
  order_index integer not null,
  number integer not null,
  title text not null,
  folder text not null,
  total_chapters integer not null default 0,
  total_chars integer not null default 0,
  total_words integer not null default 0,
  status text not null default 'queued',
  youtube_playlist_id text,
  playlist_title text,
  playlist_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, folder)
);

create table if not exists chapters (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  chapter_index integer not null,
  label text not null,
  source_file text not null,
  words integer not null default 0,
  chars integer not null default 0,
  status text not null default 'pending',
  tts_text_path text,
  audio_path text,
  audio_duration_sec numeric,
  video_path text,
  thumb_path text,
  image_prompts_json jsonb,
  image_paths_json jsonb,
  youtube_video_id text,
  youtube_url text,
  publish_at timestamptz,
  error_message text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, source_file)
);

create table if not exists tts_usage (
  id text primary key,
  month text not null,
  provider text not null,
  chars integer not null default 0,
  requests integer not null default 0,
  chapter_id text references chapters(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists youtube_accounts (
  id text primary key,
  channel_id text not null references channels(id) on delete cascade,
  youtube_channel_id text not null,
  title text not null,
  refresh_token_encrypted text not null,
  scopes text not null,
  connected_at timestamptz not null default now(),
  unique (channel_id)
);

create table if not exists youtube_quota_log (
  id text primary key,
  date text not null,
  units integer not null default 0,
  operation text not null,
  chapter_id text references chapters(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists channel_audiobook_settings (
  channel_id text primary key references channels(id) on delete cascade,
  settings_json jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_books_channel on books(channel_id);
create index if not exists idx_chapters_book on chapters(book_id);
create index if not exists idx_tts_usage_month on tts_usage(month);
create index if not exists idx_youtube_quota_date on youtube_quota_log(date);

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
alter table books disable row level security;
alter table chapters disable row level security;
alter table tts_usage disable row level security;
alter table youtube_accounts disable row level security;
alter table youtube_quota_log disable row level security;
alter table channel_audiobook_settings disable row level security;
