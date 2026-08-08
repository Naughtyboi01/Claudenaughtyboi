#!/usr/bin/env python3
"""
Naught to Ten — pricing collateral.

Inlines the studio's self-hosted type into the source plate, then renders it
to a 16:9 slide and an A4 sheet. Deliberately lives outside naught-to-ten/,
which is the Netlify publish root, so none of this reaches the website.

    python3 build.py            # build HTML + render everything
    python3 build.py --html     # rebuild the HTML only
"""

import base64
import os
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'src' / 'pricing.html'
OUT = HERE / 'out'
FONTS = HERE.parent / 'naught-to-ten' / 'assets' / 'fonts'

# family, style, weight range, file
FACES = (
    ("'Instrument Serif'", 'normal', '400', 'instrument-serif-400.woff2'),
    ("'Instrument Serif'", 'italic', '400', 'instrument-serif-400-italic.woff2'),
    ("'Inter'", 'normal', '100 900', 'inter-var.woff2'),
    ("'JetBrains Mono'", 'normal', '100 800', 'jetbrains-mono-var.woff2'),
)


def font_css():
    out = ["/* Self-hosted type, inlined — the plate is one portable file. */"]
    for fam, style, weight, name in FACES:
        raw = (FONTS / name).read_bytes()
        b64 = base64.b64encode(raw).decode('ascii')
        out.append(
            '@font-face{font-family:%s;font-style:%s;font-weight:%s;'
            "font-display:block;src:url('data:font/woff2;base64,%s') format('woff2')}"
            % (fam, style, weight, b64)
        )
        print('  · inlined %s (%.0f KB)' % (name, len(raw) / 1024))
    return '\n'.join(out)


def build_html():
    html = SRC.read_text(encoding='utf-8')
    if '/*FONTS*/' not in html:
        sys.exit('! the /*FONTS*/ placeholder is gone from src/pricing.html')
    html = html.replace('/*FONTS*/', font_css())
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / 'pricing.html'
    dest.write_text(html, encoding='utf-8')
    print('  → %s  (%.1f MB)' % (dest.name, dest.stat().st_size / 1e6))
    return dest


def main():
    print('Naught to Ten — pricing collateral\n')
    build_html()
    if '--html' in sys.argv:
        return
    print()
    # Playwright is installed globally here, and node does not look there
    # unless it is told to.
    env = dict(os.environ)
    root = subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True)
    if root.returncode == 0 and root.stdout.strip():
        env['NODE_PATH'] = os.pathsep.join(
            filter(None, [root.stdout.strip(), env.get('NODE_PATH', '')])
        )
    subprocess.check_call(['node', str(HERE / 'render.js')], env=env)


if __name__ == '__main__':
    main()
