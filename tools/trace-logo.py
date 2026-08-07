#!/usr/bin/env python3
"""
Trace the supplied House of Rocky logo into SVG paths.

The logo arrived as a JPEG: black square, cream disc, dark lettering. This
lifts the lettering off the disc, traces it to Bezier outlines, and writes

    rocky/img/logo-wordmark.svg   the mark alone, tight viewBox
    rocky/img/logo-circle.svg     the mark on its cream disc

Both use fill="currentColor" for the lettering, so colour comes from CSS
instead of from a filter hack.

The trace runs on a 2x upsample of the mask. potrace fits curves to whole
pixels, so tracing at native resolution leaves visible faceting on the thin
italic strokes of "House of"; upsampling first buys sub-pixel edges and the
curve fitter smooths the JPEG's own noise back out.

    python3 tools/trace-logo.py [path/to/logo.jpeg]
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from potrace import Bitmap

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'rocky' / 'img'

SRC_DEFAULT = ('/root/.claude/uploads/b993f866-dba1-5b9b-8b71-8193cf37b8db/'
               'fef7b15d-IMG_5372.jpeg')

UPSAMPLE = 2
RIM_INSET = 14          # px at native size; skips the disc's anti-aliased edge
INK = '#141210'
CREAM = '#F7F2EA'


def build_mask(src: Path):
    """Binary ink mask, plus the disc geometry in native pixels."""
    im = Image.open(src).convert('RGB')
    n = im.size[0]

    disc = Image.new('L', (n, n), 0)
    ImageDraw.Draw(disc).ellipse((RIM_INSET, RIM_INSET, n - 1 - RIM_INSET, n - 1 - RIM_INSET),
                                 fill=255)

    lum = np.asarray(im).astype(np.float32).mean(axis=2)
    # 250 = the cream ground, 18 = the darkest ink.
    alpha = np.clip((250.0 - lum) / (250.0 - 18.0), 0, 1)
    alpha *= np.asarray(disc).astype(np.float32) / 255.0

    a = Image.fromarray((alpha * 255).astype(np.uint8), 'L')
    a = a.resize((n * UPSAMPLE, n * UPSAMPLE), Image.LANCZOS)
    # A touch of blur before thresholding keeps JPEG ringing out of the outline.
    a = a.filter(ImageFilter.GaussianBlur(UPSAMPLE * 0.6))

    return np.asarray(a).astype(np.float32) / 255.0 > 0.5, n


def pt(p):
    return (p.x, p.y) if hasattr(p, 'x') else (p[0], p[1])


def trace_paths(mask, ox=0.0, oy=0.0, scale=1.0, places=2):
    """potrace the mask and return one SVG path string per closed curve."""
    # potracer's Bitmap constructor calls invert() on whatever it is handed,
    # so a mask where True means ink has to go in complemented.
    path = Bitmap(~mask).trace(turdsize=3, alphamax=1.0, opticurve=True, opttolerance=0.2)

    def f(v):
        return f'{round(v, places):g}'

    def xy(p):
        x, y = pt(p)
        return f'{f((x - ox) * scale)} {f((y - oy) * scale)}'

    out = []
    for curve in path:
        d = ['M' + xy(curve.start_point)]
        for seg in curve:
            if seg.is_corner:
                d.append('L' + xy(seg.c))
                d.append('L' + xy(seg.end_point))
            else:
                d.append(f'C{xy(seg.c1)} {xy(seg.c2)} {xy(seg.end_point)}')
        d.append('Z')
        out.append(' '.join(d))
    return out


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(SRC_DEFAULT)
    if not src.is_file():
        raise SystemExit(f'logo not found: {src}')

    mask, native = build_mask(src)
    ys, xs = np.where(mask)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    print(f'  source {native}x{native}, traced at {native*UPSAMPLE}px')
    print(f'  ink bbox {x1-x0+1}x{y1-y0+1} (upsampled)')

    # ── wordmark: tight viewBox, normalised to 1000 units wide ───────────
    pad = 2
    w = (x1 - x0 + 1) + pad * 2
    h = (y1 - y0 + 1) + pad * 2
    scale = 1000.0 / w
    paths = trace_paths(mask, ox=x0 - pad, oy=y0 - pad, scale=scale)
    vb_h = round(h * scale, 2)
    print(f'  {len(paths)} contours')

    d = ' '.join(paths)
    (OUT / 'logo-wordmark.svg').write_text(
        # fill="currentColor" so the mark takes its colour from CSS when the
        # file is inlined; the style on the root gives it the brand ink as a
        # default, which is what applies when it is loaded via <img>.
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 {vb_h:g}" '
        f'style="color:{INK}" role="img" aria-label="House of Rocky">'
        f'<path fill="currentColor" fill-rule="evenodd" d="{d}"/></svg>\n')

    # ── circle lockup: disc + mark, in disc coordinates ──────────────────
    # The disc fills the source square; work in a 1000-unit box.
    dscale = 1000.0 / (native * UPSAMPLE)
    dpaths = trace_paths(mask, ox=0, oy=0, scale=dscale)
    (OUT / 'logo-circle.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" '
        f'role="img" aria-label="House of Rocky">'
        f'<circle cx="500" cy="500" r="500" fill="{CREAM}"/>'
        f'<path fill="{INK}" fill-rule="evenodd" d="{" ".join(dpaths)}"/></svg>\n')

    for f_ in ('logo-wordmark.svg', 'logo-circle.svg'):
        print(f'  → {f_}  ({(OUT / f_).stat().st_size / 1024:.1f} KB)')


if __name__ == '__main__':
    main()
