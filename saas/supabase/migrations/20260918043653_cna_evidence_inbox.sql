-- Additive Liga CNA evidence pipeline. Legacy tables and data are not modified.
create schema if not exists cna_private;
revoke all on schema cna_private from public, anon;
grant usage on schema cna_private to authenticated, service_role;

create table public.cna_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.cna_admins enable row level security;
revoke all on public.cna_admins from public, anon, authenticated;
grant select on public.cna_admins to authenticated;
grant all on public.cna_admins to service_role;
create policy cna_admin_self on public.cna_admins for select to authenticated using (user_id = (select auth.uid()));

-- Dedicated allowlist; no user-editable metadata or legacy profile role is trusted.
create function cna_private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.cna_admins where user_id = auth.uid() and active
  );
$$;
revoke all on function cna_private.is_admin() from public, anon;
grant execute on function cna_private.is_admin() to authenticated, service_role;

create table public.cna_competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  created_at timestamptz not null default now()
);
create table public.cna_seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.cna_competitions(id) on delete restrict,
  name text not null check (length(name) between 1 and 120),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  unique (id,competition_id), unique (competition_id,name)
);
create table public.cna_phases (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  competition_id uuid not null,
  name text not null check (length(name) between 1 and 120),
  slug text not null,
  foreign key (season_id,competition_id) references public.cna_seasons(id,competition_id) on delete restrict,
  unique (id,season_id,competition_id), unique (season_id,slug)
);
create table public.cna_ingestion_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,32}$'),
  competition_id uuid not null references public.cna_competitions(id) on delete restrict,
  season_id uuid,
  phase_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (phase_id is null or season_id is not null),
  foreign key (season_id,competition_id) references public.cna_seasons(id,competition_id) on delete restrict,
  foreign key (phase_id,season_id,competition_id) references public.cna_phases(id,season_id,competition_id) on delete restrict
);
create table public.cna_upload_intents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.cna_ingestion_clients(id) on delete restrict,
  competition_id uuid not null references public.cna_competitions(id) on delete restrict,
  season_id uuid,
  phase_id uuid,
  phone_number_id text not null,
  message_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384),
  object_path text not null unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (phone_number_id,message_id),
  foreign key (season_id,competition_id) references public.cna_seasons(id,competition_id) on delete restrict,
  foreign key (phase_id,season_id,competition_id) references public.cna_phases(id,season_id,competition_id) on delete restrict
);
create index cna_upload_intents_client on public.cna_upload_intents(client_id,created_at);
create table public.cna_submissions (
  id uuid primary key default gen_random_uuid(),
  upload_intent_id uuid not null unique references public.cna_upload_intents(id) on delete restrict,
  competition_id uuid not null references public.cna_competitions(id) on delete restrict,
  season_id uuid,
  phase_id uuid,
  status text not null default 'pending' check (status in ('pending','processing','needs_review','approved','rejected')),
  sender_phone text not null check (sender_phone ~ '^\+?[0-9]{7,15}$'),
  whatsapp_phone_number_id text not null,
  whatsapp_message_id text not null,
  whatsapp_media_id text not null,
  received_at timestamptz not null,
  original_image_path text not null unique,
  original_mime_type text not null check (original_mime_type in ('image/jpeg','image/png')),
  original_filename text,
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_bytes bigint not null check (evidence_bytes between 1 and 10485760),
  raw_metadata jsonb not null default '{}' check (jsonb_typeof(raw_metadata) = 'object' and octet_length(raw_metadata::text) <= 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (whatsapp_phone_number_id,whatsapp_message_id),
  check (phase_id is null or season_id is not null),
  foreign key (season_id,competition_id) references public.cna_seasons(id,competition_id) on delete restrict,
  foreign key (phase_id,season_id,competition_id) references public.cna_phases(id,season_id,competition_id) on delete restrict
);
create index cna_submissions_received on public.cna_submissions(received_at desc,id desc);
create index cna_submissions_filter on public.cna_submissions(competition_id,status,received_at desc);
create index cna_submissions_season on public.cna_submissions(season_id);
create table public.cna_audit_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.cna_submissions(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  client_id uuid references public.cna_ingestion_clients(id) on delete restrict,
  action text not null,
  created_at timestamptz not null default now()
);
create index cna_audit_submission on public.cna_audit_events(submission_id,created_at);

do $$
declare t text;
begin
  foreach t in array array['cna_competitions','cna_seasons','cna_phases','cna_submissions','cna_audit_events','cna_ingestion_clients','cna_upload_intents'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  foreach t in array array['cna_competitions','cna_seasons','cna_phases','cna_submissions','cna_audit_events'] loop
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy cna_admin_read on public.%I for select to authenticated using ((select cna_private.is_admin()))',t);
  end loop;
end $$;

create function cna_private.reject_evidence_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Evidence receipts are immutable'; end;
$$;
revoke all on function cna_private.reject_evidence_mutation() from public, anon, authenticated;
create trigger cna_evidence_immutable before update or delete on public.cna_submissions
for each row execute function cna_private.reject_evidence_mutation();
create trigger cna_audit_immutable before update or delete on public.cna_audit_events
for each row execute function cna_private.reject_evidence_mutation();

-- Called only by the authenticated ingestion server, not browser clients.
create function public.cna_prepare_upload(p_client_id uuid, p_payload jsonb, p_message_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare client public.cna_ingestion_clients; intent public.cna_upload_intents; path text;
begin
  select * into client from public.cna_ingestion_clients where id=p_client_id and active for update;
  if not found then raise exception 'INGEST_UNAUTHORIZED'; end if;
  if p_payload->>'whatsapp_phone_number_id' is distinct from client.phone_number_id then raise exception 'INGEST_UNAUTHORIZED'; end if;
  if p_message_hash is null or p_message_hash !~ '^[0-9a-f]{64}$' then raise exception 'INGEST_INVALID'; end if;
  if p_payload->>'original_mime_type' not in ('image/jpeg','image/png') or p_payload->>'whatsapp_message_id' is null then raise exception 'INGEST_INVALID'; end if;
  select * into intent from public.cna_upload_intents
    where phone_number_id=client.phone_number_id and message_id=p_payload->>'whatsapp_message_id';
  if found then
    if intent.client_id<>client.id or intent.payload<>p_payload then raise exception 'INGEST_CONFLICT'; end if;
    return to_jsonb(intent);
  end if;
  if (select count(*) from public.cna_upload_intents where client_id=client.id and created_at>now()-interval '1 hour') >= 300 then raise exception 'INGEST_RATE_LIMIT'; end if;
  path := 'incoming/' || to_char((p_payload->>'received_at')::timestamptz at time zone 'UTC','YYYY/MM') || '/' || client.phone_number_id || '/' || p_message_hash ||
    case p_payload->>'original_mime_type' when 'image/png' then '.png' else '.jpg' end;
  insert into public.cna_upload_intents(client_id,competition_id,season_id,phase_id,phone_number_id,message_id,payload,object_path)
    values(client.id,client.competition_id,client.season_id,client.phase_id,client.phone_number_id,p_payload->>'whatsapp_message_id',p_payload,path) returning * into intent;
  return to_jsonb(intent);
end $$;
revoke all on function public.cna_prepare_upload(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.cna_prepare_upload(uuid,jsonb,text) to service_role;

create function public.cna_finalize_upload(p_client_id uuid, p_intent_id uuid, p_sha256 text, p_bytes bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare intent public.cna_upload_intents; sub public.cna_submissions;
begin
  if not exists(select 1 from public.cna_ingestion_clients where id=p_client_id and active) then raise exception 'INGEST_UNAUTHORIZED'; end if;
  select * into intent from public.cna_upload_intents where id=p_intent_id and client_id=p_client_id for update;
  if not found then raise exception 'INGEST_NOT_FOUND'; end if;
  select * into sub from public.cna_submissions where upload_intent_id=intent.id;
  if found then
    if sub.evidence_sha256<>p_sha256 or sub.evidence_bytes<>p_bytes then raise exception 'INGEST_CONFLICT'; end if;
    return jsonb_build_object('id',sub.id,'status',sub.status,'duplicate',true);
  end if;
  if not exists(select 1 from storage.objects where bucket_id='match-evidence' and name=intent.object_path) then raise exception 'INGEST_MISSING_OBJECT'; end if;
  if intent.payload->>'expected_sha256' is not null and intent.payload->>'expected_sha256'<>p_sha256 then raise exception 'INGEST_CONFLICT'; end if;
  if (intent.payload->>'evidence_bytes')::bigint<>p_bytes then raise exception 'INGEST_CONFLICT'; end if;
  insert into public.cna_submissions(upload_intent_id,competition_id,season_id,phase_id,sender_phone,whatsapp_phone_number_id,whatsapp_message_id,whatsapp_media_id,received_at,original_image_path,original_mime_type,original_filename,evidence_sha256,evidence_bytes,raw_metadata)
  values(intent.id,intent.competition_id,intent.season_id,intent.phase_id,intent.payload->>'sender_phone',intent.phone_number_id,intent.message_id,intent.payload->>'whatsapp_media_id',(intent.payload->>'received_at')::timestamptz,intent.object_path,intent.payload->>'original_mime_type',intent.payload->>'original_filename',p_sha256,p_bytes,coalesce(intent.payload->'raw_metadata','{}'::jsonb)) returning * into sub;
  update public.cna_upload_intents set completed_at=now() where id=intent.id;
  insert into public.cna_audit_events(submission_id,client_id,action) values(sub.id,p_client_id,'evidence_received');
  return jsonb_build_object('id',sub.id,'status',sub.status,'duplicate',false);
end $$;
revoke all on function public.cna_finalize_upload(uuid,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.cna_finalize_upload(uuid,uuid,text,bigint) to service_role;

-- Refuse an existing bucket with this name rather than silently changing its privacy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('match-evidence','match-evidence',false,10485760,array['image/jpeg','image/png']);
create policy cna_evidence_admin_read on storage.objects for select to authenticated
using (bucket_id='match-evidence' and (select cna_private.is_admin()) and exists (
  select 1 from public.cna_submissions s where s.original_image_path=name
));
-- Restrictive guards also protect against unrelated broad permissive legacy policies.
create policy cna_evidence_private on storage.objects as restrictive for select to authenticated
using (bucket_id<>'match-evidence' or ((select auth.uid()) is not null and (select cna_private.is_admin())));
create policy cna_evidence_no_anon_read on storage.objects as restrictive for select to anon
using (bucket_id<>'match-evidence');
create policy cna_evidence_no_insert on storage.objects as restrictive for insert to anon, authenticated
with check (bucket_id<>'match-evidence');
create policy cna_evidence_no_update on storage.objects as restrictive for update to anon, authenticated
using (bucket_id<>'match-evidence') with check (bucket_id<>'match-evidence');
create policy cna_evidence_no_delete on storage.objects as restrictive for delete to anon, authenticated
using (bucket_id<>'match-evidence');

insert into public.cna_competitions(name,slug) values('Liga CNA','liga-cna');
comment on table public.cna_submissions is 'Immutable incoming evidence. Does not create official match data. Status changes require a later reviewed migration.';
notify pgrst,'reload schema';

