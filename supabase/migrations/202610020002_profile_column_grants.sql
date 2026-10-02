-- Hosted Supabase grants every privilege on a new public table to anon and
-- authenticated by default. The column-level revoke in 202607290001 therefore
-- never took effect: a table-level UPDATE grant covers every column, so a
-- signed-in rider could still write their own avatar_path (pointing it at
-- another rider's file, which the upload and deletion workers then remove) and
-- onboarding_completed_at (skipping onboarding).
--
-- Revoke at the table level, then grant back only the columns the app edits
-- directly. avatar_path is written by complete-upload, onboarding_completed_at
-- by complete_equina_onboarding; both run with elevated rights.
revoke insert, update, delete, truncate, references, trigger
  on public.profiles from anon, authenticated;

grant update (display_name, locale, location, discipline, skill_level, bio)
  on public.profiles to authenticated;
