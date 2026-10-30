-- Insertion order is a side channel. Postgres keeps rows in physical order and stamps each with the
-- transaction id that wrote it (xmin), so anyone with database access could pair an anonymous
-- follow-up email with the response sent a few seconds earlier. This function rewrites both tables in
-- one transaction, in random order: every row then carries the same xmin and no physical order.
-- It runs hourly from the Worker's scheduled job. What remains: someone watching the database live
-- between runs, and backups taken between runs. FORMS.md says so.

create function public.reshuffle_anonymous() returns void
language plpgsql security definer set search_path = '' as $$
begin
  create temp table _r on commit drop as select * from public.responses order by random();
  create temp table _f on commit drop as select * from public.follow_ups order by random();
  delete from public.responses;
  delete from public.follow_ups;
  insert into public.responses select * from _r order by random();
  insert into public.follow_ups select * from _f order by random();
end $$;

revoke all on function public.reshuffle_anonymous() from public, anon, authenticated;
grant execute on function public.reshuffle_anonymous() to service_role;

-- Follow-up contacts are only accepted by anonymous forms that have the option enabled. They do not
-- require the form to still be open: the last respondent closes a capped form and must still be able to leave one.
create or replace function public.submit_follow_up(p_slug text, p_contact text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare pub jsonb; fid uuid;
begin
  pub := public.get_public_form(p_slug);
  if pub is null or pub->>'privacy_mode' <> 'anonymous'
     or coalesce((pub->'settings'->'follow_up'->>'enabled')::boolean, false) is not true then return false; end if;
  select id into fid from public.forms where slug = p_slug;
  insert into public.follow_ups (form_id, week, contact) values (fid, date_trunc('week', now())::date, p_contact);
  return true;
end $$;
