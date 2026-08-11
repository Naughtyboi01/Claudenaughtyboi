#!/usr/bin/env python3
"""
Fold the FrostByte site into one self-contained HTML file.

    python3 build-offline.py                  -> frostbyte-offline.html
    python3 build-offline.py --profile mobile -> frostbyte-offline-mobile.html

Styles, fonts, scripts, stills and the campaign film all go inline, so the
result makes no network requests at all and opens straight off file://.

Two things worth knowing:

* The film is handed to the page as base64 in `window.__FROSTBYTE_MEDIA`, and
  main.js turns it into a **Blob URL** at load. It is not a `data:` URI —
  media elements want byte-range requests to seek, and a data: source will
  not scrub reliably (Safari in particular refuses). Blob URLs seek fine.
* main.js checks for that global and skips its path-based loading when it is
  there, so the served site and the offline file share one codebase.
"""

import argparse
import base64
import mimetypes
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"

PROFILES = {
    "desktop": {
        "out": "frostbyte-offline.html",
        "img": ASSETS / "img",
        "poster": ASSETS / "media" / "poster.jpg",
        "poster-static": ASSETS / "media" / "poster-static.jpg",
        # both codecs: an offline file may be opened anywhere, including
        # browsers built without the proprietary ones
        "film": [("mp4", ASSETS / "media" / "hero.mp4"),
                 ("webm", ASSETS / "media" / "hero.webm")],
    },
    "mobile": {
        "out": "frostbyte-offline-mobile.html",
        "img": ASSETS / "img" / "sm",
        "poster": ASSETS / "media" / "poster-sm.jpg",
        "poster-static": ASSETS / "media" / "poster-static-sm.jpg",
        # H.264 only: every phone decodes it in hardware, and the VP9 copy
        # would be the single largest thing in the file
        "film": [("mp4", ASSETS / "media" / "hero-sm.mp4")],
    },
}


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if path.suffix == ".woff2":
        mime = "font/woff2"
    return f"data:{mime};base64,{b64(path)}"


def inline_css(css_path: Path, posters: dict) -> str:
    """Inline a stylesheet's own url() references."""
    css = css_path.read_text(encoding="utf-8")

    def sub(match: re.Match) -> str:
        raw = match.group(1).strip("'\"")
        if raw.startswith(("data:", "http:", "https:")):
            return match.group(0)
        # posters are swapped for the profile's own copies, by stem
        stem = Path(raw).stem
        target = posters[stem] if stem in posters else (css_path.parent / raw).resolve()
        if not target.exists():
            sys.exit(f"missing asset referenced by {css_path.name}: {raw}")
        return f"url('{data_uri(target)}')"

    return re.sub(r"url\(\s*([^)]+?)\s*\)", sub, css)


def guard(js: str) -> str:
    """Keep an inlined script from closing its own tag."""
    return js.replace("</script", "<\\/script")


def build(profile_name: str) -> Path:
    p = PROFILES[profile_name]
    html = (HERE / "index.html").read_text(encoding="utf-8")

    posters = {"poster": p["poster"], "poster-static": p["poster-static"]}

    for path in [*posters.values(), *(f for _, f in p["film"])]:
        if not path.exists():
            sys.exit(f"missing media for the {profile_name} profile: {path.relative_to(HERE)}")

    # ── stylesheets ──────────────────────────────────────────────────────
    styles = "\n".join(
        inline_css(ASSETS / "css" / name, posters) for name in ("fonts.css", "style.css")
    )
    html = re.sub(
        r'<link rel="stylesheet" href="assets/css/fonts\.css">\s*'
        r'<link rel="stylesheet" href="assets/css/style\.css">',
        f"<style>\n{styles}\n</style>",
        html,
    )

    # preloads point at files that no longer exist beside the page
    html = re.sub(r'\s*<link rel="preload"[^>]*>', "", html)

    # ── stills ───────────────────────────────────────────────────────────
    def img_sub(match: re.Match) -> str:
        name = Path(match.group(1)).name
        target = p["img"] / name
        if not target.exists():
            sys.exit(f"missing still for the {profile_name} profile: {target.relative_to(HERE)}")
        return f'src="{data_uri(target)}"'

    html = re.sub(r'src="(assets/img/[^"]+)"', img_sub, html)

    # ── the film ─────────────────────────────────────────────────────────
    poster_uri = data_uri(p["poster"])
    html = html.replace('poster="assets/media/poster.jpg"', f'poster="{poster_uri}"')
    html = re.sub(r'\s*data-src(-webm)?="assets/media/[^"]+"', "", html)
    # the <noscript> fallback paints the same frame as a background
    html = html.replace("url(assets/media/poster.jpg)", f"url({poster_uri})")

    media = ",".join(f'{key}:"{b64(path)}"' for key, path in p["film"])
    media_tag = f"<script>window.__FROSTBYTE_MEDIA={{{media}}};</script>"

    # ── scripts ──────────────────────────────────────────────────────────
    for src in ("assets/vendor/gsap.min.js",
                "assets/vendor/ScrollTrigger.min.js",
                "assets/js/main.js"):
        body = guard((HERE / src).read_text(encoding="utf-8"))
        # the film has to exist before main.js looks for it
        prefix = media_tag + "\n" if src.endswith("main.js") else ""
        html = html.replace(f'<script src="{src}" defer></script>',
                            f"{prefix}<script>\n{body}\n</script>")

    for leftover in re.findall(r'(?:src|href)="assets/[^"]+"', html):
        sys.exit(f"an asset was left un-inlined: {leftover}")

    out = HERE / p["out"]
    out.write_text(html, encoding="utf-8")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--profile", choices=[*PROFILES, "all"], default="all",
                    help="which build to write (default: all)")
    args = ap.parse_args()

    names = list(PROFILES) if args.profile == "all" else [args.profile]
    for name in names:
        written = build(name)
        print(f"{written.name}  {written.stat().st_size / 1048576:.1f} MB  ({name})")
