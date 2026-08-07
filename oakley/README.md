# EYE JACKET — Bone / Fire Iridium

A one-page luxury landing page built around a scroll-scrubbed product film.
No framework, no build step, no third-party requests at runtime — open
`index.html` and it runs.

Everything here was generated from a single 8-second, 1280×720, 24fps clip of
the sunglasses: front float → macro lens → extreme temple macro → 3/4 pull-back.

> **This is a concept.** It is not affiliated with, endorsed by, or produced by
> Oakley, Inc., the product imagery is AI-generated, and nothing on the page is
> for sale. The disclaimer in the footer should stay.

---

## The hero

The centrepiece is a **frame-sequence scrubber**. The clip is decoded ahead of
time into 120 stills; scroll position inside a 680vh sticky track picks which
one gets painted to a `<canvas>`.

This is deliberately *not* a `<video>` scrubbed via `currentTime` — video seeking
snaps to keyframes on mobile Safari and stutters. Decoded stills are frame-exact
everywhere. The cost is an upfront download, which is why there are two frame
sets and a real preloader.

Five acts hang off one `requestAnimationFrame` loop:

| Act | Hero progress | What happens |
|---|---|---|
| 1 · Silhouette | 0.00 → 0.18 | Wordmark unfolds letter by letter, then lifts out as tracking opens |
| 2 · Optics | 0.19 → 0.38 | Split spec rails slide in from both edges |
| 3 · Iridium | 0.42 → 0.64 | Lens macro, a hot scanline sweeps, caption mask-reveals |
| 4 · Fit | 0.66 → 0.86 | Temple macro and the unobtainium callout |
| 5 · The pair | 0.88 → 1.00 | Full-bleed plate clips down into a framed card and hands off |

Below the hero: a word-by-word manifesto reveal, a second pinned section with
four sequenced hotspots over a macro plate, a full-bleed looping video, a spec
table, a horizontal gallery rail on a vertical pin, and a closing panel.

---

## Decisions worth remembering

**Scroll stays native.** No transform-hijacked scroll container, so `position:
sticky` keeps working and the trackpad, keyboard and scrollbar behave normally.
Smoothing is applied to the *animated values* instead — the drawn frame index
eases toward its scroll-derived target, so a fast flick reads as motion blur
rather than a jump cut.

**Smoothing is frame-rate independent.** The easing constant is rescaled by
delta time (`1 - (1-k)^(dt/16.667)`), so a 120 Hz display and a struggling
phone settle at the same *rate* instead of the phone crawling behind the
scrollbar.

**The colour grade is baked into the JPEGs**, not applied as a CSS `filter` on
the canvas. A full-viewport filter on the single most-repainted element on the
page measured as the third-largest paint cost. `ffmpeg`'s
`eq=contrast=1.07:saturation=1.08:brightness=-0.045` matches what the CSS was
doing and costs nothing at runtime.

**The bloom moves by transform, never by rewriting its gradient.** Updating
`background` on a viewport-sized radial forces a full rasterise every frame;
`transform` + `opacity` stay on the compositor.

**No `scroll-behavior: smooth`.** The page is ~17,000px tall — a smooth anchor
jump takes seconds and fights the pins.

**Portrait fits the frame width instead of covering.** A 16:9 plate cover-cropped
into a 9:19.5 phone viewport shows a ~26% wide slice of the middle and the
product stops being legible. Portrait fits close to the full frame width and
letterboxes into the page ground, which reads as a deliberate cinematic band.

**Hotspot coordinates are authored against the image, so the image has to be
the reference box.** On portrait the anatomy plate is letterboxed to its native
16:9 and the hotspot layer is given the identical box — otherwise the dots drift
off the features they point at.

**One hotspot card at a time.** Fixed-percentage hotspots and fixed-width cards
collide at some viewport ratios if all four are up at once. The dots accumulate
behind the current card, so progress through the four is still visible.

**Frames preload in sequence order, eight at a time.** Firing all 120 at once
pins the progress bar at zero until the whole set lands, and fetches the tail of
the film before the opening frames anyone actually sees. `nearestReady()` paints
the closest decoded frame, so scrubbing ahead of the download degrades to a
coarser step rather than a blank canvas.

**Fonts are self-hosted** (shared with the Air Max page at the repo root): Inter
and JetBrains Mono as single variable files, Instrument Serif roman + italic. No
third-party requests, works offline, survives a strict CSP.

---

## Verified

Checked in headless Chromium by screenshotting ~25 scroll positions per
breakpoint at 1440×900, 1280×860, 1024×768 and 390×844, plus a reduced-motion
pass. Bugs this caught and that are now fixed:

- Hero copy was illegible over the bright bone frame — each act now carries its
  own directional wash rather than one flat scrim.
- The wordmark's exit tracking pushed its outer letters past the viewport edge.
- The gallery's sticky stage sized its grid column to the (viewport-wider) rail,
  dragging the section header off-centre with it.
- 4:5 crops of 16:9 studio plates were mostly empty backdrop; cards now carry
  per-image aspect ratios.
- Reduced motion still ran the rAF loop, which reset the anatomy hotspots to
  "off" on every frame.
- The beat rail sat at the right edge, on top of act 2's right-hand spec rail.

**Measured** (this machine, software rasterisation — real GPU hardware is much
faster): the scroll loop runs at ~39 fps and settles exactly on target. Time to
interactive is 0.5s unthrottled, 3.7s at 3 Mbps, 7.1s at 900 kbps on the large
frame set — a real 900 kbps browser reports `effectiveType: '3g'` and takes the
1.6 MB small set instead.

## Known limitations

**The video section is unverified.** The headless Chromium used for testing has
no H.264 decoder, so `assets/media/iridium-loop.mp4` shows its poster in tests.
In a real browser it plays. The bytes are a valid faststart MP4 with a silent
AAC track, Main/4.0, bt709.

**The lens engraving in the source footage is garbled.** It is AI-generated text
that reads as something like "CIMITEY IRS". It is legible for roughly one beat
of the macro sequence and there is nothing to be done about it short of
retouching every affected frame.

## The offline demo

`eye-jacket-offline.html` is the whole site as one 5.1 MB file — stylesheet,
fonts, all 120 hero frames, the stills and the looping video inlined. It runs
from a USB stick, an email attachment or a double-click on `file://` with no
server and no network. Verified: boots in 0.6s from `file://`, makes zero
network requests, no console errors.

```sh
python3 build-offline.py                      # → eye-jacket-offline.html (5.1 MB)
python3 build-offline.py --frames sm          # → 2.9 MB, 720px frames
python3 build-offline.py -o demo.html         # pick the filename
```

Three things the bundler has to get right:

- **Frames go in as a `window.__FRAMES` array of data: URIs.** `main.js` checks
  for that array and skips its normal path-based loading, so the single-file
  build exists without a forked copy of the engine to keep in sync.
- **The video becomes a Blob URL, not a data: URI.** Safari wants byte-range
  requests for media and will not reliably play a `data:` source.
- **Image references are matched per *attribute*, not per tag, and only for
  image extensions.** A tag-anchored pattern only catches the first attribute,
  so a tag carrying both `src` and `poster` keeps an un-inlined poster; a
  pattern that is not extension-scoped swallows `<script src>` and silently
  produces a stub. Both of those were real bugs in the sibling page's builder.

The footer's link to the sibling page is dropped on the way out, since it has
nowhere to point in a single file.

## Rebuilding the assets

Frames, stills and the loop video all come from the one source clip:

```sh
GRADE="eq=contrast=1.07:saturation=1.08:brightness=-0.045"

# 120 frames, two sizes
ffmpeg -i source.mp4 -vf "fps=15,scale=1280:720:flags=lanczos,$GRADE" -q:v 5 assets/frames/lg/%04d.jpg
ffmpeg -i source.mp4 -vf "fps=15,scale=720:405:flags=lanczos,$GRADE"  -q:v 6 assets/frames/sm/%04d.jpg

# seamless loop: forward + reversed, so the seam is invisible
ffmpeg -ss 2.2 -t 4.0 -i source.mp4 -f lavfi -i anullsrc=r=48000:cl=stereo \
  -filter_complex "[0:v]scale=960:540:flags=lanczos,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]" \
  -map "[v]" -map 1:a -shortest -c:v libx264 -profile:v main -level 4.0 -pix_fmt yuv420p \
  -crf 30 -preset slow -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 48k -movflags +faststart assets/media/iridium-loop.mp4
```

Serve locally with `python3 -m http.server 8000` and open `/oakley/`.

## Weight

| | |
|---|---|
| Frames, large set | 3.1 MB (120 × 1280×720) |
| Frames, small set | 1.6 MB (120 × 720×405) |
| Loop video | 298 KB |
| Stills | 300 KB |
| Fonts | 140 KB |
| HTML + CSS + JS | ~60 KB |
| **Offline bundle** | **5.1 MB** (2.9 MB with `--frames sm`) |
