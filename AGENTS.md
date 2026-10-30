# CLAUDE.md

Web side of CalmCampus (the iOS app lives in `lumenworksco/CalmCampus`): pitch site, impact report and the evidence dossier backing their claims. Live at cc.braunf.com.

## Layout

- `docs/` — the site: plain HTML/CSS, no build step. Served by GitHub Pages from `main` `/docs`; `CNAME` holds the domain, `.nojekyll` disables Jekyll. Pages: `index.html` (pitch), `report.html` (impact report), `CalmCampus-One-Pager.pdf`.
- `research/` — evidence dossier PDF, source index (`index.csv`, one row per cited paper), `NOTES.md`, `research_log.md`. `papers/` (the PDFs) is gitignored; `download_papers.sh` re-fetches it.

## Commands

```bash
python3 -m http.server 3400 --directory docs   # preview at http://localhost:3400
```

CI (`.github/workflows/ci.yml`) checks that every local `href`/`src` in `docs/*.html` exists. Run the same check locally before pushing.

## Principles

- Claims on the site must trace to a source in `research/index.csv`; update the index and dossier together with the page.
- Wellness wording, not medical claims ("supports", not "detects burnout"). No fabricated numbers or testimonials.
- Privacy: no third-party trackers, analytics or embeds. The product keeps all data on-device, and the site must not contradict that.
- Keep the repo self-contained: don't depend on files from the app repo. Link to it instead.
