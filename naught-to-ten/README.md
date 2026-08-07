# NAUGHT TO TEN — web design studio

A single-page luxury landing page for a (fictional) web design studio, built
around a scroll-scrubbed film. No framework, no build step, no third-party
requests at runtime — open `index.html` and it runs.

## The idea

The supplied clip is a 6-second dolly-out: it opens as an extreme macro on
glowing circuitry across a scalp and pulls back, through profile, to a complete
chrome figure turning to face camera.

That reveal *is* the brand argument. Scroll drives the pull-back, and a counter
in the corner ticks **0.0 → 10.0** in lockstep with it. You arrive at naught on
a detail you cannot read, and you leave at ten on a finished thing looking
straight back at you. Every other number on the page — ten services, the four
process movements labelled 00/03/07/10 — hangs off that one scale.

## The hero

The centrepiece is a **frame-sequence scrubber**: the film is decoded ahead of
time into 145 stills, preloaded, and painted to a `<canvas>` at an index driven
by scroll position inside a 760vh sticky track.

This is deliberately *not* a `<video>` with `currentTime` assignment. Scrubbing
a video element stutters badly on mobile Safari, which seeks to the nearest
keyframe rather than the requested time. Painting decoded stills is frame-exact
everywhere, at the cost of the upfront download.

Supporting details:

- **Two frame sets.** `assets/frames/lg` (1600px, 6.0 MB) for desktop,
  `assets/frames/sm` (960px, 2.9 MB) served to narrow viewports, `saveData`
  clients and 2G connections.
- **Eased index.** The drawn frame lerps toward the scroll-derived target, so a
  fast flick reads as motion blur rather than a jump cut.
- **Graceful degradation.** `nearestReady()` paints the closest decoded frame,
  so scrubbing never blanks out mid-preload; a 9s timeout dismisses the loader
  regardless of network.
- **Four choreographed beats** — wordmark, premise, method, end card —
  cross-fade against the footage on their own scroll windows, each lifting the
  side of the frame its copy sits on so type never fights the busiest part of
  the image.
- **A 0—10 rail** down the right edge whose active tick tracks the counter,
  plus sequence and phase readouts in the corners.

## Sections

| # | Section | Mechanic |
|---|---------|----------|
| 00 | Hero | 145-frame canvas scrub, 0.0 → 10.0 counter, four beats |
| 01 | Manifesto | Word-by-word ignition tied to scroll, animated stat counters |
| 02 | The scale | Pinned index of ten services; scroll advances the active row and swaps the plate beside it (rows are also clickable) |
| 03 | Film | Full-bleed loop, plays only while in view |
| 04 | Process | Four movements, staggered reveal |
| 05 | Work | Vertical scroll translated into a horizontal rail |
| 06 | Studio | Editorial split with a hover-tracked spec table |
| 07 | Start | Client-side form with inline validation and confirmation |

## Structure

```
index.html
assets/
  css/fonts.css      self-hosted @font-face
  css/style.css
  js/main.js         one rAF loop drives everything
  fonts/             Instrument Serif, Inter var, JetBrains Mono var (latin)
  frames/lg, sm/     hero sequences, 145 frames each
  img/               editorial crops pulled from the film
  media/             the loop for the film section
```

## Notes

- **Native scroll throughout.** No transform-hijacked scroll container — sticky
  positioning stays intact, and the trackpad, keyboard and scrollbar all behave.
  Smoothing is applied to animated values, not to the scroll itself.
- **The rAF loop self-schedules while easing.** Scroll events stop the instant
  the wheel does. If the loop only ran on those events, the canvas would hold a
  stale frame and the work rail would stop short of its last panel. `tick()`
  re-arms itself whenever an eased value is still short of its target.
- **The pinned service index has a fixed height.** Descriptions live in the
  right-hand plate rather than expanding inline, so ten rows can never overflow
  the pin. Below 900px the plate is dropped and the active row carries its own
  description instead.
- **Masked line reveals carry vertical slack.** Display line-heights here run
  well under 1, so an `overflow: hidden` mask sized to the line box slices
  descenders. Each `.line` is padded and pulled back with a negative margin.
- **Fonts are self-hosted**, so the page has zero external dependencies and
  works offline or behind a strict CSP.
- **`prefers-reduced-motion`** disables the grain, drift and reveal
  transitions, and drops the easing so scroll-linked values track exactly. The
  hero stays scrubbable because it is user-driven.
- **No-JS fallback** in a `<noscript>` block unpins the sticky sections,
  reveals all masked text and caps the hero poster so the wordmark stays above
  the fold.

## Running it

```bash
python3 -m http.server 8000   # any static server; file:// works too
```

## Verification

Checked in headless Chromium at 1440×900, 820×1180 and 390×844 — roughly forty
scroll positions per breakpoint — plus the reduced-motion and no-JS paths, and
the form and service-row interactions.

One caveat: the headless Chromium used here has no H.264 decoder, so the film
section's `<video>` could not be played in test and falls back to its poster.
The file itself is a Main/4.0 H.264 with a silent AAC track, bt709 tags and
faststart applied, which is the combination that plays everywhere.

## Credits

An independent design study. Naught to Ten is a fictional studio; the contact
details, client names and figures on the page are invented. Film supplied by
the project owner.
