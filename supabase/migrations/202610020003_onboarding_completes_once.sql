-- complete_equina_onboarding rewrote the profile, the primary horse (creating
-- one if it had been archived) and the Academy preferences on every call, even
-- after onboarding had finished. Only the first completion may write.

begin;

create or replace function public.complete_equina_onboarding(
  display_name_input text,
  locale_input text,
  discipline_input public.discipline,
  skill_input public.rider_level,
  horse_name_input text,
  horse_breed_input text default null,
  horse_photo_path_input text default null
)
returns table(profile_id uuid, horse_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_horse_id uuid;
  safe_locale text;
  onboarding_was_complete boolean := false;
  has_horse_input boolean := nullif(trim(horse_name_input), '') is not null;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if char_length(trim(display_name_input)) not between 2 and 80 then raise exception 'A valid display name is required'; end if;
  if has_horse_input and char_length(trim(horse_name_input)) not between 2 and 80 then raise exception 'A valid horse name is required'; end if;
  if horse_breed_input is not null and char_length(trim(horse_breed_input)) > 100 then raise exception 'Horse breed is too long'; end if;
  -- Any photo path a client sends is refused by protect_server_horse_photo
  -- anyway. Refusing it here keeps that true on the early return below too.
  if nullif(trim(horse_photo_path_input), '') is not null then
    raise exception 'Horse photos must be registered by the upload service';
  end if;

  safe_locale := case
    when locale_input in ('en', 'ro', 'hu', 'de', 'fr', 'es', 'it') then locale_input
    else 'en'
  end;

  select onboarding_completed_at is not null
  into onboarding_was_complete
  from public.profiles
  where id = actor_id
  for update;

  -- Onboarding happens once. A rider who signs in on a new device can be
  -- routed through it again by a stale client, and rewriting the profile,
  -- horse and Academy preferences from that form would overwrite everything
  -- they have edited since. Answer as before, change nothing.
  if onboarding_was_complete then
    select id into target_horse_id
    from public.horses
    where owner_id = actor_id and is_primary and archived_at is null
    order by created_at
    limit 1;
    return query select actor_id, target_horse_id;
    return;
  end if;

  update public.profiles
  set
    display_name = trim(display_name_input),
    locale = safe_locale,
    discipline = discipline_input,
    skill_level = skill_input,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = actor_id;

  if not found then
    insert into public.profiles(
      id, display_name, locale, discipline, skill_level, onboarding_completed_at
    ) values (
      actor_id, trim(display_name_input), safe_locale, discipline_input, skill_input, now()
    );
  end if;

  insert into public.user_preferences(
    user_id, academy_discipline, academy_level, use_selected_horse
  ) values (
    actor_id, discipline_input, skill_input, has_horse_input
  )
  on conflict (user_id) do update set
    academy_discipline = excluded.academy_discipline,
    academy_level = excluded.academy_level,
    use_selected_horse = excluded.use_selected_horse;

  insert into public.notification_preferences(user_id)
  values (actor_id)
  on conflict (user_id) do nothing;

  if has_horse_input then
    select id into target_horse_id
    from public.horses
    where owner_id = actor_id and is_primary and archived_at is null
    order by created_at
    limit 1
    for update;

    if target_horse_id is null then
      insert into public.horses(
        owner_id, name, breed, discipline, photo_path, is_primary
      ) values (
        actor_id,
        trim(horse_name_input),
        nullif(trim(horse_breed_input), ''),
        discipline_input,
        nullif(trim(horse_photo_path_input), ''),
        true
      )
      returning id into target_horse_id;
    else
      update public.horses
      set
        name = trim(horse_name_input),
        breed = nullif(trim(horse_breed_input), ''),
        discipline = discipline_input,
        photo_path = coalesce(nullif(trim(horse_photo_path_input), ''), photo_path)
      where id = target_horse_id;
    end if;
  end if;

  if not onboarding_was_complete then
    insert into public.account_audit_events(user_id, event_type, detail)
    values (
      actor_id,
      'onboarding_completed',
      jsonb_build_object(
        'discipline', discipline_input,
        'skill_level', skill_input,
        'has_horse', has_horse_input
      )
    );
  end if;

  return query select actor_id, target_horse_id;
end;
$$;

revoke execute on function public.complete_equina_onboarding(
  text, text, public.discipline, public.rider_level, text, text, text
) from public, anon;
grant execute on function public.complete_equina_onboarding(
  text, text, public.discipline, public.rider_level, text, text, text
) to authenticated;

commit;
