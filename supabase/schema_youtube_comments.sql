-- YouTube Comment Manager (VMM)
-- Apply when using Supabase. Local SQLite is auto-migrated in src/core/db.ts.

create table if not exists youtube_comments (
  id text primary key,
  channel_id text not null references channels(id) on delete cascade,
  youtube_comment_id text not null,
  youtube_thread_id text not null,
  video_id text not null,
  video_title text,
  author_name text,
  author_channel_id text,
  author_profile_image_url text,
  comment_text text not null,
  published_at timestamptz,
  updated_at_yt timestamptz,
  like_count integer not null default 0,
  reply_count integer not null default 0,
  our_reply_id text,
  our_reply_text text,
  category text,
  status text not null default 'pending',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, youtube_comment_id)
);

create index if not exists idx_yt_comments_channel_status
  on youtube_comments (channel_id, status);
create index if not exists idx_yt_comments_channel_published
  on youtube_comments (channel_id, published_at desc);

create table if not exists youtube_comment_runs (
  id text primary key,
  channel_id text not null references channels(id) on delete cascade,
  status text not null default 'running',
  dry_run boolean not null default false,
  max_items integer not null default 50,
  processed integer not null default 0,
  answered integer not null default 0,
  skipped integer not null default 0,
  needs_review integer not null default 0,
  errors integer not null default 0,
  stop_requested boolean not null default false,
  log_json jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_yt_comment_runs_channel
  on youtube_comment_runs (channel_id, started_at desc);

alter table youtube_comments disable row level security;
alter table youtube_comment_runs disable row level security;
