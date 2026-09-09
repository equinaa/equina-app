begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-exports',
  'account-exports',
  false,
  10485760,
  array['application/json', 'application/zip']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.enqueue_marketplace_message_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation public.marketplace_conversations;
  target_recipient uuid;
  target_listing_title text;
  notification_enabled boolean;
begin
  select * into target_conversation
  from public.marketplace_conversations
  where id = new.conversation_id;
  if target_conversation.id is null then return new; end if;

  target_recipient := case
    when new.sender_id = target_conversation.buyer_id then target_conversation.seller_id
    else target_conversation.buyer_id
  end;

  select title into target_listing_title
  from public.listings
  where id = target_conversation.listing_id;

  select coalesce(human_messages, true) into notification_enabled
  from public.notification_preferences
  where user_id = target_recipient;

  insert into public.notification_outbox(
    recipient_id,
    event_type,
    entity_type,
    entity_id,
    dedupe_key,
    payload,
    status
  ) values (
    target_recipient,
    'marketplace_message',
    'marketplace_conversation',
    target_conversation.id,
    'marketplace-message:' || new.id::text,
    jsonb_build_object(
      'conversationId', target_conversation.id,
      'listingId', target_conversation.listing_id,
      'listingTitle', coalesce(target_listing_title, 'Shop item')
    ),
    case when coalesce(notification_enabled, true) then 'pending' else 'suppressed' end
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create trigger marketplace_message_notification_outbox
after insert on public.marketplace_messages
for each row execute function private.enqueue_marketplace_message_notification();

create or replace function private.notification_category_enabled(
  target_user_id uuid,
  target_event_type text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case target_event_type
      when 'marketplace_message' then p.human_messages
      when 'order_change' then p.order_changes
      when 'horse_reminder' then p.horse_reminders
      when 'academy_reminder' then p.academy_reminders
      else false
    end,
    false
  )
  from public.notification_preferences p
  where p.user_id = target_user_id;
$$;

revoke execute on function private.notification_category_enabled(uuid, text)
from public, anon, authenticated;
grant execute on function private.notification_category_enabled(uuid, text)
to service_role;

commit;
