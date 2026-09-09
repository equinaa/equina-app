begin;

create function public.get_seller_public_profile(target_user_id uuid)
returns table(
  user_id uuid,
  display_name text,
  avatar_path text,
  country_code text,
  verification_status public.seller_verification_status,
  member_since timestamptz,
  rating_average numeric,
  review_count bigint,
  completed_sales bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    exists (select 1 from public.listings l where l.seller_id = target_user_id and l.status in ('active', 'reserved', 'sold'))
    or exists (
      select 1 from public.marketplace_conversations c
      where c.seller_id = target_user_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
    or exists (
      select 1 from public.orders o
      where o.seller_id = target_user_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
    )
    or private.is_staff()
  ) then return; end if;

  return query
  select
    s.user_id,
    p.display_name,
    p.avatar_path,
    s.country_code,
    s.verification_status,
    s.created_at,
    round(avg(r.rating)::numeric, 2),
    count(r.id),
    (select count(*) from public.orders o where o.seller_id = s.user_id and o.status = 'completed')
  from public.seller_accounts s
  join public.profiles p on p.id = s.user_id
  left join public.marketplace_reviews r on r.reviewee_id = s.user_id and r.verified
  where s.user_id = target_user_id
  group by s.user_id, p.display_name, p.avatar_path, s.country_code, s.verification_status, s.created_at;
end;
$$;

revoke execute on function public.get_seller_public_profile(uuid) from public;
grant execute on function public.get_seller_public_profile(uuid) to anon, authenticated;

commit;
