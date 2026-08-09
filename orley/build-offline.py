#!/usr/bin/env python3
"""
Fold the whole site into one HTML file you can email, carry on a stick, or
open with nothing else beside it.

    python3 build-offline.py                # -> orley-offline.html, 1500px frames
    python3 build-offline.py --frames sm    # smaller, 820px frames

Styles, fonts, all 151 hero frames, the stills and the backdrop track go in as
data URIs. The page already makes no network requests at runtime, so the only
thing this changes is that the parts arrive in one piece.

Two things worth knowing:

  * Frames go in as a `window.__ORLEY_FRAMES` array. main.js checks for it and
    skips its path-based loading, so both builds share one copy of the code
    rather than a fork that has to be kept in step.
  * Nothing here uses fetch(), which is why the result works straight off
    file:// where a fetch of a local file would be blocked.
"""

import argparse
import base64
import mimetypes
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent


def data_uri(path: pathlib.Path) -> str:
    mime = mimetypes.guess_type(path.name)[0]
    if path.suffix == ".webp":
        mime = "image/webp"
    elif path.suffix == ".woff2":
        mime = "font/woff2"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def build_css() -> str:
    css = (HERE / "assets" / "css" / "style.css").read_text()
    fonts = (HERE / "assets" / "css" / "fonts.css").read_text()

    # Resolve the @import in place, then swap each face for its bytes.
    def font_url(m):
        name = pathlib.PurePath(m.group(1)).name
        return 'url("%s")' % data_uri(HERE / "assets" / "fonts" / name)

    fonts = re.sub(r'url\("([^"]+\.woff2)"\)', font_url, fonts)
    css = re.sub(r'@import\s+url\("fonts\.css"\);', fonts, css, count=1)

    if "@import" in css:
        sys.exit("an @import survived; the bundle would still hit the network")
    return css


def inline_images(html: str) -> tuple[str, int]:
    """Swap every image reference for its bytes.

    Scoped to image suffixes on purpose: a broader pattern also eats
    <script src>, which quietly produces a bundle with no JavaScript in it.
    Every occurrence is replaced, not the first per tag — attribute order is
    not something to rely on.
    """
    seen = 0

    def repl(m):
        nonlocal seen
        attr, rel = m.group(1), m.group(2)
        path = HERE / rel
        if not path.exists():
            sys.exit(f"missing asset referenced by index.html: {rel}")
        seen += 1
        return f'{attr}="{data_uri(path)}"'

    html = re.sub(r'\b(src|poster)="(assets/[^"]+\.(?:webp|png|jpg|jpeg|avif))"',
                  repl, html)
    return html, seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", choices=("lg", "sm"), default="lg")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    html = (HERE / "index.html").read_text()

    # 1. styles and fonts
    css = build_css()
    html = re.sub(r'\s*<link rel="stylesheet"[^>]*>',
                  "\n<style>\n" + css + "\n</style>", html, count=1)
    # The font preloads point at files that no longer exist separately.
    html = re.sub(r'\s*<link rel="preload"[^>]*as="font"[^>]*>', "", html)

    # 2. stills
    html, n_img = inline_images(html)

    # 3. hero frames
    seq = sorted((HERE / "assets" / "seq" / args.frames).glob("*.webp"))
    if not seq:
        sys.exit(f"no frames in assets/seq/{args.frames} — run build-assets.py")
    frames = ",".join('"%s"' % data_uri(f) for f in seq)

    backdrop = (HERE / "assets" / "js" / "backdrop.js").read_text()
    main_js = (HERE / "assets" / "js" / "main.js").read_text()
    for name, body in (("backdrop.js", backdrop), ("main.js", main_js)):
        if "</script" in body:
            sys.exit(f"{name} contains a closing script tag; inlining is unsafe")

    bundle = (
        "<script>\n"
        f"window.__ORLEY_FRAMES=[{frames}];\n"
        f"{backdrop}\n"
        "</script>\n"
        "<script>\n"
        f"{main_js}\n"
        "</script>"
    )
    html = re.sub(
        r'<script src="assets/js/backdrop\.js"></script>\s*'
        r'<script src="assets/js/main\.js"></script>',
        lambda _: bundle, html, count=1)

    # Only markup attributes matter. main.js still carries the string
    # 'assets/seq/' in the path-based branch it no longer takes, and that is
    # not a reference to anything.
    leftover = sorted(set(re.findall(
        r'\b(?:src|href|poster)="(assets/[^"]+)"', html)))
    if leftover:
        sys.exit("unresolved references remain: " + ", ".join(leftover))

    out = pathlib.Path(args.out) if args.out else (
        HERE / ("orley-offline.html" if args.frames == "lg"
                else f"orley-offline-{args.frames}.html"))
    out.write_text(html)

    print(f"{out.name}: {out.stat().st_size/1e6:.2f} MB "
          f"({len(seq)} frames @ {args.frames}, {n_img} stills, fonts inlined)")


if __name__ == "__main__":
    main()
