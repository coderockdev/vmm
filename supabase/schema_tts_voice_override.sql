-- Per-project ElevenLabs/Cartesia voice when channel DNA is HeyGen (no API voice_id).
alter table video_projects
  add column if not exists tts_voice_id_override text;
