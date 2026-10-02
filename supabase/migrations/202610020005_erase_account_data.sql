begin;

-- Erases everything personal an account leaves in the database.
--
-- process-account-deletions used to do this itself, one HTTP request per table,
-- and only for the tables that existed when it was written. Everything added
-- since stayed behind: the ride journal (with the rider's private notes),
-- Academy progress, the onboarding starter pack, collaborations on other
-- riders' horses, feature overrides and roles. Nothing cascades to them either:
-- the auth user is soft-deleted, because orders and other legal records still
-- point at it, so no foreign key from auth.users ever fires. Every table has to
-- be named.
--
-- This function names them all, in one transaction, so a failure leaves the
-- account whole for the next retry instead of half erased. A test fails when a
-- new table references auth.users without appearing here or on the explicit
-- list of records retained on purpose (billing ledger, orders, trust and
-- safety, audit).
--
-- Storage objects are not touched here: the worker reads their paths first and
-- queues them for the storage cleanup worker before calling this.
create or replace function public.erase_account_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user_id is null then
    raise exception 'A user is required';
  end if;

  -- Media rows of the rider's posts. The posts themselves stay, redacted
  -- below, so threads other riders replied to keep their shape.
  delete from public.club_post_media
  where post_id in (select id from public.club_posts where author_id = target_user_id);

  -- Horses take their records, record files and collaborators with them.
  -- Other riders' rides on these horses keep their entry, without the horse.
  delete from public.horses where owner_id = target_user_id;
  -- Collaborations on other riders' horses.
  delete from public.horse_collaborators
  where user_id = target_user_id or invited_by = target_user_id;

  delete from public.ride_entries where rider_id = target_user_id;
  delete from public.academy_progress where user_id = target_user_id;
  delete from public.onboarding_starter_packs where user_id = target_user_id;
  -- Messages, their operations and feedback cascade from the conversation.
  delete from public.coach_conversations where user_id = target_user_id;
  delete from public.coach_message_feedback where user_id = target_user_id;
  delete from public.coach_usage_events where user_id = target_user_id;
  delete from public.data_export_requests where user_id = target_user_id;
  delete from public.push_devices where user_id = target_user_id;
  delete from public.notification_outbox where recipient_id = target_user_id;
  delete from public.upload_tickets where user_id = target_user_id;
  delete from public.club_memberships where user_id = target_user_id;
  delete from public.club_reactions where user_id = target_user_id;
  delete from public.saved_listings where user_id = target_user_id;
  delete from public.user_blocks
  where blocker_id = target_user_id or blocked_id = target_user_id;
  delete from public.user_preferences where user_id = target_user_id;
  delete from public.notification_preferences where user_id = target_user_id;
  delete from public.feature_flag_overrides where user_id = target_user_id;
  delete from public.user_roles where user_id = target_user_id;

  -- Redacted in place rather than deleted: other riders replied to them.
  -- moderate_club_post keeps 'deleted' when the body changes in the same update.
  update public.club_posts
  set body = '[Deleted by rider]', moderation_status = 'deleted'
  where author_id = target_user_id;
  update public.club_comments
  set body = '[Deleted by rider]', moderation_status = 'deleted'
  where author_id = target_user_id;
  update public.marketplace_messages
  set body = '[Deleted by rider]', deleted_at = now()
  where sender_id = target_user_id;

  update public.profiles
  set
    display_name = 'Deleted rider',
    avatar_path = null,
    location = null,
    discipline = null,
    skill_level = null,
    bio = null
  where id = target_user_id;
end;
$$;

revoke execute on function public.erase_account_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_account_data(uuid) to service_role;

commit;
