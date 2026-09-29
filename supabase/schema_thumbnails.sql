-- Per-video YouTube thumbnail concept + image ref
alter table video_projects
  add column if not exists thumbnail_json jsonb;

alter table video_projects
  add column if not exists thumbnail_ref text;
