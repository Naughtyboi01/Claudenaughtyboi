# Session notes

Two builds so far, newest first. Both start from a single short product film
and turn it into a one-page site with a scroll-driven hero.

---

# ORLEY Continuum landing page

**Date:** 2026-08-08
**Branch:** `claude/anthropic-frontend-design-plugin-nmxjzr`
**Lives in:** `orley/`

Starting point was one 8-second 4K HEVC clip of a white shield sunglass with a
blue mirror lens: macro on the lens, pull back to the model putting them on, a
pixel-mosaic dissolve, then the product floating with a wordmark.

No pull request was opened. Say the word if you want one.

## Deliberately not a re-skin of the Air Max page

That page was warm — cream, bone, sand, taupe, an acid-yellow accent — on a
700vh sticky scrub with a live HUD. This one had to be its own thing:

- **High-key instead of dark.** Neutral greys plus a single blue ramp sampled
  from the mirror in the footage. Nothing else on the page is saturated.
- **The hero is an aperture, not just a scrub.** The film is clipped by the
  product's own lens silhouette, which opens to full bleed and closes again.
  That shape is also the section marker, opening further at each section, which
  replaced `01 / 02 / 03` numbering.
- **The HUD is gone.** It was the last project's tic.
- **The page brightens as you scroll**, following the film's own cyclorama
  sweep from `#949494` to near white.
- **Different typefaces on purpose**: Archivo (variable `wdth` 62–125),
  Instrument Sans, Martian Mono — none of Instrument Serif / Inter /
  JetBrains Mono. Archivo's width axis is animated on scroll, which is where
  the "dynamic type" in the brief actually lives.

## What went wrong, and what fixed it

- **Frame-to-frame tracking of the lens mark drifted.** Adaptive-template NCC
  followed the mark for a while and then wandered, smearing patches across the
  lens and once across the model's cheek. Replaced with: the mark is *printed
  on the lens*, so anchor a search window to the lens bounding box and detect
  it there as pixels darker than the local gradient. No drift, no state.
- **A first geometric attempt over-covered.** A box wide enough to be safe for
  every viewing angle flattened a quarter of the lens. Detection inside the
  window fixed that; the box is now only as big as the mark.
- **Filling across the lens rim smears white into the lens.** The rim has a
  bright specular edge. Where a mark sits on it, move the crop instead of
  patching — that is why the "brow" material shot is framed where it is.
- **`aspect-ratio` was being ignored on the material crops.** The `width` and
  `height` HTML attributes are presentational hints that make the used height
  definite, and `aspect-ratio` only applies when a dimension is auto. Fixed
  with a global `img { height: auto }`.
- **The aperture became a portrait box mid-transition on phones.** Width and
  height were lerping to `W` and `H` independently. Now the shape keeps its
  2.9:1 ratio and grows until it covers the viewport.
- **The no-JS hero stacked all four type beats on top of each other.**
  `position: static` does not undo `grid-area: 1/1`; the grid itself had to be
  unset.
- **The end card read as a white slab** until the area outside the aperture
  started tracking the film's own backdrop colour per frame.

## Worth remembering

- ffmpeg's image muxer numbers from 1; `-start_number 0` makes a file name
  equal its source frame number.
- WebP beat JPEG comfortably here: 34 KB vs 49 KB at 1500px, same quality.
- The backdrop track ships as a **script**, not JSON, so `fetch()` is never
  needed and `file://` keeps working. Its array length doubles as the frame
  count, so there is no second place to keep in sync.
- Google Fonts' CSS API is reachable in this sandbox even when direct guesses
  at gstatic URLs 404 — request the CSS with a modern UA and read the real
  URLs out of it. Ask for the full axis range or you get a flattened instance.
- The build is byte-for-byte reproducible; verified by deleting all output and
  re-running.

## Known limitations

- Playback of the source master itself was never verified in-browser — it is
  4K HEVC and the page never plays it, only the derived stills.
- An embossed ellipse on the frame near the hinge is left in the hero frames.
  It is a moulding rather than printed branding and reads as a hinge boss at
  viewing size; it *is* removed from the still crops, where a flat fill was
  safe. That inconsistency is deliberate.

---

# Air Max 95 landing page

**Date:** 2026-08-06
**Branch:** `claude/air-max-95-landing-page-fdory9` (all work pushed, tree clean)
**Repo:** `Naughtyboi01/Claudenaughtyboi`

Starting point was an empty repo and one 8-second product video (1280×720, 24fps)
of a bone/sand Air Max 95 — rotating profile, laces, Air unit, floating pair,
tongue badge. Everything below was built from that single clip.

No pull request was opened. Say the word if you want one.

---

## What exists now

| Path | What it is |
|---|---|
| `index.html`, `assets/` | The site — the normal build |
| `airmax95-offline.html` | Entire site as one 8.6 MB file |
| `build-offline.py` | Regenerates the above |
| `demo/air-max-95-demo*.mp4` | 83s walkthrough, 720p and 1440×900 |
| `demo/air-max-95-demo*.html` | Those videos wrapped as self-contained players |
| `build-video-page.py` | Wraps any .mp4 into a player page |
| `README.md` | How it all works and how to rebuild |

Five commits, oldest first: the site, the offline build, the demo video, the
video re-encode, the HTML players.

---

## The core idea

The hero is a **scroll-scrubbed canvas frame sequence**. The video was decoded
ahead of time into 96 stills; scroll position inside a 700vh sticky track picks
which one gets painted to a `<canvas>`.

This is deliberately not a `<video>` scrubbed via `currentTime`. Video seeking
snaps to keyframes on mobile Safari and stutters badly. Decoded stills are
frame-exact everywhere. The cost is an upfront download, which is why there are
two frame sets and a real preloader.

Everything else hangs off one `requestAnimationFrame` loop. No framework, no
build step for the site itself.

---

## Decisions worth remembering

**Scroll stays native.** No transform-hijacked scroll container. That keeps
`position: sticky` working and leaves the trackpad, keyboard and scrollbar
behaving normally. Smoothing is applied to the *animated values* instead — the
drawn frame index lerps toward its scroll-derived target, so a fast flick reads
as motion blur rather than a jump cut.

**Two frame sets.** `lg` (1280px, 4.5 MB) and `sm` (720px, 2 MB), chosen by
viewport width, `saveData`, and connection type.

**Fonts are self-hosted.** Google Fonts was blocked in the build sandbox, which
forced the issue — and self-hosting turned out better regardless: no third-party
requests, works offline, survives a strict CSP. Inter and JetBrains Mono ship as
single variable files (Google served identical bytes per weight; deduping cut
9 files to 4, 364 KB to 140 KB).

**Blob URLs for inlined video, not `data:` URIs.** Safari wants byte-range
requests for media and will not reliably play a `data:` source. Both the offline
site and the video player pages convert base64 to a Blob at load.

**One codebase, two builds.** `main.js` checks for a `window.__FRAMES` array and
uses it if present, otherwise loads frames by path. That single hook is what lets
the offline bundle exist without a forked copy to keep in sync.

---

## Bugs found and fixed (all via headless-browser verification)

Screenshotting at ~40 scroll positions across two breakpoints earned its keep:

- **Masked line reveals were slicing glyphs** on every split heading. Tight
  display line-heights meant the `overflow: hidden` mask was shorter than the
  text. Fixed with padding/negative-margin slack on `.line` and `.ln`.
- **Hero title was invisible at scroll 0** — beat 1's fade-in range started at
  p=0, so it was fully transparent on arrival. Range now opens before 0.
- **Footer end column wasn't a grid**, so its button and copyright sat on one row.
- **Beat-2 copy was illegible** over the busy lace frame; added a directional wash.
- **Offline build left a broken poster path.** A tag-anchored regex only ever
  matched the first attribute per tag, so `poster=` survived un-inlined. Then the
  broadened fix swallowed `<script src>` and produced a 0.9 MB stub. Now scoped
  to image extensions.
- **Demo timeline stops landed between sections.** First pass used eyeballed
  scroll fractions; rebuilt from measured geometry (hero pin 0→0.276, anatomy pin
  0.382→0.530, archive rail 0.714→0.852).

---

## Known limitations

**The Air section's video is unverified.** The headless Chromium used for testing
has no H.264 decoder — `canPlayType` returns empty and the served build fails
identically, so this is the test browser, not the page. Consequences:

1. In the demo video, that section shows its poster still rather than the playing
   loop. In a real browser the footage plays.
2. Video playback in general could not be confirmed here. What *was* confirmed is
   that the inlined bytes are byte-identical to source (`ftypisom`, exact lengths).

**Open, unresolved: the demo video would not play for you.** Diagnosis so far —
the file is not corrupt; it decodes end to end with zero errors and has faststart
applied. Three likely culprits were addressed by re-encoding: no audio track at
all (many players refuse video-only MP4s — prime suspect), `bt470bg` colour tags
inherited from the capture, and High/4.1 profile. Now: silent AAC track, `bt709`,
Main/4.0. The HTML players are the belt-and-braces answer, with a Save button
that writes the .mp4 back out for VLC.

If it still fails, the useful detail is **where** — inline in the Claude app
versus a downloaded file in a player — plus any error text. Next moves after
that: WebM, a GIF of the highlights, or baseline-profile 480p.

---

## If you pick this up again

- Rebuild the offline file after any edit: `python3 build-offline.py`
- Serve locally: `python3 -m http.server 8000` (or just open `index.html`)
- The repo is ~50 MB, mostly frame sequences and demo videos.
- Content accuracy: Sergio Lozano designed the Air Max 95 in 1995; it was the
  first Nike with a visible forefoot Air unit; the design drew on human anatomy
  and rain-eroded desert floor. The footer carries a not-affiliated-with-Nike
  disclaimer, which should stay.
