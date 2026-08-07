/* ============================================================
   Eye Jacket — scroll engine
   ------------------------------------------------------------
   One rAF loop drives everything. Native scroll is never
   hijacked: sticky positioning does the pinning, and smoothing
   is applied to the *animated values* rather than to the
   scroll position itself. A fast flick therefore reads as
   motion blur instead of a jump cut, and the scrollbar,
   trackpad and keyboard keep behaving normally.
   ============================================================ */
(function () {
  'use strict';

  /* ── math ──────────────────────────────────────────────── */
  var clamp = function (v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return v < a ? a : v > b ? b : v; };
  var inv   = function (v, a, b) { return b === a ? 0 : clamp((v - a) / (b - a)); };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  var easeIO  = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  /* Piecewise keyframe track: stops are [progress, value] pairs. */
  function track(p, stops) {
    if (p <= stops[0][0]) return stops[0][1];
    for (var i = 1; i < stops.length; i++) {
      if (p <= stops[i][0]) {
        return lerp(stops[i - 1][1], stops[i][1], easeIO(inv(p, stops[i - 1][0], stops[i][0])));
      }
    }
    return stops[stops.length - 1][1];
  }

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── frame sequence config ─────────────────────────────────
     The offline bundle sets window.__FRAMES to an array of data:
     URIs before this file runs. That single hook is what lets the
     single-file build exist without a forked copy of the engine to
     keep in sync. */
  var EMBEDDED = (window.__FRAMES && window.__FRAMES.length) ? window.__FRAMES : null;
  var FRAMES = EMBEDDED ? EMBEDDED.length : 120;

  var conn = navigator.connection;
  var lowData = !!(conn && (conn.saveData || /(^|-)([23])g$/.test(conn.effectiveType || '')));
  var useSmall = lowData || window.innerWidth < 900 ||
                 (window.devicePixelRatio || 1) * window.innerWidth < 1100;
  var setDir = 'assets/frames/' + (useSmall ? 'sm' : 'lg') + '/';

  var images = new Array(FRAMES);
  var ready  = new Array(FRAMES);
  var loaded = 0;

  function frameSrc(i) {
    return EMBEDDED ? EMBEDDED[i] : setDir + pad(i + 1) + '.jpg';
  }

  var canvas   = $('#heroCanvas');
  var ctx      = canvas ? canvas.getContext('2d', { alpha: false }) : null;
  var heroFrame= $('#heroFrame');
  var heroTrack= $('#heroTrack');
  var boot     = $('#boot');
  var bootFill = $('#bootFill');
  var bootPct  = $('#bootPct');

  /* ── 1. wordmark: split into per-letter mask spans ─────── */
  (function buildWordmark() {
    var el = $('#wordmark');
    if (!el) return;
    // Words are wrapped in their own nowrap flex row, so a narrow
    // viewport breaks between EYE and JACKET and never mid-word.
    var words = ['EYE', 'JACKET'];
    var html = '', n = 0;
    for (var w = 0; w < words.length; w++) {
      html += '<span class="wm-word">';
      for (var i = 0; i < words[w].length; i++) {
        html += '<span class="ltr" style="--i:' + (n++) + '"><i>' + words[w].charAt(i) + '</i></span>';
      }
      html += '</span>';
      if (w < words.length - 1) html += '<span class="wm-gap" aria-hidden="true"></span>';
    }
    el.innerHTML = html;
  }());

  /* ── 2. split headings into per-word spans ───────────────
     Built with DOM calls rather than an innerHTML string. This reads
     text out of the document and puts it back, and concatenating that
     into markup is the exact shape of a DOM-XSS sink — it would also
     quietly mangle any heading containing & or <. textContent is never
     parsed as markup, so neither can happen. */
  $$('[data-words]').forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    el._words = words.map(function (w, i) {
      if (i) el.appendChild(document.createTextNode(' '));
      var span = document.createElement('span');
      span.className = 'wd';
      span.textContent = w;
      el.appendChild(span);
      return span;
    });
  });

  /* stagger delays for [data-reveal] */
  $$('[data-reveal]').forEach(function (el) {
    if (el.dataset.delay) el.style.setProperty('--d', el.dataset.delay);
  });

  /* ── 3. preload ────────────────────────────────────────── */
  function pad(n) { return ('0000' + n).slice(-4); }

  /* Frames are fetched in sequence order, eight at a time. Firing all
     120 at once leaves the progress bar pinned at zero until the whole
     set lands — and it fetches the tail of the film before the opening
     frames anyone actually sees first. */
  function preload(done) {
    if (!canvas) { done(); return; }

    var settled = false;
    var next = 0, inflight = 0;
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var finish = function () { if (!settled) { settled = true; done(); } };

    // never hold the page hostage to a slow connection
    var bail = setTimeout(finish, 9000);

    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    function bump() {
      var pct = Math.round(loaded / FRAMES * 100);
      if (bootFill) bootFill.style.width = pct + '%';
      if (bootPct) bootPct.textContent = pct + '%';
      if (loaded >= FRAMES) { clearTimeout(bail); finish(); }
      // Enough of the opening to start scrubbing. Because frames arrive
      // in order these are exactly the ones on screen first, and the
      // rest streams in behind us — draw() falls back to the nearest
      // decoded frame, so scrubbing ahead degrades to a coarser step
      // rather than a blank canvas.
      else if (loaded >= 8 && now() - t0 > 2000) finish();
    }

    function pump() {
      while (inflight < 8 && next < FRAMES) {
        (function (i) {
          inflight++;
          var img = new Image();
          img.decoding = 'async';
          var settle = function (ok) {
            ready[i] = ok; loaded++; inflight--;
            bump(); pump();
          };
          img.onload = function () { settle(true); };
          img.onerror = function () { settle(false); };
          img.src = frameSrc(i);
          images[i] = img;
        }(next++));
      }
    }
    pump();
  }

  /* Nearest frame that has actually decoded — lets scrubbing
     start before the whole sequence has landed. */
  function nearestReady(idx) {
    if (ready[idx]) return idx;
    for (var r = 1; r < FRAMES; r++) {
      if (ready[idx - r]) return idx - r;
      if (ready[idx + r]) return idx + r;
    }
    return -1;
  }

  /* ── 4. canvas sizing + draw ───────────────────────────── */
  var cw = 0, ch = 0, dpr = 1;

  function sizeCanvas() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    cw = Math.max(1, Math.round(r.width));
    ch = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }

  var lastDrawn = -1, lastZoom = -1, lastShift = -999;

  function draw(idx, zoom, shiftPct) {
    if (!ctx) return;
    var use = nearestReady(idx);
    if (use < 0) return;
    if (use === lastDrawn && Math.abs(zoom - lastZoom) < 0.0015 &&
        Math.abs(shiftPct - lastShift) < 0.05) return;
    lastDrawn = use; lastZoom = zoom; lastShift = shiftPct;

    var img = images[use];
    var iw = img.naturalWidth || 1280, ih = img.naturalHeight || 720;

    /* Landscape gets a straight cover fit. A tall phone would crop a
       16:9 plate down to a ~26% wide slice of the middle — the product
       stops being legible — so portrait fits close to the full frame
       width instead and letterboxes into the page ground. */
    var base = (ch / cw > 1.15) ? (cw / iw) * 1.18 : Math.max(cw / iw, ch / ih);
    var scale = base * zoom;
    var dw = iw * scale, dh = ih * scale;
    var dx = (cw - dw) / 2;
    var dy = (ch - dh) / 2 + (shiftPct / 100) * ch;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /* ── 5. hero act timeline ──────────────────────────────── */
  var ACTS = [
    { el: $('#act1'), intro: true, out: [0.082, 0.180], ty: -70, blur: 14 },
    { el: $('#act2'), in: [0.190, 0.252], out: [0.312, 0.376] },
    { el: $('#act3'), in: [0.424, 0.486], out: [0.572, 0.636] },
    { el: $('#act4'), in: [0.662, 0.724], out: [0.792, 0.856] },
    { el: $('#act5'), in: [0.884, 0.946], out: [9, 9] }
  ];

  var BEATS = [[0, 0.185], [0.185, 0.408], [0.408, 0.648], [0.648, 0.872], [0.872, 1.001]];
  var beatEls = $$('#beats .beat');
  var wordLetters = $$('#wordmark .ltr');
  var heroBloom = $('#heroBloom');
  var heroScan  = $('#heroScan');
  var heroScrim = $('#heroScrim');
  var heroProg  = $('#heroProg');
  var cue       = $('#cue');

  var lastBeat = -1;

  function renderHero(p) {
    /* --- picture plane --- */
    var zoom = track(p, [[0, 1.13], [0.16, 1.0], [0.40, 1.0], [0.63, 1.065], [0.86, 1.0], [1, 0.955]]);
    var shift = track(p, [[0, 2.4], [0.5, 0], [1, -2.4]]);
    draw(Math.min(FRAMES - 1, Math.round(p * (FRAMES - 1))), zoom, shift);

    /* full-bleed → framed card, right at the end of the pin */
    if (heroFrame) {
      var k = easeIO(inv(p, 0.875, 1));
      heroFrame.style.setProperty('--cy', (k * 7).toFixed(2) + 'vh');
      heroFrame.style.setProperty('--cx', (k * 5).toFixed(2) + 'vw');
      heroFrame.style.setProperty('--cr', (k * 26).toFixed(1) + 'px');
    }

    /* --- light --- */
    if (heroBloom) {
      var bx = track(p, [[0, 0], [0.30, -8], [0.55, 16], [0.80, -14], [1, 2]]);
      var by = track(p, [[0, 4], [0.30, -4], [0.55, -10], [0.80, 10], [1, 0]]);
      heroBloom.style.transform = 'translate3d(' + bx.toFixed(2) + '%,' + by.toFixed(2) + '%,0)';
      heroBloom.style.opacity = track(p, [[0, 0.46], [0.45, 0.86], [0.62, 0.92], [0.80, 0.5], [1, 0.34]]).toFixed(3);
    }
    if (heroScan) {
      var sp = inv(p, 0.400, 0.660);
      heroScan.style.opacity = (Math.sin(sp * Math.PI) * 0.9).toFixed(3);
      heroScan.style.transform = 'translate3d(0,' + ((sp * 150 - 34).toFixed(2)) + 'vh,0)';
    }
    if (heroScrim) {
      heroScrim.style.opacity = track(p, [[0, 0.62], [0.14, 0.28], [0.42, 0.30], [0.55, 0.66], [0.70, 0.66], [0.88, 0.3], [1, 0.5]]).toFixed(3);
    }
    if (heroProg) heroProg.style.width = (p * 100).toFixed(2) + '%';
    if (cue) cue.style.opacity = (1 - inv(p, 0.005, 0.045)).toFixed(3);

    /* --- wordmark exit: letters lift out and tracking opens --- */
    var wmOut = easeIO(inv(p, 0.070, 0.190));
    for (var i = 0; i < wordLetters.length; i++) {
      var li = wordLetters.length > 1 ? i / (wordLetters.length - 1) : 0;
      var e = easeIO(inv(p, 0.070 + li * 0.030, 0.160 + li * 0.030));
      wordLetters[i].style.transform = 'translate3d(0,' + (-e * 105).toFixed(2) + '%,0)';
      wordLetters[i].style.opacity = (1 - e).toFixed(3);
    }
    // Tracking opens as the letters lift. Kept small on purpose: the
    // wordmark is already viewport-wide, so a big expansion would push
    // the outer letters past the edge.
    var wm = $('#wordmark');
    if (wm) {
      wm.style.letterSpacing = (-0.05 + wmOut * 0.022).toFixed(4) + 'em';
      wm.style.transform = 'scale(' + (1 + wmOut * 0.055).toFixed(4) + ')';
    }

    /* --- acts --- */
    for (var a = 0; a < ACTS.length; a++) {
      var act = ACTS[a];
      if (!act.el) continue;
      var eIn  = act.intro ? 1 : easeOut(inv(p, act.in[0], act.in[1]));
      var eOut = easeIO(inv(p, act.out[0], act.out[1]));
      var o = eIn * (1 - eOut);
      var ty = (1 - eIn) * 34 + eOut * (act.ty || -46);
      var bl = (1 - eIn) * 9 + eOut * (act.blur || 9);
      act.el.style.opacity = o.toFixed(3);
      act.el.style.transform = 'translate3d(0,' + ty.toFixed(2) + 'px,0)';
      act.el.style.filter = bl > 0.08 ? 'blur(' + bl.toFixed(2) + 'px)' : 'none';
      act.el.style.visibility = o < 0.004 ? 'hidden' : 'visible';
    }

    /* --- beat rail --- */
    var b = 0;
    for (var j = 0; j < BEATS.length; j++) if (p >= BEATS[j][0] && p < BEATS[j][1]) b = j;
    if (b !== lastBeat) {
      lastBeat = b;
      for (var k2 = 0; k2 < beatEls.length; k2++) beatEls[k2].classList.toggle('is-on', k2 === b);
    }
  }

  /* ── 6. anatomy pin ────────────────────────────────────── */
  var anaTrack = $('#anatomyTrack');
  var anaImg   = $('#anatomyImg');
  var anaHead  = $('.anatomy__h .ln');
  var hotspots = $$('#hotspots .hs');

  function renderAnatomy(q) {
    if (anaImg) {
      var s = track(q, [[0, 1.16], [1, 1.03]]);
      var tx = track(q, [[0, 2.2], [1, -2.2]]);
      anaImg.style.transform = 'scale(' + s.toFixed(4) + ') translate3d(' + tx.toFixed(2) + '%,0,0)';
    }
    if (anaHead) anaHead.classList.toggle('in', q > 0.02);
    var cur = -1;
    for (var i = 0; i < hotspots.length; i++) {
      var on = q > 0.14 + i * 0.185;
      if (on) cur = i;
      hotspots[i].classList.toggle('is-on', on);
    }
    // narrow screens show one card at a time; wide screens accumulate
    for (var j = 0; j < hotspots.length; j++) {
      hotspots[j].classList.toggle('is-cur', j === cur);
    }
  }

  /* ── 7. gallery rail ───────────────────────────────────── */
  var galTrack = $('#galleryTrack');
  var galRail  = $('#galleryRail');

  function renderGallery(q) {
    if (!galRail) return;
    var span = galRail.scrollWidth - window.innerWidth;
    if (span <= 0) { galRail.style.transform = 'none'; return; }
    galRail.style.transform = 'translate3d(' + (-span * q).toFixed(1) + 'px,0,0)';
  }

  /* ── 8. word-by-word brightening ───────────────────────── */
  var wordBlocks = $$('[data-words]');

  function renderWords() {
    var vh = window.innerHeight;
    for (var i = 0; i < wordBlocks.length; i++) {
      var el = wordBlocks[i];
      var r = el.getBoundingClientRect();
      // 0 when the block's top hits 82% of the viewport, 1 when it clears 34%
      var q = clamp((vh * 0.82 - r.top) / (vh * 0.48 + r.height * 0.4));
      var ws = el._words;
      var n = ws.length;
      for (var j = 0; j < n; j++) {
        ws[j].classList.toggle('on', q > (j / n) * 0.86 + 0.02);
      }
    }
  }

  /* ── 9. progress of a pinned track ─────────────────────── */
  function pinProgress(el) {
    if (!el) return 0;
    var r = el.getBoundingClientRect();
    var span = el.offsetHeight - window.innerHeight;
    if (span <= 0) return 0;
    return clamp(-r.top / span);
  }

  /* ── 10. the loop ──────────────────────────────────────── */
  var heroP = 0, anaQ = 0, galQ = 0;
  var running = false;
  var prevT = 0;

  function frame(now) {
    var dt = prevT ? Math.min(now - prevT, 100) : 16.667;
    prevT = now;

    var tHero = pinProgress(heroTrack);
    var tAna  = pinProgress(anaTrack);
    var tGal  = pinProgress(galTrack);

    /* Smooth the values, not the scroll — and do it in real time, so a
       120 Hz display and a struggling phone settle at the same rate
       instead of the phone crawling behind the scrollbar. */
    var kHero = 1 - Math.pow(1 - 0.14, dt / 16.667);
    var kSec  = 1 - Math.pow(1 - 0.16, dt / 16.667);

    heroP += (tHero - heroP) * kHero;
    anaQ  += (tAna  - anaQ)  * kSec;
    galQ  += (tGal  - galQ)  * kSec;

    if (Math.abs(tHero - heroP) < 0.0004) heroP = tHero;
    if (Math.abs(tAna - anaQ) < 0.0004) anaQ = tAna;
    if (Math.abs(tGal - galQ) < 0.0004) galQ = tGal;

    renderHero(heroP);
    renderAnatomy(anaQ);
    renderGallery(galQ);
    renderWords();

    requestAnimationFrame(frame);
  }

  function startLoop() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  /* ── 11. reveals ───────────────────────────────────────── */
  function initReveals() {
    var targets = $$('[data-reveal], .iridium__h .ln');
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    targets.forEach(function (el) { io.observe(el); });
  }

  /* ── 12. nav auto-hide ─────────────────────────────────── */
  function initNav() {
    var nav = $('#nav');
    if (!nav) return;
    var prev = window.scrollY;
    var tick = false;
    window.addEventListener('scroll', function () {
      if (tick) return;
      tick = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        nav.classList.toggle('is-hidden', y > prev && y > 260);
        prev = y;
        tick = false;
      });
    }, { passive: true });
  }

  /* ── 13. cursor ────────────────────────────────────────── */
  function initCursor() {
    var el = $('#cursor');
    if (!el || !window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    var x = window.innerWidth / 2, y = window.innerHeight / 2, tx = x, ty = y;
    window.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      el.classList.add('is-live');
    }, { passive: true });
    document.addEventListener('mouseover', function (e) {
      var hot = e.target.closest && e.target.closest('a,button,[data-cursor]');
      el.classList.toggle('is-hot', !!hot);
    }, { passive: true });
    (function ride() {
      x += (tx - x) * 0.2; y += (ty - y) * 0.2;
      el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      requestAnimationFrame(ride);
    }());
  }

  /* ── 14. the loop video, only while it is on screen ────── */
  function initVideo() {
    var v = $('#iridiumVideo');
    if (!v) return;
    v.muted = true;
    v.setAttribute('muted', '');
    if (reduced) return;
    if (!('IntersectionObserver' in window)) { v.play().catch(function () {}); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { var q = v.play(); if (q) q.catch(function () {}); }
        else v.pause();
      });
    }, { threshold: 0.1 }).observe(v);
  }

  /* ── 15. go ────────────────────────────────────────────── */
  function reveal() {
    if (boot) boot.classList.add('is-done');
    document.body.classList.remove('is-booting');
    document.body.classList.add('is-lit');
    if (heroFrame) heroFrame.classList.add('is-live');
    if (reduced) return;   // no pins, no scrub — the loop would only
                           // fight the static state set up below
    // scroll can only be trusted once the pin heights are settled
    requestAnimationFrame(function () { sizeCanvas(); lastDrawn = -1; startLoop(); });
  }

  document.body.classList.add('is-booting');

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      sizeCanvas();
      lastDrawn = -1;
      renderGallery(galQ);
    }, 120);
  }, { passive: true });

  window.addEventListener('orientationchange', function () {
    setTimeout(function () { sizeCanvas(); lastDrawn = -1; }, 260);
  });

  initReveals();
  initNav();
  initCursor();
  initVideo();

  if (reduced) {
    // No scrub. Paint one good frame, drop the pins, show the page.
    sizeCanvas();
    var still = new Image();
    still.onload = function () { images[0] = still; ready[0] = true; draw(0, 1, 0); };
    still.src = frameSrc(0);
    reveal();
    $$('#beats .beat')[0] && $$('#beats .beat')[0].classList.add('is-on');
    renderAnatomy(1);
    hotspots.forEach(function (h) { h.classList.add('is-on'); });
  } else {
    sizeCanvas();
    preload(reveal);
  }

  window.addEventListener('load', function () { sizeCanvas(); lastDrawn = -1; });
}());
