# AIR MAX 95 — The Anatomy of Air

A single-page luxury landing page built around a scroll-scrubbed product film.
No framework, no build step, no third-party requests at runtime — open
`index.html` and it runs.

## The hero

The centrepiece is a **frame-sequence scrubber**: the source video is decoded
ahead of time into 96 stills, preloaded, and painted to a `<canvas>` at an index
driven by scroll position inside a 700vh sticky track.

This is deliberately *not* a `<video>` with `currentTime` assignment. Scrubbing a
video element stutters badly on mobile Safari, which seeks to the nearest
keyframe rather than the requested time. Painting decoded stills is frame-exact
everywhere, at the cost of the upfront download.

Supporting details:

- **Two frame sets.** `assets/frames/lg` (1280px, ~4.5 MB) for desktop,
  `assets/frames/sm` (720px, ~2 MB) served to narrow viewports, `saveData`
  clients, and 2G connections.
- **Eased index.** The drawn frame lerps toward the scroll-derived target, so a
  fast flick reads as motion blur rather than a jump cut.
- **Graceful degradation.** `nearestReady()` paints the closest decoded frame, so
  scrubbing never blanks out mid-preload; a 9s timeout dismisses the loader
  regardless of network.
- **Four choreographed beats** — wordmark, statement, technical callout, end card
  — cross-fade against the footage on their own scroll windows, with a live HUD
  reading sequence position and phase.

## Sections

| # | Section | Mechanic |
|---|---------|----------|
| 01 | Origin | Word-by-word ignition tied to scroll position |
| 02 | Anatomy | Pinned figure, four hotspots that advance as you scroll (also clickable) |
| 03 | Materials | Staggered editorial grid with parallax crops |
| 04 | Air | Looping video, plays only while in view |
| 05 | Archive | Vertical scroll translated into a horizontal rail |
| 06 | Specification | Hover-tracked spec table |
| 07 | Reserve | Client-side form with inline confirmation |

## Structure

```
index.html
assets/
  css/fonts.css      self-hosted @font-face
  css/style.css
  js/main.js         one rAF loop drives everything
  fonts/             Instrument Serif, Inter var, JetBrains Mono var (latin)
  frames/lg, sm/     hero sequences, 96 frames each
  img/               stills for the static sections
  media/             looping mp4 for the Air section
```

## Notes

- **Native scroll throughout.** No transform-hijacked scroll container — sticky
  positioning stays intact, and the trackpad/keyboard/scrollbar all behave.
  Smoothing is applied to animated values, not to the scroll itself.
- **Fonts are self-hosted**, so the page has zero external dependencies and works
  offline or behind a strict CSP.
- **`prefers-reduced-motion`** disables the drift, grain, and reveal transitions;
  the hero remains scrubbable because it is user-driven.
- **No-JS fallback** in a `<noscript>` block unpins the sticky sections and
  reveals all masked text.

## Running it

```bash
python3 -m http.server 8000   # any static server; file:// works too
```

## Offline

The page makes no network requests at runtime, so the folder already works with
no connection — including straight off `file://`.

For a version you can email, carry on a stick, or open with nothing else
alongside it, `airmax95-offline.html` is the **whole site as one file**: styles,
fonts, all 96 hero frames, the stills and the video, inlined. 8.6 MB, opens in
about a second from disk since nothing is fetched.

Rebuild it after any edit:

```bash
python3 build-offline.py                # -> airmax95-offline.html (1280px frames)
python3 build-offline.py --frames sm    # ~4 MB, 720px frames
```

Two things worth knowing about that build:

- Frames go in as a `window.__FRAMES` array of data URIs; `main.js` detects it
  and skips its path-based loading, so both builds share one codebase.
- The video is inlined as base64 and handed over as a **Blob URL**, not a data:
  URI — Safari wants byte-range requests for media and will not reliably play a
  data: URI video. The video also carries a poster, so the Air section still
  reads as designed if a browser can't decode H.264.

## Demo

`demo/air-max-95-demo.mp4` — an 83-second walkthrough of the offline file,
recorded at 1440×900 straight off `file://`. The scroll is driven by an eased
timeline whose stops come from the page's measured geometry, so each one lands
where it should: the hero scrub, the Air callout timed to the close-up, all four
anatomy chapters, the archive rail, and the reserve panel.

One caveat: the Air section's background shows its poster rather than the
playing loop, because the headless Chromium used to record has no H.264 decoder.
In a real browser that footage plays.

## Credits

An independent design study. Not affiliated with or endorsed by Nike, Inc.
Product footage supplied by the project owner.
