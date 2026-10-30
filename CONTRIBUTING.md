# Contributing to CalmWeb

Thanks for helping. This repo is the CalmCampus website and its evidence base, so accuracy matters more than volume. Small, focused changes are easiest to review. For the app itself, see the [CalmCampus](https://github.com/lumenworksco/CalmCampus) repo.

## Before you start

Open an issue first for anything larger than a typo, a broken link or a source correction.

## Ground rules

- **Every claim has a source.** If you add or change a number, add or update its row in `research/index.csv` and the dossier in the same pull request.
- **Wellness wording, not medical claims.** Say "supports", not "detects" or "diagnoses". No testimonials or figures we can't source.
- **No trackers.** No analytics, third-party scripts, embeds or fonts loaded from other hosts. CI fails if a page, stylesheet or script pulls in anything external.
- **Plain HTML/CSS/JS.** No build step or framework unless we agree on one in an issue first. The Worker is deployed with Wrangler; that is a deploy tool, not a site build.
- **Forms keep respondents anonymous.** Changes to the forms platform must not add anything that could identify a respondent to an anonymous form (IPs, user agents, fine timestamps, shared ids). Add or update a test in `supabase/tests/` or `tests/` with the change.
- **Keep it accessible.** Alt text on images, sensible heading order, readable contrast, works on a phone.

## Development

```bash
python3 -m http.server 3400 --directory docs   # the site, http://localhost:3400
node scripts/dev-server.mjs                    # site + forms + admin, no accounts needed
node scripts/seed-dev.mjs                      # load the templates
```

Check every page at phone width and at desktop width, with the keyboard, and in light and dark mode for form pages. Run `python3 scripts/check-site.py`, `node --test tests/*.test.mjs` and `bash supabase/tests/run.sh` before pushing; CI runs the same. See [FORMS.md](FORMS.md) for how the forms platform fits together.

## Pull requests

- Branch from `main`, keep the change focused, and explain the why.
- Make sure CI passes.
- Match the surrounding HTML/CSS style.

By contributing you agree that your work is released under the [MIT License](LICENSE).

Please be respectful and constructive; see the [Code of Conduct](CODE_OF_CONDUCT.md).
