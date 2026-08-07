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
- **The logo and the type are both vector.** See below.
- **`prefers-reduced-motion`** disables the grain, drift and reveal
  transitions; the hero stays scrubbable because it is user-driven.
- **No-JS fallback** in a `<noscript>` block unpins the sticky sections,
  reveals all masked text, and leaves the hero showing its poster.

## Brand assets — all vector

Nothing on the page renders brand type or the mark from a bitmap, so both stay
sharp at any size and on any display.

**The logo**, `rocky/img/logo-wordmark.svg` and `logo-circle.svg`. The logo
arrived as a JPEG — black square, cream disc, dark lettering. `tools/trace-logo.py`
lifts the lettering off the disc and traces it to Bezier outlines:

```bash
python3 tools/trace-logo.py [path/to/logo.jpeg]
```

It traces a 2× upsample of the mask, because potrace fits curves to whole
pixels and tracing at native resolution leaves visible faceting on the thin
italic strokes of *House of*. The result is 17 contours and about 12 KB —
smaller than the 92 KB PNG it replaces, and resolution-independent. Traced ink
coverage lands within 2% of the original raster, the remainder being sub-pixel
edge rounding.

The wordmark is filled with `currentColor` and carries the brand ink as its
root style, so it takes the ink colour when loaded through `<img>` and follows
CSS `color` if you ever inline it. The circle lockup keeps its cream disc and
is also the SVG favicon, with the PNG left in place for `apple-touch-icon`.

> One caveat: this is a faithful *trace of a raster*, not the original artwork.
> If whoever drew the logo still has the vector file, use theirs — it will have
> true curves rather than curves fitted to pixels. This is the best available
> reconstruction from what was supplied.

**The type.** Instrument Serif (display), Inter (UI) and JetBrains Mono
(labels) are self-hosted as `woff2` in `rocky/fonts/` — outline fonts, so the
text is vector too, and stays live text: selectable, searchable and readable by
a screen reader. Nothing is converted to paths. Self-hosting also means the
page makes zero external requests and works offline or behind a strict CSP.

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

## Offline — the whole site as one file

The page makes no network requests at runtime, so the folder already works
with no connection. For a version you can email, put on a stick, or open with
nothing else beside it, there are two single-file builds:

| File | Size | For |
|---|---|---|
| `house-of-rocky-offline.html` | 10.2 MB | Desktop — 1000px hero frames, full-size stills |
| `house-of-rocky-offline-mobile.html` | 5.5 MB | Phones and sharing — 620px frames, stills capped at 900px |

Both are the complete site: styles, fonts, all 109 hero frames, the stills and
the film. Open either straight off `file://` — it loads in about a second
because nothing is fetched, and every section behaves exactly as it does when
served.

Rebuild after any edit:

```bash
python3 build-offline.py                   # desktop
python3 build-offline.py --preset mobile   # lighter
python3 build-offline.py --site airmax95   # the older study
```

Three things worth knowing about that build:

- Frames go in as a `window.__FRAMES` array of data URIs; `main.js` detects it
  and skips its path-based loading, so both builds share one codebase.
- The video is inlined as base64 and handed over as a **Blob URL**, not a
  `data:` URI — Safari wants byte-range requests for media and will not
  reliably play a `data:` URI video.
- `@import`ed stylesheets are **spliced in as text**, not embedded as data
  URIs. A browser only applies an imported sheet served as `text/css`, and a
  base64 blob arrives as `application/octet-stream` — which silently drops
  every `@font-face` and falls the page back to system serifs.

## Also in this repo

`airmax95.html` and `assets/` are an earlier, unrelated design study, kept
alongside this one. `build-offline.py` packs that study into a single
self-contained file; `demo/` holds its walkthrough video.

## Credits

Brand film, logo and the facts of the story supplied by the project owner.
