-- Makes the new-channel POST idempotent. A repeated submit/retry with the
-- same browser-generated request id returns the original channel.
alter table public.channels
  add column if not exists creation_request_id uuid;

create unique index if not exists channels_creation_request_id_key
  on public.channels (creation_request_id)
  where creation_request_id is not null;

comment on column public.channels.creation_request_id is
  'Client-generated idempotency key for the three-step channel onboarding.';
