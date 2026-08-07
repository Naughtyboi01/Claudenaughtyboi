# Working in this repo

Concept product landing pages, each built from a single short product film.
Two so far: **Air Max 95** at the repo root, **Eye Jacket** in `oakley/`.
Each has its own README with the full detail — read the one for the page you
are touching before changing it.

## Non-negotiables

- **No framework, no build step, no third-party requests at runtime.** The
  sites are hand-written HTML/CSS/JS and must run by opening `index.html`.
  Python and Playwright are for *asset generation and verification only* —
  never for serving the page.
- **Self-host fonts.** No Google Fonts link, no CDN. Variable fonts, one file
  per family. This survives a strict CSP and works offline.
- **The disclaimers stay.** Both pages are concepts using AI-generated imagery
  of a real brand's product. The footer must keep the not-affiliated notice and
  the statement that the imagery is AI-generated and nothing is for sale.
  Do not quietly soften or drop this.
- **Never invent product facts as if they were real.** Made-up marketing copy
  is fine on a page that declares itself a concept; specific false claims about
  a real company's history, materials or dates are not.

## The technique both pages share

The hero is a **scroll-scrubbed canvas frame sequence**: the source film is
decoded ahead of time into stills, preloaded, and painted to a `<canvas>` at an
index driven by scroll position inside a tall `position: sticky` track.

Do not "simplify" this into a `<video>` scrubbed via `currentTime` — video
seeking snaps to keyframes on mobile Safari and stutters badly. Decoded stills
are frame-exact everywhere; the upfront download is the accepted cost, which is
why there are two frame sets and a real preloader.

**Scroll stays native.** Never hijack scroll with a transform container — it
breaks `position: sticky` and the trackpad, keyboard and scrollbar. Smooth the
*animated values* instead, and scale the easing constant by delta time so slow
devices settle at the same rate rather than lagging the scrollbar.

## Performance rules, learned the hard way

Measured on this repo, not assumed:

- **Bake colour grades into the asset**, don't apply a CSS `filter` to the most
  repainted element on the page. A full-viewport filter on the hero canvas was
  the third-largest paint cost; `ffmpeg`'s `eq=` does it for free.
- **Move things with `transform`, never by rewriting `background`.** Updating a
  viewport-sized radial gradient every frame forces a full rasterise.
- **Full-screen `mix-blend-mode` overlays are the single biggest cost.** Keep
  them viewport-sized — an `inset: -50%` overlay paints 4x the area for nothing.
- **No `scroll-behavior: smooth`** on these pages. They are ~17,000px tall; a
  smooth anchor jump takes seconds and fights the pins.

## Writing to the DOM

Build generated markup with DOM calls (`createElement` + `textContent`), not by
concatenating strings into `innerHTML`. Round-tripping text through `innerHTML`
materialises real elements out of text and silently mangles any content with
`&` or `<`. `innerHTML` with a fully hardcoded literal that no data flows into
is fine.

## Verifying before you claim it works

Screenshot sweeps in headless Chromium are the standard here and they earn
their keep — every page-level bug in both READMEs' "Verified" sections was
caught this way, not by reading the code.

- Sweep ~25 scroll positions at several breakpoints, **including one portrait
  phone size and one reduced-motion pass**.
- Watch for `pageerror`, console errors, and 4xx responses during the sweep.
- Note that this environment's Chromium has **no H.264 decoder**. `<video>`
  with only an MP4 source will show its poster and look broken in tests. Ship a
  VP9 WebM source alongside the MP4 — it fixes the test *and* real Chromium
  builds without proprietary codecs.
- `Emulation.setVirtualTimePolicy` is **not** usable for deterministic capture:
  it advances `performance.now()` and rAF but not `document.timeline`, so every
  CSS transition snaps or freezes. Record in slow motion with
  `Animation.setPlaybackRate` and resample instead — see `oakley/record-demo.js`.

## Git

- Work on the branch you were given; never push to another without being asked.
- `main` is the default branch and carries both projects.
- Commit messages: a short imperative subject, then prose explaining *why* and
  what was verified. Say what was measured. Say what is still unverified.
