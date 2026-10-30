# calmweb

The web side of CalmCampus: pitch site, impact report and evidence dossier for [CalmCampus](https://github.com/lumenworksco/CalmCampus), a privacy-first wellness companion for university students. Live at [cc.braunf.com](https://cc.braunf.com/).

```
docs/       The site (plain HTML/CSS), served by GitHub Pages from /docs (CNAME: cc.braunf.com)
research/   Evidence dossier and source index backing the site's claims
```

## Preview

```bash
python3 -m http.server 3400 --directory docs
```

`research/papers/` (downloaded PDFs) is gitignored; `research/download_papers.sh` re-fetches it.

## Checks

CI verifies that every local `href`/`src` in `docs/*.html` exists.
