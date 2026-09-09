begin;

create or replace function private.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.marketplace_conversations set
    last_message_at = new.created_at,
    buyer_archived_at = case when buyer_id <> new.sender_id then null else buyer_archived_at end,
    seller_archived_at = case when seller_id <> new.sender_id then null else seller_archived_at end
  where id = new.conversation_id;
  return new;
end;
$$;

commit;
