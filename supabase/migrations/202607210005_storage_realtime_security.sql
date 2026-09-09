begin;

create or replace function private.safe_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function private.prevent_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Horse ownership cannot be changed by update';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_listing_seller_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.seller_id is distinct from old.seller_id then
    raise exception 'Listing seller cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_message_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.conversation_id is distinct from old.conversation_id or new.sender_id is distinct from old.sender_id or new.client_nonce is distinct from old.client_nonce then
    raise exception 'Message identity cannot be changed';
  end if;
  if new.body is distinct from old.body and old.deleted_at is not null then
    raise exception 'Deleted messages cannot be edited';
  end if;
  return new;
end;
$$;

create trigger horses_prevent_owner_change before update on public.horses
for each row execute function private.prevent_owner_change();
create trigger listings_prevent_seller_change before update on public.listings
for each row execute function private.prevent_listing_seller_change();
create trigger messages_prevent_identity_change before update on public.marketplace_messages
for each row execute function private.prevent_message_identity_change();

revoke update on public.marketplace_conversations from authenticated;
grant update (buyer_archived_at, seller_archived_at) on public.marketplace_conversations to authenticated;
revoke update on public.marketplace_messages from authenticated;
grant update (delivery_status, read_at, deleted_at) on public.marketplace_messages to authenticated;
revoke all on public.payment_webhook_events from anon, authenticated;

revoke execute on function public.create_marketplace_conversation(uuid) from public, anon;
revoke execute on function public.publish_listing(uuid) from public, anon;
revoke execute on function public.begin_checkout(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_marketplace_conversation(uuid) to authenticated;
grant execute on function public.publish_listing(uuid) to authenticated;
grant execute on function public.begin_checkout(uuid, uuid, jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/heif']),
  ('horse-media', 'horse-media', false, 15728640, array['image/jpeg', 'image/png', 'image/heic', 'image/heif']),
  ('horse-records', 'horse-records', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']),
  ('club-media', 'club-media', false, 52428800, array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime']),
  ('listing-media', 'listing-media', false, 15728640, array['image/jpeg', 'image/png', 'image/heic', 'image/heif']),
  ('dispute-evidence', 'dispute-evidence', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_read_authenticated on storage.objects for select to authenticated
using (bucket_id = 'avatars');
create policy avatars_upload_own on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and private.safe_uuid((storage.foldername(name))[1]) = auth.uid());
create policy avatars_change_own on storage.objects for update to authenticated
using (bucket_id = 'avatars' and owner_id = auth.uid()::text)
with check (bucket_id = 'avatars' and owner_id = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and owner_id = auth.uid()::text);

create policy horse_media_read_authorized on storage.objects for select to authenticated
using (bucket_id = 'horse-media' and private.can_view_horse(private.safe_uuid((storage.foldername(name))[2])));
create policy horse_media_upload_editor on storage.objects for insert to authenticated
with check (
  bucket_id = 'horse-media'
  and private.safe_uuid((storage.foldername(name))[1]) = auth.uid()
  and private.can_edit_horse(private.safe_uuid((storage.foldername(name))[2]))
);
create policy horse_media_delete_owner on storage.objects for delete to authenticated
using (bucket_id = 'horse-media' and owner_id = auth.uid()::text);

create policy horse_records_read_authorized on storage.objects for select to authenticated
using (bucket_id = 'horse-records' and private.can_view_horse(private.safe_uuid((storage.foldername(name))[2])));
create policy horse_records_upload_editor on storage.objects for insert to authenticated
with check (
  bucket_id = 'horse-records'
  and private.safe_uuid((storage.foldername(name))[1]) = auth.uid()
  and private.can_edit_horse(private.safe_uuid((storage.foldername(name))[2]))
);
create policy horse_records_delete_owner on storage.objects for delete to authenticated
using (bucket_id = 'horse-records' and owner_id = auth.uid()::text);

create policy club_media_read_visible on storage.objects for select to authenticated
using (
  bucket_id = 'club-media'
  and exists (select 1 from public.club_posts p where p.id = private.safe_uuid((storage.foldername(name))[2]))
);
create policy club_media_upload_author on storage.objects for insert to authenticated
with check (
  bucket_id = 'club-media'
  and private.safe_uuid((storage.foldername(name))[1]) = auth.uid()
  and exists (select 1 from public.club_posts p where p.id = private.safe_uuid((storage.foldername(name))[2]) and p.author_id = auth.uid())
);
create policy club_media_delete_owner on storage.objects for delete to authenticated
using (bucket_id = 'club-media' and owner_id = auth.uid()::text);

create policy listing_media_read_public_listing on storage.objects for select to anon, authenticated
using (
  bucket_id = 'listing-media'
  and exists (select 1 from public.listings l where l.id = private.safe_uuid((storage.foldername(name))[2]))
);
create policy listing_media_upload_seller on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-media'
  and private.safe_uuid((storage.foldername(name))[1]) = auth.uid()
  and exists (
    select 1 from public.listings l
    where l.id = private.safe_uuid((storage.foldername(name))[2]) and l.seller_id = auth.uid() and l.status in ('draft', 'rejected')
  )
);
create policy listing_media_delete_owner on storage.objects for delete to authenticated
using (bucket_id = 'listing-media' and owner_id = auth.uid()::text);

create policy dispute_evidence_read_participant on storage.objects for select to authenticated
using (
  bucket_id = 'dispute-evidence'
  and exists (
    select 1 from public.order_disputes d
    join public.orders o on o.id = d.order_id
    where d.id = private.safe_uuid((storage.foldername(name))[2])
      and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or private.is_staff())
  )
);
create policy dispute_evidence_upload_participant on storage.objects for insert to authenticated
with check (
  bucket_id = 'dispute-evidence'
  and private.safe_uuid((storage.foldername(name))[1]) = auth.uid()
  and exists (
    select 1 from public.order_disputes d
    join public.orders o on o.id = d.order_id
    where d.id = private.safe_uuid((storage.foldername(name))[2]) and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  )
);
create policy dispute_evidence_delete_owner on storage.objects for delete to authenticated
using (bucket_id = 'dispute-evidence' and owner_id = auth.uid()::text);

do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array['club_posts', 'club_comments', 'club_reactions', 'marketplace_messages', 'orders', 'shipments']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end;
$$;

commit;

