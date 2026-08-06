/* ═══════════════════════════════════════════════════════════════
   AIR MAX 95 — scroll engine
   Hand-written. One rAF loop, no dependencies.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /* ── config ─────────────────────────────────────────────── */
  const FRAME_COUNT = 96;
  const FRAME_PAD   = 4;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE  = matchMedia('(hover: none), (pointer: coarse)').matches;

  /* ── helpers ────────────────────────────────────────────── */
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp  = (a, b, t) => a + (b - a) * t;
  /** normalised 0→1 position of v inside [a,b] */
  const norm  = (v, a, b) => clamp((v - a) / (b - a || 1));
  const smooth = t => t * t * (3 - 2 * t);
  const pad = (n, w) => String(n).padStart(w, '0');

  const state = {
    y: window.scrollY,
    vh: window.innerHeight,
    vw: window.innerWidth,
    vel: 0,
    t: performance.now()
  };

  /* ═══════════════════════════════════════════════════════════
     TEXT SPLITTING
     ═══════════════════════════════════════════════════════════ */
  function splitChars(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const text = el.textContent;
    el.textContent = '';
    const inner = document.createElement('span');
    inner.style.display = 'inline-block';
    [...text].forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.style.setProperty('--i', i);
      s.textContent = c === ' ' ? ' ' : c;
      inner.appendChild(s);
    });
    el.appendChild(inner);
  }

  /** wraps each <br>-separated line so it can mask-reveal */
  function splitLines(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const parts = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = parts
      .map((p, i) => `<span class="ln"><span style="--i:${i}">${p}</span></span>`)
      .join('');
  }

  function splitWords(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(tok => {
            if (!tok.trim()) return frag.appendChild(document.createTextNode(tok));
            const s = document.createElement('span');
            s.className = 'w';
            s.textContent = tok;
            frag.appendChild(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) {
          walk(n);
        }
      });
    };
    walk(el);
  }

  $$('[data-split]').forEach(splitChars);
  $$('[data-split-lines]').forEach(splitLines);
  $$('[data-words]').forEach(splitWords);

  /* ═══════════════════════════════════════════════════════════
     HERO — FRAME SEQUENCE SCRUBBER
     ═══════════════════════════════════════════════════════════ */
  const canvas = $('#heroCanvas');
  const ctx    = canvas.getContext('2d', { alpha: false });
  const heroTrack = $('#heroTrack');

  // Lighter frame set for small screens / data-saver connections.
  const conn = navigator.connection || {};
  const useSmall = state.vw < 900 || conn.saveData === true ||
                   /2g/.test(conn.effectiveType || '');
  const SET = useSmall ? 'sm' : 'lg';
  const src = i => `assets/frames/${SET}/${pad(i + 1, FRAME_PAD)}.jpg`;

  const frames  = new Array(FRAME_COUNT);
  const ready   = new Array(FRAME_COUNT).fill(false);
  let   loaded  = 0;
  let   lastDrawn = -1;

  /** nearest already-decoded frame, so scrubbing never blanks out */
  function nearestReady(i) {
    if (ready[i]) return i;
    for (let d = 1; d < FRAME_COUNT; d++) {
      if (ready[i - d]) return i - d;
      if (ready[i + d]) return i + d;
    }
    return -1;
  }

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width  = Math.round(r.width  * dpr);
    canvas.height = Math.round(r.height * dpr);
    lastDrawn = -1;
  }

  function drawFrame(i) {
    const idx = nearestReady(clamp(Math.round(i), 0, FRAME_COUNT - 1) | 0);
    if (idx < 0 || idx === lastDrawn) return;
    const img = frames[idx];
    const cw = canvas.width, ch = canvas.height;
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = cw / ch;
    // cover-fit, biased slightly upward so the shoe sits above centre
    let w, h, x, y;
    if (cr > ir) { w = cw; h = cw / ir; }
    else         { h = ch; w = ch * ir; }
    // portrait viewports get a gentle punch-in so the shoe still reads
    const punch = cr < 1 ? 1.22 : 1;
    w *= punch; h *= punch;
    x = (cw - w) / 2;
    y = (ch - h) / 2 - h * 0.02;
    ctx.fillStyle = '#e6e3dd';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, x, y, w, h);
    lastDrawn = idx;
  }

  /* ── preload with bounded concurrency ─────────────────────── */
  const loaderEl   = $('#loader');
  const loaderBar  = $('#loaderBar');
  const loaderNum  = $('#loaderCount');
  let   started    = false;

  function bumpProgress() {
    const p = Math.round((loaded / FRAME_COUNT) * 100);
    loaderBar.style.width = p + '%';
    loaderNum.textContent = p;
  }

  function preload(done) {
    let next = 0, active = 0;
    const LIMIT = 8;
    const pump = () => {
      while (active < LIMIT && next < FRAME_COUNT) {
        const i = next++;
        active++;
        const img = new Image();
        img.decoding = 'async';
        img.onload = img.onerror = () => {
          ready[i] = img.naturalWidth > 0;
          frames[i] = img;
          loaded++; active--;
          bumpProgress();
          if (i === 0) drawFrame(0);
          if (loaded === FRAME_COUNT) done();
          else pump();
        };
        img.src = src(i);
      }
    };
    pump();
  }

  function start() {
    if (started) return;
    started = true;
    document.body.classList.remove('is-loading');
    loaderEl.classList.add('is-done');
    sizeCanvas();
    drawFrame(0);
    // let the first beat play in
    requestAnimationFrame(() => heroBeats[0].el.classList.add('is-in'));
  }

  /* ── hero beat choreography ──────────────────────────────── */
  // [enter, full-in, hold-out, gone]
  const heroBeats = [
    // beat 1 opens fully in view — it is the page's first frame
    { el: $('.beat--1'), r: [-0.05, 0.000, 0.105, 0.170], shift: 70 },
    { el: $('.beat--2'), r: [0.225, 0.300, 0.405, 0.470], shift: 60 },
    { el: $('.beat--3'), r: [0.510, 0.575, 0.680, 0.740], shift: 50 },
    { el: $('.beat--4'), r: [0.815, 0.885, 1.100, 1.200], shift: 60 }
  ];

  const PHASES = [
    [0.00, 'PROFILE'], [0.24, 'LACING'], [0.44, 'AIR UNIT'],
    [0.66, 'THE PAIR'], [0.84, 'BADGE']
  ];

  const hudFrame = $('#hudFrame');
  const hudTotal = $('#hudTotal');
  const hudRail  = $('#hudRail');
  const hudPhase = $('#hudPhase');
  const scrollCue = $('#scrollCue');
  hudTotal.textContent = pad(FRAME_COUNT, 3);

  let heroP = 0, heroPEased = 0, lastPhase = '';

  function heroUpdate() {
    const rect = heroTrack.getBoundingClientRect();
    const total = rect.height - state.vh;
    heroP = clamp(-rect.top / (total || 1));

    // ease the frame index so fast flicks still look filmic
    heroPEased = lerp(heroPEased, heroP, REDUCED ? 1 : 0.18);
    drawFrame(heroPEased * (FRAME_COUNT - 1));

    // HUD
    const fi = Math.round(heroPEased * (FRAME_COUNT - 1)) + 1;
    hudFrame.textContent = pad(fi, 3);
    hudRail.style.width = (heroPEased * 100).toFixed(2) + '%';
    let ph = PHASES[0][1];
    for (const [at, name] of PHASES) if (heroP >= at) ph = name;
    if (ph !== lastPhase) { hudPhase.textContent = ph; lastPhase = ph; }

    scrollCue.classList.toggle('is-out', heroP > 0.025);

    // beats
    for (const b of heroBeats) {
      const [a, f, o, g] = b.r;
      const inP  = smooth(norm(heroP, a, f));
      const outP = smooth(norm(heroP, o, g));
      const op = inP * (1 - outP);
      const ty = (1 - inP) * b.shift - outP * b.shift;
      const sc = 1 + outP * 0.04;
      b.el.style.opacity = op.toFixed(3);
      b.el.style.transform = `translate3d(0, ${ty.toFixed(1)}px, 0) scale(${sc.toFixed(3)})`;
      b.el.style.filter = outP > 0 ? `blur(${(outP * 6).toFixed(1)}px)` : '';
      b.el.classList.toggle('is-in', op > 0.03);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ANATOMY — pinned hotspots
     ═══════════════════════════════════════════════════════════ */
  const anatomy   = $('#anatomy');
  const anaItems  = $$('.ana');
  const anaSpots  = $$('.spot');
  const anaImg    = $('#anatomyImg');
  const anaCap    = $('#anaCap');
  let   anaActive = -1;

  function anatomyUpdate() {
    if (!anatomy) return;
    const rect = anatomy.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > state.vh) return;
    const total = rect.height - state.vh;
    const p = clamp(-rect.top / (total || 1));
    const i = Math.min(anaItems.length - 1, Math.floor(p * anaItems.length * 0.999));
    if (i !== anaActive) {
      anaActive = i;
      anaItems.forEach((el, k) => el.classList.toggle('is-active', k === i));
      anaSpots.forEach((el, k) => el.classList.toggle('is-on', k === i));
      const row = anaItems[i];
      anaCap.textContent =
        `${$('.ana__idx', row).textContent} · ${$('.ana__title', row).textContent.toUpperCase()}`;
    }
    // slow push-in across the whole pin
    anaImg.style.transform = `scale(${(1.02 + p * 0.07).toFixed(4)})`;
  }

  // clicking a hotspot or a list row scrolls to that chapter
  const gotoChapter = i => {
    const top = anatomy.offsetTop;
    const total = anatomy.offsetHeight - state.vh;
    window.scrollTo({
      top: top + total * ((i + 0.45) / anaItems.length),
      behavior: REDUCED ? 'auto' : 'smooth'
    });
  };
  anaSpots.forEach((el, i) => el.addEventListener('click', () => gotoChapter(i)));
  anaItems.forEach((el, i) => el.addEventListener('click', () => gotoChapter(i)));

  /* ═══════════════════════════════════════════════════════════
     ARCHIVE — horizontal rail
     ═══════════════════════════════════════════════════════════ */
  const archive = $('#archive');
  const rail    = $('#archiveRail');
  const archProg = $('#archiveProg');
  let railX = 0, railTarget = 0;

  function archiveUpdate() {
    if (!archive) return;
    const rect = archive.getBoundingClientRect();
    if (rect.bottom < -200 || rect.top > state.vh + 200) return;
    const total = rect.height - state.vh;
    const p = clamp(-rect.top / (total || 1));
    const dist = Math.max(0, rail.scrollWidth - state.vw);
    railTarget = -p * dist;
    railX = REDUCED ? railTarget : lerp(railX, railTarget, 0.12);
    rail.style.transform = `translate3d(${railX.toFixed(2)}px,0,0)`;
    archProg.style.width = (p * 100).toFixed(2) + '%';
  }

  /* ═══════════════════════════════════════════════════════════
     MANIFESTO — word-by-word ignition
     ═══════════════════════════════════════════════════════════ */
  const wordBlocks = $$('[data-words]').map(el => ({ el, words: $$('.w', el) }));

  function wordsUpdate() {
    for (const b of wordBlocks) {
      const r = b.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > state.vh) continue;
      const p = norm(r.top, state.vh * 0.78, state.vh * 0.22);
      const lit = Math.round(p * b.words.length);
      b.words.forEach((w, i) => w.classList.toggle('is-lit', i < lit));
    }
  }

  /* ═══════════════════════════════════════════════════════════
     PARALLAX
     ═══════════════════════════════════════════════════════════ */
  const paras = $$('[data-parallax]');
  function parallaxUpdate() {
    if (REDUCED) return;
    for (const el of paras) {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < -100 || r.top > state.vh + 100) continue;
      const p = norm(r.top + r.height / 2, state.vh, -r.height) - 0.5;
      el.style.transform = `translate3d(0, ${(p * 9).toFixed(2)}%, 0)`;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     MARQUEES
     ═══════════════════════════════════════════════════════════ */
  const marquees = $$('[data-marquee]').map(el => {
    const gap = parseFloat(getComputedStyle(el).gap) || 0;
    el.style.gap = '0px';
    const a = document.createElement('span');
    a.style.cssText =
      `display:inline-flex;align-items:center;white-space:nowrap;gap:${gap}px;padding-right:${gap}px;`;
    while (el.firstChild) a.appendChild(el.firstChild);
    el.append(a, a.cloneNode(true));
    return { el, half: () => a.offsetWidth, x: 0, speed: parseFloat(el.dataset.speed) || 0.5 };
  });

  function marqueeUpdate(dt) {
    for (const m of marquees) {
      const half = m.half();
      if (!half) continue;
      // base drift + a nudge from scroll velocity
      m.x -= (m.speed * dt * 0.06) + state.vel * 0.05 * m.speed;
      if (m.x <= -half) m.x += half;
      if (m.x > 0) m.x -= half;
      m.el.style.transform = `translate3d(${m.x.toFixed(2)}px,0,0)`;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     REVEALS + COUNTERS
     ═══════════════════════════════════════════════════════════ */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      if (e.target.dataset.count) countUp(e.target);
      io.unobserve(e.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });

  $$('[data-reveal], [data-split-lines], [data-count]').forEach(el => io.observe(el));

  // hero-independent split-char blocks (e.g. the reserve headline)
  const charIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      charIO.unobserve(e.target);
    });
  }, { threshold: 0.3 });
  $$('.reserve__title').forEach(el => {
    el.classList.add('beat');           // reuse the .beat.is-in char rule
    el.style.cssText = 'position:static;display:grid;padding:0;opacity:1;pointer-events:auto;';
    charIO.observe(el);
  });

  function countUp(el) {
    if (REDUCED) return;
    const target = parseInt(el.dataset.count, 10);
    const from = target - 40;
    const dur = 1400;
    const t0 = performance.now();
    const tick = now => {
      const p = clamp((now - t0) / dur);
      el.textContent = Math.round(lerp(from, target, smooth(p)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ═══════════════════════════════════════════════════════════
     NAV — auto-hide + light/dark inversion
     ═══════════════════════════════════════════════════════════ */
  const nav = $('#nav');
  const darkSections = $$('.air, .archive, .reserve, .foot, .marquee');
  let lastY = state.y;

  function navUpdate() {
    const y = state.y;
    nav.classList.toggle('is-stuck', y > 40);
    nav.classList.toggle('is-hidden', y > 400 && y > lastY + 4);
    lastY = y;

    const probe = 38; // measure at the nav's optical centre
    let dark = false;
    for (const s of darkSections) {
      const r = s.getBoundingClientRect();
      if (r.top <= probe && r.bottom >= probe) { dark = true; break; }
    }
    nav.dataset.theme = dark ? 'dark' : 'light';
  }

  /* ═══════════════════════════════════════════════════════════
     AIR VIDEO — play only while on screen
     ═══════════════════════════════════════════════════════════ */
  const airVideo = $('#airVideo');
  if (airVideo) {
    new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          if (airVideo.preload === 'none') airVideo.preload = 'auto';
          airVideo.play().catch(() => {});
        } else {
          airVideo.pause();
        }
      });
    }, { threshold: 0.15 }).observe(airVideo);
  }

  /* ═══════════════════════════════════════════════════════════
     CURSOR + MAGNETICS
     ═══════════════════════════════════════════════════════════ */
  let cursorTick = null;
  if (!COARSE) {
    const cur = $('#cursor');
    const dot = $('.cursor__dot', cur);
    const ring = $('.cursor__ring', cur);
    let mx = state.vw / 2, my = state.vh / 2, rx = mx, ry = my;

    window.addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      cur.classList.add('is-on');
    }, { passive: true });

    const hoverables = 'a, button, .spot, .ana, input, select, .card';
    document.addEventListener('mouseover', e => {
      if (e.target.closest(hoverables)) cur.classList.add('is-hover');
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest(hoverables)) cur.classList.remove('is-hover');
    });

    cursorTick = () => {
      rx = lerp(rx, mx, 0.16);
      ry = lerp(ry, my, 0.16);
      dot.style.transform  = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
    };

    // magnetic buttons
    $$('[data-magnetic]').forEach(el => {
      const R = 70;
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.24}px, ${dy * 0.34}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transition = 'transform .6s cubic-bezier(.22,1,.36,1)';
        el.style.transform = '';
        setTimeout(() => (el.style.transition = ''), 620);
      });
      el.addEventListener('mouseenter', () => (el.style.transition = ''));
      void R;
    });
  }

  /* ═══════════════════════════════════════════════════════════
     RESERVE FORM
     ═══════════════════════════════════════════════════════════ */
  const form = $('#rform');
  if (form) {
    const note = $('#rformNote');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const email = $('#email').value.trim();
      const size = $('#size').value;
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
      note.textContent = ok
        ? `HELD — UK ${size} RESERVED FOR 48 HOURS · CONFIRMATION SENT TO ${email.toUpperCase()}`
        : 'ENTER A VALID EMAIL ADDRESS TO CONTINUE';
      note.style.color = ok ? 'var(--volt)' : '#ff6b57';
      note.classList.add('is-on');
      if (ok) form.reset();
    });
  }

  /* ═══════════════════════════════════════════════════════════
     MISC
     ═══════════════════════════════════════════════════════════ */
  $('#year').textContent = new Date().getFullYear();
  $$('[data-scroll-top]').forEach(b =>
    b.addEventListener('click', () =>
      window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' })));

  /* ═══════════════════════════════════════════════════════════
     MAIN LOOP
     ═══════════════════════════════════════════════════════════ */
  function frame(now) {
    const dt = Math.min(now - state.t, 64);
    state.t = now;
    const y = window.scrollY || window.pageYOffset;
    state.vel = lerp(state.vel, y - state.y, 0.35);
    state.y = y;

    heroUpdate();
    anatomyUpdate();
    archiveUpdate();
    wordsUpdate();
    parallaxUpdate();
    marqueeUpdate(dt);
    navUpdate();
    if (cursorTick) cursorTick();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── kick off the frame sequence ────────────────────────── */
  sizeCanvas();
  preload(start);
  setTimeout(start, 9000);   // never hold the page hostage to the network

  /* ── resize ─────────────────────────────────────────────── */
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      state.vh = window.innerHeight;
      state.vw = window.innerWidth;
      sizeCanvas();
      drawFrame(heroPEased * (FRAME_COUNT - 1));
    }, 140);
  }, { passive: true });

})();
