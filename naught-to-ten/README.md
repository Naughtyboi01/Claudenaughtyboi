# NAUGHT TO TEN — web design studio

A single-page luxury landing page for a Galway web design studio, built
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
| 06 | Founder | Portrait, first-person bio, fact table and a three-up contact sheet |
| 07 | Studio | Editorial split with a hover-tracked spec table |
| 08 | Start | Client-side form with inline validation and confirmation |

## Pages

| URL | File | Purpose |
|---|---|---|
| `/` | `index.html` | The one-pager |
| `/contact/` | `contact/index.html` | Enquiry form, full NAP block, `ContactPage` + `ContactPoint` schema |
| `/work/` | `work/index.html` | Project index, `CollectionPage` schema |
| `/privacy/` | `privacy/index.html` | GDPR notice, written to what the site actually does |
| `/terms/` | `terms/index.html` | Site terms and the studio's standard engagement terms |
| — | `404.html` | Not-found page, `noindex, follow` |

Sub-pages share `style.css` and add `page.css`; they load `page.js` rather
than the one-pager's `main.js`, since none of the scroll choreography applies.

## SEO

Every page carries a unique title (under 60 characters) and description (under
160), a canonical URL, Open Graph and Twitter card tags pointing at a 1200×630
share image, `lang="en-IE"`, and JSON-LD.

The structured data models the studio as a `ProfessionalService` with its real
NAP — name, address, phone — plus `founder`, `areaServed`, `sameAs` and an
`OfferCatalog` of the ten services. Sub-pages add `BreadcrumbList` and their
own page type. **Placeholder figures are deliberately kept out of the
structured data**: founding year, price range and the client list are still
invented, and asserting them in schema is the kind of thing that gets a rich
result pulled.

`robots.txt`, `sitemap.xml` and `site.webmanifest` sit at the root. The two
offline bundles are disallowed in robots.txt — they duplicate the whole site
and would otherwise be indexed as near-duplicate pages.

Two defects found and fixed while doing this:

- **Reveal animations hid content from anything without JavaScript.** With JS
  disabled the work page rendered zero visible cards. The hidden state is now
  gated behind a `.js` class set by an inline head script, so no-JS gets the
  content plainly and only the animation is lost.
- **Split headings lost their word breaks.** `data-lines` splits on `<br>`, and
  without a space in its place the H2 read `Four movements,twelve weeks.` to
  anything walking `textContent`.

### Changing the domain

The domain appears in canonicals, OG URLs, JSON-LD `@id`s, the sitemap and
robots.txt, and all of them must match wherever the site actually lives.

```bash
python3 set-domain.py example.ie --dry   # report
python3 set-domain.py example.ie         # apply, then rebuild the bundles
```

## Performance

The loader used to hold the first paint until all 145 frames had decoded. It
now releases after 24 and keeps fetching behind the revealed page;
`nearestReady()` already covered any gap the scrubber reached first.

Measured at 390×844 on a throttled 1.6 Mbps / 150 ms connection:

| | Time to reveal | Requests | Transferred |
|---|---|---|---|
| Before | 16.6 s | 160 | 3.31 MB |
| After | 5.7 s | 39 | 1.11 MB |

## Structure

```
index.html
contact/  work/  privacy/  terms/     sub-pages
robots.txt  sitemap.xml  site.webmanifest  404.html
assets/
  css/fonts.css      self-hosted @font-face
  css/style.css
  js/main.js         one rAF loop drives everything
  fonts/             Instrument Serif, Inter var, JetBrains Mono var (latin)
  frames/lg, sm/     hero sequences, 145 frames each
  img/               editorial crops pulled from the film
  img/founder/       portrait and contact sheet
  logo/              outlined SVG wordmarks, monogram and icon
  og/                1200x630 share card
  icons/             apple-touch-icon and manifest icons
  css/page.css       sub-page layer
  js/page.js         sub-page behaviour
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

## Offline

The page makes no network requests at runtime, so this folder already works
with no connection — including straight off `file://`.

For a version you can email, carry on a stick, or open with nothing else
alongside it, there are **two single-file builds** — styles, fonts, all 145
hero frames, the crops and the film, all inlined:

| File | Frames | Size | Boot from disk |
|---|---|---|---|
| `naught-to-ten-offline-desktop.html` | 1600px | 11.3 MB | ~0.7 s |
| `naught-to-ten-offline-mobile.html` | 960px | 6.9 MB | ~0.4 s |

They differ only in which frame set is baked in. The served site picks between
the two sets at runtime; a single file cannot, so the choice is made at build
time instead — hand someone the mobile file if they are on a phone or a slow
disk, the desktop file otherwise. Both are otherwise identical and both are
fully responsive.

Rebuild after any edit:

```bash
python3 build-offline.py --both      # both files
python3 build-offline.py             # desktop only
python3 build-offline.py --frames sm # mobile only
```

Three things worth knowing about that build:

- Frames go in as a `window.__FRAMES` array of data URIs; `main.js` detects it
  and skips its path-based loading, so both builds share one codebase.
- The film is inlined as base64 and handed over as a **Blob URL**, not a
  `data:` URI — Safari wants byte-range requests for media and will not
  reliably play a `data:` URI video. It also keeps its poster, so the section
  still reads as designed if a browser cannot decode H.264.
- Asset references are rewritten per *attribute*, not per tag. The `<video>`
  carries both `src` and `poster`; a tag-anchored match catches only the first
  and leaves the other pointing at a file that is no longer there. The build
  fails loudly if any `assets/` reference survives.

## Verification

Checked in headless Chromium at 1440×900, 820×1180 and 390×844 — roughly forty
scroll positions per breakpoint — plus the reduced-motion and no-JS paths, and
the form and service-row interactions.

Both offline files were opened from `file://` and confirmed to make **zero**
network requests, raise no console errors, and scrub the full sequence to
145/145 with the counter landing on 10.

One caveat: the headless Chromium used here has no H.264 decoder, so the film
section's `<video>` could not be played in test and falls back to its poster.
The file itself is a Main/4.0 H.264 with a silent AAC track, bt709 tags and
faststart applied, which is the combination that plays everywhere.


## Founder photographs

The four slots are filled. The frames themselves are styled to stand alone —
a matted, hairline-bordered `0—10` plate — so an empty slot reads as a
contact sheet rather than a broken image.

To replace them, or to fill slots later:

```bash
python3 add-founder-photos.py --portrait me.jpg --grid a.jpg b.jpg c.jpg
python3 build-offline.py --both        # refresh the single-file bundles
```

The script crops with ffmpeg (portrait to 1000×1250, squares to 800×800, both
centred), writes them to `assets/img/founder/`, and rewrites the matching
frames in `index.html` as `<img>` tags. Slots you don't supply stay as frames,
and re-running overwrites in place.

It never enlarges past the source. Enlarging adds no detail, only bytes and
softness, so a source that cannot fill a slot is cropped to the right shape
and written at whatever size it honestly supports — the current portrait comes
from an 828px screenshot and lands at 660×826 rather than a stretched
1000×1250. Feeding it the original camera files would fill the slots properly.

## Logo

`make-logo.py` rebuilds the wordmark from the site's own fonts and writes it
out as **outlined SVG paths**, so the artwork scales cleanly and opens
anywhere without the fonts installed.

```bash
python3 make-logo.py          # -> assets/logo/*.svg
python3 make-logo.py --png    # also 2400px transparent PNGs
```

| File | What it is |
|---|---|
| `wordmark-{dark,light}.svg` | The horizontal lockup — the primary mark |
| `wordmark-stacked-{dark,light}.svg` | Three-line version, as in the hero |
| `monogram-{dark,light}.svg` | The `0—10` scale mark |
| `icon.svg` | Square app icon, `10` in porcelain on an ink tile |

`dark` is ink for pale backgrounds, `light` is porcelain for dark ones. Inter
ships here as a variable font, so it is pinned to `wght=500` before the
outlines are taken — read at its 400 default the logo would come out visibly
lighter than the site. The stacked lockup is set looser than the hero (line
height .92 against .82), because on the page each line sits in its own masked
block and free-standing the italic *to* would run into the cap of *Ten*.

## Content that is still placeholder

The site carries real contact details, so anything invented reads as a real
claim. Before this goes live, replace:

- **The six case studies** in the Work rail — Aureate, Halcyon Atelier,
  Meridian Rye, Nocturne, Vantage Labs and Fold are all fictional, and they
  currently reuse crops from the hero film as their imagery.
- **The manifesto statistics** — brands launched, median Lighthouse, typical
  engagement.
- **The studio spec table** — founded year, engagements per quarter, starting
  price.

The `/work/` page repeats those six fictional projects and reuses crops from
the hero film as their imagery. None of it appears in structured data, so
nothing false is being asserted to search engines — but it is on the page, and
a visitor will read it as true.

Worth adding when there is time: a `/services/` page. The ten services are the
highest-intent thing people actually search for, and right now they only exist
as a pinned section on the one-pager.

## Credits

Naught to Ten is a real studio in Mervue, Galway — the address, phone and email
on the page are its own. The client names and figures are not; see *Content
that is still placeholder* above. Film supplied by the project owner.
