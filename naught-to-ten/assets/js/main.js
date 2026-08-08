/* ==========================================================================
   Naught to Ten
   One requestAnimationFrame loop drives every scroll-linked value on the page.

   Scrolling itself is never hijacked — native scroll stays intact so sticky
   positioning, the scrollbar, the keyboard and the trackpad all behave. What
   gets smoothed is the *animated values*, not the scroll position.
   ========================================================================== */
(function () {
'use strict';

/* ── constants ──────────────────────────────────────────────────────────── */
var FRAME_COUNT = 145;
var BOOT_TIMEOUT = 9000;
/* Frames needed before the page is revealed. Waiting for all 145 meant
   holding the first paint behind ~6 MB, which is a Largest Contentful Paint
   figure no amount of markup tuning can rescue. The rest keep loading behind
   the revealed page, and nearestReady() covers any gap the scrubber reaches
   first. */
var READY_FRAMES = 24;
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The single-file offline build sets window.__FRAMES to an array of data URIs
   before this script runs. Detecting it here is the one hook that lets both
   builds share this file instead of forking a copy to keep in sync. */
var EMBEDDED = (window.__FRAMES && window.__FRAMES.length) ? window.__FRAMES : null;
if (EMBEDDED) FRAME_COUNT = EMBEDDED.length;

/* ── helpers ────────────────────────────────────────────────────────────── */
var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
var lerp  = function (a, b, t) { return a + (b - a) * t; };

/* normalised position of v inside [a,b] */
function norm(v, a, b) { return clamp((v - a) / (b - a), 0, 1); }
/* ramp up then down across [a,b,c,d] — the shape every hero beat uses */
function band(p, a, b, c, d) { return Math.min(norm(p, a, b), 1 - norm(p, c, d)); }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

/* ── text splitting ─────────────────────────────────────────────────────── */

/* Characters, for the hero wordmark. */
function splitChars(el) {
  var text = el.textContent;
  el.textContent = '';
  var frag = document.createDocumentFragment();
  for (var i = 0; i < text.length; i++) {
    var s = document.createElement('span');
    s.className = 'ch';
    s.textContent = text[i] === ' ' ? ' ' : text[i];
    frag.appendChild(s);
  }
  el.appendChild(frag);
  return $$('.ch', el);
}

/* Words, preserving inline elements like <em>. */
function splitWords(el) {
  var out = [];
  function walk(node) {
    var kids = Array.prototype.slice.call(node.childNodes);
    kids.forEach(function (n) {
      if (n.nodeType === 3) {
        var parts = n.textContent.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        parts.forEach(function (p) {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
          var s = document.createElement('span');
          s.className = 'w';
          s.textContent = p;
          frag.appendChild(s);
          out.push(s);
        });
        node.replaceChild(frag, n);
      } else if (n.nodeType === 1) {
        walk(n);
      }
    });
  }
  walk(el);
  return out;
}

/* Lines, split on <br>, each masked so it can rise into view. */
function splitLines(el) {
  var chunks = [[]];
  Array.prototype.slice.call(el.childNodes).forEach(function (n) {
    if (n.nodeType === 1 && n.tagName === 'BR') chunks.push([]);
    else chunks[chunks.length - 1].push(n);
  });
  el.textContent = '';
  chunks.forEach(function (nodes, i) {
    var line = document.createElement('span');
    line.className = 'line';
    var inner = document.createElement('i');
    nodes.forEach(function (n) { inner.appendChild(n); });
    line.appendChild(inner);
    /* The <br> carried the word break. Without a space in its place the
       heading reads "Four movements,twelve weeks." to anything walking
       textContent — crawlers and screen readers included. */
    if (i) el.appendChild(document.createTextNode(' '));
    el.appendChild(line);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   HERO — frame sequence
   ══════════════════════════════════════════════════════════════════════════ */
var canvas  = $('#heroCanvas');
var ctx     = canvas ? canvas.getContext('2d', { alpha: false }) : null;
var frames  = new Array(FRAME_COUNT);
var loaded  = 0;
var drawnIdx = -1;
var easedIdx = 0;

/* Smaller set for narrow viewports, data-saver clients and slow links. */
function pickSet() {
  var c = navigator.connection || {};
  if (c.saveData) return 'sm';
  if (/2g/.test(c.effectiveType || '')) return 'sm';
  if (window.innerWidth < 900) return 'sm';
  return 'lg';
}

var boot    = $('#boot');
var bootBar = $('#bootBar');
var bootPct = $('#bootPct');
var poster  = $('#heroPoster');
var bootDone = false;

function finishBoot() {
  if (bootDone) return;
  bootDone = true;
  document.body.classList.remove('is-booting');
  if (boot) boot.classList.add('is-done');
  if (poster) poster.classList.add('is-out');
  $('#nav').classList.add('is-in');
  entrance();
  measure();
  tick();
}

function loadFrames() {
  var set = pickSet();
  var pad = function (n) { return ('000' + n).slice(-4); };
  var srcOf = function (i) {
    return EMBEDDED ? EMBEDDED[i] : 'assets/frames/' + set + '/' + pad(i + 1) + '.jpg';
  };
  var next = 0;
  var CONCURRENCY = 8;

  var gate = Math.min(READY_FRAMES, FRAME_COUNT);

  function bump() {
    loaded++;
    /* the bar tracks the reveal gate, not the full sequence, so it reads
       as a real countdown rather than stalling at 16% */
    var pct = Math.min(1, loaded / gate);
    if (bootBar) bootBar.style.width = (pct * 100) + '%';
    if (bootPct) bootPct.textContent = Math.round(pct * 10);
    if (loaded === 1) schedule();
    if (loaded >= gate) finishBoot();
  }

  /* In sequence order, a fixed number in flight — the first frames land
     first, so the hero is scrubbable long before the tail arrives. */
  function pumpOne() {
    if (next >= FRAME_COUNT) return;
    var i = next++;
    var img = new Image();
    img.decoding = 'async';
    img.onload = img.onerror = function () { bump(); pumpOne(); };
    img.src = srcOf(i);
    frames[i] = img;
  }
  for (var k = 0; k < CONCURRENCY; k++) pumpOne();

  setTimeout(finishBoot, BOOT_TIMEOUT);
}

/* Nearest decoded neighbour, so a scrub never blanks mid-preload. */
function nearestReady(i) {
  var f = frames[i];
  if (f && f.complete && f.naturalWidth) return f;
  for (var d = 1; d < FRAME_COUNT; d++) {
    var a = frames[i - d], b = frames[i + d];
    if (a && a.complete && a.naturalWidth) return a;
    if (b && b.complete && b.naturalWidth) return b;
  }
  return null;
}

var cw = 0, ch = 0;
function sizeCanvas() {
  if (!canvas) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = canvas.clientWidth; ch = canvas.clientHeight;
  canvas.width  = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawnIdx = -1;
}

function paint(i) {
  if (!ctx || i === drawnIdx) return;
  var img = nearestReady(i);
  if (!img) return;
  drawnIdx = i;
  var s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  var w = img.naturalWidth * s, h = img.naturalHeight * s;
  ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
}

/* ── hero DOM ───────────────────────────────────────────────────────────── */
var heroTrack = $('#heroTrack');
var beats = [$('#beat1'), $('#beat2'), $('#beat3'), $('#beat4')];
var washL = $('#heroWashL');
var washR = $('#heroWashR');
var cue   = $('#cue');
var countN = $('#countN'), countD = $('#countD');
var hudSeq = $('#hudSeq'), hudPhase = $('#hudPhase');
var railFill = $('#railFill'), railTicks = $('#railTicks');
var PHASES = ['Naught', 'Premise', 'Method', 'Ten'];

if (railTicks) {
  for (var t = 10; t >= 0; t--) {
    var li = document.createElement('li');
    li.textContent = t === 10 ? '10' : '0' + t;
    railTicks.appendChild(li);
  }
}
var tickEls = $$('li', railTicks);
var lastTick = -1, lastPhase = -1, lastSeq = -1, lastCount = -1;

/* ── entrance (once the frames are in) ──────────────────────────────────── */
var ledeChars = [];
function entrance() {
  if (reduced) return;
  ledeChars.forEach(function (c, i) {
    c.style.transform = 'translateY(105%)';
    c.style.opacity = '0';
    /* eslint-disable no-loop-func */
    setTimeout(function () {
      c.style.transition = 'transform 1.15s cubic-bezier(.22,1,.36,1), opacity .7s ease';
      c.style.transform = 'translateY(0)';
      c.style.opacity = '1';
    }, 90 + i * 26);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SCALE — pinned services index
   ══════════════════════════════════════════════════════════════════════════ */
var scaleTrack = $('#scaleTrack');
var rows = $$('.row');
var scaleFrame = $('#scaleFrame');
var scaleCapN = $('#scaleCapN'), scaleCapT = $('#scaleCapT'), scaleCapD = $('#scaleCapD');
var plates = [];
var activeRow = -1;
var rowLock = -1, rowLockUntil = 0;

rows.forEach(function (row) {
  var pl = document.createElement('div');
  pl.className = 'pl';
  pl.style.backgroundImage = 'url("' + row.getAttribute('data-img') + '")';
  if (scaleFrame) scaleFrame.appendChild(pl);
  plates.push(pl);

  row.querySelector('.row__btn').addEventListener('click', function () {
    var i = +row.getAttribute('data-i');
    /* Clicking pins that row briefly, then scroll takes over again. */
    rowLock = i;
    rowLockUntil = performance.now() + 2200;
    setRow(i);
  });
});

function setRow(i) {
  if (i === activeRow) return;
  activeRow = i;
  rows.forEach(function (r, k) { r.classList.toggle('is-on', k === i); });
  plates.forEach(function (p, k) { p.classList.toggle('is-on', k === i); });
  if (scaleCapN) scaleCapN.textContent = ('0' + (i + 1)).slice(-2);
  if (scaleCapT) scaleCapT.textContent = rows[i].querySelector('.row__t').textContent;
  if (scaleCapD) scaleCapD.textContent = rows[i].querySelector('.row__d').textContent;
}

/* ══════════════════════════════════════════════════════════════════════════
   WORK — vertical scroll becomes a horizontal rail
   ══════════════════════════════════════════════════════════════════════════ */
var workTrack = $('#workTrack');
var workRail  = $('#workRail');
var workShift = 0, workTarget = 0, workMax = 0;

/* ══════════════════════════════════════════════════════════════════════════
   MANIFESTO — words ignite across the scroll window
   ══════════════════════════════════════════════════════════════════════════ */
var igniteEl = $('[data-ignite]');
var igniteWords = igniteEl ? splitWords(igniteEl) : [];
var igniteLit = -1;

/* ══════════════════════════════════════════════════════════════════════════
   STAT COUNTERS
   ══════════════════════════════════════════════════════════════════════════ */
var stats = $$('[data-count]').map(function (el) {
  return { el: el, to: +el.getAttribute('data-count'), suffix: el.getAttribute('data-suffix') || '', run: false, from: 0, t0: 0 };
});

function runStat(s) {
  if (s.run) return;
  s.run = true;
  if (reduced) { s.el.textContent = s.to + s.suffix; return; }
  s.t0 = performance.now();
  (function step(now) {
    var t = clamp((now - s.t0) / 1400, 0, 1);
    s.el.textContent = Math.round(easeOut(t) * s.to) + s.suffix;
    if (t < 1) requestAnimationFrame(step);
  })(performance.now());
}

/* ══════════════════════════════════════════════════════════════════════════
   REVEALS
   ══════════════════════════════════════════════════════════════════════════ */
$$('[data-lines]').forEach(splitLines);

if ('IntersectionObserver' in window) {
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
  $$('[data-rev],[data-lines]').forEach(function (el) { io.observe(el); });
} else {
  $$('[data-rev],[data-lines]').forEach(function (el) { el.classList.add('is-in'); });
}

/* ── film: play only while on screen ────────────────────────────────────── */
var filmV = $('#filmV');
if (filmV && 'IntersectionObserver' in window) {
  new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        if (filmV.preload !== 'auto') filmV.preload = 'auto';
        var p = filmV.play();
        if (p && p.catch) p.catch(function () { /* autoplay refused — poster stands in */ });
      } else {
        filmV.pause();
      }
    });
  }, { threshold: 0.2 }).observe(filmV);
}

/* ══════════════════════════════════════════════════════════════════════════
   NAV
   ══════════════════════════════════════════════════════════════════════════ */
var nav = $('#nav');
var darkZones = [];
function measureDark() {
  darkZones = ['#manifesto', '#scale', '#film', '#work', '#start', '.foot'].map(function (sel) {
    var el = $(sel);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var top = r.top + window.scrollY;
    return [top, top + r.height];
  }).filter(Boolean);
}
var navHidden = false, lastY = 0;

/* ══════════════════════════════════════════════════════════════════════════
   GEOMETRY
   ══════════════════════════════════════════════════════════════════════════ */
var geo = { heroTop: 0, heroLen: 1, scaleTop: 0, scaleLen: 1, workTop: 0, workLen: 1, manTop: 0, manLen: 1, vh: 0 };

function measure() {
  geo.vh = window.innerHeight;
  sizeCanvas();

  if (heroTrack) {
    geo.heroTop = heroTrack.offsetTop;
    geo.heroLen = Math.max(1, heroTrack.offsetHeight - geo.vh);
  }
  if (scaleTrack) {
    geo.scaleTop = scaleTrack.getBoundingClientRect().top + window.scrollY;
    geo.scaleLen = Math.max(1, scaleTrack.offsetHeight - geo.vh);
  }
  if (workTrack && workRail) {
    geo.workTop = workTrack.getBoundingClientRect().top + window.scrollY;
    geo.workLen = Math.max(1, workTrack.offsetHeight - geo.vh);
    /* scrollWidth on a flex row drops the container's trailing padding, which
       would leave the last panel short of the edge. Measure the last child
       and add the gutter back explicitly. */
    var last = workRail.lastElementChild;
    var padR = parseFloat(getComputedStyle(workRail).paddingRight) || 0;
    workMax = last
      ? Math.max(0, last.offsetLeft + last.offsetWidth + padR - window.innerWidth)
      : Math.max(0, workRail.scrollWidth - window.innerWidth);
  }
  if (igniteEl) {
    var r = igniteEl.getBoundingClientRect();
    geo.manTop = r.top + window.scrollY;
    geo.manLen = r.height;
  }
  measureDark();
}

/* ══════════════════════════════════════════════════════════════════════════
   THE LOOP
   ══════════════════════════════════════════════════════════════════════════ */
var raf = null;
function tick() {
  var y = window.scrollY || window.pageYOffset;
  var now = performance.now();
  /* The single-file site bundle keeps every page in one document and shows
     one at a time. While a sub-page is showing, the one-pager is display:none
     — every measurement here would read zero and the nav would fight the
     static one. Undefined on the normal site, so this costs nothing there. */
  if (window.__NTT_ROUTE && window.__NTT_ROUTE !== 'home') { raf = null; return; }

  /* Set whenever an eased value is still short of its target. Scroll events
     stop the moment the wheel does, so without this the ease would freeze
     part-way — the canvas would hold a stale frame and the rail would stop
     short of its last panel. */
  var busy = false;

  /* ── hero ─────────────────────────────────────────────────────────────── */
  var p = clamp((y - geo.heroTop) / geo.heroLen, 0, 1);

  if (canvas && y < geo.heroTop + heroTrack.offsetHeight + geo.vh) {
    var target = p * (FRAME_COUNT - 1);
    /* Ease the index rather than the scroll: a fast flick reads as motion,
       not a jump cut. */
    easedIdx = reduced ? target : lerp(easedIdx, target, 0.18);
    if (Math.abs(easedIdx - target) < 0.02) easedIdx = target; else busy = true;
    paint(Math.round(clamp(easedIdx, 0, FRAME_COUNT - 1)));

    /* beats */
    /* beat 1 opens *before* p=0 so the wordmark is solid on arrival */
    var o1 = band(p, -0.10, -0.02, 0.10, 0.185);
    var o2 = band(p,  0.22, 0.30, 0.38, 0.455);
    var o3 = band(p,  0.47, 0.545, 0.625, 0.695);
    var o4 = band(p,  0.755, 0.83, 1.10, 1.20);
    var os = [o1, o2, o3, o4];
    for (var b = 0; b < 4; b++) {
      var el = beats[b];
      if (!el) continue;
      var o = os[b];
      el.style.opacity = o;
      var drift = (1 - o) * 22;
      el.style.transform = 'translate3d(0,' + (reduced ? 0 : drift) + 'px,0)';
      el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
    }
    /* beats 2 and 4 sit left, beat 3 sits right — wash the matching side */
    if (washL) washL.style.opacity = Math.max(o2, o4 * 0.72) * 0.96;
    if (washR) washR.style.opacity = o3 * 0.96;
    if (cue) cue.style.opacity = 1 - norm(p, 0.01, 0.07);

    /* counter */
    var v = p * 10;
    var vi = Math.floor(v + 1e-9);
    var vd = Math.floor((v - vi) * 10 + 1e-9);
    var packed = vi * 10 + vd;
    if (packed !== lastCount) {
      lastCount = packed;
      countN.textContent = vi;
      countD.textContent = vd;
    }

    /* rail */
    if (railFill) railFill.style.height = (p * 100) + '%';
    var tk = Math.round(p * 10);
    if (tk !== lastTick) {
      lastTick = tk;
      for (var ti = 0; ti < tickEls.length; ti++) {
        /* ticks render 10 → 00 top to bottom */
        tickEls[ti].classList.toggle('is-on', (10 - ti) === tk);
      }
    }

    /* readouts */
    var seq = Math.round(clamp(easedIdx, 0, FRAME_COUNT - 1)) + 1;
    if (seq !== lastSeq) {
      lastSeq = seq;
      hudSeq.textContent = ('00' + seq).slice(-3) + ' / ' + FRAME_COUNT;
    }
    var ph = p < 0.2 ? 0 : p < 0.46 ? 1 : p < 0.72 ? 2 : 3;
    if (ph !== lastPhase) { lastPhase = ph; hudPhase.textContent = PHASES[ph]; }
  }

  /* ── manifesto ignition ───────────────────────────────────────────────── */
  if (igniteWords.length) {
    var mp = clamp((y + geo.vh * 0.86 - geo.manTop) / (geo.manLen + geo.vh * 0.36), 0, 1);
    /* Finish the sentence with window to spare — the last words should be lit
       well before the paragraph leaves, not exactly as it does. */
    var lit = Math.round(clamp(mp / 0.78, 0, 1) * igniteWords.length);
    if (lit !== igniteLit) {
      var lo = Math.min(lit, igniteLit), hi = Math.max(lit, igniteLit);
      if (igniteLit < 0) { lo = 0; hi = igniteWords.length; }
      for (var wi = lo; wi < hi; wi++) {
        if (igniteWords[wi]) igniteWords[wi].classList.toggle('is-on', wi < lit);
      }
      igniteLit = lit;
    }
  }

  /* ── stats ────────────────────────────────────────────────────────────── */
  for (var si = 0; si < stats.length; si++) {
    if (stats[si].run) continue;
    var sr = stats[si].el.getBoundingClientRect();
    if (sr.top < geo.vh * 0.9 && sr.bottom > 0) runStat(stats[si]);
  }

  /* ── the scale ────────────────────────────────────────────────────────── */
  if (scaleTrack && rows.length) {
    var sq = clamp((y - geo.scaleTop) / geo.scaleLen, 0, 1);
    if (now > rowLockUntil) {
      rowLock = -1;
      var padded = clamp((sq - 0.03) / 0.9, 0, 0.9999);
      setRow(Math.floor(padded * rows.length));
    } else if (rowLock >= 0) {
      setRow(rowLock);
    }
  }

  /* ── work rail ────────────────────────────────────────────────────────── */
  if (workRail && workMax > 0) {
    var wq = clamp((y - geo.workTop) / geo.workLen, 0, 1);
    workTarget = -workMax * wq;
    workShift = reduced ? workTarget : lerp(workShift, workTarget, 0.12);
    if (Math.abs(workShift - workTarget) < 0.4) workShift = workTarget; else busy = true;
    workRail.style.transform = 'translate3d(' + workShift.toFixed(2) + 'px,0,0)';
  }

  /* ── nav ──────────────────────────────────────────────────────────────── */
  var probe = y + 42;
  var isDark = false;
  for (var di = 0; di < darkZones.length; di++) {
    if (probe >= darkZones[di][0] && probe < darkZones[di][1]) { isDark = true; break; }
  }
  nav.classList.toggle('is-dark', isDark);
  nav.classList.toggle('is-solid', y > geo.vh * 0.5);

  /* hide on the way down, show on the way up — but never over the hero */
  var dy = y - lastY;
  if (y > geo.vh * 1.2 && dy > 4 && !navHidden) { navHidden = true; nav.classList.remove('is-in'); }
  else if ((dy < -4 || y < geo.vh) && navHidden) { navHidden = false; nav.classList.add('is-in'); }
  if (Math.abs(dy) > 1) lastY = y;

  raf = busy ? requestAnimationFrame(tick) : null;
}

function schedule() { if (raf === null) raf = requestAnimationFrame(tick); }

/* Geometry has to be retaken after the one-pager is shown again in the
   bundle, since everything measured to zero while it was hidden. */
window.__NTT_REMEASURE = function () { measure(); schedule(); };

window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', function () { measure(); schedule(); });
window.addEventListener('orientationchange', function () { setTimeout(function () { measure(); schedule(); }, 250); });

/* ══════════════════════════════════════════════════════════════════════════
   FORM
   Posts to Netlify Forms — a urlencoded POST to this page's own path, which
   Netlify accepts because it read the form's markup at deploy time. No
   endpoint to configure, and no third-party request on page load: the browser
   only talks to this domain, and only once someone submits.

   Spam is caught by a honeypot input rather than a CAPTCHA. A CAPTCHA would
   pull in a third party, an international transfer and terminal-equipment
   access needing consent; a hidden field costs none of that.
   ══════════════════════════════════════════════════════════════════════════ */
var form = $('#form'), note = $('#formNote');
if (form) {
  var btn = form.querySelector('button[type=submit]');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#fName'), mail = $('#fMail');
    var bad = [];
    if (!name.value.trim()) bad.push(name);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.value.trim())) bad.push(mail);

    $$('.field', form).forEach(function (f) { f.classList.remove('is-bad'); });
    note.classList.remove('is-good', 'is-bad');

    if (bad.length) {
      bad.forEach(function (i) { i.closest('.field').classList.add('is-bad'); });
      note.textContent = 'A name and a working email, and we are away.';
      note.classList.add('is-bad');
      bad[0].focus();
      return;
    }

    note.textContent = 'Sending…';
    if (btn) btn.disabled = true;

    fetch(form.getAttribute('action') || window.location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString()
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      form.classList.add('is-sent');
      note.textContent = 'Received. You will hear back within two working days.';
      note.classList.add('is-good');
    }).catch(function () {
      /* offline copy, or the post failed — never pretend it arrived */
      if (btn) btn.disabled = false;
      note.innerHTML = 'That did not send. Email <a href="mailto:naughttoten@hotmail.com">' +
                       'naughttoten@hotmail.com</a> and it will reach us.';
      note.classList.add('is-bad');
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   START
   ══════════════════════════════════════════════════════════════════════════ */
$$('.lede__l[data-split]').forEach(function (el) {
  ledeChars = ledeChars.concat(splitChars(el));
});
ledeChars.forEach(function (c) { c.style.transform = 'translateY(105%)'; c.style.opacity = '0'; });

document.body.classList.add('is-booting');
measure();
loadFrames();

/* Re-measure once webfonts settle — line boxes move. */
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(function () { measure(); schedule(); });
}
window.addEventListener('load', function () { measure(); schedule(); });

})();
