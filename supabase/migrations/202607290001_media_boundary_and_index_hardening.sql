begin;

-- Media writes must pass through create-upload-ticket and complete-upload.
drop policy if exists avatars_upload_own on storage.objects;
drop policy if exists avatars_change_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;
drop policy if exists horse_media_upload_editor on storage.objects;
drop policy if exists horse_records_upload_editor on storage.objects;
drop policy if exists club_media_upload_author on storage.objects;
drop policy if exists listing_media_upload_seller on storage.objects;
drop policy if exists dispute_evidence_upload_participant on storage.objects;

drop policy if exists record_files_create_editor on public.horse_record_files;
drop policy if exists record_files_delete_editor on public.horse_record_files;
drop policy if exists post_media_create on public.club_post_media;
drop policy if exists post_media_delete on public.club_post_media;
drop policy if exists listing_photos_create_own on public.listing_photos;
drop policy if exists listing_photos_change_own on public.listing_photos;
drop policy if exists listing_photos_delete_own on public.listing_photos;
drop policy if exists dispute_evidence_create_participant on public.dispute_evidence;

revoke insert, delete on public.horse_record_files from authenticated;
revoke insert, update, delete on public.club_post_media from authenticated;
revoke insert, update, delete on public.listing_photos from authenticated;
revoke insert, update, delete on public.dispute_evidence from authenticated;

-- Server-owned paths and completion state cannot be forged by a mobile client.
revoke update (avatar_path, onboarding_completed_at) on public.profiles from authenticated;

revoke insert, update on public.horses from authenticated;
grant insert (
  owner_id, name, breed, discipline, birth_date, sex, height_cm, is_primary, archived_at
) on public.horses to authenticated;
grant update (
  name, breed, discipline, birth_date, sex, height_cm, is_primary, archived_at
) on public.horses to authenticated;

create or replace function private.protect_server_horse_photo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' and new.photo_path is not null then
      raise exception 'Horse photos must be registered by the upload service';
    end if;
    if tg_op = 'UPDATE' and new.photo_path is distinct from old.photo_path then
      raise exception 'Horse photos must be registered by the upload service';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists horses_protect_server_photo_insert on public.horses;
create trigger horses_protect_server_photo_insert
before insert on public.horses
for each row execute function private.protect_server_horse_photo();

drop trigger if exists horses_protect_server_photo_update on public.horses;
create trigger horses_protect_server_photo_update
before update of photo_path on public.horses
for each row execute function private.protect_server_horse_photo();

-- Index every previously uncovered FK so joins and cascades stay predictable at scale.
create index if not exists app_feature_flags_updated_by_idx on public.app_feature_flags(updated_by);
create index if not exists checkout_quotes_listing_idx on public.checkout_quotes(listing_id);
create index if not exists checkout_quotes_shipping_rate_idx on public.checkout_quotes(shipping_rate_id);
create index if not exists club_comments_author_idx on public.club_comments(author_id);
create index if not exists club_comments_parent_idx on public.club_comments(parent_id);
create index if not exists club_post_media_post_idx on public.club_post_media(post_id);
create index if not exists club_post_media_uploaded_by_idx on public.club_post_media(uploaded_by);
create index if not exists club_posts_horse_idx on public.club_posts(horse_id);
create index if not exists club_spaces_created_by_idx on public.club_spaces(created_by);
create index if not exists coach_conversations_selected_horse_idx on public.coach_conversations(selected_horse_id);
create index if not exists coach_safety_events_conversation_idx on public.coach_safety_events(conversation_id);
create index if not exists coach_safety_events_message_idx on public.coach_safety_events(message_id);
create index if not exists coach_safety_events_reviewed_by_idx on public.coach_safety_events(reviewed_by);
create index if not exists coach_safety_events_user_idx on public.coach_safety_events(user_id);
create index if not exists content_reports_assigned_to_idx on public.content_reports(assigned_to);
create index if not exists dispute_evidence_dispute_idx on public.dispute_evidence(dispute_id);
create index if not exists dispute_evidence_uploaded_by_idx on public.dispute_evidence(uploaded_by);
create index if not exists horse_collaborators_invited_by_idx on public.horse_collaborators(invited_by);
create index if not exists horse_record_files_record_idx on public.horse_record_files(record_id);
create index if not exists horse_record_files_uploaded_by_idx on public.horse_record_files(uploaded_by);
create index if not exists horse_records_created_by_idx on public.horse_records(created_by);
create index if not exists listing_photos_uploaded_by_idx on public.listing_photos(uploaded_by);
create index if not exists listing_risk_signals_resolved_by_idx on public.listing_risk_signals(resolved_by);
create index if not exists listings_brand_idx on public.listings(brand_id);
create index if not exists marketplace_reports_assigned_to_idx on public.marketplace_reports(assigned_to);
create index if not exists marketplace_reviews_reviewee_idx on public.marketplace_reviews(reviewee_id);
create index if not exists moderation_actions_marketplace_report_idx on public.moderation_actions(marketplace_report_id);
create index if not exists moderation_actions_moderator_idx on public.moderation_actions(moderator_id);
create index if not exists moderation_actions_report_idx on public.moderation_actions(report_id);
create index if not exists notification_outbox_recipient_idx on public.notification_outbox(recipient_id);
create index if not exists order_disputes_assigned_to_idx on public.order_disputes(assigned_to);
create index if not exists order_disputes_opened_by_idx on public.order_disputes(opened_by);
create index if not exists order_events_actor_idx on public.order_events(actor_id);
create index if not exists orders_listing_idx on public.orders(listing_id);
create index if not exists orders_quote_idx on public.orders(quote_id);
create index if not exists user_roles_granted_by_idx on public.user_roles(granted_by);
create index if not exists user_sanctions_issued_by_idx on public.user_sanctions(issued_by);
create index if not exists user_sanctions_lifted_by_idx on public.user_sanctions(lifted_by);

commit;
