/* ═══════════════════════════════════════════════════════════════════════════
   The Galway Roast — one page, one rAF loop.

   The hero is a scroll-scrubbed frame sequence painted to a <canvas>. The clip
   was decoded ahead of time into stills rather than scrubbed as a <video>,
   because seeking a video by currentTime snaps to keyframes on mobile Safari.
   Stills are frame-exact everywhere; the cost is an upfront download, hence the
   preloader and the two frame sets.

   Scroll itself is never hijacked — sticky positioning, the scrollbar, the
   keyboard and the trackpad all keep working. Smoothing is applied to the
   animated *values* instead, so a fast flick reads as motion rather than a cut.
   ═══════════════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const FRAME_COUNT = 121;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const clamp  = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const lerp   = (a, b, t) => a + (b - a) * t;
  /* 0 before `a`, 1 after `b`, smooth in between */
  const range  = (v, a, b) => clamp((v - a) / (b - a || 1e-6));
  const smooth = (v, a, b) => { const t = range(v, a, b); return t * t * (3 - 2 * t); };

  /* ─── frame set: bigger art only where it will actually be seen ─────────── */

  const conn = navigator.connection || {};
  const slow = conn.saveData === true || /2g/.test(conn.effectiveType || '');
  const dense = Math.min(window.devicePixelRatio || 1, 2);
  const useLarge = !slow && (window.innerWidth * dense >= 900);
  const SET = useLarge ? 'lg' : 'sm';

  const framePath = i => `assets/frames/${SET}/f${String(i + 1).padStart(3, '0')}.webp`;

  /* ─── DOM ───────────────────────────────────────────────────────────────── */

  const body        = document.body;
  const loader      = $('#loader');
  const loaderFill  = $('#loaderFill');
  const loaderPct   = $('#loaderPct');
  const canvas      = $('#frames');
  const ctx         = canvas.getContext('2d', { alpha: false });
  const canvasWrap  = $('#canvasWrap');
  const heroTrack   = $('#heroTrack');
  const heroWash    = $('#heroWash');
  const nav         = $('#nav');
  const navProgress = $('#navProgress');
  const hudFill     = $('#hudFill');
  const hudFrame    = $('#hudFrame');
  const hudTotal    = $('#hudTotal');
  const rail        = $('#rail');
  const railBox     = $('.rail');
  const beats       = $$('.beat');
  const blendTrack  = $('#blendTrack');
  const blendPanels = $$('.panel');
  const blendTicks  = $$('#blendTicks li');
  const blendArt    = $('.blend__art img');
  const marquee     = $('#marquee');
  const parallaxEls = $$('[data-parallax]');

  hudTotal.textContent = String(FRAME_COUNT).padStart(3, '0');
  body.classList.add('is-loading');

  /* ─── preload ───────────────────────────────────────────────────────────── */

  const images = new Array(FRAME_COUNT);
  let loaded = 0;
  let started = false;

  function bumpProgress() {
    const pct = Math.round((loaded / FRAME_COUNT) * 100);
    loaderFill.style.width = pct + '%';
    loaderPct.textContent = pct;
  }

  function preload() {
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = img.onerror = () => {
        loaded++;
        bumpProgress();
        if (loaded >= FRAME_COUNT) start();
      };
      img.src = framePath(i);
      images[i] = img;
    }
    /* Never hold the page hostage to a slow connection. */
    setTimeout(start, 12000);
  }

  function start() {
    if (started) return;
    started = true;
    loaderFill.style.width = '100%';
    loaderPct.textContent = '100';
    requestAnimationFrame(() => {
      loader.classList.add('is-done');
      body.classList.remove('is-loading');
      resize();
      tick();
    });
  }

  /* ─── canvas ────────────────────────────────────────────────────────────── */

  let cw = 0, ch = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = canvas.clientWidth;
    ch = canvas.clientHeight;
    canvas.width  = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* Nearest frame that has actually decoded — keeps the scrub smooth while the
     tail of the sequence is still arriving. */
  function usable(i) {
    for (let d = 0; d < FRAME_COUNT; d++) {
      const a = images[i - d], b = images[i + d];
      if (a && a.complete && a.naturalWidth) return a;
      if (b && b.complete && b.naturalWidth) return b;
    }
    return null;
  }

  const EDGE = '#140203';   /* sampled from the film's own frame edges */

  function paint(index, fit, zoom, shiftX, shiftY) {
    const img = usable(index);
    if (!img) return;

    ctx.fillStyle = EDGE;
    ctx.fillRect(0, 0, cw, ch);

    const iw = img.naturalWidth, ih = img.naturalHeight;
    const cover   = Math.max(cw / iw, ch / ih);
    const contain = Math.min(cw / iw, ch / ih);
    /* Early frames are pure texture, so filling the viewport is free drama.
       By the end the whole pouch has to be inside the frame — hence the drift
       from cover to contain as the pull-back completes. */
    const scale = lerp(cover, contain * 1.04, fit) * zoom;

    const w = iw * scale, h = ih * scale;
    const x = (cw - w) / 2 + shiftX;
    const y = (ch - h) / 2 + shiftY;
    ctx.drawImage(img, x, y, w, h);

    /* Feather the frame's own edges into the page rather than the canvas
       edges — once the image is letterboxed or pushed aside, the boundary that
       needs hiding is the picture's, not the viewport's. The clip's borders are
       near-black burgundy, so the seam disappears completely. */
    const fx = Math.min(w, cw) * 0.14;
    const fy = Math.min(h, ch) * 0.12;
    const band = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, EDGE);
      g.addColorStop(1, 'rgba(20,2,3,0)');
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    };
    band(x, 0, x + fx, 0, x, y, fx, h);                    /* left  */
    band(x + w, 0, x + w - fx, 0, x + w - fx, y, fx, h);   /* right */
    band(0, y, 0, y + fy, x, y, w, fy);                    /* top   */
    band(0, y + h, 0, y + h - fy, x, y + h - fy, w, fy);   /* bottom*/
  }

  /* ─── scroll-driven state ───────────────────────────────────────────────── */

  const state = {
    frame: 0,        /* smoothed frame index */
    frameTarget: 0,
    scroll: 0,
    scrollLast: 0,
    marquee: 0
  };

  /* Beat choreography over hero progress p (0 → 1 across the sticky track).
     `r` is [fade-in start, fade-in end, fade-out start, fade-out end]; `enterY`
     is where the beat comes from, `exitY` where it drifts to as it leaves. */
  const BEATS = [
    { el: beats[0], r: [-0.08, -0.03, 0.085, 0.15 ], enterY:  0, exitY: -90, enterS: 1,    exitS: -0.08 },
    { el: beats[1], r: [ 0.17, 0.235, 0.315, 0.375], enterY: 56, exitY: -70, enterS: 1,    exitS: -0.03 },
    { el: beats[2], r: [ 0.42, 0.475, 0.565, 0.625], enterY: 48, exitY: -58, enterS: 0.97, exitS: -0.02 },
    { el: beats[3], r: [ 0.72, 0.805, 2,    2.1   ], enterY: 52, exitY:   0, enterS: 1,    exitS:  0    }
  ];

  function heroProgress() {
    const rect = heroTrack.getBoundingClientRect();
    const total = heroTrack.offsetHeight - window.innerHeight;
    return clamp(-rect.top / (total || 1));
  }

  /* Scroll distance is spent unevenly across the clip on purpose: linger on the
     opening macro, hurry through the flat white middle, and slow right down for
     the pull-back that reveals the pouch. [hero progress, frame] */
  const PACING = [
    [0.015,   0], [0.13,  12], [0.26,  32],
    [0.38,   54], [0.55,  74], [0.72,  98], [0.90, 120]
  ];

  function frameAt(p) {
    if (p <= PACING[0][0]) return 0;
    for (let i = 1; i < PACING.length; i++) {
      const [pa, fa] = PACING[i - 1], [pb, fb] = PACING[i];
      if (p <= pb) return lerp(fa, fb, range(p, pa, pb));
    }
    return FRAME_COUNT - 1;
  }

  function drawHero(p) {
    state.frameTarget = frameAt(p);
    state.frame = REDUCED
      ? state.frameTarget
      : lerp(state.frame, state.frameTarget, 0.18);

    const idx = clamp(Math.round(state.frame), 0, FRAME_COUNT - 1);
    const fit = smooth(p, 0.5, 0.94);
    const zoom = lerp(1.14, 1.0, smooth(p, 0, 0.42)) * lerp(1, 0.965, smooth(p, 0.9, 1));

    /* The closing composition: on a landscape screen the pouch slides left and
       the copy takes the right half, campaign-poster style. On a portrait one
       it lifts instead, leaving the copy underneath. */
    const finale = smooth(p, 0.6, 0.92);
    const wide = cw >= 1024 && cw >= ch;
    const shiftX = wide ? -cw * 0.17 * finale : 0;
    const shiftY = wide ? -ch * 0.02 * fit : -ch * (0.03 * fit + 0.19 * finale);

    paint(idx, fit, zoom, shiftX, shiftY);

    canvasWrap.style.opacity = String(lerp(1, 0.92, smooth(p, 0.92, 1)));
    heroWash.style.opacity = String(0.18 + 0.82 * smooth(p, 0.55, 0.82));

    hudFill.style.width = (p * 100).toFixed(1) + '%';
    hudFrame.textContent = String(idx + 1).padStart(3, '0');

    for (const b of BEATS) {
      const inn = smooth(p, b.r[0], b.r[1]);
      const out = smooth(p, b.r[2], b.r[3]);
      const o  = inn * (1 - out);
      const ty = lerp(b.enterY, 0, inn) + b.exitY * out;
      const sc = lerp(b.enterS, 1, inn) + b.exitS * out;
      b.el.style.opacity = o.toFixed(3);
      b.el.style.transform = `translate3d(0, ${ty.toFixed(1)}px, 0) scale(${sc.toFixed(3)})`;
      b.el.style.visibility = o < 0.004 ? 'hidden' : 'visible';
      /* inner staggers fire once the beat is properly on screen */
      b.el.classList.toggle('is-live', o > 0.45);
    }
  }

  /* ─── the blend panels ──────────────────────────────────────────────────── */

  let blendIndex = -1;

  function drawBlend() {
    if (!blendTrack) return;
    const rect = blendTrack.getBoundingClientRect();
    const total = blendTrack.offsetHeight - window.innerHeight;
    const q = clamp(-rect.top / (total || 1));
    if (rect.top > window.innerHeight || rect.bottom < 0) return;

    /* Three equal thirds, nudged so each panel settles before the next arrives */
    const i = q < 0.34 ? 0 : q < 0.67 ? 1 : 2;
    if (i !== blendIndex) {
      blendIndex = i;
      blendPanels.forEach((el, n) => el.classList.toggle('is-on', n === i));
      blendTicks.forEach((el, n) => el.classList.toggle('is-on', n <= i));
    }
    if (blendArt) {
      blendArt.style.transform = `scale(${(1.06 + q * 0.1).toFixed(3)}) rotate(${(q * 14 - 7).toFixed(2)}deg)`;
    }
  }

  /* ─── parallax + marquee ────────────────────────────────────────────────── */

  function drawParallax() {
    const vh = window.innerHeight;
    for (const el of parallaxEls) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const centre = (r.top + r.height / 2 - vh / 2) / vh;
      const f = parseFloat(el.dataset.parallax) || 0;
      el.style.transform = `translate3d(0, ${(centre * f * vh).toFixed(1)}px, 0)`;
    }
  }

  function drawMarquee(dv) {
    if (!marquee) return;
    state.marquee -= 0.45 + Math.min(Math.abs(dv) * 0.06, 6);
    const half = marquee.scrollWidth / 2 || 1;
    if (state.marquee <= -half) state.marquee += half;
    marquee.style.transform = `translate3d(${state.marquee.toFixed(1)}px, 0, 0)`;
  }

  /* ─── the loop ──────────────────────────────────────────────────────────── */

  function tick() {
    const y = window.pageYOffset || document.documentElement.scrollTop;
    const dv = y - state.scrollLast;
    state.scrollLast = y;

    const doc = document.documentElement.scrollHeight - window.innerHeight;
    navProgress.style.width = clamp(y / (doc || 1)) * 100 + '%';
    nav.classList.toggle('is-stuck', y > window.innerHeight * 0.6);

    const hp = heroProgress();
    drawHero(hp);
    /* the rail would collide with the hero's closing copy, so it waits */
    railBox.classList.toggle('is-on', hp > 0.97);
    drawBlend();
    drawParallax();
    drawMarquee(dv);

    requestAnimationFrame(tick);
  }

  /* ─── reveals ───────────────────────────────────────────────────────────── */

  function setupReveals() {
    $$('.split').forEach(el => {
      $$('.l', el).forEach((l, i) => l.style.setProperty('--ln', i));
    });
    $$('.reveal').forEach(el => {
      if (el.dataset.delay) el.style.setProperty('--d', el.dataset.delay);
    });

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    $$('.reveal, .split').forEach(el => io.observe(el));

    /* strength meter fills once it is on screen */
    const meter = $('.meter');
    if (meter) {
      const n = parseInt(meter.dataset.fill, 10) || 0;
      $$('i', meter).forEach((bar, i) => { if (i < n) bar.classList.add('on'); });
      new IntersectionObserver((es, ob) => {
        for (const e of es) if (e.isIntersecting) { e.target.classList.add('is-on'); ob.disconnect(); }
      }, { threshold: 0.5 }).observe(meter);
    }
  }

  /* ─── section rail ──────────────────────────────────────────────────────── */

  function setupRail() {
    if (!rail) return;
    const items = $$('li', rail);
    const targets = items
      .map(li => ({ li, el: document.getElementById(li.dataset.target) }))
      .filter(t => t.el);

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const hit = targets.find(t => t.el === e.target);
        if (!hit) continue;
        items.forEach(li => li.classList.toggle('is-on', li === hit.li));
      }
    }, { rootMargin: '-45% 0px -45% 0px' });

    targets.forEach(t => io.observe(t.el));
    items.forEach(li => li.addEventListener('click', () => {
      const el = document.getElementById(li.dataset.target);
      if (el) el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    }));
  }

  /* ─── cursor + magnetics ────────────────────────────────────────────────── */

  function setupCursor() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const cur = $('.cursor');
    const dot = $('.cursor__dot');
    const ring = $('.cursor__ring');
    let x = 0, y = 0, rx = 0, ry = 0;

    window.addEventListener('mousemove', (e) => {
      x = e.clientX; y = e.clientY;
      body.classList.add('cursor-on');
      dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }, { passive: true });

    (function follow() {
      rx = lerp(rx, x, 0.16);
      ry = lerp(ry, y, 0.16);
      ring.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px) translate(-50%, -50%)`;
      requestAnimationFrame(follow);
    })();

    $$('a, button, .magnetic, .picker__opts button').forEach(el => {
      el.addEventListener('mouseenter', () => body.classList.add('cursor-hot'));
      el.addEventListener('mouseleave', () => body.classList.remove('cursor-hot'));
    });

    if (!REDUCED) {
      $$('.magnetic').forEach(el => {
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          const mx = e.clientX - r.left - r.width / 2;
          const my = e.clientY - r.top - r.height / 2;
          el.style.transform = `translate(${mx * 0.22}px, ${my * 0.3}px)`;
        });
        el.addEventListener('mouseleave', () => { el.style.transform = ''; });
      });
    }
    cur.style.opacity = '';
  }

  /* ─── shop, film, footer bits ───────────────────────────────────────────── */

  function setupShop() {
    const picker = $('#sizePicker');
    if (!picker) return;
    const val = $('#priceVal'), unit = $('#priceUnit'), add = $('#addToBag');

    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      $$('button', picker).forEach(b => {
        const on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', String(on));
      });
      val.textContent = btn.dataset.price;
      unit.textContent = `/ ${btn.dataset.size} pouch`;
    });

    if (add) {
      add.addEventListener('click', () => {
        const label = add.querySelector('span');
        const size = $('button.is-on', picker);
        label.textContent = `Added — ${size ? size.dataset.size : ''}`;
        add.disabled = true;
        setTimeout(() => { label.textContent = 'Add to bag'; add.disabled = false; }, 2200);
      });
    }
  }

  function setupFilm() {
    const wrap = $('.film__frame');
    const video = $('#filmVideo');
    const toggle = $('#filmToggle');
    if (!wrap || !video || !toggle) return;

    const sync = () => {
      const playing = !video.paused && !video.ended;
      wrap.classList.toggle('is-playing', playing);
      toggle.setAttribute('aria-pressed', String(playing));
      $('.film__toggleLabel', toggle).textContent = playing ? 'Pause' : 'Play';
      $('.film__icon', toggle).style.borderLeftColor = playing ? 'transparent' : '';
    };

    toggle.addEventListener('click', () => {
      if (video.paused) { const p = video.play(); if (p) p.catch(() => {}); }
      else video.pause();
      sync();
    });
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);

    /* Autoplay muted when it comes into view; pause when it leaves. */
    if (!REDUCED) {
      new IntersectionObserver((es) => {
        for (const e of es) {
          if (e.isIntersecting) { const p = video.play(); if (p) p.catch(() => {}); }
          else video.pause();
        }
      }, { threshold: 0.45 }).observe(video);
    }
  }

  function setupFooter() {
    const year = $('#year');
    if (year) year.textContent = new Date().getFullYear();

    const form = $('#signup');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#email', form);
      const msg = $('#signupMsg');
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
      msg.textContent = ok
        ? 'Thank you — roast notes are on their way.'
        : 'That email address does not look right.';
      if (ok) input.value = '';
    });
  }

  /* ─── go ────────────────────────────────────────────────────────────────── */

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
    resize();
  }, { passive: true });

  setupReveals();
  setupRail();
  setupCursor();
  setupShop();
  setupFilm();
  setupFooter();
  resize();
  preload();
})();
