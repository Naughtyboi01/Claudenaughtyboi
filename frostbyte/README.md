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
film's full 0–3.042s with `scrub: true`.

Seeks are applied on a `requestAnimationFrame` pump rather than straight out of
the scroll handler. Assigning `currentTime` faster than the decoder can answer
queues seeks and the scrub lags behind the wheel; the pump holds the newest
target and issues one seek at a time, gated on `seeked`.

### The film

Re-encoded from the 1280×720 / 24fps source:

```bash
ffmpeg -i input.mp4 -vf crop=1280:656:0:0 -c:v libx264 -crf 23 -g 1 \
       -pix_fmt yuv420p -movflags +faststart -an hero.mp4
ffmpeg -i hero.mp4 -vf "select=eq(n\,0)" -vframes 1 poster.jpg
```

`-g 1` makes every frame a keyframe, which is what lets the browser land on any
requested time instead of snapping to the nearest I-frame. `+faststart` moves
the moov atom to the front so playback can begin before the download finishes.
At 3 seconds and 1280 wide that costs 1.5 MB — a third of what the previous
portrait film did.

**The crop is not cosmetic.** The supplied clip carries a KlingAI watermark
across the bottom right, y≈664–702. Cutting the frame to 656 removes it with
8px to spare, and costs nothing that matters: the watermark sits on flat
backdrop in every frame, and the gesture is well clear of it. `-an` drops the
audio track, which a muted, scroll-driven hero has no use for.

A VP9 `.webm` ships alongside it, chosen via `canPlayType` for builds without
the proprietary codecs. H.264 is preferred where available — hardware decode is
what makes seeking cheap.

### Framing

The film is landscape, 1.951:1, so a landscape viewport it simply fills —
`object-fit: cover`, `object-position: center`, full bleed, no letterbox. A
1440×900 screen shows the middle 82% of the width, and every ring lives well
inside that.

Portrait screens are the awkward case. Covering a 390×844 phone would show only
the middle **quarter** of the film's width, cutting the outer rings off both
hands. So the plate's height is capped there instead —
`min(100svh, 100vw × 1.025)` — which turns it into a full-width band with paper
above and below, holding roughly the middle half of the width. That is exactly
the span the rings occupy.

One trap worth recording: the frame is a centred grid item, so a *percentage*
height has no definite basis to resolve against and the film silently falls back
to its own intrinsic ratio — letterboxing a viewport it should be filling. The
cap has to be in `svh`.

### Typography over the film

This film is high-key end to end — pale backdrop, blush dress, blonde hair — so
the wordmark is a single near-black setting and reads over all of it. The one
exception is the saturated fold of the dress along the hem, where near-black
falls to about 2.8:1; a white scrim over the bottom 26% of the plate lifts that
to roughly 10:1 and lets the film dissolve into the page below rather than
butting against it.

The previous portrait film needed considerably more than this — two clipped
copies of the wordmark to survive the seam between a lit wall and a black
roll-neck. None of that machinery survives the swap, which is the point: the
footage changed, so the fix it demanded went with it.

### Callouts

Ring labels are real HTML text, never baked into the film.

The hands start *below* the frame here and rise through it, which moves the
cues. At 40% of the pin the left hand is still low and its butterfly sits behind
the wordmark's cap line, so a label there would point at something you cannot
see; measured across the scrub it clears at about 52%. The right hand is settled
by 70%, so that checkpoint stands as briefed. `01 Papillon` resolves at 52%,
`04 Rose Cabochon` at 70%.

Placement moved too. The hands converge in the middle of the frame and their
arms leave only about a sixth of the width free at ring height — too narrow to
set a name and a price in. What *is* open is the backdrop either side of her
head, so on landscape screens both callouts sit up there flanking her, each with
a rule running inward toward the hand it names. On portrait the film is a band
with paper above and below, so they go on the paper and never touch the film at
all.

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
| `frostbyte-offline.html` | 5.0 MB | 1280w H.264 **and** VP9, full-size stills |
| `frostbyte-offline-mobile.html` | 1.5 MB | 854w H.264 only, 560w stills |

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

`demo/frostbyte-demo.mp4` — a 48-second walkthrough at 1440×900, recorded off
the offline file rather than a served copy. `demo/frostbyte-demo-720p.mp4` is
the same cut at 1152×720.

```bash
node record-demo.js                                            # 1x,  ~63s
node record-demo.js frostbyte-offline.html 1440 900 demo 2 1   # shipped, ~48s
node record-demo.js frostbyte-offline.html 1440 900 demo 2     # 2x flat, ~34s
```

The last two arguments are pace multipliers for **travel** and **hold**, kept
separate. The shipped cut runs the scroll at 2× while the stops keep their full
length, so it moves briskly without hurrying the part you are meant to read.
Holds default to the travel pace when omitted.

Get a faster cut this way rather than speeding the finished file up with
`setpts` — at 25fps that would throw away every other frame and leave the eased
travel visibly choppy. Re-recording keeps all 25 unique frames per second
(1197 frames over 47.9s in the shipped cut).

The scroll is an eased timeline whose stops are measured from the page's own
geometry, so each one lands where it should. It comes to a **full stop wherever
product information appears** — the Papillon callout at 52% of the hero pin, the
Rose Cabochon at 70%, then each row of the collection grid — holding 3.4s at
each. The two hero stops are read off the same checkpoints as `main.js`; move
one and the other has to follow.

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
  media/            hero.mp4, hero.webm, poster.jpg + 854w -sm variants
  img/              collection and atelier stills, sm/ for the light build
```

## Imagery

Every still on the page is cut from the campaign film, so the grid and the
editorial sections carry the same cold, even studio light as the hero.

Worth knowing before you enlarge anything: this source is 1280×720, against the
2152×3852 of the film it replaced. Tight ring crops are therefore upscaled about
2× to reach 720×900, which holds up at the size the grid actually renders them
but will not survive a lightbox or a print. If those tiles ever need to be
sharp, they need shooting — no amount of re-cutting gets detail back out of a
720p master.

## Credits

An independent design study. FrostByte® is not a real label; the prices,
stockists and contact details are fictional. Campaign footage supplied by the
project owner.
