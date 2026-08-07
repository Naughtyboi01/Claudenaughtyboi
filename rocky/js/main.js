/* ============================================================
   HOUSE OF ROCKY
   One requestAnimationFrame loop drives every scroll-linked value.
   Native scrolling throughout — nothing is hijacked.
   ============================================================ */

(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- small helpers ---------- */
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };

  /* Smooth 0→1 ramp between two stops. */
  function ramp(v, a, b) {
    if (b === a) return v < a ? 0 : 1;
    var t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* Trapezoid: 0 outside [a,b], 1 in the middle, `f` long fades. */
  function band(v, a, b, f) {
    return Math.min(ramp(v, a, a + f), 1 - ramp(v, b - f, b));
  }

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ============================================================
     1 · HERO FRAME SEQUENCE
     ============================================================ */

  /* The single-file offline build inlines the sequence as data: URIs on
     window.__FRAMES. When that is present it replaces the path-based
     loading below, so both builds share this file unchanged. */
  var EMBED  = (window.__FRAMES && window.__FRAMES.length) ? window.__FRAMES : null;
  var FRAMES = EMBED ? EMBED.length : 109;

  var canvas  = $('#hero-canvas');
  var hero    = $('#hero');
  /* Transparent, not opaque: until a frame decodes the canvas must let the
     stage's poster show through rather than covering it with flat colour. */
  var ctx     = canvas ? canvas.getContext('2d') : null;

  /* Serve the light set to narrow viewports, data-savers and slow links. */
  var conn = navigator.connection || {};
  var wantSmall =
    window.innerWidth < 760 ||
    conn.saveData === true ||
    /2g/.test(conn.effectiveType || '');

  var dir = wantSmall ? 'sm' : 'lg';

  var images = new Array(FRAMES);
  var ready  = new Array(FRAMES);
  var loaded = 0;

  function src(i) {
    if (EMBED) return EMBED[i];
    return 'rocky/frames/' + dir + '/' + String(i + 1).padStart(4, '0') + '.jpg';
  }

  /* Load order: first frame, then a coarse sweep, then everything else.
     Scrubbing stays usable long before the set finishes. */
  function loadOrder() {
    var order = [0], seen = { 0: 1 }, step, i;
    for (step = 16; step >= 1; step = Math.floor(step / 2)) {
      for (i = 0; i < FRAMES; i += step) {
        if (!seen[i]) { seen[i] = 1; order.push(i); }
      }
      if (step === 1) break;
    }
    for (i = 0; i < FRAMES; i++) if (!seen[i]) order.push(i);
    return order;
  }

  var loaderEl   = $('#loader');
  var loaderFill = $('#loader-fill');
  var loaderPct  = $('#loader-pct');
  var loaderDone = false;

  function dismissLoader() {
    if (loaderDone) return;
    loaderDone = true;
    if (loaderEl) loaderEl.classList.add('done');
  }

  function onFrameSettled(i, img) {
    if (img) { images[i] = img; ready[i] = 1; }
    loaded++;
    var p = loaded / FRAMES;
    if (loaderFill) loaderFill.style.transform = 'scaleX(' + p + ')';
    if (loaderPct)  loaderPct.textContent = String(Math.round(p * 100)).padStart(3, '0');
    /* Enough decoded to scrub convincingly — let people in. */
    if (loaded >= Math.min(FRAMES, 26)) dismissLoader();
    /* A newly decoded frame may be a closer match than whatever is on the
       canvas — including the very first paint, which happens before any
       image exists. request() dedupes, so this costs one paint per frame. */
    request();
  }

  function startLoading() {
    var order = loadOrder();
    var cursor = 0;
    var lanes = wantSmall ? 4 : 6;

    function next() {
      if (cursor >= order.length) return;
      var i = order[cursor++];
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { onFrameSettled(i, img); next(); };
      img.onerror = function () { onFrameSettled(i, null); next(); };
      img.src = src(i);
    }
    for (var l = 0; l < lanes; l++) next();
  }

  /* Closest decoded neighbour, so the canvas never blanks mid-preload. */
  function nearestReady(i) {
    if (ready[i]) return i;
    for (var d = 1; d < FRAMES; d++) {
      if (ready[i - d]) return i - d;
      if (ready[i + d]) return i + d;
    }
    return -1;
  }

  /* ---------- canvas sizing ---------- */

  var vw = 0, vh = 0, dpr = 1;

  function sizeCanvas() {
    if (!canvas) return;
    var stage = canvas.parentNode;
    vw = stage.clientWidth;
    vh = stage.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* Tiny offscreen copy of the current frame. Upscaled with smoothing it
     becomes a cheap blur, which fills the plate margins with a backdrop
     that always matches the footage. */
  var tiny = document.createElement('canvas');
  tiny.width = tiny.height = 32;
  var tctx = tiny.getContext('2d');
  var tinyFor = -1;

  var drawnIndex = -1, drawnFit = -1, drawnScale = -1;

  function draw(index, fit, breathe) {
    if (!ctx) return;
    var i = nearestReady(Math.round(index));
    if (i < 0) return;

    /* Skip redundant repaints. */
    if (i === drawnIndex &&
        Math.abs(fit - drawnFit) < 0.002 &&
        Math.abs(breathe - drawnScale) < 0.002) return;
    drawnIndex = i; drawnFit = fit; drawnScale = breathe;

    var img = images[i];
    var iw = img.naturalWidth || 1000;
    var ih = img.naturalHeight || 1000;

    var cover   = Math.max(vw / iw, vh / ih);
    var contain = Math.min(vw / iw, vh / ih);
    var s = lerp(contain, cover, fit) * breathe;

    var dw = iw * s, dh = ih * s;
    var dx = (vw - dw) / 2, dy = (vh - dh) / 2;

    /* On a tall screen the contained plate leaves a band top and bottom.
       Bias it upward so the closing caption gets clear space beneath it
       instead of landing on the plate. */
    if (dh < vh && vh > vw * 1.2) dy -= (vh - dh) * 0.20;

    /* Backdrop, only when the plate no longer fills the stage. */
    if (dw < vw - 1 || dh < vh - 1) {
      if (tinyFor !== i) { tctx.drawImage(img, 0, 0, 32, 32); tinyFor = i; }
      ctx.imageSmoothingEnabled = true;
      var bs = Math.max(vw / 32, vh / 32) * 1.2;
      ctx.drawImage(tiny, (vw - 32 * bs) / 2, (vh - 32 * bs) / 2, 32 * bs, 32 * bs);
      ctx.fillStyle = 'rgba(18, 14, 10, 0.34)';
      ctx.fillRect(0, 0, vw, vh);
    }

    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /* ============================================================
     2 · SCROLL-LINKED STATE
     ============================================================ */

  var heroOpen   = $('#hero-open');
  var heroClose  = $('#hero-close');
  var heroBeats  = $$('.hero-beat');
  var heroFill   = $('#hero-fill');
  var heroCount  = $('#hero-count');
  var heroPhase  = $('#hero-phase');
  var heroCue    = $('#hero-cue');
  var heroWash   = $('#hero-wash');
  var heroVig    = $('#hero-vignette');
  var heroScrim  = $('#hero-scrim');

  /* Beat windows, in hero-progress space. The footage cuts to the finished
     cookie at ~0.54, which is where the captions hand over to the closing card. */
  var BEATS = [
    { a: 0.055, b: 0.250, f: 0.045 },
    { a: 0.265, b: 0.410, f: 0.040 },
    { a: 0.425, b: 0.545, f: 0.035 }
  ];

  var PHASES = [
    { at: 0.00, name: 'DOUGH' },
    { at: 0.26, name: 'PECAN' },
    { at: 0.42, name: 'CHOCOLATE' },
    { at: 0.55, name: 'THE COOKIE' }
  ];

  var eased = 0;          /* frame index, smoothed */
  var heroP = 0;

  function readHero() {
    if (!hero) return;
    var r = hero.getBoundingClientRect();
    var total = hero.offsetHeight - window.innerHeight;
    heroP = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
  }

  function renderHero() {
    if (!canvas) return;

    var target = heroP * (FRAMES - 1);
    /* Ease the drawn index so a fast flick reads as motion rather than a cut. */
    eased = reduce ? target : lerp(eased, target, 0.22);
    if (Math.abs(eased - target) < 0.02) eased = target;

    /* Cover while the macro footage carries the screen, easing back to a
       framed plate as the cookie resolves — which keeps the wordmark burned
       into the bottom-right of the footage inside the frame. Contain is the
       only fit that shows the whole square, so the pull-back always ends
       there; on a portrait screen that lands as a full-width plate. */
    var fit = 1 - ramp(heroP, 0.55, 0.80);

    var breathe = lerp(1.06, 1.0, ramp(heroP, 0, 0.5));

    draw(eased, fit, breathe);

    /* Opening lockup drifts back and dissolves. */
    if (heroOpen) {
      var o = 1 - ramp(heroP, 0.005, 0.075);
      heroOpen.style.opacity = o;
      heroOpen.style.transform =
        'translate3d(0,' + (-heroP * 90) + 'px,0) scale(' + lerp(1, 1.14, ramp(heroP, 0, 0.09)) + ')';
    }

    /* Captions. */
    for (var i = 0; i < heroBeats.length; i++) {
      var w = BEATS[i];
      var a = band(heroP, w.a, w.b, w.f);
      heroBeats[i].style.opacity = a;
      heroBeats[i].style.transform = 'translate3d(0,' + (1 - a) * 28 + 'px,0)';
    }

    /* Closing card, and the scrim that keeps it legible over the plate. */
    if (heroClose) {
      var c = ramp(heroP, 0.66, 0.76);
      heroClose.style.opacity = c;
      heroClose.style.transform = 'translate3d(0,' + (1 - c) * 26 + 'px,0)';
      if (heroScrim) heroScrim.style.opacity = c;
    }

    /* Wash deepens through the chocolate beat, clears for the product shot. */
    if (heroWash) {
      heroWash.style.opacity = Math.min(ramp(heroP, 0.36, 0.47), 1 - ramp(heroP, 0.50, 0.60)) * 0.55;
    }
    if (heroVig) {
      heroVig.style.opacity = lerp(1, 0.28, ramp(heroP, 0.55, 0.8));
    }

    /* Rail. */
    if (heroFill)  heroFill.style.transform = 'scaleY(' + heroP + ')';
    if (heroCount) heroCount.textContent =
      String(Math.round(eased) + 1).padStart(3, '0') + ' / ' + FRAMES;
    if (heroPhase) {
      var name = PHASES[0].name;
      for (var k = 0; k < PHASES.length; k++) if (heroP >= PHASES[k].at) name = PHASES[k].name;
      if (heroPhase.textContent !== name) heroPhase.textContent = name;
    }
    if (heroCue) heroCue.style.opacity = 1 - ramp(heroP, 0.005, 0.05);
  }

  /* ============================================================
     3 · STATEMENT — words ignite with scroll
     ============================================================ */

  var stmt = $('#statement-copy');
  var words = [];

  if (stmt) {
    var parts = stmt.textContent.trim().split(/\s+/);
    stmt.textContent = '';
    parts.forEach(function (w, i) {
      var s = document.createElement('span');
      s.className = 'word';
      s.textContent = w;
      stmt.appendChild(s);
      if (i < parts.length - 1) stmt.appendChild(document.createTextNode(' '));
      words.push(s);
    });
  }

  function renderStatement() {
    if (!words.length) return;
    var r = stmt.getBoundingClientRect();
    var h = window.innerHeight;
    /* 0 when the block sits low, 1 once it has risen through the middle. */
    var p = clamp((h * 0.82 - r.top) / (r.height + h * 0.30), 0, 1);
    var lit = Math.round(p * words.length);
    for (var i = 0; i < words.length; i++) {
      var on = i < lit;
      if (on !== !!words[i]._lit) {
        words[i].classList.toggle('lit', on);
        words[i]._lit = on;
      }
    }
  }

  /* ============================================================
     4 · ANATOMY — pinned figure, four chapters
     ============================================================ */

  var anatomy   = $('#cookie');
  var spots     = $$('.hotspot');
  var panels    = $$('.anatomy-panel');
  var progBars  = $$('#anatomy-progress i');
  /* null, not -1 — -1 is a real state (the stacked mobile layout), and
     starting there would skip clearing the markup's initial selection. */
  var anatomyOn = null;

  function setAnatomy(i) {
    if (i === anatomyOn) return;
    anatomyOn = i;
    for (var k = 0; k < panels.length; k++) panels[k].classList.toggle('on', k === i);
    for (var s = 0; s < spots.length; s++) spots[s].setAttribute('aria-selected', s === i ? 'true' : 'false');
    for (var b = 0; b < progBars.length; b++) progBars[b].classList.toggle('on', b <= i);
  }

  /* Where in the document each chapter is active — also used by the hotspots,
     so clicking one scrolls to the same place the scroll would have taken you. */
  function anatomyBounds() {
    var top = anatomy.getBoundingClientRect().top + window.pageYOffset;
    var total = anatomy.offsetHeight - window.innerHeight;
    return { top: top, total: Math.max(total, 1) };
  }

  function renderAnatomy() {
    if (!anatomy || !panels.length) return;
    if (window.innerWidth <= 900) { setAnatomy(-1); return; }
    var b = anatomyBounds();
    var p = clamp((window.pageYOffset - b.top) / b.total, 0, 1);
    var seg = clamp(Math.floor(ramp(p, 0.06, 0.94) * panels.length), 0, panels.length - 1);
    setAnatomy(seg);
  }

  spots.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var i = parseInt(btn.getAttribute('data-spot'), 10);
      if (window.innerWidth <= 900) return;
      var b = anatomyBounds();
      /* Centre of chapter i, inverted back through the same ramp. */
      var frac = (i + 0.5) / panels.length;
      var p = 0.06 + frac * (0.94 - 0.06);
      window.scrollTo({ top: b.top + p * b.total, behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  /* ============================================================
     5 · CRAFT — vertical scroll becomes a horizontal rail
     ============================================================ */

  var craft    = $('#craft');
  var rail     = $('#rail');
  var railView = $('#rail-viewport');
  var railFill = $('#rail-fill');
  var railStep = $('#rail-step');
  var railItems = $$('.rail-item').length || 1;

  function renderRail() {
    if (!craft || !rail || !railView) return;
    if (window.innerWidth <= 900) { rail.style.transform = ''; return; }
    var top = craft.getBoundingClientRect().top + window.pageYOffset;
    var total = Math.max(craft.offsetHeight - window.innerHeight, 1);
    var p = clamp((window.pageYOffset - top) / total, 0, 1);
    var travel = Math.max(rail.scrollWidth - railView.clientWidth, 0);
    rail.style.transform = 'translate3d(' + (-p * travel) + 'px,0,0)';

    if (railFill) railFill.style.transform = 'scaleX(' + p + ')';
    if (railStep) {
      var n = clamp(Math.floor(p * railItems) + 1, 1, railItems);
      var txt = 'STEP ' + String(n).padStart(2, '0') + ' / ' + String(railItems).padStart(2, '0');
      if (railStep.textContent !== txt) railStep.textContent = txt;
    }
  }

  /* ============================================================
     6 · CARD PARALLAX
     ============================================================ */

  var parallax = $$('[data-parallax] .card-media img');

  function renderParallax() {
    if (reduce) return;
    var h = window.innerHeight;
    for (var i = 0; i < parallax.length; i++) {
      var img = parallax[i];
      var r = img.parentNode.getBoundingClientRect();
      if (r.bottom < -200 || r.top > h + 200) continue;
      var p = (r.top + r.height / 2 - h / 2) / h;   /* -1 … 1 */
      img.style.transform = 'translate3d(0,' + (-p * 5 - 7) + '%,0)';
    }
  }

  /* ============================================================
     7 · NAV — retreats going down, returns going up
     ============================================================ */

  var nav = $('#nav');
  var navVeil = $('#nav-veil');
  var lastY = window.pageYOffset;

  function renderNav() {
    if (!nav) return;
    var y = window.pageYOffset;
    if (y > 420 && y > lastY + 4) nav.classList.add('hide');
    else if (y < lastY - 4 || y < 200) nav.classList.remove('hide');
    lastY = y;

    /* Only needed while the film is behind the nav. */
    if (navVeil && hero) {
      var end = hero.offsetTop + hero.offsetHeight - window.innerHeight;
      navVeil.style.opacity = 1 - ramp(y, end - window.innerHeight * 0.6, end);
    }
  }

  /* ============================================================
     8 · THE LOOP
     ============================================================ */

  var queued = false;

  function frame() {
    queued = false;
    readHero();
    renderHero();
    renderStatement();
    renderAnatomy();
    renderRail();
    renderParallax();
    renderNav();
  }

  function request() {
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  }

  /* The hero needs continuous frames while its index eases toward the
     target; everything else is fine driven straight off scroll events. */
  function tick() {
    if (Math.abs(eased - heroP * (FRAMES - 1)) > 0.02) request();
    requestAnimationFrame(tick);
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () {
    sizeCanvas();
    drawnIndex = -1;          /* force a repaint at the new size */
    request();
  });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { sizeCanvas(); drawnIndex = -1; request(); }, 120);
  });

  /* ============================================================
     9 · REVEALS
     ============================================================ */

  var revealTargets = $$('[data-reveal], .mask-line, .rule-draw');

  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ============================================================
     10 · FILM — plays only while on screen
     ============================================================ */

  var film = $('#film-video');
  if (film && 'IntersectionObserver' in window) {
    var fio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (film.preload === 'none') film.preload = 'auto';
          var p = film.play();
          if (p && p.catch) p.catch(function () { /* autoplay refused — poster stands in */ });
        } else {
          film.pause();
        }
      });
    }, { threshold: 0.25 });
    fio.observe(film);
  }

  /* ============================================================
     11 · RESERVE FORM
     ============================================================ */

  var form = $('#reserve-form');
  var done = $('#form-done');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name  = $('#f-name');
      var email = $('#f-email');

      if (!name.value.trim()) { name.focus(); return; }
      if (!/^\S+@\S+\.\S+$/.test(email.value)) { email.focus(); return; }

      var first = name.value.trim().split(/\s+/)[0];
      var box   = $('#f-box').value;
      $('#form-done-copy').textContent =
        first + ', your ' + box.split(' — ')[0].toLowerCase() +
        ' is noted. We\'ll confirm by email before the next bake.';

      form.style.display = 'none';
      done.classList.add('on');
      done.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  /* ============================================================
     12 · BOOT
     ============================================================ */

  var y = $('#year');
  if (y) y.textContent = new Date().getFullYear();

  sizeCanvas();
  startLoading();
  request();
  requestAnimationFrame(tick);

  /* Never let a slow connection hold the page hostage. */
  setTimeout(dismissLoader, 9000);
  window.addEventListener('load', function () { setTimeout(dismissLoader, 1200); });
})();
