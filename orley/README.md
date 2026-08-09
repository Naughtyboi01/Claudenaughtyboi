# ORLEY Continuum — a shield built around one lens

A single-page landing site for a shield sunglass, built from two short product
films. No framework, no build step for the site itself — open `index.html` and
it runs.

## The direction

Every luxury eyewear site is near-black. This one is blown out. Sunglasses
exist *because* the world is too bright, so the page is the bright environment
and the lens is the only place colour and depth pool — the whole palette is
neutral grey plus one blue ramp, and that ramp is sampled from the mirror in
the footage rather than invented.

The film's cyclorama brightens from `#949494` to near white across its eight
seconds. The page inherits that: `--sweep` runs 0 to 1 with document scroll and
the background follows, so the site is dim at the hero and nearly white by the
footer.

## The hero

The centrepiece is an **aperture**. The film is painted to a `<canvas>` clipped
by the silhouette of the product's own lens. That shield opens from a small
window to full bleed as you scroll in, holds through the film, then closes back
to a band around the floating product. The one structural device on the page is
the shape of the thing being sold.

Details that matter:

- **A frame sequence, not a `<video>`.** The master is HEVC, which most
  browsers cannot decode at all, and scrubbing a video element by `currentTime`
  stutters on mobile Safari because it seeks to the nearest keyframe. 151
  decoded stills are frame-exact everywhere.
- **The aperture grows at fixed proportion.** Interpolating width to `W` and
  height to `H` independently passes through a portrait rectangle on a phone,
  which stops reading as a lens somewhere in the middle. Instead the shape
  keeps its 2.9:1 ratio and grows until it covers the viewport, at which point
  radius, nose notch and top arc have all reached zero and it *is* full bleed.
- **The backdrop is sampled, not guessed.** `assets/js/backdrop.js` carries the
  lit cyclorama colour for every frame, read at build time from whichever
  corner is least saturated — in the macro shots two corners are full of skin,
  and the cyclorama is the only perfectly neutral thing in frame. The area
  outside the aperture takes that colour, so the shield reads as a window cut
  into the same studio rather than a card pasted over a different grey.
- **Two frame sets.** `seq/lg` (1500px, 3.7 MB) and `seq/sm` (820px, 1.5 MB),
  chosen by viewport, `saveData` and connection type. The first 26 frames load
  first and dismiss the loader; the rest stream in behind. `nearestReady()`
  paints the closest decoded frame so scrubbing never blanks out.
- **Type carries the motion.** Archivo ships with a real `wdth` axis, so the
  wordmark physically widens from 62% to 122% as the aperture opens — the
  letterforms change shape rather than being scaled. The same device returns
  once on the Worn headline, which makes it a motif rather than a one-off.

## Cleaning the footage

The film is of a real product, and it carries another maker's marks. Two kinds,
handled differently, both in `build-assets.py` so the result is reproducible:

**The printed mark on the lens** moves and changes scale through the whole
clip. Frame-to-frame tracking was tried first and drifted badly — it smeared
patches across the lens and, at one point, across the model's cheek. What works
is that the mark is *printed on the lens*, so it always falls in the same
corner of it. The lens bounding box supplies a search window, and inside that
window the mark is found as pixels running darker than the lens's own smooth
gradient, then filled by interpolating across it. Two passes: solid strokes
first, then a lower threshold around them for the faint edges.

**The film's own wordmark and caption strip** appear once the product is
floating, and degrade into garbled glyphs by the last second. Those sit on flat
backdrop in fixed bands, so they are filled from the rows either side. Clearing
them also freed the top and bottom of the frame, which is where the page's own
type beats now sit.

Crops for the still sections are chosen so no patch ever straddles the lens
rim: the rim carries a bright specular edge, and interpolating across it drags
white into the lens.

One thing deliberately left alone: the embossed ellipse on the frame near the
hinge. It is a moulding rather than printed branding, it reads as a hinge boss
at viewing size, and patching 55 frames of low-contrast white-on-white risks
more than it fixes.

## Sections

The marker at each section is the aperture again, opening a little further each
time. There are no `01 / 02 / 03` numbers, because the sections are an argument
rather than a sequence of steps.

| Section | What carries it |
|---|---|
| Light | An interactive transmission chart. The washed column is the light that arrives; the saturated one is what gets past the lens. Pointer or arrow keys read out any wavelength. |
| Form | The product with four dots, keyed to a legend that highlights them on hover or focus. |
| Worn | Full-bleed band, with the width axis running on the headline as it enters, then two wearers flanking the fit copy. |
| Materials | Three crops — mirror, brow, frame. |
| Specification | Table and a reserve form with inline confirmation. |


## A second film

`source/orley-worn-02.mp4` is a second 8-second film of the same product on a
second model, and the Worn section takes one portrait from it so the page shows
more than one face — which is also what lets the fit copy beside it talk about
the bridge adjustment covering a narrow face and a wide one.

Only its first act is usable here. It resolves to a product turn on a
near-black backdrop, which belongs to a different page than this high-key one.
It is 1280x720 rather than 4K, so the crop is taken close to native size; at
the 364px it renders at, it holds up beside the stills cut from the master.

A third film was offered and left out on purpose: same product, but on a chrome
android with glowing circuitry and a dark sci-fi vignette. The page argues that
this is an honest object made of real materials obeying real optics, and a robot
head undercuts that on contact. One bold move — the aperture — is the budget;
a second, unrelated visual language spends it twice.

## Structure

```
index.html
build-assets.py        derives everything below from source/
source/
  orley-master.mp4     3840x2160 HEVC, 24fps, 193 frames
  orley-worn-02.mp4    1280x720 H.264, second model, one still taken from it
assets/
  css/fonts.css        self-hosted @font-face
  css/style.css
  js/main.js           one rAF loop drives the hero
  js/backdrop.js       generated: backdrop colour per frame
  fonts/               Archivo, Instrument Sans, Martian Mono (variable, latin)
  seq/lg, seq/sm/      hero sequences, 151 frames each
  img/                 stills for the static sections
```

## Notes

- **Native scroll throughout.** No transform-hijacked container, so sticky
  positioning stays intact and the trackpad, keyboard and scrollbar all behave.
  Smoothing is applied to the animated values, not the scroll — the drawn frame
  eases toward its scroll-derived target, so a fast flick reads as motion blur
  rather than a jump cut.
- **Fonts are self-hosted** with their axes intact, so there are no runtime
  third-party requests and the page works offline or behind a strict CSP.
- **`prefers-reduced-motion`** drops the easing and the reveal transitions. The
  hero stays scrubbable because it is entirely user-driven.
- **No JS** unpins the hero, shows the poster, and lays the four type beats out
  as a column. Every section below is static and complete.
- **Keyboard.** The spectrum is a real slider — arrows step 5 nm, shift-arrows
  25 nm, Home and End jump to the ends, and `aria-valuetext` tracks the reading.

## Running it

```bash
python3 -m http.server 8000     # any static server; file:// works too
```

`file://` works because nothing is fetched at runtime — the backdrop track is a
script rather than JSON precisely so it survives there.

## Offline

The folder already works with no connection, including straight off `file://`,
because nothing is fetched at runtime. For a version you can email or carry on
a stick, **`orley-offline.html` is the whole site as one file** — styles,
fonts, all 151 hero frames, the stills and the backdrop track inlined. 5.4 MB,
and it paints in about half a second from disk since there is nothing to go and
get.

```bash
python3 build-offline.py                # -> orley-offline.html   5.4 MB, 1500px frames
python3 build-offline.py --frames sm    # -> orley-offline-sm.html 2.6 MB, 820px frames
```

Rebuild it after any edit to the site. Two things worth knowing about that
build:

- Frames go in as a `window.__ORLEY_FRAMES` array of data URIs. `main.js`
  checks for it and skips its path-based loading, so both builds share one copy
  of the code instead of a fork that has to be kept in step.
- The image inlining is scoped to image suffixes. A broader pattern also eats
  `<script src>` and quietly produces a bundle with no JavaScript in it, and
  every occurrence is replaced rather than the first per tag — attribute order
  is not worth relying on. The build fails loudly if any `src`, `href` or
  `poster` still points at `assets/`.

## Rebuilding the assets

```bash
pip install pillow numpy imageio-ffmpeg
python3 build-assets.py                 # sequences and stills, ~75s
python3 build-assets.py --stills-only
```

Output is byte-for-byte reproducible from the master.

## Credits

An independent design study. ORLEY is not a real brand and is not affiliated
with or endorsed by any eyewear maker. The product film was supplied by the
project owner; the specifications quoted on the page were written for the study
and are not measurements of a real product.
