# ORLEY Continuum — a shield built around one lens

A single-page landing site for a shield sunglass, built from one eight-second
product film. No framework, no build step for the site itself — open
`index.html` and it runs.

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
| Worn | Full-bleed band, with the width axis running on the headline as it enters. |
| Materials | Three crops — mirror, brow, frame. |
| Specification | Table and a reserve form with inline confirmation. |

## Structure

```
index.html
build-assets.py        derives everything below from source/
source/
  orley-master.mp4     3840x2160 HEVC, 24fps, 193 frames
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
