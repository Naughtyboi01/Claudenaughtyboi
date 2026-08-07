/* 30-second runthrough recorder  ->  demo/eye-jacket-demo.mp4
 *
 *   npm i playwright && node record-demo.js
 *   (serve the site first: python3 -m http.server 8321 from the repo root)
 *
 * Writes seq/ as an exact 30fps frame sequence; encode with:
 *   ffmpeg -framerate 30 -i seq/%05d.jpg -f lavfi -i anullsrc=r=48000:cl=stereo \
 *     -shortest -c:v libx264 -profile:v main -level 4.0 -pix_fmt yuv420p -crf 20 \
 *     -preset slow -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
 *     -c:a aac -b:a 64k -movflags +faststart demo/eye-jacket-demo.mp4
 *
 * Virtual time is not usable here: it advances performance.now() and rAF but
 * NOT document.timeline, so every CSS transition on the page (reveals, hotspot
 * cards, mask reveals, the preloader dissolve) either snaps or freezes.
 *
 * So: record in real time, but in slow motion. CDP Animation.setPlaybackRate
 * slows the document's animation timeline, and the scroll timeline is slowed
 * by the same factor, so CSS and JS motion stay in sync with each other. The
 * renderer only has to deliver RATE x 30 wall-fps to yield a full 30 content-fps,
 * which is what makes this work on a software rasteriser that tops out ~13fps
 * at this size.
 *
 * Captured frames are then resampled against *content* time onto an exact
 * 1/30s grid, so the output is correctly paced no matter how unevenly the
 * screencast delivered.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const W = 1600, H = 900;
const FPS = 30;
const T_END = 30;          // seconds of finished video
const RATE = 0.3;          // content seconds per wall second
const RAW = 'raw';
const SEQ = 'seq';
const URL = 'http://localhost:8321/oakley/index.html';

const KEYS = [
  [0.0,     0], [2.2,     0],
  [4.0,  1462], [4.7,  1462],
  [6.3,  2714], [7.0,  2714],
  [8.6,  3915], [9.3,  3915],
  [10.9, 5063], [11.6, 5220], [12.3, 5220],
  // the manifesto lights word by word as it crosses the viewport, so it needs
  // a slow crawl and a beat to land rather than a fast transit
  [13.0, 5900], [14.3, 6220], [15.0, 6320],
  [15.9, 7299], [16.5, 7299],
  [17.4, 7832], [18.0, 7832],
  [18.9, 8365], [19.5, 8365],
  [20.4, 8898], [21.0, 8898],
  [21.9, 9776],
  [23.1, 10950], [23.9, 11400],
  [24.5, 11584], [26.5, 13744],
  [27.5, 15000],
  [28.7, 16076], [30.0, 16076],
];

(async () => {
  for (const d of [RAW, SEQ]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d); }

  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('is-lit'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: RATE });

  // rewind the intro so the preloader dissolve and the wordmark unfold are
  // part of the recording rather than something that happened during setup
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.id = '__rewind';
    s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
    document.head.appendChild(s);
    document.body.classList.remove('is-lit');
    document.getElementById('boot').classList.remove('is-done');
    window.scrollTo(0, 0);
    void document.body.offsetHeight;
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('__rewind').remove());
  await page.waitForTimeout(120);

  // Animation.setPlaybackRate slows the animation timeline but not media
  // elements — without this the loop would play at 1/RATE speed once the
  // capture is resampled back to real time.
  await page.evaluate((r) => {
    const v = document.getElementById('iridiumVideo');
    if (v) v.playbackRate = r;
  }, RATE);

  /* ── capture ─────────────────────────────────────────────────── */
  const frames = [];   // { t (content seconds), file }
  let saved = 0;
  cdp.on('Page.screencastFrame', async (e) => {
    const file = path.join(RAW, String(saved++).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(e.data, 'base64'));
    frames.push({ epoch: e.metadata.timestamp * 1000, file });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }); } catch (_) {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });

  const wallDuration = T_END / RATE;
  console.log(`recording ${T_END}s of content over ${wallDuration.toFixed(0)}s wall time (rate ${RATE})`);

  const startEpoch = await page.evaluate(({ keys, rate, tEnd }) => {
    /* monotone cubic Hermite (Fritsch–Carlson): C1-continuous so velocity never
       jerks at a keyframe, monotonicity-preserving so it can never overshoot
       into a backwards scroll, and naturally flat where y repeats (a hold). */
    const xs = keys.map(k => k[0]), ys = keys.map(k => k[1]), n = keys.length;
    const h = [], d = [];
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i+1]-xs[i]; d[i] = (ys[i+1]-ys[i])/h[i]; }
    const m = new Array(n); m[0] = d[0]; m[n-1] = d[n-2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i-1]*d[i] <= 0) m[i] = 0;
      else { const w1 = 2*h[i]+h[i-1], w2 = h[i]+2*h[i-1]; m[i] = (w1+w2)/(w1/d[i-1]+w2/d[i]); }
    }
    const at = x => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n-1]) return ys[n-1];
      let i = 0; while (i < n-2 && x > xs[i+1]) i++;
      const t = (x-xs[i])/h[i], t2 = t*t, t3 = t2*t;
      return (2*t3-3*t2+1)*ys[i] + (t3-2*t2+t)*h[i]*m[i]
           + (-2*t3+3*t2)*ys[i+1] + (t3-t2)*h[i]*m[i+1];
    };
    const t0 = performance.now();
    const origin = performance.timeOrigin + t0;
    document.body.classList.add('is-lit');
    document.getElementById('boot').classList.add('is-done');
    return new Promise(res => {
      (function tick() {
        const content = (performance.now() - t0) / 1000 * rate;
        window.scrollTo(0, Math.round(at(content)));
        if (content < tEnd) requestAnimationFrame(tick);
        else res(origin);
      })();
    });
  }, { keys: KEYS, rate: RATE, tEnd: T_END });

  await cdp.send('Page.stopScreencast');
  await new Promise(r => setTimeout(r, 400));

  /* ── resample onto an exact 1/30s content grid ────────────────── */
  for (const f of frames) f.t = (f.epoch - startEpoch) / 1000 * RATE;
  frames.sort((a, b) => a.t - b.t);

  const wanted = Math.round(T_END * FPS);
  let cursor = 0, dupes = 0;
  for (let n = 0; n < wanted; n++) {
    const t = n / FPS;
    while (cursor + 1 < frames.length && frames[cursor + 1].t <= t) cursor++;
    const src = frames[Math.max(0, cursor)].file;
    const dst = path.join(SEQ, String(n).padStart(5, '0') + '.jpg');
    fs.linkSync(src, dst);
    if (n > 0 && src === frames[Math.max(0, cursor)].file && cursor === (frames.length ? cursor : 0)) { /* noop */ }
  }
  // count how many output frames reused a previous capture
  {
    let prev = null; dupes = 0; let c = 0;
    for (let n = 0; n < wanted; n++) {
      const t = n / FPS;
      while (c + 1 < frames.length && frames[c + 1].t <= t) c++;
      if (prev === c) dupes++;
      prev = c;
    }
  }

  const span = frames.length ? (frames[frames.length - 1].t - frames[0].t) : 0;
  console.log(`captured ${frames.length} frames over ${span.toFixed(1)}s content ` +
              `(${(frames.length / Math.max(span, 0.001)).toFixed(1)} content-fps)`);
  console.log(`resampled to ${wanted} frames @ ${FPS}fps — ${dupes} repeated ` +
              `(${(dupes / wanted * 100).toFixed(1)}%)`);
  console.log(errs.length ? errs : 'recording clean');
  await browser.close();
})();
