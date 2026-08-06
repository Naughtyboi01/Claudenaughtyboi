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

## Credits

An independent design study. Not affiliated with or endorsed by Nike, Inc.
Product footage supplied by the project owner.
