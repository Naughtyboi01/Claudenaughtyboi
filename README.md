# House of Rocky

A one-page luxury site for a small bakery, built around a scroll-scrubbed
brand film. No framework, no build step, no third-party requests at runtime —
open `index.html` and it runs.

---

## The hero

The centrepiece is a **frame-sequence scrubber**. The 6-second brand film is
decoded ahead of time into 109 square stills, preloaded, and painted to a
`<canvas>` at an index driven by scroll position inside a 760vh sticky track.

This is deliberately *not* a `<video>` with `currentTime` assignment. Scrubbing
a video element stutters badly on mobile Safari, which seeks to the nearest
keyframe rather than the requested time. Painting decoded stills is frame-exact
everywhere, at the cost of the upfront download.

The film has four beats, and the hero is choreographed to them:

| Scroll | Footage | On screen |
|---|---|---|
| 0.00 – 0.25 | macro dough | wordmark lockup, then *“Butter, browned”* |
| 0.26 – 0.41 | pecans | *“Toasted whole, broken by hand”* |
| 0.42 – 0.55 | chocolate chunks | *“Cut from the block, never a chip”* — a wash deepens here |
| 0.55 – 1.00 | the finished cookie | captions clear out; the closing card fades up |

**The pull-back.** The film is square and the footage carries the House of Rocky
wordmark burned into its bottom-right corner. Cover-cropping a square into a
wide viewport would slice that off, so the canvas eases from `cover` to
`contain` between 0.55 and 0.80 — the shot pulls back into a framed plate as
the cookie resolves, and the wordmark lands intact. On a portrait screen the
same move ends as a full-width plate with the caption in clear space beneath.

**The plate margins** are filled with a 32×32 copy of the current frame scaled
back up with smoothing — a cheap blur that always matches the footage, so there
is no colour to keep in sync and no hard letterbox.

Supporting details:

- **Two frame sets.** `rocky/frames/lg` (1000px, 5.8 MB) for desktop,
  `rocky/frames/sm` (620px, 2.6 MB) for narrow viewports, `saveData` clients
  and 2G connections.
- **Eased index.** The drawn frame lerps toward the scroll-derived target, so a
  fast flick reads as motion rather than a cut.
- **Graceful degradation.** `nearestReady()` paints the closest decoded frame,
  so scrubbing never blanks mid-preload; a 9s timeout dismisses the loader
  regardless of network.
- **A poster behind the canvas**, so the hero shows real footage before the
  first frame decodes — and with JavaScript off, where the canvas never paints.

## Sections

| # | Section | Mechanic |
|---|---------|----------|
| 01 | Hero | Scroll-scrubbed canvas, four choreographed beats |
| 02 | Statement | Word-by-word ignition tied to scroll position |
| 03 | The reason | The Rocky story — editorial two-column, dark |
| 04 | Anatomy | Pinned cookie, four hotspots that advance with scroll (also clickable) |
| 05 | The counter | Three products, parallax crops |
| 06 | Craft | Vertical scroll translated into a horizontal rail |
| 07 | The film | Looping macro footage, plays only while in view |
| 08 | Reserve | Client-side form with inline confirmation |

## Structure

```
index.html
rocky/
  css/fonts.css      self-hosted @font-face
  css/style.css
  js/main.js         one rAF loop drives everything
  fonts/             Instrument Serif, Inter var, JetBrains Mono var (latin)
  frames/lg, sm/     hero sequences, 109 frames each
  img/               logo, stills, posters
  media/             looping mp4 for the film section
```

## Notes

- **Native scroll throughout.** No transform-hijacked scroll container — sticky
  positioning stays intact, and the trackpad, keyboard and scrollbar all behave.
  Smoothing is applied to animated values, not to the scroll itself.
- **The logo is the real one.** `rocky/img/logo-wordmark.png` is the supplied
  mark lifted off its cream disc onto transparency, so it can sit on any
  background; `logo-circle.png` keeps the disc.
- **Fonts are self-hosted**, so the page has zero external dependencies and
  works offline or behind a strict CSP.
- **`prefers-reduced-motion`** disables the grain, drift and reveal
  transitions; the hero stays scrubbable because it is user-driven.
- **No-JS fallback** in a `<noscript>` block unpins the sticky sections,
  reveals all masked text, and leaves the hero showing its poster.

## Copy — please read before this goes live

The origin story in section 03 is written from what was supplied: the business
was started by **Jane Naughton** in memory of her late brother **Rafeek**, known
to everyone as **Rocky**.

Everything else in that section is **written colour, not reported fact** — the
late-night kitchen, the neighbours at the door, "the loudest laugh in the room",
the plates he overfilled. It reads as memoir, so it should be replaced with real
memories before publishing rather than left as written. The same goes for the
product specifics invented to give the page substance: the 36-hour cold rest,
Irish butter, the €4.00–4.50 prices, the Thursday–Sunday bake days, the
`hello@houseofrocky.ie` address and the empty social links.

The reserve form is front-end only. It validates and confirms in the page and
sends nothing anywhere — wire it to a real order system before launch.

## Running it

```bash
python3 -m http.server 8000   # any static server; file:// works too
```

## Also in this repo

`airmax95.html` and `assets/` are an earlier, unrelated design study, kept
alongside this one. `build-offline.py` packs that study into a single
self-contained file; `demo/` holds its walkthrough video.

## Credits

Brand film, logo and the facts of the story supplied by the project owner.
