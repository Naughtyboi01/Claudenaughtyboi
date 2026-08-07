#!/usr/bin/env python3
"""
Bundle a site in this repo into a single self-contained .html file.

Everything — stylesheets, fonts, the hero frame sequence, the stills and the
looping video — is inlined, so the result runs from a USB stick, an email
attachment or file:// with no server and no network.

    python3 build-offline.py                      # House of Rocky, desktop
    python3 build-offline.py --preset mobile      # House of Rocky, lighter
    python3 build-offline.py --site airmax95      # the older study

Three deliberate choices:

* Frames are inlined as data: URIs in a `window.__FRAMES` array. main.js picks
  that up automatically and skips its normal path-based loading.
* The video is inlined as base64 and handed to the page as a Blob URL rather
  than a data: URI. Safari will not reliably play a data: URI video because it
  wants byte-range requests; a Blob URL sidesteps that everywhere.
* `--image-width` re-encodes oversized stills on the way in. Base64 costs a
  third on top of every byte, so the mobile preset leans on it heavily.
"""

import argparse
import base64
import io
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.resolve()

MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
}

RASTER = {'.jpg', '.jpeg', '.png'}

SITES = {
    'rocky': {
        'html':     'index.html',
        'prefix':   'rocky',
        'js':       'rocky/js/main.js',
        'frames':   'rocky/frames',
        'video':    'rocky/media/house-of-rocky.mp4',
        'video_id': 'film-video',
        'out':      'house-of-rocky-offline.html',
    },
    'airmax95': {
        'html':     'airmax95.html',
        'prefix':   'assets',
        'js':       'assets/js/main.js',
        'frames':   'assets/frames',
        'video':    'assets/media/air-max-95.mp4',
        'video_id': 'airVideo',
        'out':      'airmax95-offline.html',
    },
}

PRESETS = {
    'desktop': {'frames': 'lg', 'image_width': 0},
    'mobile':  {'frames': 'sm', 'image_width': 900},
}


def shrink(path: Path, max_width: int) -> bytes:
    """Re-encode a raster image down to max_width. Returns original bytes if
    it is already small enough, or if Pillow is unavailable."""
    raw = path.read_bytes()
    if not max_width or path.suffix.lower() not in RASTER:
        return raw
    try:
        from PIL import Image
    except ImportError:
        return raw
    im = Image.open(io.BytesIO(raw))
    if im.width <= max_width:
        return raw
    h = round(im.height * max_width / im.width)
    im = im.resize((max_width, h), Image.LANCZOS)
    buf = io.BytesIO()
    if path.suffix.lower() == '.png':
        im.save(buf, 'PNG', optimize=True)
    else:
        im.convert('RGB').save(buf, 'JPEG', quality=84, optimize=True)
    return buf.getvalue()


def data_uri(path: Path, max_width: int = 0) -> str:
    mime = MIME.get(path.suffix.lower(), 'application/octet-stream')
    return f"data:{mime};base64,{base64.b64encode(shrink(path, max_width)).decode()}"


def expand_imports(css: str, css_dir: Path, max_width: int, depth: int = 0) -> str:
    """Splice @import'ed stylesheets in as text.

    They cannot go in as data: URIs — a browser will not apply an imported
    sheet unless it is served as text/css, and base64 blobs come back as
    application/octet-stream. Each import has its own url() references
    resolved against its own directory before being spliced.
    """
    if depth > 8:
        raise SystemExit('@import nested too deeply — check for a cycle')

    def repl(m):
        raw = m.group(1).strip().strip('\'"')
        if raw.startswith(('data:', 'http:', 'https:')):
            return m.group(0)
        target = (css_dir / raw).resolve()
        if not target.is_file():
            print(f'  ! missing @import, left as-is: {raw}')
            return m.group(0)
        inner = expand_imports(target.read_text(), target.parent, max_width, depth + 1)
        print(f'  · spliced @import {raw}')
        return inline_css_urls(inner, target.parent, max_width)

    return re.sub(r'@import\s+url\(([^)]+)\)\s*;', repl, css)


def inline_css_urls(css: str, css_dir: Path, max_width: int) -> str:
    """Rewrite url(...) references to data: URIs, leaving existing ones alone."""
    def repl(m):
        raw = m.group(1).strip().strip('\'"')
        if raw.startswith(('data:', 'http:', 'https:', '#')):
            return m.group(0)
        target = (css_dir / raw).resolve()
        if not target.is_file():
            print(f'  ! missing, left as-is: {raw}')
            return m.group(0)
        return f"url('{data_uri(target, max_width)}')"
    return re.sub(r'url\(([^)]+)\)', repl, css)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--site', default='rocky', choices=sorted(SITES))
    ap.add_argument('--preset', default='desktop', choices=sorted(PRESETS))
    ap.add_argument('-o', '--out', help='output filename (defaults per site/preset)')
    ap.add_argument('--frames', choices=['lg', 'sm'], help='override the preset frame set')
    ap.add_argument('--image-width', type=int,
                    help='override: cap inlined stills at this width (0 = leave alone)')
    args = ap.parse_args()

    site = SITES[args.site]
    preset = PRESETS[args.preset]
    frame_set = args.frames or preset['frames']
    max_width = preset['image_width'] if args.image_width is None else args.image_width
    prefix = site['prefix']

    out_name = args.out or (
        site['out'] if args.preset == 'desktop'
        else site['out'].replace('.html', '-mobile.html'))

    print(f'  building {args.site} · {args.preset} · frames={frame_set} · '
          f'images={"≤" + str(max_width) + "px" if max_width else "original"}\n')

    html = (ROOT / site['html']).read_text()

    # ── stylesheets ──────────────────────────────────────────────────────
    for href in re.findall(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', html):
        path = ROOT / href
        css = expand_imports(path.read_text(), path.parent, max_width)
        css = inline_css_urls(css, path.parent, max_width)
        html = re.sub(rf'<link rel="stylesheet" href="{re.escape(href)}"\s*/?>',
                      lambda _: f'<style>\n{css}\n</style>', html, count=1)
        print(f'  · inlined {href}')

    # preload hints point at files that no longer exist standalone
    html = re.sub(r'\s*<link rel="preload"[^>]*>', '', html)

    # ── images: src, poster, and the icon/apple-touch-icon hrefs ─────────
    # Scan per attribute, not per tag: a tag can carry both src and poster,
    # and a tag-anchored match only ever yields the first of them. Anchor
    # hrefs are untouched because the pattern demands the asset prefix.
    refs = re.findall(
        rf'\b(src|poster|href)="({re.escape(prefix)}/[^"]+\.(?:jpg|jpeg|png|svg))"', html)
    for attr, src in sorted(set(refs)):
        html = html.replace(f'{attr}="{src}"', f'{attr}="{data_uri(ROOT / src, max_width)}"')
        print(f'  · inlined {src}')
    html = re.sub(rf'url\("({re.escape(prefix)}/[^"]+)"\)',
                  lambda m: f'url("{data_uri(ROOT / m.group(1), max_width)}")', html)

    # ── hero frame sequence ──────────────────────────────────────────────
    frame_dir = ROOT / site['frames'] / frame_set
    frames = sorted(frame_dir.glob('*.jpg'))
    if not frames:
        raise SystemExit(f'no frames found in {frame_dir}')
    uris = [data_uri(f) for f in frames]          # already sized by frame set
    total = sum(f.stat().st_size for f in frames)
    print(f'  · inlined {len(frames)} frames from {frame_set}/ ({total/1e6:.1f} MB raw)')

    # ── looping video, as a Blob URL ─────────────────────────────────────
    video = ROOT / site['video']
    video_b64 = base64.b64encode(video.read_bytes()).decode()
    # Drop whichever form the markup uses: a src attribute or a <source> child.
    html = html.replace(f' src="{site["video"]}"', '')
    html = re.sub(rf'\s*<source src="{re.escape(site["video"])}"[^>]*>', '', html)
    print(f'  · inlined {video.name} ({video.stat().st_size/1e6:.1f} MB raw)')

    payload = f"""<script>
window.__FRAMES = {json.dumps(uris)};
(function () {{
  // base64 -> Blob URL: Safari wants byte-range requests for video and will
  // not reliably play a data: URI source.
  var b64 = "{video_b64}", bin = atob(b64), buf = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  var v = document.getElementById('{site["video_id"]}');
  if (v) v.src = URL.createObjectURL(new Blob([buf], {{ type: 'video/mp4' }}));
}})();
</script>
"""

    # ── main.js, after the payload so window.__FRAMES is already set ─────
    js = (ROOT / site['js']).read_text()
    html = html.replace(f'<script src="{site["js"]}"></script>',
                        payload + f'<script>\n{js}\n</script>')

    leftover = re.findall(rf'(?:src|href|poster)="({re.escape(prefix)}/[^"]+)"', html)
    if leftover:
        print(f'  ! {len(leftover)} unresolved reference(s): {sorted(set(leftover))}')

    out = ROOT / out_name
    out.write_text(html)
    print(f'\n  → {out.name}  ({out.stat().st_size/1e6:.1f} MB)')


if __name__ == '__main__':
    main()
