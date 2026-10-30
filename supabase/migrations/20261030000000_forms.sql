-- CalmWeb forms platform: schema, row-level security and the only entry points
-- respondents ever reach (security-definer functions, callable by the ingest Worker only).
--
-- Privacy model, enforced here and not just by policy:
--   * Anonymous rows (responses, page_reach, follow_ups) have no timestamp finer than an ISO week,
--     no IP, no user agent, no device id and no foreign key between them.
--   * Random uuid ids, no serial ids, no created_at: nothing in a row reveals insert order.
--   * anon and authenticated roles get no table access except admins through RLS.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Policies call this as the signed-in user, so it must be executable by them even when the project
-- does not grant execute on new functions by default.
grant execute on function public.is_admin() to authenticated;

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  title text not null check (length(title) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed', 'archived')),
  privacy_mode text not null default 'anonymous' check (privacy_mode in ('anonymous', 'identified')),
  draft jsonb not null default '{"pages":[]}',      -- editable form document, see docs/forms/core.js
  settings jsonb not null default '{}',             -- opens_at, closes_at, max_responses, thanks, consent, ...
  current_version int,                              -- latest published version
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Publishing freezes a copy, so editing a live form never corrupts earlier answers.
create table public.form_versions (
  form_id uuid not null references public.forms (id) on delete cascade,
  version int not null,
  privacy_mode text not null,
  doc jsonb not null,
  settings jsonb not null,
  published_at timestamptz not null default now(),
  primary key (form_id, version)
);

-- Anonymous answers. week = Monday of the ISO week. No other column on purpose.
create table public.responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  version int not null,
  week date not null,
  answers jsonb not null
);
create index responses_form_idx on public.responses (form_id);

-- Drop-off: plain counters per page, no id, no link to any response.
create table public.page_reach (
  form_id uuid not null references public.forms (id) on delete cascade,
  version int not null,
  page_id text not null,
  reached int not null default 0,
  primary key (form_id, version, page_id)
);

-- Waitlist / follow-up contacts on an anonymous form: own table, own request, week-rounded,
-- no id shared with responses.
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  week date not null,
  contact text not null check (length(contact) <= 320)
);

-- Identified mode only. Explicit consent, retention date, deletion on request via token.
create table public.identified_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  version int not null,
  submitted_on date not null default current_date,
  answers jsonb not null,
  contact jsonb not null,
  consented_at timestamptz not null,
  retention_until date not null,
  delete_token_hash text not null
);

-- ── RLS: admins only; respondents never touch tables ───────────────────────────────────
alter table public.admins enable row level security;
alter table public.forms enable row level security;
alter table public.form_versions enable row level security;
alter table public.responses enable row level security;
alter table public.page_reach enable row level security;
alter table public.follow_ups enable row level security;
alter table public.identified_responses enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on public.forms to authenticated;
grant select on public.form_versions, public.page_reach to authenticated;
grant select, delete on public.responses, public.follow_ups, public.identified_responses to authenticated;
grant select on public.admins to authenticated;

create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid());
create policy forms_admin on public.forms for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy versions_admin on public.form_versions for select to authenticated using (public.is_admin());
create policy responses_admin_read on public.responses for select to authenticated using (public.is_admin());
create policy responses_admin_delete on public.responses for delete to authenticated using (public.is_admin());
create policy reach_admin on public.page_reach for select to authenticated using (public.is_admin());
create policy followups_admin_read on public.follow_ups for select to authenticated using (public.is_admin());
create policy followups_admin_delete on public.follow_ups for delete to authenticated using (public.is_admin());
create policy identified_admin_read on public.identified_responses for select to authenticated using (public.is_admin());
create policy identified_admin_delete on public.identified_responses for delete to authenticated using (public.is_admin());

-- ── Admin: publish ────────────────────────────────────────────────────────────────────
create function public.publish_form(p_form_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.forms
     set current_version = coalesce(current_version, 0) + 1, status = 'published', updated_at = now()
   where id = p_form_id returning current_version into v;
  if v is null then raise exception 'no such form'; end if;
  insert into public.form_versions (form_id, version, privacy_mode, doc, settings)
    select id, v, privacy_mode, draft, settings from public.forms where id = p_form_id;
  return v;
end $$;

-- ── Respondent entry points (service_role only: the ingest Worker) ────────────────────
create function public.get_public_form(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'slug', f.slug, 'title', f.title, 'version', v.version, 'privacy_mode', v.privacy_mode,
           'doc', v.doc, 'settings', v.settings,
           'open', (f.status = 'published'
                    and (v.settings->>'opens_at' is null or (v.settings->>'opens_at')::timestamptz <= now())
                    and (v.settings->>'closes_at' is null or (v.settings->>'closes_at')::timestamptz > now())
                    and (v.settings->>'max_responses' is null
                         or (select count(*) from public.responses r where r.form_id = f.id)
                          + (select count(*) from public.identified_responses i where i.form_id = f.id)
                            < (v.settings->>'max_responses')::int)))
    from public.forms f
    join public.form_versions v on v.form_id = f.id and v.version = f.current_version
   where f.slug = p_slug and f.status in ('published', 'closed');
$$;

create function public.submit_response(p_slug text, p_answers jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare f public.forms; pub jsonb;
begin
  pub := public.get_public_form(p_slug);
  if pub is null or not (pub->>'open')::boolean or pub->>'privacy_mode' <> 'anonymous' then return false; end if;
  if pg_column_size(p_answers) > 65536 then return false; end if;
  select * into f from public.forms where slug = p_slug;
  insert into public.responses (form_id, version, week, answers)
    values (f.id, (pub->>'version')::int, date_trunc('week', now())::date, p_answers);
  return true;
end $$;

create function public.submit_identified(p_slug text, p_answers jsonb, p_contact jsonb, p_token_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare f public.forms; pub jsonb; days int;
begin
  pub := public.get_public_form(p_slug);
  if pub is null or not (pub->>'open')::boolean or pub->>'privacy_mode' <> 'identified' then return false; end if;
  if pg_column_size(p_answers) + pg_column_size(p_contact) > 65536 then return false; end if;
  days := coalesce((pub->'settings'->>'retention_days')::int, 90);
  select * into f from public.forms where slug = p_slug;
  insert into public.identified_responses (form_id, version, answers, contact, consented_at, retention_until, delete_token_hash)
    values (f.id, (pub->>'version')::int, p_answers, p_contact, now(), current_date + days, p_token_hash);
  return true;
end $$;

create function public.delete_identified(p_token_hash text) returns boolean
language sql security definer set search_path = '' as $$
  with d as (delete from public.identified_responses where delete_token_hash = p_token_hash returning 1)
  select exists (select 1 from d);
$$;

create function public.purge_expired() returns int
language sql security definer set search_path = '' as $$
  with d as (delete from public.identified_responses where retention_until < current_date returning 1)
  select count(*)::int from d;
$$;

create function public.track_page(p_slug text, p_version int, p_page_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare fid uuid;
begin
  select id into fid from public.forms where slug = p_slug and status = 'published' and current_version = p_version;
  if fid is null or length(p_page_id) > 64 then return; end if;
  insert into public.page_reach (form_id, version, page_id, reached) values (fid, p_version, p_page_id, 1)
    on conflict (form_id, version, page_id) do update set reached = public.page_reach.reached + 1;
end $$;

create function public.submit_follow_up(p_slug text, p_contact text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare fid uuid;
begin
  select id into fid from public.forms where slug = p_slug and status = 'published';
  if fid is null then return false; end if;
  insert into public.follow_ups (form_id, week, contact) values (fid, date_trunc('week', now())::date, p_contact);
  return true;
end $$;

revoke all on function public.get_public_form(text), public.submit_response(text, jsonb),
  public.submit_identified(text, jsonb, jsonb, text), public.delete_identified(text), public.purge_expired(),
  public.track_page(text, int, text), public.submit_follow_up(text, text) from public, anon, authenticated;
grant execute on function public.get_public_form(text), public.submit_response(text, jsonb),
  public.submit_identified(text, jsonb, jsonb, text), public.delete_identified(text), public.purge_expired(),
  public.track_page(text, int, text), public.submit_follow_up(text, text) to service_role;
revoke all on function public.publish_form(uuid) from public, anon;
grant execute on function public.publish_form(uuid) to authenticated;
