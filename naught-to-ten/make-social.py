#!/usr/bin/env python3
"""
Generate the share card and the icon set.

    python3 make-social.py

Writes:
    assets/og/og-default.jpg        1200x630 link preview card
    assets/icons/apple-touch-icon.png       180x180
    assets/icons/icon-192.png  icon-512.png  for the web app manifest
    assets/icons/favicon-32.png favicon-16.png  legacy fallbacks

The card is composed as HTML and photographed in headless Chromium, so it uses
the same fonts and the same film frame as the site rather than a re-drawn
approximation.
"""

import base64
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'


def b64(path: Path, mime: str) -> str:
    return f'data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}'


def og_html() -> str:
    frame = b64(ROOT / 'assets' / 'frames' / 'lg' / '0139.webp', 'image/webp')
    inter = b64(ROOT / 'assets' / 'fonts' / 'inter-var.woff2', 'font/woff2')
    serif = b64(ROOT / 'assets' / 'fonts' / 'instrument-serif-400-italic.woff2', 'font/woff2')
    mono = b64(ROOT / 'assets' / 'fonts' / 'jetbrains-mono-var.woff2', 'font/woff2')
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:I;src:url({inter}) format('woff2-variations');font-weight:100 900}}
@font-face{{font-family:S;src:url({serif}) format('woff2');font-style:italic}}
@font-face{{font-family:M;src:url({mono}) format('woff2-variations');font-weight:100 800}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:1200px;height:630px;display:flex;background:#F8F7F5;
  font-family:I,sans-serif;color:#0A0A0B;overflow:hidden}}
.l{{width:612px;flex:0 0 auto;padding:62px 54px;display:flex;flex-direction:column;
  justify-content:space-between;position:relative;z-index:2;background:#F8F7F5}}
.k{{font-family:M;font-size:15px;letter-spacing:.2em;text-transform:uppercase;color:#0A0A0B8c;
  display:flex;justify-content:space-between}}
.w{{font-size:98px;line-height:.84;letter-spacing:-.055em;font-weight:500}}
.w i{{font-family:S;font-style:italic;font-weight:400;letter-spacing:-.02em;color:#0A0A0B8f}}
.s{{margin-top:22px;font-size:23px;line-height:1.32;letter-spacing:-.017em;color:#0A0A0Bad;max-width:24ch}}
.f{{font-family:M;font-size:15px;letter-spacing:.16em;text-transform:uppercase;color:#0A0A0B8c}}
.r{{flex:1;position:relative}}
.r img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}}
.fade{{position:absolute;top:0;bottom:0;left:-1px;width:190px;z-index:1;
  background:linear-gradient(to right,#F8F7F5,#F8F7F500)}}
</style></head><body>
  <div class="l">
    <div class="k"><span>Web design studio</span><span>0—10</span></div>
    <div>
      <div class="w">Naught<br><i>to</i> Ten</div>
      <div class="s">The presence your brand should have had all along.</div>
    </div>
    <div class="f">Mervue, Galway &nbsp;·&nbsp; Ireland</div>
  </div>
  <div class="r"><img src="{frame}"><div class="fade"></div></div>
</body></html>"""


def icon_html(px: int) -> str:
    svg = (ROOT / 'assets' / 'logo' / 'icon.svg').read_text()
    return (f'<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
            f'*{{margin:0;padding:0}}body{{width:{px}px;height:{px}px;overflow:hidden}}'
            f'svg{{width:{px}px;height:{px}px;display:block}}</style></head>'
            f'<body>{svg}</body></html>')


JOB_SCRIPT = """
const { chromium } = require('playwright');
(async () => {
  const jobs = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  const b = await chromium.launch({ executablePath: process.argv[3] });
  for (const j of jobs) {
    const p = await b.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    await p.setContent(j.html, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(180);
    const opts = { path: j.out };
    if (j.out.endsWith('.jpg')) { opts.type = 'jpeg'; opts.quality = 90; }
    await p.screenshot(opts);
    await p.close();
  }
  await b.close();
})();
"""


def main():
    (ROOT / 'assets' / 'og').mkdir(parents=True, exist_ok=True)
    (ROOT / 'assets' / 'icons').mkdir(parents=True, exist_ok=True)

    jobs = [{'w': 1200, 'h': 630, 'html': og_html(),
             'out': str(ROOT / 'assets' / 'og' / 'og-default.jpg')}]
    for name, px in (('apple-touch-icon', 180), ('icon-192', 192), ('icon-512', 512),
                     ('favicon-32', 32), ('favicon-16', 16)):
        jobs.append({'w': px, 'h': px, 'html': icon_html(px),
                     'out': str(ROOT / 'assets' / 'icons' / f'{name}.png')})

    spec = ROOT / '_social_jobs.json'
    runner = ROOT / '_social_run.js'
    spec.write_text(json.dumps(jobs))
    runner.write_text(JOB_SCRIPT)
    try:
        subprocess.run(['node', str(runner), str(spec), CHROME], check=True, cwd=ROOT)
    finally:
        spec.unlink(missing_ok=True)
        runner.unlink(missing_ok=True)

    for j in jobs:
        p = Path(j['out'])
        print(f'  · {p.relative_to(ROOT)}  ({j["w"]}x{j["h"]}, {p.stat().st_size/1e3:.0f} KB)')


if __name__ == '__main__':
    main()
