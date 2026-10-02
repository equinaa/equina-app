-- Client write privileges, stated in one place.
--
-- Hosted Supabase runs
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated, service_role;
-- so every table these migrations created started out with INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN for anon and
-- authenticated. The migrations were written as if tables started with no
-- grants. A column-level grant on top of a table-level one adds nothing, and a
-- column-level revoke (202607290001 on profiles) removes nothing.
--
-- RLS held most of the line: no write policy applies to anon, and every command
-- a client should not run has no permissive policy. What RLS cannot see is
-- which column a permitted write touches:
--
--   * profiles: avatar_path and onboarding_completed_at, writable by any
--     signed-in rider. 202610020002 fixes the same thing; it is restated below
--     because revoking at table level also clears column grants.
--   * club_posts and club_comments: moderation_status. The moderation trigger
--     only runs when body changes, so an author could set their hidden post
--     back to visible. space_id moved a post into a private space its author
--     cannot read, and created_at pinned a post to the top of the feed.
--   * horse_records.created_by, the server-owned listing columns, a report's
--     status and assignee, a review's verified flag, message read state.
--
-- So: take every write privilege away from both client roles, then grant back
-- exactly the columns the app writes directly (src/backend/*-repository.ts).
-- Edge Functions write with the service role and are untouched. A PostgREST
-- upsert sends ON CONFLICT DO UPDATE SET for every column in its payload, the
-- conflict key included, so an upserted table needs UPDATE on all of them.
--
-- SELECT is left alone: where clients hold a SELECT nobody granted, RLS has no
-- read policy for them and returns nothing.

begin;

-- Revoking at table level also revokes the matching column grants.
revoke insert, update, delete, truncate, references, trigger, maintain
  on all tables in schema public from anon, authenticated;

-- Every sequence here backs a server-written table.
revoke all on all sequences in schema public from anon, authenticated;

-- Account ---------------------------------------------------------------------

-- avatar_path is written by complete-upload, onboarding_completed_at by
-- complete_equina_onboarding; both run with elevated rights.
grant update (display_name, locale, location, discipline, skill_level, bio)
  on public.profiles to authenticated;

-- version is bumped by trigger.
grant
  insert (user_id, academy_discipline, academy_level, academy_focus,
          use_rider_profile, use_selected_horse, use_ride_history, reduced_personalization),
  update (academy_discipline, academy_level, academy_focus,
          use_rider_profile, use_selected_horse, use_ride_history, reduced_personalization)
  on public.user_preferences to authenticated;

grant
  insert (user_id, human_messages, order_changes, horse_reminders, academy_reminders,
          message_previews, quiet_hours_timezone, quiet_hours_start, quiet_hours_end),
  update (human_messages, order_changes, horse_reminders, academy_reminders,
          message_previews, quiet_hours_timezone, quiet_hours_start, quiet_hours_end)
  on public.notification_preferences to authenticated;

-- Horses and records ----------------------------------------------------------

-- Unchanged from 202607290001: photo_path belongs to complete-upload.
grant
  insert (owner_id, name, breed, discipline, birth_date, sex, height_cm, is_primary, archived_at),
  update (name, breed, discipline, birth_date, sex, height_cm, is_primary, archived_at)
  on public.horses to authenticated;

-- Invitations go through set_horse_collaborator; the invitee only accepts.
grant update (accepted_at), delete on public.horse_collaborators to authenticated;

-- Deletion goes through delete-horse-record, which also removes the files.
-- created_by and horse_id are fixed once the record exists.
grant
  insert (horse_id, created_by, record_type, status, title, occurred_on,
          due_on, provider_name, notes, source, details),
  update (status, title, occurred_on, due_on, provider_name, notes, source, details)
  on public.horse_records to authenticated;

grant
  insert (rider_id, horse_id, discipline, focus, planned_duration, started_at, completed_at,
          elapsed_seconds, completed_phases, total_phases, mood, rider_note),
  update (focus, mood, rider_note, elapsed_seconds, completed_phases),
  delete
  on public.ride_entries to authenticated;

-- Club ------------------------------------------------------------------------

-- joinSpace is an upsert. There is no UPDATE policy, so the UPDATE grant only
-- lets the statement plan; a repeated join is still refused by RLS.
grant insert (space_id, user_id, role), update (space_id, user_id, role), delete
  on public.club_memberships to authenticated;

-- moderation_status and edited_at are set by private.moderate_club_post.
-- Deleting a post goes through delete-club-post, which also removes media.
grant
  insert (author_id, space_id, post_type, body, horse_id, ride_id),
  update (body)
  on public.club_posts to authenticated;

grant
  insert (post_id, author_id, parent_id, body),
  update (body),
  delete
  on public.club_comments to authenticated;

grant insert (post_id, user_id, reaction), update (post_id, user_id, reaction), delete
  on public.club_reactions to authenticated;

grant insert (blocker_id, blocked_id), update (blocker_id, blocked_id), delete
  on public.user_blocks to authenticated;

-- status, assigned_to and resolved_at belong to staff (UPDATE granted below).
grant insert (reporter_id, post_id, comment_id, reported_user_id, reason, detail)
  on public.content_reports to authenticated;

-- Marketplace -----------------------------------------------------------------

-- status moves through publish_listing, archive_listing and the moderation
-- worker; moderation_note, published_at and reserved_until are theirs too.
-- Drafts are deleted by delete-listing-draft.
grant
  insert (seller_id, category, title, description, brand_name, model, condition_grade,
          price_minor, currency, country_code, locality, metadata, status),
  update (category, title, description, brand_name, model, condition_grade,
          price_minor, currency, country_code, locality, metadata)
  on public.listings to authenticated;

grant
  insert (listing_id, country_code, service_name, amount_minor, min_days, max_days,
          tracked, insured_up_to_minor),
  update (listing_id, country_code, service_name, amount_minor, min_days, max_days,
          tracked, insured_up_to_minor),
  delete
  on public.listing_shipping_rates to authenticated;

grant insert (user_id, listing_id), update (user_id, listing_id), delete
  on public.saved_listings to authenticated;

-- Conversations are opened by create_marketplace_conversation.
grant update (buyer_archived_at, seller_archived_at)
  on public.marketplace_conversations to authenticated;

grant
  insert (conversation_id, sender_id, client_nonce, body),
  update (delivery_status, read_at, deleted_at)
  on public.marketplace_messages to authenticated;

grant insert (reporter_id, listing_id, message_id, reported_user_id, reason, detail)
  on public.marketplace_reports to authenticated;

grant insert (order_id, reviewer_id, reviewee_id, rating, body)
  on public.marketplace_reviews to authenticated;

-- Ralf and the Academy --------------------------------------------------------

grant
  insert (user_id, message_id, useful, reason),
  update (user_id, message_id, useful, reason),
  delete
  on public.coach_message_feedback to authenticated;

grant
  insert (user_id, lesson_id, position_seconds, completed_at, last_seen_at),
  update (user_id, lesson_id, position_seconds, completed_at, last_seen_at),
  delete
  on public.academy_progress to authenticated;

-- Staff -----------------------------------------------------------------------

-- Every write policy on these requires private.is_staff() or the admin role,
-- and the app never writes them, so they keep the table-level grants their
-- migrations gave them.
grant insert, update, delete on
  public.academy_lessons,
  public.academy_chapters,
  public.app_feature_flags,
  public.coach_credit_policies,
  public.listing_risk_signals,
  public.moderation_actions
to authenticated;

grant update on
  public.content_reports,
  public.marketplace_reports,
  public.user_sanctions
to authenticated;

commit;
