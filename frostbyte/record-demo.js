/**
 * Record a walkthrough of the FrostByte page.
 *
 *   node record-demo.js [file] [width] [height] [outdir]
 *
 * The scroll is an eased timeline whose stops are measured from the page's own
 * geometry rather than eyeballed fractions, so each one lands where it should.
 * It comes to a full stop everywhere product information appears — both hero
 * ring callouts, then each row of the collection grid — and holds long enough
 * to read the name and the price.
 *
 * Recorded off the offline build so what you see is the single file, not a
 * served copy. Note the hero film plays from the VP9 copy here: this Chromium
 * has no H.264 decoder, which is also why the mobile build cannot be recorded.
 */

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const FILE = path.resolve(process.argv[2] || path.join(__dirname, 'frostbyte-offline.html'));
const W = parseInt(process.argv[3] || '1440', 10);
const H = parseInt(process.argv[4] || '900', 10);
const OUT = process.argv[5] || path.join(__dirname, 'demo');
/* Pace multiplier. 2 halves every travel and hold, which is a true 2x cut at
   the full frame rate — speeding the finished file up with setpts would throw
   away every other frame and make the eased travel visibly choppy. */
const SPEED = parseFloat(process.argv[6] || '1');

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  const page = await ctx.newPage();
  /* Capture starts with the page, but the timeline cannot until the film has
     decoded — several seconds for a 4 MB Blob. Report that gap so the encode
     can trim it instead of opening on dead air. */
  const t0 = Date.now();

  await page.goto('file://' + FILE, { waitUntil: 'load' });
  // let the film decode and the fonts settle before anything moves
  await page.waitForFunction(() => {
    const v = document.getElementById('heroVideo');
    return document.fonts.status === 'loaded' &&
           (document.documentElement.classList.contains('static-hero') || v.readyState >= 3);
  }, null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  // ── stops, measured from the page ──────────────────────────────────────
  const stops = await page.evaluate((vh) => {
    document.documentElement.style.scrollBehavior = 'auto';

    const hero = document.getElementById('hero');
    const heroTravel = hero.getBoundingClientRect().height - vh;
    const docMax = document.documentElement.scrollHeight - vh;

    // scroll y that puts an element's centre in the middle of the viewport
    const centre = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return Math.min(docMax, Math.max(0, window.scrollY + r.top + r.height / 2 - vh / 2));
    };
    // scroll y that puts an element's top a little below the viewport top
    const below = (sel, gap) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return Math.min(docMax, Math.max(0, window.scrollY + r.top - (gap || 0.18) * vh));
    };

    const cards = [...document.querySelectorAll('.card')];

    return [
      // the hero holds at 40% and 70% — where the timeline resolves each callout
      { label: 'wordmark',        y: 0,                     travel: 0,    hold: 1900 },
      { label: 'onyx callout',    y: heroTravel * 0.40,     travel: 4200, hold: 3400 },
      { label: 'garnet callout',  y: heroTravel * 0.70,     travel: 3600, hold: 3400 },
      { label: 'hero release',    y: heroTravel,            travel: 3000, hold: 1200 },
      { label: 'statement',       y: centre('.statement'),  travel: 2600, hold: 2400 },
      { label: 'collection head', y: below('.collection .section-head', 0.30), travel: 2400, hold: 1400 },
      { label: 'grid row 1',      y: centre(`.card:nth-child(2)`), travel: 2200, hold: 3400 },
      { label: 'grid row 2',      y: centre(`.card:nth-child(5)`), travel: 2600, hold: 3400 },
      { label: 'atelier',         y: below('.craft .section-head', 0.30),      travel: 2600, hold: 2000 },
      { label: 'craft notes',     y: centre('.craft__notes'), travel: 2400, hold: 2600 },
      { label: 'footer',          y: docMax,                travel: 2600, hold: 2600 },
    ].map(s => ({ ...s, y: Math.round(s.y) }));
  }, H);

  for (const s of stops) {
    s.travel = Math.round(s.travel / SPEED);
    s.hold = Math.round(s.hold / SPEED);
  }
  console.log(`pace: ${SPEED}x  (holds ${Math.round(3400 / SPEED)}ms at each callout)`);

  // ── drive it ───────────────────────────────────────────────────────────
  const headMs = Date.now() - t0;
  console.log(`head (decode + settle): ${headMs} ms — trim this off the capture\n`);

  for (const stop of stops) {
    process.stdout.write(`  ${stop.label.padEnd(16)} y=${String(stop.y).padStart(5)}  `);
    if (stop.travel > 0) {
      await page.evaluate(({ to, ms }) => new Promise(resolve => {
        const from = window.scrollY;
        const t0 = performance.now();
        // easeInOutCubic — no abrupt starts, no overshoot
        const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        (function step(now) {
          const t = Math.min(1, (now - t0) / ms);
          window.scrollTo(0, from + (to - from) * ease(t));
          t < 1 ? requestAnimationFrame(step) : resolve();
        })(t0);
      }), { to: stop.y, ms: stop.travel });
    } else {
      await page.evaluate(y => window.scrollTo(0, y), stop.y);
    }
    await page.waitForTimeout(stop.hold);
    console.log('held ' + stop.hold + 'ms');
  }

  await page.waitForTimeout(400);
  const video = page.video();
  await ctx.close();
  await browser.close();
  console.log('\nraw capture: ' + (await video.path()));
  console.log('trim: ' + Math.max(0, (headMs - 1400) / 1000).toFixed(2) + 's  (keeps 1.4s of lead-in)');
})();
