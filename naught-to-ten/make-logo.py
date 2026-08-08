#!/usr/bin/env python3
"""
Generate the Naught to Ten logo pack as real vector artwork.

The wordmark on the site is set in live type — Inter at weight 500 with tight
tracking, and the "to" in Instrument Serif italic. This script rebuilds that
lockup from the same font files and writes it out as **outlined SVG paths**,
so the result scales cleanly and needs no fonts installed to open.

    python3 make-logo.py            # -> assets/logo/*.svg
    python3 make-logo.py --png      # also rasterise via headless Chromium

Inter ships here as a variable font, so it is pinned to wght=500 first —
otherwise the outlines come out at the 400 default and the logo would be
visibly lighter than the site.
"""

import argparse
import subprocess
import sys
from pathlib import Path

from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).parent.resolve()
FONTS = ROOT / 'assets' / 'fonts'
OUT = ROOT / 'assets' / 'logo'

INK = '#0A0A0B'
PORCELAIN = '#EFEEEB'
SIZE = 100.0            # em size used for layout; the SVG viewBox is unitless
SERIF_OPACITY = 0.55    # matches the footer lockup on the site


def load(path: Path, wght: float | None = None) -> TTFont:
    font = TTFont(path)
    if wght is not None and 'fvar' in font:
        font = instancer.instantiateVariableFont(font, {'wght': wght}, inplace=False)
    return font


class Setter:
    """Lays out a run of text as SVG path data, honouring CSS-style tracking."""

    def __init__(self, font: TTFont, size: float):
        self.font = font
        self.size = size
        self.scale = size / font['head'].unitsPerEm
        self.glyphs = font.getGlyphSet()
        self.cmap = font.getBestCmap()
        self.hmtx = font['hmtx']

    def advance(self, ch: str) -> float:
        return self.hmtx[self.cmap[ord(ch)]][0] * self.scale

    def run(self, text: str, x: float, baseline: float, tracking_em: float):
        """Returns (path_data, pen_x_after, bbox) — bbox is (x0,y0,x1,y1) or None."""
        parts, bounds = [], []
        for ch in text:
            name = self.cmap[ord(ch)]
            xform = Transform(self.scale, 0, 0, -self.scale, x, baseline)

            pen = SVGPathPen(self.glyphs, ntos=lambda v: f'{v:.2f}')
            self.glyphs[name].draw(TransformPen(pen, xform))
            d = pen.getCommands()
            if d:
                parts.append(d)

            bp = BoundsPen(self.glyphs)
            self.glyphs[name].draw(TransformPen(bp, xform))
            if bp.bounds:
                bounds.append(bp.bounds)

            x += self.advance(ch) + tracking_em * self.size

        box = None
        if bounds:
            box = (min(b[0] for b in bounds), min(b[1] for b in bounds),
                   max(b[2] for b in bounds), max(b[3] for b in bounds))
        return ' '.join(parts), x, box


def union(*boxes):
    boxes = [b for b in boxes if b]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def svg(paths, box, pad, title):
    """paths: list of (d, fill, opacity)."""
    x0, y0, x1, y1 = box
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    w, h = x1 - x0, y1 - y0
    body = '\n'.join(
        f'  <path d="{d}" fill="{fill}"'
        + (f' fill-opacity="{op}"' if op < 1 else '') + '/>'
        for d, fill, op in paths)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="{x0:.2f} {y0:.2f} {w:.2f} {h:.2f}" '
            f'width="{w:.2f}" height="{h:.2f}" role="img" aria-label="{title}">\n'
            f'  <title>{title}</title>\n{body}\n</svg>\n')


def build_wordmark(sans, serif, fg, stacked=False):
    """Naught to Ten — inline, or stacked on three lines as in the hero."""
    S = Setter(sans, SIZE)
    T = Setter(serif, SIZE if not stacked else SIZE * 0.86)
    paths, boxes = [], []

    if not stacked:
        d1, x, b1 = S.run('Naught', 0, 0, -0.055)
        x += S.advance(' ') * 0.72                      # optical space, not a full one
        d2, x, b2 = T.run('to', x, 0, -0.02)
        x += S.advance(' ') * 0.72
        d3, x, b3 = S.run('Ten', x, 0, -0.055)
        paths = [(d1, fg, 1), (d2, fg, SERIF_OPACITY), (d3, fg, 1)]
        boxes = [b1, b2, b3]
    else:
        # The hero sets these at line-height .82, but there each line lives in
        # its own masked block. Free-standing, that lets the italic "to"
        # descender run into the cap of "Ten", so the stack is opened up.
        lh = SIZE * 0.92
        d1, _, b1 = S.run('Naught', 0, 0, -0.055)
        d2, _, b2 = T.run('to', SIZE * 0.09, lh, -0.02)
        d3, _, b3 = S.run('Ten', 0, lh * 2, -0.055)
        paths = [(d1, fg, 1), (d2, fg, SERIF_OPACITY), (d3, fg, 1)]
        boxes = [b1, b2, b3]

    return paths, union(*boxes)


def build_monogram(sans, fg):
    """The 0—10 mark used as the scale motif throughout the site."""
    S = Setter(sans, SIZE)
    d, _, box = S.run('0—10', 0, 0, -0.05)
    return [(d, fg, 1)], box


def build_icon(sans):
    """Square app icon: 10 in porcelain on an ink tile."""
    S = Setter(sans, 100)
    d, x, box = S.run('10', 0, 0, -0.05)
    w = box[2] - box[0]
    h = box[3] - box[1]
    tile = 160.0
    # centre the numerals on the tile
    dx = (tile - w) / 2 - box[0]
    dy = (tile - h) / 2 - box[1]
    d, _, _ = S.run('10', dx, dy, -0.05)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {tile:.0f} {tile:.0f}" '
            f'width="{tile:.0f}" height="{tile:.0f}" role="img" aria-label="Naught to Ten">\n'
            f'  <title>Naught to Ten</title>\n'
            f'  <rect width="{tile:.0f}" height="{tile:.0f}" rx="34" fill="{INK}"/>\n'
            f'  <path d="{d}" fill="{PORCELAIN}"/>\n</svg>\n')


def rasterise(files: list[Path], width: int = 2400):
    """Render each SVG to a transparent PNG through headless Chromium."""
    chrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    script = OUT / '_raster.js'
    script.write_text("""
const { chromium } = require('playwright');
(async () => {
  const files = JSON.parse(process.argv[2]);
  const W = +process.argv[3];
  const b = await chromium.launch({ executablePath: process.argv[4] });
  for (const f of files) {
    const svg = require('fs').readFileSync(f, 'utf8');
    const m = svg.match(/viewBox="([-\\d.]+) ([-\\d.]+) ([\\d.]+) ([\\d.]+)"/);
    const ar = (+m[4]) / (+m[3]);
    const p = await b.newPage({ viewport:{ width: W, height: Math.max(1, Math.round(W*ar)) },
                                deviceScaleFactor: 1 });
    await p.setContent(`<style>html,body{margin:0;background:transparent}
      svg{width:${W}px;height:auto;display:block}</style>${svg}`);
    await p.screenshot({ path: f.replace(/\\.svg$/, '.png'), omitBackground: true });
    await p.close();
  }
  await b.close();
})();
""")
    subprocess.run(['node', str(script), str([str(f) for f in files]).replace("'", '"'),
                    str(width), chrome],
                   check=True, cwd=OUT)
    script.unlink()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--png', action='store_true', help='also write PNGs at 2400px wide')
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    sans = load(FONTS / 'inter-var.woff2', wght=500)
    serif = load(FONTS / 'instrument-serif-400-italic.woff2')

    written = []

    def write(name, text):
        p = OUT / name
        p.write_text(text)
        written.append(p)
        print(f'  · {name}')

    for tone, fg in (('dark', INK), ('light', PORCELAIN)):
        paths, box = build_wordmark(sans, serif, fg)
        write(f'wordmark-{tone}.svg', svg(paths, box, 6, 'Naught to Ten'))

        paths, box = build_wordmark(sans, serif, fg, stacked=True)
        write(f'wordmark-stacked-{tone}.svg', svg(paths, box, 6, 'Naught to Ten'))

        paths, box = build_monogram(sans, fg)
        write(f'monogram-{tone}.svg', svg(paths, box, 6, 'Naught to Ten, 0 to 10'))

    write('icon.svg', build_icon(sans))

    if args.png:
        print('\n  rasterising…')
        rasterise(written)
        for p in written:
            png = p.with_suffix('.png')
            print(f'  · {png.name}  ({png.stat().st_size/1e3:.0f} KB)')

    print(f'\n  → {len(written)} file(s) in assets/logo/')


if __name__ == '__main__':
    main()
