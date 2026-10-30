# Contributing to CalmWeb

Thanks for helping. This repo is the CalmCampus website and its evidence base, so accuracy matters more than volume. Small, focused changes are easiest to review. For the app itself, see the [CalmCampus](https://github.com/lumenworksco/CalmCampus) repo.

## Before you start

Open an issue first for anything larger than a typo, a broken link or a source correction.

## Ground rules

- **Every claim has a source.** If you add or change a number, add or update its row in `research/index.csv` and the dossier in the same pull request.
- **Wellness wording, not medical claims.** Say "supports", not "detects" or "diagnoses". No testimonials or figures we can't source.
- **No trackers.** No analytics, third-party scripts, embeds or fonts loaded from other hosts.
- **Plain HTML/CSS.** No build step or framework unless we agree on one in an issue first.
- **Keep it accessible.** Alt text on images, sensible heading order, readable contrast, works on a phone.

## Development

```bash
python3 -m http.server 3400 --directory docs   # http://localhost:3400
```

Check every page at phone width and at desktop width. Run the link check from the README before pushing; CI runs the same one.

## Pull requests

- Branch from `main`, keep the change focused, and explain the why.
- Make sure CI passes.
- Match the surrounding HTML/CSS style.

By contributing you agree that your work is released under the [MIT License](LICENSE).

Please be respectful and constructive; see the [Code of Conduct](CODE_OF_CONDUCT.md).
