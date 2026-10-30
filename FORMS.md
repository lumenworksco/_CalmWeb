# CalmWeb forms platform

A custom form builder and public form pages in the CalmCampus design system, running on cc.braunf.com. Built instead of Tally or Google Forms so that the look, the privacy promise and the wellness-specific question types are ours. The first form to run on it is an anonymous demand case study (template `case-study`).

## How it fits together

```
 respondent ──► cc.braunf.com/f/<slug>   static shell (GitHub Pages) served via the Worker route
            ──► cc.braunf.com/api/*      Cloudflare Worker: validates, spam-checks, stores
                                              │  service key, server to server
                                              ▼
                                         Supabase Postgres (EU region), RLS on every table

 admin     ──► admin.cc.braunf.com       static admin app (Cloudflare Pages), signs in with an email code
            ──► Supabase directly         RLS lets only users in `admins` read or write anything
```

| Part | Where | Notes |
|---|---|---|
| Design tokens | `docs/tokens.css` | Shared by the site, the forms and the admin. Dark values live in `docs/forms/forms.css`. |
| Form logic | `docs/forms/core.js` | Document model, show-if logic, validation, summaries, CSV. Pure functions, used by the browser **and** the Worker, so the server enforces what the respondent sees. |
| Renderer | `docs/forms/render.js` | The whole respondent flow, and the admin's live preview. DOM built with `textContent` only. |
| Public page | `docs/f/` | `/f/<slug>`; strict CSP (`'self'` only). |
| Templates | `docs/forms/templates.js` | Case study, waitlist, pilot intake, quick feedback. |
| Ingest Worker | `worker/` | `/api/*`: challenge, submit, reach, follow-up, delete. |
| Database | `supabase/migrations/` | Tables, RLS, the respondent functions. Tests in `supabase/tests/`. |
| Admin | `admin/` | Builder, settings, sharing, results. Assembled for deployment by `scripts/assemble-admin.sh`. |

## Privacy model, and how it is enforced

**Anonymous (default).** There is no account, cookie, local ID, IP, user agent or fingerprint stored with an answer.

- Respondents never call Supabase. They call the Worker, which stores only the cleaned answers. Supabase sees the Worker's address, not the respondent's. The Worker does not log requests (`observability` is off) and passes no client headers on.
- An answer row is `id` (random uuid), `form_id`, `version`, `week` (the Monday of the ISO week) and `answers`. No `created_at`, no serial id, nothing about insert order. Tables and exports are shuffled. The database tests assert this column list.
- Drop-off uses plain per-page counters (`page_reach`) with no id.
- A waitlist or follow-up email on an anonymous form is a **separate request into a separate table** (`follow_ups`), week-rounded, with no id shared with any answer. The form says so.
- Answers on the device while filling in are `localStorage` only, cleared on send. "Remember it was answered" is a flag on the device and is not enforced by the server; that is the price of anonymity.
- The admin never shows a breakdown or filter result of fewer than 5 responses (`MIN_GROUP` in `core.js`).

**Identified.** For forms where you must know who answered. It collects only the fields the form asks for, with a consent checkbox, a per-form retention period (a daily job deletes expired rows) and a deletion code the respondent can use at `cc.braunf.com/f/`. Only a hash of the code is stored.

**Spam without CAPTCHA.** A signed, expiring challenge from the Worker, a small proof-of-work solved in the browser (`docs/forms/pow.js`), a minimum fill time, a honeypot field, and optional Cloudflare rate limiting. Nothing identifying is stored with the answer. The replay guard is in-memory per Worker instance: it is best effort, which is fine for spam, and not a security boundary.

**Honest limits, also stated to respondents.** The network provider in front of the Worker (Cloudflare) sees the IP address while delivering a request; we do not store it. In anonymous forms, free text can identify someone, so the form warns respondents and the admin warns when there are few responses. Anonymous answers cannot be deleted by respondents, because nobody can tell which are theirs.

Surveys differ from the app: the CalmCampus app keeps its data on the phone, but a form has to send answers to a server. The privacy notice on every form says so plainly.

## Data model

- `forms`: slug, title, `status` (draft, published, closed, archived), `privacy_mode`, `draft` (the editable document), `settings`, `current_version`.
- `form_versions`: a frozen copy per publish. Editing a live form never corrupts earlier answers, and results can be read per version.
- Document: `{ pages: [{ id, title, blocks: [{ id, type, label, help, required, options, other, min, max, minLabel, maxLabel, maxLength, show_if }] }] }`. `show_if` is `{ all | any: [{ q, op, value }] }` over earlier questions. `{{blockId}}` in text pipes an earlier answer in.
- Question types: short and long text, email, number, date, single and multiple choice, dropdown, ranking, yes/no, rating, number scale, mood/energy slider, illustrated scale, “How’s your week been?”, plus text, image and divider blocks.
- Themes are not data. There is one theme, the CalmCampus design system, with two safe options (accent sage or terracotta, cover circles) and light/dark by system setting.
- Not built yet: matrix questions, file upload (deliberately skipped: it adds storage, malware and EXIF risk for little gain on anonymous forms), per-block validation patterns, email or webhook notification, linking forms to pilots.

## Local development (no accounts, no Docker)

```bash
node scripts/dev-server.mjs          # http://localhost:3400 , admin at /admin/ , login code 000000
node scripts/seed-dev.mjs            # publishes the four templates: /f/case-study, /f/waitlist, ...
node --test tests/*.test.mjs         # core, proof-of-work and Worker tests
bash supabase/tests/run.sh           # migration, RLS and anonymity tests (needs PostgreSQL 14+ binaries)
python3 scripts/check-site.py        # links resolve, nothing loads from third parties
```

The dev server serves the site, the admin, the real Worker code and an in-memory stand-in for Supabase (`scripts/fake-supabase.mjs`). Data is lost when it stops.

## Going live

None of this is automated, because it creates accounts and changes DNS. Do these once.

1. **Supabase** (EU region: Frankfurt or Ireland). Create a project, then run `supabase/migrations/*.sql` (SQL editor, or `supabase db push`).
   - Authentication: turn **off** “Allow new users to sign up”. Turn on the Email provider. In the “Magic Link” email template, include `{{ .Token }}` so the email carries a code.
   - Create your admin user (Authentication → Users → Add user), then in the SQL editor: `insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';`
2. **Admin config.** Put the project URL and the **anon** key in `admin/config.js` (both are public by design; RLS protects the data). Never put the service key anywhere in the repo.
3. **Worker.** In `worker/`: `npx wrangler secret put SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CHALLENGE_SECRET` (a long random string), uncomment `routes` in `wrangler.toml`, then `npx wrangler deploy`. This needs braunf.com on Cloudflare with the `cc` record proxied. *(DNS change: yours to make.)*
4. **Admin hosting.** A Cloudflare Pages project on this repo: build command `bash scripts/assemble-admin.sh`, output directory `dist-admin`, custom domain `admin.cc.braunf.com`. *(DNS change: yours to make.)* Optionally put Cloudflare Access in front as a second lock.
5. **Create the first form.** Sign in at admin.cc.braunf.com, New form, “Student stress & support: demand case study”, review the words, Settings → check the privacy notice, Publish. The link is `https://cc.braunf.com/f/case-study`.

GitHub Pages settings and the `CNAME` file are untouched by all of this.
