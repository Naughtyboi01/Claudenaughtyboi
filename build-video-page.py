#!/usr/bin/env python3
"""
Wrap an .mp4 in a single self-contained .html player.

    python3 build-video-page.py demo/air-max-95-demo-720p.mp4

The video, its poster frame and the fonts are all inlined, so the result is one
file that plays offline by double-clicking — no player app, no server, no
network. Useful when a desktop video player is being fussy: browsers decode
H.264 reliably.

The video is inlined as base64 and handed to the page as a Blob URL rather than
a data: URI, because Safari wants byte-range requests for media and will not
reliably play a data: URI source. The page also offers a Save button that
writes the .mp4 back out of the HTML, so the original file can always be
recovered from the bundle.
"""

import argparse
import base64
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
FFMPEG = '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2'


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


def poster_frame(video: Path, at: str = '3') -> str:
    """Grab a frame to show before playback starts. Optional — skipped if ffmpeg isn't around."""
    ffmpeg = FFMPEG if Path(FFMPEG).is_file() else 'ffmpeg'
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'poster.jpg'
        try:
            subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-ss', at,
                            '-i', str(video), '-frames:v', '1', '-vf', 'scale=1280:-2',
                            '-q:v', '4', str(out)], check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            print('  ! could not extract a poster frame; continuing without one')
            return ''
        return f"data:image/jpeg;base64,{b64(out)}"


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230b0b0c'/%3E%3Ctext x='16' y='23' font-family='Georgia,serif' font-size='17' fill='%23d7ff3b' text-anchor='middle'%3E95%3C/text%3E%3C/svg%3E" />
<style>
@font-face {{ font-family:'Instrument Serif'; font-style:normal; font-weight:400; font-display:swap;
  src:url('{serif}') format('woff2'); }}
@font-face {{ font-family:'JetBrains Mono'; font-weight:100 800; font-display:swap;
  src:url('{mono}') format('woff2'); }}

*,*::before,*::after {{ box-sizing:border-box; }}
* {{ margin:0; padding:0; }}
body {{
  min-height:100vh; display:grid; align-content:center; gap:26px;
  padding:clamp(20px,4vw,54px);
  background:#0b0b0c; color:#f5f2ed;
  font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  -webkit-font-smoothing:antialiased;
}}
header {{ display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:14px;
  max-width:1400px; width:100%; margin-inline:auto; }}
h1 {{ font-family:'Instrument Serif',Georgia,serif; font-weight:400;
  font-size:clamp(26px,3.4vw,46px); line-height:1; letter-spacing:-.02em; }}
h1 em {{ font-style:italic; color:#c6b49b; }}
.meta {{ font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:#8a8175; }}
.dot {{ display:inline-block; width:5px; height:5px; border-radius:50%; background:#d7ff3b;
  box-shadow:0 0 0 3px rgba(215,255,59,.18); margin-right:8px; }}

figure {{ max-width:1400px; width:100%; margin-inline:auto; }}
video {{ width:100%; height:auto; display:block; background:#000;
  border:1px solid rgba(255,255,255,.12); border-radius:3px; }}

.bar {{ display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;
  max-width:1400px; width:100%; margin-inline:auto; }}
.btn {{ display:inline-flex; align-items:center; gap:10px; padding:12px 22px;
  border:1px solid rgba(255,255,255,.3); border-radius:100px; background:none; color:inherit;
  font:inherit; font-size:11px; letter-spacing:.18em; text-transform:uppercase; cursor:pointer;
  transition:background-color .4s,color .4s,border-color .4s; }}
.btn:hover {{ background:#f5f2ed; color:#0b0b0c; border-color:#f5f2ed; }}
.note {{ font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#6e6961; }}

#fallback {{ display:none; max-width:1400px; width:100%; margin-inline:auto;
  border:1px solid rgba(255,120,90,.4); border-radius:3px; padding:20px;
  font-size:12px; line-height:1.7; letter-spacing:.06em; color:#ffb2a0; text-transform:none; }}
#fallback.on {{ display:block; }}
#fallback b {{ color:#fff; }}
</style>
</head>
<body>

<header>
  <h1>Air Max 95 — <em>demo</em></h1>
  <span class="meta"><i class="dot"></i>{label} · {duration} · {size}</span>
</header>

<figure>
  <video id="v" controls playsinline preload="auto"{poster_attr}></video>
</figure>

<div class="bar">
  <button class="btn" id="save">Save the .mp4</button>
  <span class="note">Self-contained — plays offline, no player app needed</span>
</div>

<div id="fallback">
  <b>This browser could not decode the video.</b><br />
  That is unusual for H.264, but it happens on stripped-down or headless builds.
  Click <b>Save the .mp4</b> above to write the original file out of this page,
  then open it in VLC — it plays anything.
</div>

<script>
(function () {{
  var B64 = "{video}";
  // base64 -> bytes -> Blob URL. A data: URI would break Safari, which wants
  // byte-range requests for media.
  var bin = atob(B64), buf = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  var blob = new Blob([buf], {{ type: 'video/mp4' }});
  var url = URL.createObjectURL(blob);

  var v = document.getElementById('v');
  v.src = url;
  v.addEventListener('error', function () {{
    document.getElementById('fallback').classList.add('on');
  }});

  document.getElementById('save').addEventListener('click', function () {{
    var a = document.createElement('a');
    a.href = url;
    a.download = "{filename}";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }});
}})();
</script>

</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video', help='path to the .mp4 to wrap')
    ap.add_argument('-o', '--out', help='output .html (defaults alongside the video)')
    ap.add_argument('--label', default='', help='short label shown in the header')
    args = ap.parse_args()

    video = Path(args.video).resolve()
    if not video.is_file():
        sys.exit(f'no such file: {video}')

    out = Path(args.out).resolve() if args.out else video.with_suffix('.html')
    size_mb = video.stat().st_size / 1e6

    # duration, purely cosmetic
    duration = '—'
    try:
        ffmpeg = FFMPEG if Path(FFMPEG).is_file() else 'ffmpeg'
        info = subprocess.run([ffmpeg, '-hide_banner', '-i', str(video)],
                              capture_output=True, text=True).stderr
        for line in info.splitlines():
            if 'Duration:' in line:
                hms = line.split('Duration:')[1].split(',')[0].strip()
                h, m, s = hms.split(':')
                duration = f'{int(m) * 60 + int(float(s))}s'
                break
    except Exception:
        pass

    print(f'  · wrapping {video.name} ({size_mb:.1f} MB)')
    poster = poster_frame(video)

    page = PAGE.format(
        title=f'Air Max 95 — demo',
        label=args.label or video.stem,
        duration=duration,
        size=f'{size_mb:.1f} MB',
        serif=f"data:font/woff2;base64,{b64(ROOT / 'assets/fonts/instrument-serif-400.woff2')}",
        mono=f"data:font/woff2;base64,{b64(ROOT / 'assets/fonts/jetbrains-mono-var.woff2')}",
        poster_attr=f' poster="{poster}"' if poster else '',
        video=b64(video),
        filename=video.name,
    )
    out.write_text(page)
    print(f'  → {out.name}  ({out.stat().st_size / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
