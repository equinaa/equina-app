begin;

alter table public.content_reports add constraint content_reports_not_self
check (reported_user_id is null or reported_user_id <> reporter_id);
create unique index reports_no_duplicate_user on public.content_reports(reporter_id, reported_user_id)
where reported_user_id is not null and status in ('open', 'reviewing');
create unique index marketplace_report_user_once on public.marketplace_reports(reporter_id, reported_user_id)
where reported_user_id is not null and status in ('open', 'reviewing');

drop policy reports_create on public.content_reports;
create policy reports_create on public.content_reports for insert to authenticated
with check (
  reporter_id = auth.uid()
  and (
    (post_id is not null and exists (select 1 from public.club_posts p where p.id = post_id and p.author_id <> auth.uid()))
    or (comment_id is not null and exists (select 1 from public.club_comments c where c.id = comment_id and c.author_id <> auth.uid()))
    or (reported_user_id is not null and reported_user_id <> auth.uid() and exists (
      select 1 from public.club_posts p where p.author_id = reported_user_id and p.moderation_status = 'visible'
      union all
      select 1 from public.club_comments c where c.author_id = reported_user_id and c.moderation_status = 'visible'
    ))
  )
);

drop policy marketplace_reports_create on public.marketplace_reports;
create policy marketplace_reports_create on public.marketplace_reports for insert to authenticated
with check (
  reporter_id = auth.uid()
  and (
    (listing_id is not null and exists (
      select 1 from public.listings l where l.id = listing_id and l.seller_id <> auth.uid()
    ))
    or (message_id is not null and exists (
      select 1 from public.marketplace_messages m
      where m.id = message_id and m.sender_id <> auth.uid() and private.is_conversation_member(m.conversation_id)
    ))
    or (reported_user_id is not null and reported_user_id <> auth.uid() and exists (
      select 1 from public.marketplace_conversations c
      where (c.buyer_id = auth.uid() and c.seller_id = reported_user_id)
         or (c.seller_id = auth.uid() and c.buyer_id = reported_user_id)
    ))
  )
);

commit;
