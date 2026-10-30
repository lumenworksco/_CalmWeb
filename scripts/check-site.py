#!/usr/bin/env python3
"""Site checks, run by CI and by hand:  python3 scripts/check-site.py

1. Every local href/src in docs/**/*.html and admin/*.html points at a file that exists
   (root-relative paths resolve against docs/, or admin/ for admin pages).
2. No third-party scripts, styles, fonts, frames or images in any page or stylesheet: the
   site and the forms load nothing from other hosts. Plain links (<a href>) are fine.
"""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
docs, admin = root / "docs", root / "admin"
pages = sorted(docs.rglob("*.html")) + sorted(admin.glob("*.html"))
bad = []

def resolves(page, ref):
    ref = ref.split("#")[0].split("?")[0]
    if not ref:
        return True
    if ref.startswith("/"):
        return any((base / ref.lstrip("/")).exists() for base in ([admin, docs] if admin in page.parents else [docs]))
    return (page.parent / ref).exists()

for page in pages:
    text = page.read_text()
    for ref in re.findall(r'(?:href|src|srcset)="([^"]+)"', text):
        if re.match(r"(https?:|mailto:|data:|blob:|#)", ref) or "{" in ref:
            continue
        if not resolves(page, ref):
            bad.append(f"{page.relative_to(root)}: missing {ref}")
    # third-party resources: any external URL in a tag that loads something
    for tag in re.findall(r"<(?:script|link|img|iframe|source|video|audio|embed|object)\b[^>]*>", text):
        for url in re.findall(r'(?:src|href|srcset|data)="(https?://[^"]+)"', tag):
            bad.append(f"{page.relative_to(root)}: external resource {url}")

for css in list(docs.rglob("*.css")) + list(admin.glob("*.css")):
    for url in re.findall(r"url\(\s*['\"]?(https?:[^)'\"]+)", css.read_text()):
        bad.append(f"{css.relative_to(root)}: external url() {url}")
    for url in re.findall(r"@import\s+(?:url\()?['\"]?(https?:[^)'\";]+)", css.read_text()):
        bad.append(f"{css.relative_to(root)}: external @import {url}")

js_hosts = re.compile(r"""(?:import\s[^;]*from\s+|import\(|fetch\()\s*['"`](https?://[^'"`]+)""")
for js in list((docs / "forms").glob("*.js")) + list((docs / "f").glob("*.js")) + list(admin.glob("*.js")) + list((root / "worker/src").glob("*.js")):
    for url in js_hosts.findall(js.read_text()):
        bad.append(f"{js.relative_to(root)}: external import/fetch {url}")

print("\n".join(bad) or f"ok ({len(pages)} pages)")
sys.exit(1 if bad else 0)
