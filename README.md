# _CalmWeb

[![CI](https://github.com/lumenworksco/_CalmWeb/actions/workflows/ci.yml/badge.svg)](https://github.com/lumenworksco/_CalmWeb/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Stack: plain HTML/CSS](https://img.shields.io/badge/stack-plain%20HTML%2FCSS-blue.svg)
![No trackers](https://img.shields.io/badge/trackers-none-brightgreen.svg)

**The web side of [CalmCampus](https://github.com/lumenworksco/CalmCampus)**, a privacy-first wellness companion for university students: the pitch site, the impact report and the evidence dossier behind their claims. Live at [**cc.braunf.com**](https://cc.braunf.com/).

<p align="center">
  <img src="docs/assets/og-image.png" width="600" alt="CalmCampus: Stop burnout before it starts">
</p>

## What's here

| Path | What it is |
|---|---|
| [`docs/`](docs/) | The site. Plain HTML/CSS, no build step: `index.html` (pitch), `report.html` (impact report), `CalmCampus-One-Pager.pdf` |
| [`research/`](research/) | Evidence dossier (PDF), source index (`index.csv`, one row per cited paper), notes and research log |

The iOS app, the on-device model and the design mockups live in the [CalmCampus](https://github.com/lumenworksco/CalmCampus) repo.

## Run it locally

```bash
python3 -m http.server 3400 --directory docs
```

Then open <http://localhost:3400>. There is nothing to install.

`research/papers/` (the downloaded PDFs) is gitignored. Run `research/download_papers.sh` to fetch it again.

## Deployment

GitHub Pages serves `main` from `/docs`, with the domain set in [`docs/CNAME`](docs/CNAME). Pushing to `main` publishes.

## Checks

CI verifies that every local `href`/`src` in `docs/*.html` points to a file that exists. Run the same check before you push:

```bash
python3 - <<'PY'
import re, pathlib
root = pathlib.Path("docs")
bad = [f"{p}: {r}" for p in root.glob("*.html")
       for r in re.findall(r'(?:href|src)="([^"#?]+)"', p.read_text())
       if not re.match(r'(https?:|mailto:|data:)', r) and not (root / r).exists()]
print("\n".join(bad) or "ok")
PY
```

## Principles

- **Every claim has a source.** Numbers on the site trace to a row in `research/index.csv`.
- **Wellness wording, not medical claims.** The product "supports", it does not "detect burnout".
- **No trackers.** No analytics, third-party scripts or embeds, matching the app's on-device promise.

## Contributing

Corrections to a claim or source are especially welcome, see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## Team

- **Florian Braun**: Engineering Technology, UCLL
- **Helene David**: Economics and Business, UCLL

## License

[MIT](LICENSE). The CalmCampus name and logo are not covered by the license.
