-- Audiobook pipeline tables (Júlio Verne chapter-mode channels).

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

alter table books disable row level security;
alter table chapters disable row level security;
alter table tts_usage disable row level security;
alter table youtube_accounts disable row level security;
alter table youtube_quota_log disable row level security;
alter table channel_audiobook_settings disable row level security;
