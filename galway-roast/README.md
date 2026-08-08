# The Galway Roast — landing page

A single-page brand site built around the supplied product film. No framework,
no build step, no third-party requests at runtime — open `index.html` and it
runs.

```
galway-roast/
├── index.html
└── assets/
    ├── css/      fonts.css, style.css
    ├── js/       main.js
    ├── fonts/    Shantell Sans (roman + italic), Inter — all self-hosted
    ├── frames/   lg/ (1000px) and sm/ (600px) WebP frame sequences, 121 each
    ├── img/      stills pulled from the film
    └── media/    the source film, for the campaign section
```

## The hero

The centrepiece is a **frame-sequence scrubber**. The 5.09s, 1440×1440, 24fps
clip was decoded ahead of time into 121 WebP stills, preloaded behind a progress
counter, then painted to a `<canvas>` at an index driven by scroll position
inside a 780vh sticky track.

This is deliberately *not* a `<video>` scrubbed by assigning `currentTime`.
Video seeking snaps to the nearest keyframe on mobile Safari and stutters badly.
Decoded stills are frame-exact everywhere; the cost is an upfront download,
which is why there are two frame sets and a real preloader.

Details worth knowing:

- **Scroll is never hijacked.** Native scrolling, `position: sticky`, the
  scrollbar, keyboard and trackpad all behave normally. Smoothing is applied to
  the *animated values* instead — the painted frame index lerps toward its
  scroll-derived target, so a fast flick reads as motion rather than a jump cut.
- **Uneven pacing.** Scroll distance is not spent linearly across the clip. A
  keyframe table lingers on the opening macro texture, hurries through the flat
  white middle of the pouch, and slows right down for the pull-back that reveals
  the pack. See `PACING` in `main.js`.
- **Cover → contain.** Early frames are pure texture, so they fill the viewport.
  As the pull-back completes the fit drifts toward `contain` so the whole pouch
  stays inside the frame. The image edges are feathered into `#140203`, sampled
  from the film's own frame borders, so the seam is invisible.
- **A composed finale.** On a landscape screen the pack slides to the left third
  and the closing copy takes the right — campaign-poster layout. On a portrait
  screen it lifts instead and the copy sits underneath.
- **Four beats** fade in and out across the track (wordmark → origin line →
  spec band → product reveal), each with its own directional scrim, because the
  footage swings from near-black to a bright white pouch and cream type needs
  help on both.

Everything hangs off one `requestAnimationFrame` loop: hero, blend panels,
parallax, marquee, nav progress and the section rail.

## Typography

Both faces are self-hosted — no third-party requests, works offline, survives a
strict CSP.

**Shantell Sans** carries every display line. It was chosen by rendering
sixteen candidate hands against a frame grab of the pouch: it is the closest
widely-licensable match to the printed lettering — upright rounded marker,
single-storey `a` and `g` — and its weight axis covers both roles on the pack in
one file, the heavy wordmark and the lighter product line. **Inter** does the
eyebrows, body copy and UI.

## The logo

`.logo` in `style.css` is a reproduction of the mark printed on the pouch:
three tucked lines with the bean-and-saucer sitting to the right of *the*, drawn
as inline SVG. Everything scales from the container's `font-size`, so the same
component serves the hero, the nav and the footer. On the pack the outer lines
are roast brown and *galway* is wine; reversed out on this dark ground that
becomes cream and rose.

## Palette

Sampled from the film itself: oxblood silk, roast brown, bone. `--ink`
(`#140203`) is the measured colour of the clip's frame edges, which is what lets
the canvas dissolve into the page.

## Running it

```sh
python3 -m http.server 8000     # or just open index.html
```

## Rebuilding the frames

Frames were extracted with ffmpeg from the source film:

```sh
ffmpeg -i source.mp4 -vf "scale=1000:1000:flags=lanczos" \
       -c:v libwebp -quality 74 -compression_level 6 -an assets/frames/lg/f%03d.webp
ffmpeg -i source.mp4 -vf "scale=600:600:flags=lanczos" \
       -c:v libwebp -quality 70 -compression_level 6 -an assets/frames/sm/f%03d.webp
```

If the count changes, update `FRAME_COUNT` in `main.js`.

## Content notes

Product facts come from the pouch itself: 100% Arabica, ground coffee, a blend
of Brazilian Santos, Guatemalan and Honduras beans, medium strength, chocolate
and caramel tasting notes, suited to cafetière and filter, Great Taste 2024.

The range, formats, delivery terms, roastery history and contact details follow
the live shop at [galwayroast.ie](https://galwayroast.ie). Every card in the
range links to its real product page.

### Prices — the one thing still missing

`PRICES` at the top of `setupShop()` in `main.js` is the single source for every
price on the page: the featured picker and all eight range cards read from it.
Each key is currently `null`, which renders as "On request" and leaves the buy
links working.

They are empty rather than guessed: the build environment's network policy
blocks `galwayroast.ie`, so the live catalogue could not be read, and inventing
a shop's prices is worse than showing none. To fill them:

```sh
curl -s 'https://galwayroast.ie/products.json?limit=250' | jq -r \
  '.products[] | .title as $t | .variants[] | "\($t) / \(.title): \(.price)"'
```

Then set plain euro numbers, e.g. `'blend-ground-200': 9.95`.

### Still to confirm

- **Phone number.** Deliberately omitted. Directory sites return two different
  numbers for the Tuam address and neither could be checked against the
  business's own pages, so none is published.
- **Email.** `info@galwayroast.ie` is shown in the footer — worth a quick
  confirmation against `galwayroast.ie/pages/contact`.
- **Product name.** The live shop spells it *Columbian* Black Condor; the card
  here uses *Colombia*. Match whichever the catalogue should use.
- **Social links.** Only Facebook is linked, as it is the only account that
  could be verified.

The brew guide's exact dosing (30g to 500ml, four minutes) is a sensible
house recipe, not a published one.
