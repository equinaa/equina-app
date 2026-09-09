begin;

create table public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_horse_id uuid references public.horses(id) on delete set null,
  title text not null default 'New conversation' check (char_length(trim(title)) between 1 and 100),
  context_focus text not null default 'Rhythm' check (char_length(trim(context_focus)) between 1 and 80),
  context_load text not null default 'Normal week' check (char_length(trim(context_load)) between 1 and 80),
  response_style text not null default 'Clear and practical' check (char_length(trim(response_style)) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coach_conversations_user_idx
  on public.coach_conversations(user_id, updated_at desc)
  where archived_at is null;

create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.coach_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null check (char_length(trim(body)) between 1 and 6000),
  client_nonce uuid not null,
  status text not null default 'complete' check (status in ('pending', 'complete', 'failed', 'blocked')),
  based_on text[] not null default '{}'::text[],
  confidence text check (confidence is null or confidence in ('high', 'medium', 'low')),
  safety_category text not null default 'none' check (safety_category in (
    'none', 'health_escalation', 'welfare_escalation', 'unsafe_request', 'provider_review'
  )),
  public_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(public_metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (conversation_id, client_nonce, role)
);
create index coach_messages_conversation_idx
  on public.coach_messages(conversation_id, created_at, id);

create table public.coach_message_operations (
  message_id uuid primary key references public.coach_messages(id) on delete cascade,
  provider_request_id text,
  provider_name text,
  model_name text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  created_at timestamptz not null default now()
);

create table public.coach_message_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.coach_messages(id) on delete cascade,
  useful boolean not null,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table public.coach_safety_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.coach_conversations(id) on delete set null,
  message_id uuid references public.coach_messages(id) on delete set null,
  category text not null check (category in (
    'health_escalation', 'welfare_escalation', 'unsafe_request', 'prompt_injection', 'provider_output'
  )),
  severity text not null check (severity in ('low', 'medium', 'high', 'urgent')),
  redacted_reason text not null check (char_length(redacted_reason) between 1 and 500),
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'reviewing', 'resolved')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index coach_safety_events_review_idx
  on public.coach_safety_events(review_status, severity, created_at);

create table public.coach_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_key)
);
create index coach_usage_events_window_idx
  on public.coach_usage_events(user_id, created_at desc);

create trigger coach_conversations_set_updated_at
before update on public.coach_conversations
for each row execute function private.set_updated_at();

create trigger coach_feedback_set_updated_at
before update on public.coach_message_feedback
for each row execute function private.set_updated_at();

create or replace function public.create_coach_conversation(
  target_horse_id uuid,
  focus_input text,
  load_input text,
  style_input text
)
returns public.coach_conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  created public.coach_conversations;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if not private.feature_enabled('coach_chat', actor_id) then raise exception 'Coach chat is not enabled for this account'; end if;
  if target_horse_id is not null and not private.can_view_horse(target_horse_id) then raise exception 'Horse is not available'; end if;
  if char_length(trim(focus_input)) not between 1 and 80 then raise exception 'Focus is required'; end if;
  if char_length(trim(load_input)) not between 1 and 80 then raise exception 'Weekly load is required'; end if;
  if char_length(trim(style_input)) not between 1 and 80 then raise exception 'Response style is required'; end if;

  insert into public.coach_conversations(
    user_id, selected_horse_id, context_focus, context_load, response_style
  ) values (
    actor_id, target_horse_id, trim(focus_input), trim(load_input), trim(style_input)
  )
  returning * into created;
  return created;
end;
$$;

create or replace function public.update_coach_conversation(
  target_conversation_id uuid,
  title_input text,
  target_horse_id uuid,
  focus_input text,
  load_input text,
  style_input text,
  archive_input boolean
)
returns public.coach_conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  updated public.coach_conversations;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if not private.feature_enabled('coach_chat', actor_id) then raise exception 'Coach chat is not enabled for this account'; end if;
  if target_horse_id is not null and not private.can_view_horse(target_horse_id) then raise exception 'Horse is not available'; end if;
  if char_length(trim(title_input)) not between 1 and 100 then raise exception 'Conversation title is required'; end if;
  if char_length(trim(focus_input)) not between 1 and 80 then raise exception 'Focus is required'; end if;
  if char_length(trim(load_input)) not between 1 and 80 then raise exception 'Weekly load is required'; end if;
  if char_length(trim(style_input)) not between 1 and 80 then raise exception 'Response style is required'; end if;

  update public.coach_conversations
  set
    title = trim(title_input),
    selected_horse_id = target_horse_id,
    context_focus = trim(focus_input),
    context_load = trim(load_input),
    response_style = trim(style_input),
    archived_at = case when archive_input then coalesce(archived_at, now()) else null end
  where id = target_conversation_id and user_id = actor_id
  returning * into updated;

  if updated.id is null then raise exception 'Conversation not found'; end if;
  return updated;
end;
$$;

create or replace function public.delete_coach_conversation(target_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  deleted_count integer;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  delete from public.coach_conversations
  where id = target_conversation_id and user_id = actor_id;
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

create or replace function public.delete_my_coach_history()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  deleted_count integer;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  delete from public.coach_conversations where user_id = actor_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.record_coach_request(
  target_user_id uuid,
  request_key_input uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  minute_count integer;
  day_count integer;
begin
  if target_user_id is null then raise exception 'User is required'; end if;
  if exists (
    select 1 from public.coach_usage_events
    where user_id = target_user_id and request_key = request_key_input
  ) then return false;
  end if;

  select count(*) into minute_count
  from public.coach_usage_events
  where user_id = target_user_id and created_at > now() - interval '1 minute';
  if minute_count >= 8 then raise exception 'Coach chat minute limit exceeded'; end if;

  select count(*) into day_count
  from public.coach_usage_events
  where user_id = target_user_id and created_at > now() - interval '24 hours';
  if day_count >= 60 then raise exception 'Coach chat daily limit exceeded'; end if;

  insert into public.coach_usage_events(user_id, request_key)
  values (target_user_id, request_key_input);
  return true;
end;
$$;

alter table public.coach_conversations enable row level security;
alter table public.coach_messages enable row level security;
alter table public.coach_message_operations enable row level security;
alter table public.coach_message_feedback enable row level security;
alter table public.coach_safety_events enable row level security;
alter table public.coach_usage_events enable row level security;

create policy coach_conversations_read_self
on public.coach_conversations for select to authenticated
using (user_id = auth.uid());

create policy coach_messages_read_self
on public.coach_messages for select to authenticated
using (
  exists (
    select 1 from public.coach_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
);

create policy coach_feedback_read_self
on public.coach_message_feedback for select to authenticated
using (user_id = auth.uid());
create policy coach_feedback_insert_self
on public.coach_message_feedback for insert to authenticated
with check (
  user_id = auth.uid()
  and private.feature_enabled('coach_chat')
  and exists (
    select 1
    from public.coach_messages m
    join public.coach_conversations c on c.id = m.conversation_id
    where m.id = message_id and m.role = 'assistant' and c.user_id = auth.uid()
  )
);
create policy coach_feedback_update_self
on public.coach_message_feedback for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy coach_feedback_delete_self
on public.coach_message_feedback for delete to authenticated
using (user_id = auth.uid());

revoke execute on function public.create_coach_conversation(uuid, text, text, text) from public, anon;
revoke execute on function public.update_coach_conversation(uuid, text, uuid, text, text, text, boolean) from public, anon;
revoke execute on function public.delete_coach_conversation(uuid) from public, anon;
revoke execute on function public.delete_my_coach_history() from public, anon;
revoke execute on function public.record_coach_request(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_coach_conversation(uuid, text, text, text) to authenticated;
grant execute on function public.update_coach_conversation(uuid, text, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.delete_coach_conversation(uuid) to authenticated;
grant execute on function public.delete_my_coach_history() to authenticated;
grant execute on function public.record_coach_request(uuid, uuid) to service_role;

grant select on public.coach_conversations, public.coach_messages to authenticated;
grant select, insert, update, delete on public.coach_message_feedback to authenticated;

grant select, insert, update, delete on
  public.coach_conversations,
  public.coach_messages,
  public.coach_message_operations,
  public.coach_message_feedback,
  public.coach_safety_events,
  public.coach_usage_events
to service_role;
grant usage, select on sequence public.coach_safety_events_id_seq to service_role;
grant usage, select on sequence public.coach_usage_events_id_seq to service_role;

alter publication supabase_realtime add table public.coach_messages;

commit;
