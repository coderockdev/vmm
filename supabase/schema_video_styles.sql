-- Video style + instrumental bed / SFX mix metadata
alter table video_projects
  add column if not exists video_style_json jsonb;

alter table video_projects
  add column if not exists audio_bed_json jsonb;
