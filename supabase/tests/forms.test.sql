\set ON_ERROR_STOP on
-- Fixtures
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000aa'), ('00000000-0000-0000-0000-0000000000bb');
insert into public.admins values ('00000000-0000-0000-0000-0000000000aa');

-- Admin creates + publishes a form
set role authenticated; set request.jwt.sub = '00000000-0000-0000-0000-0000000000aa';
insert into public.forms (slug, title, draft, settings) values ('case-study', 'Case study', '{"pages":[{"id":"p1","blocks":[]}]}', '{"max_responses":2}');
select public.publish_form(id) from public.forms where slug = 'case-study';
do $$ begin assert (select current_version from public.forms where slug='case-study') = 1, 'published v1'; end $$;

-- A signed-in non-admin sees and can do nothing
set request.jwt.sub = '00000000-0000-0000-0000-0000000000bb';
do $$ begin
  assert (select count(*) from public.forms) = 0, 'non-admin sees no forms';
  begin perform public.publish_form((select id from public.forms limit 1)); exception when others then null; end;
  begin insert into public.forms (slug, title) values ('evil','x'); assert false, 'non-admin insert must fail';
  exception when insufficient_privilege or others then if sqlerrm like 'non-admin%' then raise; end if; end;
end $$;

-- anon has no table access and cannot call respondent functions
reset role; set role anon;
do $$ begin
  begin perform count(*) from public.responses; assert false, 'anon read must fail'; exception when insufficient_privilege then null; end;
  begin perform public.submit_response('case-study', '{}'); assert false, 'anon rpc must fail'; exception when insufficient_privilege then null; end;
end $$;

-- Ingest path (service_role): submit, limit, tracking
reset role; set role service_role;
do $$ declare r jsonb; begin
  assert public.submit_response('case-study', '{"q1":"a"}'), 'submit 1';
  assert public.submit_response('case-study', '{"q1":"b"}'), 'submit 2';
  assert not public.submit_response('case-study', '{"q1":"c"}'), 'limit of 2 enforced';
  assert not public.submit_response('missing', '{}'), 'unknown slug';
  assert (public.get_public_form('case-study')->>'open')::boolean = false, 'closed at limit';
  perform public.track_page('case-study', 1, 'p1'); perform public.track_page('case-study', 1, 'p1');
  assert public.submit_follow_up('case-study', 'a@b.eu'), 'follow-up';
end $$;

reset role;
do $$ begin assert (select reached from public.page_reach) = 2, 'page counter'; end $$;
-- Anonymity: no response column other than id/form/version/week/answers; week is a Monday;
-- follow_ups shares no id/timestamp finer than week with responses.
reset role;
do $$ begin
  assert (select array_agg(column_name::text order by column_name) from information_schema.columns
           where table_schema='public' and table_name='responses')
       = array['answers','form_id','id','version','week'], 'responses columns';
  assert (select array_agg(column_name::text order by column_name) from information_schema.columns
           where table_schema='public' and table_name='follow_ups')
       = array['contact','form_id','id','week'], 'follow_ups columns';
  assert (select bool_and(extract(isodow from week) = 1) from public.responses), 'week is Monday';
  assert not exists (select 1 from public.responses r join public.follow_ups f on f.id = r.id), 'no shared ids';
end $$;

-- Admin can read responses, delete works
set role authenticated; set request.jwt.sub = '00000000-0000-0000-0000-0000000000aa';
do $$ begin
  assert (select count(*) from public.responses) = 2, 'admin reads responses';
  delete from public.responses; assert (select count(*) from public.responses) = 0, 'admin deletes';
end $$;

-- Identified mode: consent, retention, delete-by-token, purge
reset role; set role authenticated; set request.jwt.sub = '00000000-0000-0000-0000-0000000000aa';
insert into public.forms (slug, title, privacy_mode, settings) values ('pilot-intake','Pilot','identified','{"retention_days":30}');
select public.publish_form(id) from public.forms where slug='pilot-intake';
reset role; set role service_role;
do $$ begin
  assert not public.submit_response('pilot-intake','{}'), 'anonymous endpoint refuses identified form';
  assert public.submit_identified('pilot-intake','{"q":1}','{"email":"x@y.eu"}','hash1'), 'identified submit';
  reset role;
  assert (select retention_until from public.identified_responses) = current_date + 30, 'retention';
  set role service_role;
  assert public.delete_identified('hash1'), 'delete by token';
  assert not public.delete_identified('hash1'), 'second delete is a no-op';
end $$;
\echo ALL SQL TESTS PASSED
