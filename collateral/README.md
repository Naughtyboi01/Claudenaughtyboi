# Collateral

Sales material in the Naught to Ten house style. **This folder is deliberately
outside `naught-to-ten/`**, which is the Netlify publish root — nothing here is
served on the website, so prices can change without a deploy.

## Pricing sheet

| File | Use it for |
|---|---|
| `out/naught-to-ten-pricing-slide.png` | 3840×2160, dark. Screen share, a meeting, a slide deck. |
| `out/naught-to-ten-pricing-a4.png` | A4 portrait, light. Dropping into a message or a doc. |
| `out/naught-to-ten-pricing.pdf` | A4 portrait, one page, real text. Email attachment, printing. |

The two plates carry the same offer. The A4 has one thing the slide does not —
a **How it runs** strip — because a sheet someone reads alone has to answer
"what happens next" without you in the room.

## Changing a price

Everything lives in `src/pricing.html`. The numbers appear **twice**, once per
plate, so change both. Then:

```bash
python3 build.py          # inline the fonts, render all three files
python3 build.py --html   # rebuild out/pricing.html only, no rendering
```

The renderer prints `fits` or `overflows by Npx` for each plate. **Do not ship
an overflowing plate** — it does not crop, it silently drops whatever fell off
the bottom, and the first thing to go is the small print.

Two traps worth knowing, both already hit once:

- The A4 is a light plate reusing dark-plate rules. Any new element needs its
  own `.board--a4` colour override, or it renders white-on-white and vanishes.
- The tiers are three columns on the slide and three stacked rows on the A4.
  They are not the same layout, and a change to one does not carry to the other.

## What is assumed rather than decided

These are on the sheet as commitments. Confirm them before sending it to anyone:

- **An hour a month** of small content edits included
- **Twelve-month minimum** on the monthly fee
- **Two working days** to reply
- No VAT line, on the basis of being under the €42,500 services threshold.
  Once registered, every figure on the sheet needs revisiting.
