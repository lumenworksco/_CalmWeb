# CLAUDE.md

CalmWeb: the web side of CalmCampus (the iOS app lives in `lumenworksco/CalmCampus`): pitch site, impact report and the evidence dossier backing their claims. Live at cc.braunf.com.

## Layout

- `docs/` — the site: plain HTML/CSS/JS, no build step. Served by GitHub Pages from `main` `/docs`; `CNAME` holds the domain, `.nojekyll` disables Jekyll. Pages: `index.html` (pitch), `report.html` (impact report), `CalmCampus-One-Pager.pdf`. `tokens.css` holds the design tokens and fonts shared with the forms; `site.css` styles the pages (`style.css` looks like a leftover, check before touching). `f/` and `forms/` are the public form pages (see FORMS.md).
- `admin/` — private forms admin (builder, settings, share, results), plain ES modules. Deployed on its own origin via `scripts/assemble-admin.sh`; imports shared files from `docs/` by root-relative paths.
- `worker/` — Cloudflare Worker (`/api/*`, `/f/<slug>`): the only way respondents reach the database. `supabase/` — migrations and SQL tests. `tests/` — `node:test` suites. `scripts/` — dev server, in-memory Supabase fake, seed, site check, admin assemble.
- `research/` — evidence dossier PDF, source index (`index.csv`, one row per cited paper), `NOTES.md`, `research_log.md`. `papers/` (the PDFs) is gitignored; `download_papers.sh` re-fetches it.

## Commands

```bash
python3 -m http.server 3400 --directory docs   # site only, http://localhost:3400
node scripts/dev-server.mjs                    # site + forms + admin (/admin/, code 000000) + Worker + fake Supabase
node scripts/seed-dev.mjs                      # publish the templates into the running dev server
python3 scripts/check-site.py                  # links resolve, nothing loads from third parties
node --test tests/*.test.mjs                   # core, proof-of-work, Worker
bash supabase/tests/run.sh                     # migration + RLS + anonymity tests (needs PostgreSQL binaries)
```

CI (`.github/workflows/ci.yml`) runs all of the checks above. Run them before pushing.

## Principles

- Claims on the site must trace to a source in `research/index.csv`; update the index and dossier together with the page.
- Wellness wording, not medical claims ("supports", not "detects burnout"). No fabricated numbers or testimonials.
- Privacy: no third-party trackers, analytics or embeds. The product keeps all data on-device, and the site must not contradict that.
- Forms: `docs/forms/core.js` is shared by the browser and the Worker, so keep it pure (no DOM, no network). Anonymous tables must never gain an identifying or fine-grained column; `supabase/tests/forms.test.sql` asserts the column lists. No third-party scripts, fonts or embeds anywhere, including the admin; CSP is `'self'`-only, so no inline scripts or style attributes (set styles through CSSOM).
- Never commit secrets: the Supabase service key and `CHALLENGE_SECRET` live only in Worker secrets. The anon key in `admin/config.js` is public by design.
- Keep the repo self-contained: don't depend on files from the app repo. Link to it instead.
