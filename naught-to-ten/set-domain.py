#!/usr/bin/env python3
"""
Point the whole site at a different domain.

The domain appears in canonical tags, Open Graph URLs, JSON-LD @ids, the
sitemap and robots.txt. Those have to agree with wherever the site actually
lives — a canonical pointing at a domain you do not own tells Google to index
that one instead of yours.

    python3 set-domain.py example.ie          # apply
    python3 set-domain.py example.ie --dry    # show what would change

Then rebuild the bundles:  python3 build-offline.py --both
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
CURRENT_FILE = ROOT / '.domain'
DEFAULT = 'naughttoten.ie'

TARGETS = ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'site.webmanifest',
           'build-offline.py', 'README.md']
TARGET_DIRS = ['contact', 'work', 'privacy', 'terms', 'services', 'faq']


def current() -> str:
    if CURRENT_FILE.is_file():
        return CURRENT_FILE.read_text().strip()
    return DEFAULT


def files():
    for name in TARGETS:
        p = ROOT / name
        if p.is_file():
            yield p
    for d in TARGET_DIRS:
        p = ROOT / d / 'index.html'
        if p.is_file():
            yield p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('domain', help='the new bare domain, e.g. example.ie')
    ap.add_argument('--dry', action='store_true', help='report without writing')
    args = ap.parse_args()

    new = args.domain.strip().lower()
    new = re.sub(r'^https?://', '', new).rstrip('/')
    if not re.fullmatch(r'[a-z0-9-]+(\.[a-z0-9-]+)+', new):
        sys.exit(f'! that does not look like a domain: {args.domain}')

    old = current()
    if old == new:
        sys.exit(f'  already set to {new} — nothing to do')

    total = 0
    for p in files():
        text = p.read_text()
        n = text.count(old)
        if not n:
            continue
        total += n
        print(f'  · {p.relative_to(ROOT)}  ({n})')
        if not args.dry:
            p.write_text(text.replace(old, new))

    if args.dry:
        print(f'\n  would change {total} reference(s): {old} -> {new}')
        return

    CURRENT_FILE.write_text(new + '\n')
    print(f'\n  → {total} reference(s) changed: {old} -> {new}')
    print('  → now run: python3 build-offline.py --both')


if __name__ == '__main__':
    main()
