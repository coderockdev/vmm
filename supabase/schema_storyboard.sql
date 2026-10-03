-- Storyboard is the cinematic plan for a video project.
-- Safe to run more than once.
alter table video_projects add column if not exists storyboard_json jsonb;
