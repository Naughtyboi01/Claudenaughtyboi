#!/usr/bin/env python3
"""
Bundle Naught to Ten into a single self-contained .html file.

Everything — stylesheets, fonts, the 145-frame hero sequence, the editorial
crops and the looping film — is inlined, so the result runs from a USB stick,
an email attachment or file:// with no server and no network.

    python3 build-offline.py                # desktop, 1600px frames
    python3 build-offline.py --frames sm    # mobile,  960px frames
    python3 build-offline.py --both         # writes both files

Three deliberate choices:

* Frames go in as a `window.__FRAMES` array of data URIs. main.js detects that
  and skips its normal path-based loading, so both builds share one codebase.
* The film is inlined as base64 and handed to the page as a Blob URL rather
  than a data: URI. Safari wants byte-range requests for media and will not
  reliably play a data: URI video source.
* Asset references are rewritten per attribute rather than per tag. A tag can
  carry both `src` and `poster`; a tag-anchored match only ever catches the
  first one and silently leaves the other pointing at a file that is no longer
  there.
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

VIDEO = 'assets/media/naught-to-ten-loop.mp4'
VIDEO_EL = 'filmV'

_cache: dict[Path, str] = {}


def data_uri(path: Path) -> str:
    if path not in _cache:
        mime = MIME.get(path.suffix.lower(), 'application/octet-stream')
        _cache[path] = f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"
    return _cache[path]


def inline_css_urls(css: str, css_dir: Path) -> str:
    """Rewrite url(...) references to data: URIs, leaving absolute ones alone."""
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


def build(frame_set: str, out_name: str) -> None:
    html = (ROOT / 'index.html').read_text()

    # ── stylesheets ──────────────────────────────────────────────────────
    for href in re.findall(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', html):
        path = ROOT / href
        css = inline_css_urls(path.read_text(), path.parent)
        html = re.sub(rf'<link rel="stylesheet" href="{re.escape(href)}"\s*/?>',
                      lambda _: f'<style>\n{css}\n</style>', html, count=1)
        print(f'  · inlined {href}')

    # hints that point at an origin this file no longer has
    html = re.sub(r'\s*<link rel="pre(?:load|connect)"[^>]*>', '', html)

    # ── image references ─────────────────────────────────────────────────
    # Per attribute, not per tag — the <video> carries src and poster both.
    refs = re.findall(r'\b(src|poster|data-img)="(assets/[^"]+\.(?:jpg|jpeg|png|svg))"', html)
    for attr, src in sorted(set(refs)):
        html = html.replace(f'{attr}="{src}"', f'{attr}="{data_uri(ROOT / src)}"')
        print(f'  · inlined {src}')

    # inline style="background-image:url(...)" — either quote style, or none
    html = re.sub(r"""url\((['"]?)(assets/[^)'"]+\.(?:jpg|jpeg|png|svg))\1\)""",
                  lambda m: f"url('{data_uri(ROOT / m.group(2))}')", html)

    # ── hero frame sequence ──────────────────────────────────────────────
    frame_dir = ROOT / 'assets' / 'frames' / frame_set
    frames = sorted(frame_dir.glob('*.jpg'))
    if not frames:
        raise SystemExit(f'no frames found in {frame_dir}')
    uris = [data_uri(f) for f in frames]
    raw = sum(f.stat().st_size for f in frames)
    print(f'  · inlined {len(frames)} frames from {frame_set}/ ({raw/1e6:.1f} MB raw)')

    # ── the film, as a Blob URL ──────────────────────────────────────────
    video = ROOT / VIDEO
    video_b64 = base64.b64encode(video.read_bytes()).decode()
    html = html.replace(f' src="{VIDEO}"', '')
    print(f'  · inlined {video.name} ({video.stat().st_size/1e6:.1f} MB raw)')

    payload = f"""<script>
window.__FRAMES = {json.dumps(uris)};
(function () {{
  // base64 -> Blob URL: Safari wants byte-range requests for video and will
  // not reliably play a data: URI source.
  var bin = atob("{video_b64}"), buf = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  var v = document.getElementById('{VIDEO_EL}');
  if (v) v.src = URL.createObjectURL(new Blob([buf], {{ type: 'video/mp4' }}));
}})();
</script>
"""

    # main.js goes after the payload so window.__FRAMES is already set
    js = (ROOT / 'assets' / 'js' / 'main.js').read_text()
    html = html.replace('<script src="assets/js/main.js"></script>',
                        payload + f'<script>\n{js}\n</script>')

    leftover = re.findall(r'(?:src|href|poster|data-img)="(assets/[^"]+)"', html)
    leftover += re.findall(r'url\([\'"]?(assets/[^)\'"]+)', html)
    if leftover:
        raise SystemExit(f'  ! unresolved reference(s): {sorted(set(leftover))}')

    out = ROOT / out_name
    out.write_text(html)
    print(f'  → {out.name}  ({out.stat().st_size/1e6:.1f} MB)\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', default='lg', choices=['lg', 'sm'],
                    help='frame set to embed (lg = 1600px, sm = 960px)')
    ap.add_argument('-o', '--out', help='output filename (default depends on --frames)')
    ap.add_argument('--both', action='store_true', help='write the desktop and mobile files')
    args = ap.parse_args()

    names = {'lg': 'naught-to-ten-offline-desktop.html',
             'sm': 'naught-to-ten-offline-mobile.html'}

    if args.both:
        for fs in ('lg', 'sm'):
            build(fs, names[fs])
    else:
        build(args.frames, args.out or names[args.frames])


if __name__ == '__main__':
    main()
