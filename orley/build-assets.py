#!/usr/bin/env python3
"""
Derive every runtime asset for the ORLEY page from the source master.

    python3 build-assets.py [--src source/orley-master.mp4]

The master is 3840x2160 HEVC, 24fps, 193 frames. Two things about that:

  * HEVC does not play in most browsers, so the hero is a decoded frame
    sequence painted to a canvas rather than a <video> element. That is also
    the only way to scrub frame-exactly on mobile Safari, which otherwise
    snaps to keyframes.
  * The last ~40 frames resolve to a third-party logo end card. The hero
    sequence stops at frame 150, before it appears. Product stills taken from
    the tail are cropped below the logo band.

Output: assets/seq/{lg,sm}/0000.webp ... and assets/img/*.webp
"""

import argparse
import re
import json
import pathlib
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent

SEQ_LAST = 150          # last source frame in the hero sequence (inclusive)
SRC_W, SRC_H = 3840, 2160

SEQ_SETS = {
    "lg": dict(width=1500, quality=78),
    "sm": dict(width=820, quality=72),
}

# Crops are normalised (x, y, w, h) against the source frame.
# The logo end card sits above y=0.30, so tail crops start below it.
PRODUCT_CROP = (0.150, 0.330, 0.720, 0.420)

STILLS = [
    # name              frame  crop                              width
    ("product-b",        168,  PRODUCT_CROP,                      1400),
    ("product-d",        188,  PRODUCT_CROP,                      1400),
    ("worn-band",         62,  (0.280, 0.270, 0.500, 0.230),      1400),
    ("worn-portrait",     48,  (0.235, 0.000, 0.550, 1.000),      1100),
    ("macro-lens",         4,  (0.000, 0.060, 0.620, 0.800),      1400),
    # The brow, where the lens meets the frame — a different subject from
    # macro-lens, and above the printed mark rather than across it.
    ("macro-temple",      26,  (0.550, 0.170, 0.250, 0.275),       960),
    ("poster",             0,  (0.000, 0.000, 1.000, 1.000),      1500),
]

# A second film of the same product on a second model, so the Worn section
# shows more than one face. Only its first act is usable here: it resolves to
# a product turn on a near-black backdrop, which belongs to a different page
# than this one. 1280x720 rather than 4K, so the crop is taken close to native
# size — at the 364px it renders at, it holds up beside the 4K stills.
SRC_ALT = "orley-worn-02.mp4"

STILLS_ALT = [
    ("worn-portrait-02",  72,  (0.295, 0.000, 0.450, 1.000),       576),
]

# The photographed product carries another maker's marks on the lens and
# temple. This is an ORLEY page, so they come off. Boxes are in the output
# image's own pixel space and are filled by interpolating across the box from
# the columns either side of it — the lens and the frame are both smooth
# gradients there, so the patch leaves no seam.
#
# Crops are chosen so no box ever straddles the lens rim: the rim carries a
# bright specular edge, and interpolating across it smears white into the
# lens. Where a mark sits on the rim the crop is moved instead.
MARKS = {
    "product-b":    [(626, 274, 744, 324), (898, 194, 974, 238), (698, 76, 744, 102)],
    "product-d":    [(606, 276, 718, 332), (892, 206, 960, 248), (698, 72, 748, 104)],
    "worn-band":    [(1270, 182, 1356, 240), (1064, 300, 1176, 356)],
}


def ffmpeg_bin() -> str:
    for cand in ("ffmpeg", shutil.which("ffmpeg")):
        if cand and shutil.which(cand):
            return shutil.which(cand)
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit("ffmpeg not found. Install it, or: pip install imageio-ffmpeg")


FFMPEG = ffmpeg_bin()


def run(args):
    proc = subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args],
        capture_output=True, text=True,
    )
    if proc.returncode:
        sys.exit(f"ffmpeg failed:\n{' '.join(args)}\n{proc.stderr}")


# --------------------------------------------------------------------------
# Cleaning the footage
#
# Two things in the master do not belong on an ORLEY page.
#
# 1. Another maker's mark is printed on the lens. It moves and changes scale
#    through the whole clip, so it is tracked rather than boxed: normalised
#    cross-correlation on quarter-size greyscale, with an adaptive template,
#    seeded from a hand-read box at each end of the film.
# 2. From the dissolve onward the film supplies its own wordmark and a strip
#    of caption text, both of which degrade into garbled glyphs by the last
#    second. Those are fixed bands over flat backdrop, so they are simply
#    filled from the rows either side.
# --------------------------------------------------------------------------

# Bands cleared once the film starts captioning itself, as fractions of height.
BAND_FROM = 88
BANDS = [(0.105, 0.245), (0.800, 0.915)]

# The mark is printed on the lens, so it always falls in the same corner of
# it — measured across the film, its centre sits at 0.83-0.93 of the lens
# width and 0.52-0.59 of the height. That is too loose to patch blind: a box
# wide enough to be safe flattens a quarter of the lens. So the anchor only
# supplies a search window, and the mark is then found inside it as the
# pixels running darker than the lens's own smooth gradient.
SEARCH_WINDOW = dict(x0=0.68, x1=1.00, y0=0.28, y1=0.82)
MIN_LENS_AREA = 0.004       # fraction of the frame
MIN_SOLIDITY = 0.45         # mask area / bbox area; the dissolve breaks this
DARK_THRESHOLD = 9.0        # luminance below the local trend
EDGE_INSET = 0.022          # keep clear of the lens rim, in lens widths


def lens_mask(a):
    import numpy as np
    return ((a.max(axis=2) - a.min(axis=2)) > 42) & \
           (a[:, :, 2] > a[:, :, 0] + 18)


def lens_box(a, mask):
    """Bounding box of the mirror lens: the only saturated thing in frame."""
    import numpy as np
    if mask.sum() < MIN_LENS_AREA * mask.size:
        return None
    ys, xs = np.nonzero(mask)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    area = (x1 - x0 + 1) * (y1 - y0 + 1)
    if area <= 0 or mask.sum() / area < MIN_SOLIDITY:
        return None                      # fragmented — mid-dissolve
    return x0, y0, x1, y1


def _row_spans(mask, y0, y1, inset):
    """First and last lens pixel on each row, pulled in off the rim."""
    import numpy as np
    spans = {}
    for y in range(y0, y1):
        xs = np.nonzero(mask[y])[0]
        if xs.size < 8:
            continue
        spans[y] = (int(xs.min()) + inset, int(xs.max()) - inset)
    return spans


def find_mark(a, mask):
    """Locate the printed mark, or None. Returns (x0, y0, x1, y1)."""
    import numpy as np

    box = lens_box(a, mask)
    if not box:
        return None, None
    lx0, ly0, lx1, ly1 = box
    lw, lh = lx1 - lx0, ly1 - ly0
    inset = max(2, int(EDGE_INSET * lw))

    sx0 = int(lx0 + SEARCH_WINDOW["x0"] * lw)
    sx1 = int(lx0 + SEARCH_WINDOW["x1"] * lw)
    sy0 = int(ly0 + SEARCH_WINDOW["y0"] * lh)
    sy1 = int(ly0 + SEARCH_WINDOW["y1"] * lh)
    spans = _row_spans(mask, max(0, sy0), min(a.shape[0], sy1), inset)
    if not spans:
        return None, None

    lum = a[:, :, 0] * 0.299 + a[:, :, 1] * 0.587 + a[:, :, 2] * 0.114
    # The baseline window has to be wider than the mark itself, or the mark
    # pulls the trend down towards its own darkness and hides from it.
    win = max(15, int(0.30 * lw) | 1)
    half = win // 2

    def scan(bounds, threshold):
        bx0, by0, bx1, by1 = bounds
        hx, hy = [], []
        for y, (rx0, rx1) in spans.items():
            if y < by0 or y >= by1:
                continue
            x0 = max(bx0, rx0)
            x1 = min(bx1, rx1)
            if x1 - x0 < 6:
                continue
            row = lum[y, x0:x1]
            pad = np.pad(row, half, mode="edge")
            c = np.cumsum(np.insert(pad, 0, 0.0))
            baseline = ((c[win:] - c[:-win]) / win)[:row.size]
            dark = np.nonzero(row < baseline - threshold)[0]
            if dark.size:
                hx.append(dark + x0)
                hy.append(np.full(dark.size, y))
        if not hx:
            return None
        return np.concatenate(hx), np.concatenate(hy)

    found = scan((sx0, sy0, sx1, sy1), DARK_THRESHOLD)
    if found is None or found[0].size < 50:
        return None, spans
    xs, ys = found

    # A first pass finds the solid strokes. Widen around them and rescan at a
    # lower threshold so the faint edges of the largest instances come too.
    qx = np.percentile(xs, [1.0, 99.0])
    qy = np.percentile(ys, [1.0, 99.0])
    gw = (qx[1] - qx[0]) * 0.45 + 6
    gh = (qy[1] - qy[0]) * 0.55 + 6
    refined = scan((int(qx[0] - gw), int(qy[0] - gh),
                    int(qx[1] + gw), int(qy[1] + gh)), DARK_THRESHOLD * 0.55)
    if refined is not None and refined[0].size >= xs.size:
        xs, ys = refined

    qx = np.percentile(xs, [0.4, 99.6])
    qy = np.percentile(ys, [0.4, 99.6])
    pad_x = max(3, int(0.014 * lw))
    pad_y = max(3, int(0.012 * lw))
    return (int(qx[0]) - pad_x, int(qy[0]) - pad_y,
            int(qx[1]) + pad_x, int(qy[1]) + pad_y), spans


def _fill_h(a, x0, y0, x1, y1):
    """Fill a box by interpolating across it from the columns either side."""
    import numpy as np
    h, w = a.shape[:2]
    x0, x1 = max(1, int(x0)), min(w - 2, int(x1))
    y0, y1 = max(0, int(y0)), min(h, int(y1))
    if x1 <= x0 or y1 <= y0:
        return
    left = a[y0:y1, x0 - 1][:, None, :]
    right = a[y0:y1, x1 + 1][:, None, :]
    t = np.linspace(0.0, 1.0, x1 - x0, dtype=np.float32)[None, :, None]
    a[y0:y1, x0:x1] = left * (1.0 - t) + right * t


def _fill_v(a, y0, y1):
    """Fill a full-width band from the rows either side."""
    import numpy as np
    h, w = a.shape[:2]
    y0, y1 = max(1, int(y0)), min(h - 2, int(y1))
    if y1 <= y0:
        return
    top = a[y0 - 1][None, :, :]
    bot = a[y1 + 1][None, :, :]
    t = np.linspace(0.0, 1.0, y1 - y0, dtype=np.float32)[:, None, None]
    a[y0:y1] = top * (1.0 - t) + bot * t


def _fill_mark(a, box, spans):
    """Fill the mark row by row, never sampling past the lens rim."""
    import numpy as np
    x0, y0, x1, y1 = box
    for y in range(max(0, y0), min(a.shape[0], y1)):
        span = spans.get(y)
        if not span:
            continue
        rx0, rx1 = span
        cx0 = max(x0, rx0 + 1)
        cx1 = min(x1, rx1 - 1)
        if cx1 - cx0 < 2:
            continue
        left = a[y, cx0 - 1]
        right = a[y, cx1 + 1]
        t = np.linspace(0.0, 1.0, cx1 - cx0, dtype=np.float32)[:, None]
        a[y, cx0:cx1] = left * (1.0 - t) + right * t


def clean_frame(path, do_bands):
    """Take the other maker's mark off the lens, and the film's own captions
    off the backdrop. Returns (image, patched)."""
    import numpy as np
    from PIL import Image, ImageFilter

    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    height = a.shape[0]

    box, spans = find_mark(a, lens_mask(a))
    if box:
        _fill_mark(a, box, spans)

    if do_bands:
        for f0, f1 in BANDS:
            _fill_v(a, f0 * height, f1 * height)

    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if box:
        # A whisper of blur inside the patch only, so the flat fill picks up
        # the grain of the footage around it.
        soft = out.filter(ImageFilter.GaussianBlur(0.9))
        x0, y0, x1, y1 = [int(v) for v in box]
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(out.width, x1), min(out.height, y1)
        if x1 > x0 and y1 > y0:
            out.paste(soft.crop((x0, y0, x1, y1)), (x0, y0))
    return out, bool(box)


def corner_colour(img):
    """The lit backdrop, read from whichever corner is actually showing it.

    In the macro act two corners are full of skin and hair, so a median over
    all four comes back warm. The cyclorama is perfectly neutral and skin is
    not, so the least saturated corner is the right one every time."""
    import numpy as np
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    ph, pw = max(4, h // 14), max(4, w // 14)
    corners = [a[:ph, :pw], a[:ph, -pw:], a[-ph:, :pw], a[-ph:, -pw:]]
    best, best_sat = None, 1e9
    for patch in corners:
        med = np.median(patch.reshape(-1, 3), axis=0)
        sat = float(med.max() - med.min())
        if sat < best_sat:
            best, best_sat = med, sat
    return [int(v) for v in best]


def build_sequences(src):
    """Both sets in one pass.

    Detection runs only at full size: at 820px the mark is a handful of low
    contrast pixels and the scan misses a third of the frames. The small set
    is resampled from the already-cleaned large frames instead, so the two
    sets are guaranteed to have had exactly the same work done to them.
    """
    from PIL import Image

    outs = {}
    for name in SEQ_SETS:
        d = HERE / "assets" / "seq" / name
        for old in d.glob("*.webp"):
            old.unlink()
        d.mkdir(parents=True, exist_ok=True)
        outs[name] = d

    big = SEQ_SETS["lg"]["width"]
    tmp = HERE / ".seqtmp"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True, exist_ok=True)

    run(["-i", str(src),
         "-frames:v", str(SEQ_LAST + 1),
         "-vf", f"scale={big}:-2:flags=lanczos",
         # Number from zero so a file name is its source frame number.
         "-start_number", "0",
         str(tmp / "%04d.png")])

    frames = sorted(tmp.glob("*.png"))
    patched = 0
    backdrop = []
    for f in frames:
        i = int(f.stem)
        img, hit = clean_frame(f, do_bands=i >= BAND_FROM)
        patched += hit
        backdrop.append(corner_colour(img))
        for name, cfg in SEQ_SETS.items():
            w = cfg["width"]
            im = img if w == img.width else img.resize(
                (w, round(img.height * w / img.width)), Image.LANCZOS)
            im.save(outs[name] / f"{i:04d}.webp",
                    "WEBP", quality=cfg["quality"], method=5)

    shutil.rmtree(tmp)

    # The studio backdrop brightens from #949494 to near white across the
    # eight seconds. The page picks the colour up behind the aperture so the
    # cut reads as a window onto the same room rather than a pasted card.
    # Written as a script rather than JSON so the page still works from
    # file:// , where fetch() of a local file is blocked.
    (HERE / "assets" / "js" / "backdrop.js").write_text(
        "/* Generated by build-assets.py — the lit backdrop, per frame. */\n"
        "window.__ORLEY_BACKDROP = " +
        json.dumps(backdrop, separators=(",", ":")) + ";\n")

    for name, cfg in SEQ_SETS.items():
        files = sorted(outs[name].glob("*.webp"))
        total = sum(f.stat().st_size for f in files)
        print(f"  seq/{name}: {len(files)} frames @ {cfg['width']}px, "
              f"{total/1e6:.2f} MB ({total/len(files)/1024:.0f} KB avg)")
    print(f"    lens mark cleared on {patched}/{len(frames)} frames")
    return len(frames)


def retouch(path, boxes):
    """Fill each box by interpolating horizontally across it."""
    from PIL import Image, ImageFilter
    import numpy as np

    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape

    for x0, y0, x1, y1 in boxes:
        x0, y0 = max(x0, 1), max(y0, 0)
        x1, y1 = min(x1, w - 2), min(y1, h)
        if x1 <= x0 or y1 <= y0:
            continue
        left = a[y0:y1, x0 - 1][:, None, :]          # column just outside
        right = a[y0:y1, x1 + 1][:, None, :]
        t = np.linspace(0.0, 1.0, x1 - x0, dtype=np.float32)[None, :, None]
        a[y0:y1, x0:x1] = left * (1.0 - t) + right * t

    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    # A whisper of blur only inside the patched boxes, to kill any banding
    # the linear fill introduces against film grain.
    blurred = out.filter(ImageFilter.GaussianBlur(1.1))
    for x0, y0, x1, y1 in boxes:
        out.paste(blurred.crop((x0, y0, x1, y1)), (x0, y0))
    out.save(path, "WEBP", quality=86, method=5)


def probe_size(src):
    proc = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", str(src)],
        capture_output=True, text=True)
    m = re.search(r"Video:.*?,\s*(\d{2,5})x(\d{2,5})", proc.stderr)
    if not m:
        sys.exit(f"could not read the frame size of {src}")
    return int(m.group(1)), int(m.group(2))


def build_still(src, name, frame, crop, width, size=None):
    sw, sh = size or (SRC_W, SRC_H)
    x, y, w, h = crop
    cw, ch = round(sw * w), round(sh * h)
    cx, cy = round(sw * x), round(sh * y)
    # libwebp needs even dimensions after scaling; -2 handles the height.
    dest = HERE / "assets" / "img" / f"{name}.webp"
    run(["-i", str(src),
         "-vf", (f"select='eq(n\\,{frame})',crop={cw}:{ch}:{cx}:{cy},"
                 f"scale={width}:-2:flags=lanczos"),
         "-frames:v", "1",
         "-c:v", "libwebp", "-quality", "82", "-preset", "picture",
         str(dest)])
    marks = MARKS.get(name)
    if marks:
        retouch(dest, marks)

    print(f"  img/{name}.webp  frame {frame:>3}  "
          f"{cw}x{ch} -> {width}px  {dest.stat().st_size/1024:.0f} KB"
          f"{'  (%d marks removed)' % len(marks) if marks else ''}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(HERE / "source" / "orley-master.mp4"))
    ap.add_argument("--stills-only", action="store_true")
    args = ap.parse_args()

    src = pathlib.Path(args.src)
    if not src.exists():
        sys.exit(f"source not found: {src}")

    (HERE / "assets" / "img").mkdir(parents=True, exist_ok=True)

    count = SEQ_LAST + 1
    if not args.stills_only:
        print("hero sequence")
        count = build_sequences(src)

    print("stills")
    for name, frame, crop, width in STILLS:
        build_still(src, name, frame, crop, width)

    alt = src.parent / SRC_ALT
    if alt.exists():
        size = probe_size(alt)
        for name, frame, crop, width in STILLS_ALT:
            build_still(alt, name, frame, crop, width, size=size)
    else:
        print(f"  (skipped {SRC_ALT}: not present)")

    print(f"\n{count} frames, sets: {', '.join(SEQ_SETS)}")


if __name__ == "__main__":
    main()
