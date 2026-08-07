#!/usr/bin/env python3
"""
Bundle the Eye Jacket page into a single self-contained .html file.

Everything — stylesheet, fonts, the 120-frame hero sequence, the stills and
the looping video — is inlined, so the result runs from a USB stick, an email
attachment or file:// with no server and no network.

    python3 build-offline.py [-o eye-jacket-offline.html] [--frames lg|sm]

Three deliberate choices:

* Frames are inlined as data: URIs in a `window.__FRAMES` array. main.js picks
  that up automatically and skips its normal path-based loading, so there is no
  forked copy of the engine to keep in sync.
* The video is inlined as base64 and handed to the page as a Blob URL rather
  than a data: URI. Safari will not reliably play a data: URI video because it
  wants byte-range requests; a Blob URL sidesteps that everywhere.
* Image references are matched per *attribute*, not per tag, and only for image
  extensions. A tag-anchored pattern only ever catches the first attribute, so
  a `<video src poster>` would keep an un-inlined poster; a pattern that is not
  extension-scoped swallows `<script src>` and produces a stub.
"""

import argparse
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.resolve()

MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
}

VIDEO_ID = 'iridiumVideo'
VIDEOS = [                       # order matters: it is the browser's pick order
    ('assets/media/iridium-loop.webm', 'video/webm'),
    ('assets/media/iridium-loop.mp4',  'video/mp4'),
]


def data_uri(path: Path) -> str:
    mime = MIME.get(path.suffix.lower(), 'application/octet-stream')
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def inline_css_urls(css: str, css_dir: Path) -> str:
    """Rewrite url(...) references to data: URIs, leaving existing ones alone."""
    def repl(m):
        raw = m.group(1).strip().strip('\'"')
        if raw.startswith(('data:', 'http:', 'https:', '#')):
            return m.group(0)
        target = (css_dir / raw).resolve()
        if not target.is_file():
            print(f'  ! missing, left as-is: {raw}')
            return m.group(0)
        return f"url('{data_uri(target)}')"
    return re.sub(r'url\(([^)]+)\)', repl, css)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-o', '--out', default='eye-jacket-offline.html')
    ap.add_argument('--frames', default='lg', choices=['lg', 'sm'],
                    help='frame set to embed (lg = 1280px, sm = 720px)')
    args = ap.parse_args()

    html = (ROOT / 'index.html').read_text()

    # ── stylesheets ──────────────────────────────────────────────────────
    for href in re.findall(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', html):
        path = ROOT / href
        css = inline_css_urls(path.read_text(), path.parent)
        html = re.sub(rf'<link rel="stylesheet" href="{re.escape(href)}"\s*/?>',
                      lambda _: f'<style>\n{css}\n</style>', html, count=1)
        print(f'  · inlined {href}')

    # preload hints point at files that no longer exist standalone
    html = re.sub(r'\s*<link rel="preload"[^>]*>', '', html)

    # ── image sources (incl. the video poster) ───────────────────────────
    refs = re.findall(r'\b(src|poster)="(assets/[^"]+\.(?:jpg|jpeg|png|svg))"', html)
    for attr, src in sorted(set(refs)):
        html = html.replace(f'{attr}="{src}"', f'{attr}="{data_uri(ROOT / src)}"')
        print(f'  · inlined {src}')
    html = re.sub(r'url\("(assets/[^"]+)"\)',
                  lambda m: f'url("{data_uri(ROOT / m.group(1))}")', html)

    # the sibling page does not travel with a single file
    html, n = re.subn(r'\n\s*<a href="\.\./index\.html"[^>]*>.*?</a>', '', html)
    print(f'  · dropped {n} link(s) to the sibling page')

    # ── hero frame sequence ──────────────────────────────────────────────
    frame_dir = ROOT / 'assets' / 'frames' / args.frames
    frames = sorted(frame_dir.glob('*.jpg'))
    if not frames:
        raise SystemExit(f'no frames found in {frame_dir}')
    uris = [data_uri(f) for f in frames]
    total = sum(f.stat().st_size for f in frames)
    print(f'  · inlined {len(frames)} frames from {args.frames}/ ({total/1e6:.1f} MB raw)')

    # ── looping video, as Blob URLs ──────────────────────────────────────
    # Both codecs travel: WebM/VP9 for Chromium builds without proprietary
    # codecs, MP4/H.264 for Safari. The <source> elements stay in place and
    # only lose their src, so the browser still does the picking.
    media = {}
    for rel, mime in VIDEOS:
        f = ROOT / rel
        media[mime] = base64.b64encode(f.read_bytes()).decode()
        html = html.replace(f'<source src="{rel}" type="{mime}">',
                            f'<source type="{mime}">')
        print(f'  · inlined {f.name} ({f.stat().st_size/1e6:.1f} MB raw)')

    payload = f"""<script>
window.__FRAMES = {json.dumps(uris)};
(function () {{
  // base64 -> Blob URL: Safari wants byte-range requests for video and will
  // not reliably play a data: URI source.
  var MEDIA = {json.dumps(media)};
  function blobUrl(b64, type) {{
    var bin = atob(b64), buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([buf], {{ type: type }}));
  }}
  var v = document.getElementById('{VIDEO_ID}');
  if (!v) return;
  var srcs = v.getElementsByTagName('source');
  for (var i = 0; i < srcs.length; i++) {{
    var t = srcs[i].getAttribute('type');
    if (MEDIA[t]) srcs[i].src = blobUrl(MEDIA[t], t);
  }}
  v.load();
}})();
</script>
"""

    # ── main.js, after the payload so window.__FRAMES is already set ─────
    js = (ROOT / 'assets' / 'js' / 'main.js').read_text()
    html = html.replace('<script src="assets/js/main.js" defer></script>',
                        payload + f'<script>\n{js}\n</script>')

    leftover = re.findall(r'(?:src|href|poster)="(assets/[^"]+)"', html)
    if leftover:
        print(f'  ! {len(leftover)} unresolved reference(s): {sorted(set(leftover))}')

    out = ROOT / args.out
    out.write_text(html)
    print(f'\n  → {out.name}  ({out.stat().st_size/1e6:.1f} MB)')


if __name__ == '__main__':
    main()
