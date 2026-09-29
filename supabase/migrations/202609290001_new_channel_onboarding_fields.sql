-- Fields introduced by the three-step new-channel onboarding.
-- Existing Channel DNA fields remain in dna_json; these columns hold the new
-- media and reference data without changing the meaning of legacy columns.
alter table public.channels
  add column if not exists channel_image_ref text,
  add column if not exists channel_banner_ref text,
  add column if not exists visual_reference_ref text,
  add column if not exists reference_links_json jsonb not null default '[]'::jsonb,
  add column if not exists visual_style_description text not null default '',
  add column if not exists script_skill text not null default '';

comment on column public.channels.channel_image_ref is
  'Square channel avatar uploaded in onboarding step 1.';
comment on column public.channels.channel_banner_ref is
  'Optional 16:9 channel banner uploaded in onboarding step 1.';
comment on column public.channels.visual_reference_ref is
  'Optional 16:9 visual reference uploaded in onboarding step 2.';
comment on column public.channels.reference_links_json is
  'Optional reference channels/pages as [{platform, url}].';
comment on column public.channels.visual_style_description is
  'Optional editable description of the desired visual style.';
comment on column public.channels.script_skill is
  'Optional Markdown instructions used as the channel script-generation skill.';

-- The onboarding uploads straight to Supabase Storage. The bucket is public
-- because channel artwork is rendered directly by the app via public URLs;
-- writes still happen only on the server with the service-role key.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = excluded.public;
