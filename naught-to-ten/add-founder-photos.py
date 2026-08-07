#!/usr/bin/env python3
"""
Drop real photographs into the founder section.

The section ships with styled empty frames so it looks finished before any
photo exists. This script crops the images you give it, writes them into
assets/img/founder/, and swaps the matching frames in index.html for <img>
tags. Slots you don't supply are left as frames.

    python3 add-founder-photos.py --portrait me.jpg
    python3 add-founder-photos.py --portrait me.jpg --grid a.jpg b.jpg c.jpg

Portrait is cropped to 4:5 at 1000x1250, contact-sheet frames to 1:1 at
800x800, both centred. Re-running is safe — it overwrites in place.

Afterwards, rebuild the single-file bundles:

    python3 build-offline.py --both
"""

import argparse
import html as htmlmod
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
OUT = ROOT / 'assets' / 'img' / 'founder'

SPECS = {                      # slot        -> (w, h, css modifier, alt text)
    'portrait': (1000, 1250, 'tall', 'Jozua, founder of Naught to Ten'),
    'grid-01':  (800, 800, 'sq', 'Naught to Ten, off the desk'),
    'grid-02':  (800, 800, 'sq', 'Naught to Ten, off the desk'),
    'grid-03':  (800, 800, 'sq', 'Naught to Ten, off the desk'),
}


def crop(src: Path, slot: str) -> Path:
    w, h, _, _ = SPECS[slot]
    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f'{slot}.jpg'
    cmd = [
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src),
        '-vf', f'scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,'
               f'crop={w}:{h}',
        '-frames:v', '1', '-q:v', '4', str(dst),
    ]
    subprocess.run(cmd, check=True)
    print(f'  · {src.name} -> assets/img/founder/{dst.name} '
          f'({w}x{h}, {dst.stat().st_size/1e3:.0f} KB)')
    return dst


def fill_slot(page: str, slot: str) -> str:
    """Replace the empty frame for `slot` with an <img>, keeping the frame."""
    _, _, mod, alt = SPECS[slot]
    pattern = re.compile(
        rf'(<div class="shot shot--{mod}" data-slot="{slot}">).*?(</div>)',
        re.S)
    if not pattern.search(page):
        raise SystemExit(f'! no slot "{slot}" found in index.html')
    img = (f'<img src="assets/img/founder/{slot}.jpg" '
           f'alt="{htmlmod.escape(alt, quote=True)}" loading="lazy" decoding="async">')
    return pattern.sub(lambda m: m.group(1) + img + m.group(2), page, count=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--portrait', type=Path, help='the founder portrait (cropped to 4:5)')
    ap.add_argument('--grid', type=Path, nargs='*', default=[],
                    help='up to three contact-sheet photos (cropped square)')
    args = ap.parse_args()

    if not args.portrait and not args.grid:
        ap.error('give --portrait and/or --grid')
    if shutil.which('ffmpeg') is None:
        sys.exit('! ffmpeg not found on PATH — needed to crop the images')
    if len(args.grid) > 3:
        sys.exit('! the contact sheet has three slots; give at most three --grid photos')

    jobs = []
    if args.portrait:
        jobs.append(('portrait', args.portrait))
    for i, src in enumerate(args.grid, start=1):
        jobs.append((f'grid-{i:02d}', src))

    for slot, src in jobs:
        if not src.is_file():
            sys.exit(f'! not a file: {src}')

    page_path = ROOT / 'index.html'
    page = page_path.read_text()
    for slot, src in jobs:
        crop(src, slot)
        page = fill_slot(page, slot)
    page_path.write_text(page)

    print(f'\n  → index.html updated ({len(jobs)} slot(s) filled)')
    print('  → now run: python3 build-offline.py --both')


if __name__ == '__main__':
    main()
