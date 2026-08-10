# FrostByte® — statement rings

A one-page landing site built around a scroll-scrubbed campaign film. No
framework, no build step, no third-party requests at runtime — serve the
folder and it runs.

```bash
npx http-server frostbyte -p 8080     # or any static server with Range support
```

**Range requests are required.** The hero binds `video.currentTime` to scroll
position, and a server that answers `200` instead of `206` leaves
`video.seekable` empty — the film loads, reports `readyState 4`, and refuses to
move. Python's `http.server` is the common offender. Every real static host
(Netlify, Vercel, S3, nginx, Caddy) handles this already.

## The hero

`.hero` is 400svh tall. GSAP ScrollTrigger pins `.hero__pin` from the top of
that section to its bottom — 300svh of travel — and maps the range onto the
film's full 0–5.042s with `scrub: true`.

Seeks are applied on a `requestAnimationFrame` pump rather than straight out of
the scroll handler. Assigning `currentTime` faster than the decoder can answer
queues seeks and the scrub lags behind the wheel; the pump holds the newest
target and issues one seek at a time, gated on `seeked`.

### The film

Re-encoded from the 2152×3852 / 24fps source:

```bash
ffmpeg -i input.mp4 -vf scale=1080:-2 -c:v libx264 -crf 23 -g 1 \
       -pix_fmt yuv420p -movflags +faststart hero.mp4
ffmpeg -i hero.mp4 -vf "select=eq(n\,0)" -vframes 1 poster.jpg
```

`-g 1` makes every frame a keyframe, which is what lets the browser land on any
requested time instead of snapping to the nearest I-frame. `+faststart` moves
the moov atom to the front so playback can begin before the download finishes.
The cost is size: 5.0 MB for 5 seconds.

A VP9 `.webm` ships alongside it, chosen via `canPlayType` for builds without
the proprietary codecs. H.264 is preferred where available — hardware decode is
what makes seeking cheap.

### Framing

The film is portrait, 0.5584:1. Covering a 16:9 desktop viewport with it would
show a horizontal band about 35% of the frame's height — which cuts off the
onyx ring on the upper hand *and* the garnet signet on the lower one, the two
things the scroll choreography exists to point at.

So the video element is a full-height plate, `0.62 × viewport height` wide,
centred on paper. `object-fit: cover` with `object-position: center` is still
what fills it: on portrait viewports the plate *is* the viewport and the film
crops as intended, and on wide viewports the plate's own ratio means cover trims
only the dead white above her head and the dead black below the hem. Both hands
stay in frame at every width.

### Typography over the film

The wordmark crosses the plate's left edge, so it has to be legible on paper and
on a black roll-neck at once. It ships as two stacked copies: near-black
underneath, white on top clipped to the plate — inset by a further 14% of the
plate width, because that leftmost strip is the lit studio wall behind her arm
at every point in the scrub. The flip lands between the `t` and the `B`.

A `mix-blend-mode: difference` layer does this in one element, and was the first
attempt. It turns teal over skin tones, which is out of key for a page with one
accent colour.

On portrait viewports the plate fills the screen, the wordmark sits in the
bottom band — roll-neck all the way across — and the whole thing goes white.

### Callouts

Ring labels are real HTML text, never baked into the film. Both resolve exactly
on their cue: `01 Obsidian Signet` at 40% of the pin, `04 Sanguine Signet` at
70%, each fading and sliding in over the 10% before it.

On wide viewports they sit at opposite frame edges, clear of the hands and the
nails. On portrait there is no paper margin to sit against, so they share one
slot on the roll-neck and flip to white — measured across the scrub, the strip
from 52% down stays under 60/255 at every point, which is what makes one slot
safe for both. They never coincide in time, so one is enough.

## Degradation

| Condition | Behaviour |
|---|---|
| `prefers-reduced-motion` | Scrub off, poster frame, no travel on the reveals. The film is never fetched. |
| iOS / iPadOS WebKit | Same static path — video seeking there is unreliable regardless of keyframe density. Detected before the first byte, so the 5 MB is never spent. |
| Decoder refuses to seek | Four unanswered seeks in a row and the hero drops to the poster at runtime. |
| No JavaScript | `<noscript>` unpins the hero and reveals the poster and all text. |

Text choreography plays in full in every one of these — only the film stops
moving.

## Performance notes

- Only `transform` and `opacity` are animated. Nothing touches layout.
- `will-change: transform` is applied by JS when the hero trigger goes active
  and removed when it leaves; the section reveals add it on enter and drop it
  in `onComplete`.
- Fonts are self-hosted variable woff2, latin subset — 83 KB for both.
- GSAP is vendored from npm rather than a CDN, so the page makes no
  third-party requests.

## Offline

The folder already works with no connection, since the page makes no network
requests at runtime. For a version you can email, carry on a stick, or open
with nothing else beside it, there are two single-file builds:

| File | Size | Contents |
|---|---|---|
| `frostbyte-offline.html` | 13.5 MB | 1080w H.264 **and** VP9, full-size stills |
| `frostbyte-offline-mobile.html` | 3.3 MB | 720w H.264 only, 560w stills |

Rebuild after any edit:

```bash
python3 build-offline.py                   # both
python3 build-offline.py --profile mobile  # just the light one
```

The desktop build carries both codecs because an offline file can end up
anywhere, including a browser built without the proprietary ones. The mobile
build drops VP9: every phone decodes H.264 in hardware, and that copy would
otherwise be the largest single thing in the file.

Two things worth knowing about the build:

- The film goes in as base64 on `window.__FROSTBYTE_MEDIA` and is handed to the
  video element as a **Blob URL**, not a `data:` URI. Media elements want
  byte-range requests to seek — the same requirement as the served site — and a
  `data:` source will not scrub reliably. Blob URLs seek fine, and the offline
  build was checked at 0/40/70/100% off `file://`: identical timings to the
  served page.
- `main.js` checks for that global and skips its path-based loading when it is
  present, so both builds share one codebase with no forked copy to keep in
  sync.

## Demo

`demo/frostbyte-demo.mp4` — a 63-second walkthrough at 1440×900, recorded off
the offline file rather than a served copy. `demo/frostbyte-demo-720p.mp4` is
the same cut at 1152×720.

```bash
node record-demo.js                                   # -> demo/*.webm
node record-demo.js frostbyte-offline.html 1440 900   # explicit
```

The scroll is an eased timeline whose stops are measured from the page's own
geometry, so each one lands where it should. It comes to a **full stop wherever
product information appears** — the Obsidian Signet callout at 40% of the hero
pin, the Sanguine Signet at 70%, then each row of the collection grid — and
holds 3.4s at each, long enough to read the name and the price.

The script prints a `trim:` value on exit. That is the dead air at the head
while the film decodes; pass it to `ffmpeg -ss` when encoding.

Both cuts carry a **silent AAC track**, bt709 tags and Main/4.0 — video-only
MP4s are refused by a fair number of players. `frostbyte-demo.html` and
`frostbyte-demo-720p.html` wrap the same footage as self-contained player
pages, with a Save button that writes the .mp4 back out, for when a desktop
player is being difficult.

One caveat: the hero film in the recording plays from the **VP9** copy, because
the Chromium used to record has no H.264 decoder. In a normal browser the page
uses the H.264 copy. This is also why the mobile build cannot be recorded — it
ships H.264 only, so it would record as the static poster.

## Structure

```
index.html
build-offline.py
assets/
  css/fonts.css     self-hosted @font-face
  css/style.css
  js/main.js
  vendor/           gsap.min.js, ScrollTrigger.min.js
  fonts/            Archivo (display), Inter (body)
  media/            hero.mp4, hero.webm, poster.jpg + 720w -sm variants
  img/              collection and atelier stills, sm/ for the light build
```

## Imagery

Every still on the page is cut from the campaign film at native resolution, so
the grid and the editorial sections carry the same cold, even studio light as
the hero. Two of the six collection tiles fall against her black roll-neck
rather than the white wall — that is where those rings are worn, and the grid
reads the better for the rhythm.

## Credits

An independent design study. FrostByte® is not a real label; the prices,
stockists and contact details are fictional. Campaign footage supplied by the
project owner.
