/* ORLEY — Continuum
 *
 * One requestAnimationFrame loop drives the hero. Scroll stays native: the
 * page is not transform-hijacked, so sticky positioning, the scrollbar, the
 * trackpad and the keyboard all behave normally. Smoothing is applied to the
 * animated values instead — the drawn frame index eases toward its
 * scroll-derived target, so a fast flick reads as motion blur rather than a
 * jump cut.
 *
 * The film is a decoded frame sequence painted to a canvas rather than a
 * <video> scrubbed by currentTime. The master is HEVC, which most browsers
 * cannot decode at all, and video seeking snaps to keyframes on mobile
 * Safari. Stills are frame-exact everywhere.
 */
(function () {
  'use strict';

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- helpers

  function clamp(v, lo, hi) {
    lo = lo === undefined ? 0 : lo;
    hi = hi === undefined ? 1 : hi;
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* 0 below edge0, 1 above edge1, smooth between. */
  function span(v, edge0, edge1) {
    if (edge1 === edge0) return v < edge0 ? 0 : 1;
    var t = clamp((v - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  function easeIO(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function fitCanvas(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w: w, h: h, dpr: dpr, cssW: r.width, cssH: r.height };
  }

  // ------------------------------------------------------- the frame set

  /* backdrop.js is generated alongside the frames and carries one entry per
     frame, so it is also the frame count — no second source to keep in sync. */
  var BACKDROP = window.__ORLEY_BACKDROP || null;

  /* The single-file build sets __ORLEY_FRAMES to an array of data URIs. This
     one hook is what lets the offline bundle exist without a forked copy of
     this file to keep in step. */
  var EMBEDDED = window.__ORLEY_FRAMES || null;

  var FRAMES = EMBEDDED ? EMBEDDED.length
             : BACKDROP ? BACKDROP.length : 151;
  var PRIORITY = 26;          // enough to cover the aperture opening
  var BOOT_TIMEOUT = 9000;

  function pickSet() {
    var c = navigator.connection || {};
    if (c.saveData) return 'sm';
    if (/(^|[^0-9])2g$/.test(c.effectiveType || '')) return 'sm';
    var w = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2);
    return w < 1100 ? 'sm' : 'lg';
  }

  var setName = pickSet();
  var images = new Array(FRAMES);
  var ready = new Array(FRAMES);
  var readyCount = 0;

  function src(i) {
    if (EMBEDDED) return EMBEDDED[i];
    var n = String(i);
    while (n.length < 4) n = '0' + n;
    return 'assets/seq/' + setName + '/' + n + '.webp';
  }

  /* The closest decoded frame to i, so scrubbing never blanks out while the
     rest of the sequence is still streaming in. */
  function nearestReady(i) {
    if (ready[i]) return images[i];
    for (var d = 1; d < FRAMES; d++) {
      if (i - d >= 0 && ready[i - d]) return images[i - d];
      if (i + d < FRAMES && ready[i + d]) return images[i + d];
    }
    return null;
  }

  // --------------------------------------------------------------- preload

  var boot = document.getElementById('boot');
  var bootFill = document.getElementById('bootFill');
  var bootPct = document.getElementById('bootPct');
  var booted = false;
  var priorityLoaded = 0;

  function dismissBoot() {
    if (booted) return;
    booted = true;
    if (bootFill) bootFill.style.width = '100%';
    if (bootPct) bootPct.textContent = '100%';
    if (boot) boot.classList.add('is-done');
  }

  function load(i, priority) {
    var img = new Image();
    img.decoding = 'async';
    images[i] = img;
    img.onload = img.onerror = function () {
      if (!ready[i]) {
        ready[i] = true;
        readyCount++;
        if (priority) {
          priorityLoaded++;
          var pct = Math.round((priorityLoaded / PRIORITY) * 100);
          if (bootFill) bootFill.style.width = pct + '%';
          if (bootPct) bootPct.textContent = pct + '%';
          if (priorityLoaded >= PRIORITY) {
            dismissBoot();
            rest();
          }
        }
      }
    };
    img.src = src(i);
  }

  var restStarted = false;
  function rest() {
    if (restStarted) return;
    restStarted = true;
    for (var i = PRIORITY; i < FRAMES; i++) load(i, false);
  }

  for (var i = 0; i < PRIORITY; i++) load(i, true);
  setTimeout(function () { dismissBoot(); rest(); }, BOOT_TIMEOUT);

  // ------------------------------------------------------------ the hero

  var track = document.getElementById('heroTrack');
  var canvas = document.getElementById('heroCanvas');
  var cue = document.getElementById('heroCue');
  var word = document.getElementById('heroWord');
  var beats = [
    document.getElementById('beat1'),
    document.getElementById('beat2'),
    document.getElementById('beat3'),
    document.getElementById('beat4')
  ];
  var ctx = canvas ? canvas.getContext('2d') : null;

  /* Where each beat lives on the hero's 0..1 scroll. Beat 1 opens before 0
     so the title is already on screen when the page arrives. Beat 3 lands
     just after the film's own mosaic dissolve at p≈0.56. */
  var BEATS = [
    { in0: -0.05, in1: 0.005, out0: 0.085, out1: 0.130 },
    { in0: 0.200, in1: 0.265, out0: 0.380, out1: 0.440 },
    { in0: 0.600, in1: 0.660, out0: 0.720, out1: 0.780 },
    { in0: 0.840, in1: 0.900, out0: 1.200, out1: 1.300 }
  ];

  var OPEN_END = 0.130;    // aperture reaches full bleed
  var CLOSE_AT = 0.800;    // aperture starts closing again
  var RATIO = 2.9;         // width to height of the closed lens

  var frameNow = 0;        // eased, what is actually painted
  var apNow = -1;          // eased aperture parameter

  var stage = track ? track.firstElementChild : null;
  var lastBackdrop = '';

  /* Paint the area outside the aperture with the studio backdrop as it is in
     the frame currently showing, interpolated between frames. */
  function syncBackdrop(f) {
    if (!BACKDROP || !stage) return;
    var i = Math.floor(f);
    var a = BACKDROP[Math.max(0, Math.min(BACKDROP.length - 1, i))];
    var b = BACKDROP[Math.max(0, Math.min(BACKDROP.length - 1, i + 1))];
    if (!a) return;
    var t = f - i;
    var css = 'rgb(' +
      Math.round(lerp(a[0], b[0], t)) + ',' +
      Math.round(lerp(a[1], b[1], t)) + ',' +
      Math.round(lerp(a[2], b[2], t)) + ')';
    if (css !== lastBackdrop) {
      lastBackdrop = css;
      stage.style.setProperty('--stage-bg', css);
    }
  }

  /* The lens silhouette. Degenerates to the plain viewport rectangle when
     radius, notch and arc all reach zero, which is what lets the shield open
     into a full-bleed frame without a shape change. */
  function aperturePath(c, cx, cy, w, h, r, notch, arc) {
    var x0 = cx - w / 2, x1 = cx + w / 2;
    var y0 = cy - h / 2, y1 = cy + h / 2;
    r = Math.min(r, w / 2, h / 2);

    c.beginPath();
    c.moveTo(x0 + r, y0);
    if (arc > 0.5) c.quadraticCurveTo(cx, y0 - arc * 2, x1 - r, y0);
    else c.lineTo(x1 - r, y0);
    c.quadraticCurveTo(x1, y0, x1, y0 + r);
    c.lineTo(x1, y1 - r);
    c.quadraticCurveTo(x1, y1, x1 - r, y1);
    if (notch > 0.5) {
      var nw = Math.min(w * 0.17, h * 0.9);
      c.lineTo(cx + nw, y1);
      c.quadraticCurveTo(cx, y1 - notch * 2.4, cx - nw, y1);
    }
    c.lineTo(x0 + r, y1);
    c.quadraticCurveTo(x0, y1, x0, y1 - r);
    c.lineTo(x0, y0 + r);
    c.quadraticCurveTo(x0, y0, x0 + r, y0);
    c.closePath();
  }

  function drawHero(p, dims) {
    var W = dims.w, H = dims.h;
    ctx.clearRect(0, 0, W, H);

    /* Closed geometry: wide and shallow with near-stadium ends, which is
       what separates a lens from a goggle. The floor keeps it from becoming
       a slot on a narrow phone. */
    var wClosed = Math.min(Math.max(W * 0.54, 260), W * 0.88, H * 1.62);
    var hClosed = wClosed / RATIO;

    /* Opening keeps the lens proportion the whole way and simply grows until
       it covers the viewport, rather than lerping width and height to W and
       H independently — that route passes through a portrait rectangle on a
       phone, which stops looking like a lens somewhere in the middle. At
       wCover the shape is at least as wide as the viewport and at least as
       tall, so it reads as full bleed with nothing left to interpolate. */
    var wCover = Math.max(W, H * RATIO);

    var w, h, r, notch, arc;
    if (p < OPEN_END) {
      var e = easeIO(clamp(p / OPEN_END));
      w = lerp(wClosed, wCover, e);
      h = w / RATIO;
      r = lerp(hClosed * 0.46, 0, e);
      notch = lerp(hClosed * 0.10, 0, e);
      arc = lerp(hClosed * 0.09, 0, e);
    } else if (p < CLOSE_AT) {
      w = wCover; h = wCover / RATIO; r = 0; notch = 0; arc = 0;
    } else {
      var e2 = easeIO(clamp((p - CLOSE_AT) / (1 - CLOSE_AT)));
      var wEnd = Math.min(Math.max(W * 0.80, 300), W * 0.94, H * 2.25);
      var hEnd = wEnd / RATIO;
      w = lerp(wCover, wEnd, e2);
      h = w / RATIO;
      r = lerp(0, hEnd * 0.46, e2);
      notch = lerp(0, hEnd * 0.09, e2);
      arc = lerp(0, hEnd * 0.07, e2);
    }

    var cx = W / 2;
    var cy = H / 2;

    var img = nearestReady(Math.round(frameNow));
    if (!img || !img.naturalWidth) return;

    c2d_clipDraw(img, W, H, cx, cy, w, h, r, notch, arc);
  }

  function c2d_clipDraw(img, W, H, cx, cy, w, h, r, notch, arc) {
    ctx.save();
    aperturePath(ctx, cx, cy, w, h, r, notch, arc);
    ctx.clip();

    /* Cover-fit the frame across the whole canvas, not just the aperture, so
       a small shield reads as a window onto the scene rather than a
       thumbnail of it. Biased slightly above centre to keep the face and the
       product in frame when a tall viewport crops the 16:9 master. */
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var s = Math.max(W / iw, H / ih);
    var dw = iw * s, dh = ih * s;
    ctx.drawImage(img, (W - dw) * 0.5, (H - dh) * 0.42, dw, dh);
    ctx.restore();

    /* A hairline on the aperture edge while it is actually a shield. Keeps
       the cut legible against the studio grey behind it. */
    if (r > 0.5) {
      ctx.save();
      aperturePath(ctx, cx, cy, w, h, r, notch, arc);
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = Math.max(1, H * 0.0016);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ------------------------------------------------- reveal, sweep, worn

  var root = document.documentElement;
  var wornLine = document.getElementById('wornLine');

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(document.querySelectorAll('.rise'), function (el) {
      io.observe(el);
    });
  } else {
    Array.prototype.forEach.call(document.querySelectorAll('.rise'), function (el) {
      el.classList.add('is-in');
    });
  }

  // ------------------------------------------------------------- the loop

  var lastP = -1;

  function frame() {
    // Page sweep: the studio backdrop brightens from top to bottom.
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    var sweep = docH > 0 ? clamp(window.scrollY / docH) : 0;
    root.style.setProperty('--sweep', sweep.toFixed(4));

    if (track && ctx) {
      var stageH = track.firstElementChild.offsetHeight;
      var total = track.offsetHeight - stageH;
      var top = track.getBoundingClientRect().top;
      var p = total > 0 ? clamp(-top / total) : 0;

      // Ease the painted frame toward the scroll target.
      var target = p * (FRAMES - 1);
      frameNow = reduced ? target : frameNow + (target - frameNow) * 0.18;
      if (Math.abs(target - frameNow) < 0.01) frameNow = target;

      var ap = reduced ? p : (apNow < 0 ? p : apNow + (p - apNow) * 0.22);
      apNow = ap;

      var dims = fitCanvas(canvas);
      syncBackdrop(frameNow);
      drawHero(ap, dims);

      // Beats
      for (var b = 0; b < BEATS.length; b++) {
        var cfg = BEATS[b];
        var o = span(p, cfg.in0, cfg.in1) * (1 - span(p, cfg.out0, cfg.out1));
        var el = beats[b];
        if (el) {
          el.style.opacity = o.toFixed(3);
          el.style.transform = 'translateY(' + ((1 - o) * 14).toFixed(2) + 'px)';
        }
      }

      /* The wordmark widens as the aperture opens. Archivo carries a real
         width axis, so this is the letterforms changing shape rather than a
         horizontal scale. */
      if (word) {
        var wp = easeIO(clamp(p / OPEN_END));
        word.style.fontStretch = lerp(62, 122, wp).toFixed(1) + '%';
        word.style.letterSpacing = lerp(0.17, -0.012, wp).toFixed(4) + 'em';
      }

      if (cue) cue.style.opacity = (1 - span(p, 0.01, 0.06)).toFixed(3);

      lastP = p;
    }

    // The same width device once more, on the worn headline.
    if (wornLine) {
      var wr = wornLine.getBoundingClientRect();
      if (wr.top < window.innerHeight && wr.bottom > 0) {
        var t = clamp(1 - (wr.top / window.innerHeight));
        wornLine.style.fontStretch = lerp(72, 116, easeIO(t)).toFixed(1) + '%';
      }
    }

    requestAnimationFrame(frame);
  }

  if (canvas) requestAnimationFrame(frame);

  // ------------------------------------------------------------- spectrum

  /* Transmission and reflection of a blue dielectric mirror over a light
     grey base tint, as percentages of incident light at each wavelength.
     Piecewise-linear control points, interpolated smoothly. */
  var T_CURVE = [
    [380, 0.000], [400, 0.004], [420, 0.045], [440, 0.062], [470, 0.078],
    [490, 0.090], [520, 0.118], [545, 0.140], [570, 0.152], [585, 0.112],
    [600, 0.126], [625, 0.170], [655, 0.196], [680, 0.208], [700, 0.212]
  ];
  var R_CURVE = [
    [380, 0.300], [420, 0.560], [450, 0.742], [480, 0.700], [510, 0.520],
    [550, 0.380], [600, 0.300], [650, 0.262], [700, 0.240]
  ];

  function sample(curve, nm) {
    if (nm <= curve[0][0]) return curve[0][1];
    var last = curve[curve.length - 1];
    if (nm >= last[0]) return last[1];
    for (var i = 1; i < curve.length; i++) {
      if (nm <= curve[i][0]) {
        var a = curve[i - 1], b = curve[i];
        var t = (nm - a[0]) / (b[0] - a[0]);
        return lerp(a[1], b[1], t * t * (3 - 2 * t));
      }
    }
    return last[1];
  }

  /* Approximate visible-spectrum colour for a wavelength. */
  function nmToRGB(nm) {
    var r = 0, g = 0, b = 0;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else { r = 1; }
    var f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40
          : nm > 680 ? 0.3 + 0.7 * (700 - nm) / 20 : 1;
    return [
      Math.round(255 * Math.pow(clamp(r * f), 0.8)),
      Math.round(255 * Math.pow(clamp(g * f), 0.8)),
      Math.round(255 * Math.pow(clamp(b * f), 0.8))
    ];
  }

  var NM0 = 380, NM1 = 700;
  var PAD_L = 34;          // CSS px reserved for the percentage axis
  var specWrap = document.getElementById('spectrum');
  var specCanvas = document.getElementById('spectrumCanvas');
  var roNm = document.getElementById('roNm');
  var roT = document.getElementById('roT');
  var roR = document.getElementById('roR');
  var cursorNm = 452;
  var hasCursor = false;

  function drawSpectrum() {
    if (!specCanvas) return;
    var c = specCanvas.getContext('2d');
    var d = fitCanvas(specCanvas);
    var W = d.w, H = d.h, dpr = d.dpr;
    c.clearRect(0, 0, W, H);

    var padT = 16 * dpr, padB = 30 * dpr, padL = PAD_L * dpr;
    var plotH = H - padT - padB;
    var plotW = W - padL;
    var x = function (nm) { return padL + ((nm - NM0) / (NM1 - NM0)) * plotW; };
    var y = function (frac) { return padT + plotH * (1 - frac); };

    /* Two layers. The washed column is all the light that arrives at this
       wavelength; the saturated one is the part that gets past the lens. The
       gap between them is the answer to the question in the heading. */
    for (var px = 0; px < plotW; px++) {
      var nm = NM0 + (px / plotW) * (NM1 - NM0);
      var t = sample(T_CURVE, nm);
      var rgb = nmToRGB(nm);
      var col = rgb[0] + ',' + rgb[1] + ',' + rgb[2];

      c.fillStyle = nm < 400 ? 'rgba(16,17,20,.10)' : 'rgba(' + col + ',.13)';
      c.fillRect(padL + px, padT, 1, plotH);

      if (t > 0) {
        c.fillStyle = 'rgb(' + col + ')';
        c.fillRect(padL + px, y(t), 1, y(0) - y(t));
      }
    }

    // Percentage gridlines.
    c.strokeStyle = 'rgba(16,17,20,.13)';
    c.lineWidth = 1 * dpr;
    c.fillStyle = '#7c7f86';
    c.font = (9 * dpr) + 'px "Martian Mono", monospace';
    c.textAlign = 'right';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      c.beginPath();
      c.moveTo(padL, y(f)); c.lineTo(W, y(f)); c.stroke();
      c.fillText(Math.round(f * 100) + '%', padL - 7 * dpr, y(f) + 3.5 * dpr);
    });

    // The transmission curve itself, so the notch at 585 nm is readable.
    c.beginPath();
    for (var px2 = 0; px2 <= plotW; px2++) {
      var nm2 = NM0 + (px2 / plotW) * (NM1 - NM0);
      var yy = y(sample(T_CURVE, nm2));
      if (px2 === 0) c.moveTo(padL + px2, yy); else c.lineTo(padL + px2, yy);
    }
    c.strokeStyle = '#101114';
    c.lineWidth = 1.5 * dpr;
    c.stroke();

    // Baseline and the 400 nm cut.
    c.strokeStyle = 'rgba(16,17,20,.28)';
    c.lineWidth = 1 * dpr;
    c.beginPath(); c.moveTo(padL, y(0)); c.lineTo(W, y(0)); c.stroke();

    c.setLineDash([3 * dpr, 3 * dpr]);
    c.beginPath(); c.moveTo(x(400), padT); c.lineTo(x(400), y(0)); c.stroke();
    c.setLineDash([]);

    // Axis ticks.
    c.fillStyle = '#4a4c52';
    c.font = (9.5 * dpr) + 'px "Martian Mono", monospace';
    [400, 450, 500, 550, 600, 650, 700].forEach(function (nm) {
      // The last tick sits on the right edge, so it hangs off unless aligned
      // into the plot.
      c.textAlign = nm === NM1 ? 'right' : 'center';
      c.fillText(String(nm), x(nm), H - 10 * dpr);
    });
    c.textAlign = 'left';
    c.fillText('nm', padL + 2 * dpr, H - 10 * dpr);
    c.fillStyle = '#7c7f86';
    c.save();
    c.translate(x(390), padT + 14 * dpr);
    c.fillText('UV', 0, 0);
    c.restore();

    // Cursor. Shown from the start at the deepest point of the block, so the
    // readout carries real numbers before anyone touches it.
    if (hasCursor) {
      var cxp = x(cursorNm);
      c.strokeStyle = '#005a96';
      c.lineWidth = 1.4 * dpr;
      c.beginPath(); c.moveTo(cxp, padT); c.lineTo(cxp, y(0)); c.stroke();
      var tv = sample(T_CURVE, cursorNm);
      c.fillStyle = '#005a96';
      c.beginPath(); c.arc(cxp, y(tv), 4 * dpr, 0, Math.PI * 2); c.fill();
    }
  }

  function setCursor(nm) {
    cursorNm = clamp(nm, NM0, NM1);
    hasCursor = true;
    var t = sample(T_CURVE, cursorNm);
    var r = sample(R_CURVE, cursorNm);
    if (roNm) roNm.textContent = Math.round(cursorNm) + ' nm';
    if (roT) roT.textContent = (t * 100).toFixed(1) + '%';
    if (roR) roR.textContent = Math.round(r * 100) + '%';
    if (specWrap) {
      specWrap.setAttribute('aria-valuenow', String(Math.round(cursorNm)));
      specWrap.setAttribute('aria-valuetext',
        Math.round(cursorNm) + ' nanometres, transmits ' + (t * 100).toFixed(1) +
        ' percent, reflects ' + Math.round(r * 100) + ' percent');
    }
    drawSpectrum();
  }

  if (specWrap && specCanvas) {
    var nmAt = function (clientX) {
      var r = specCanvas.getBoundingClientRect();
      return NM0 + clamp((clientX - r.left - PAD_L) / (r.width - PAD_L)) *
        (NM1 - NM0);
    };
    specWrap.addEventListener('pointermove', function (e) {
      setCursor(nmAt(e.clientX));
    });
    specWrap.addEventListener('pointerdown', function (e) {
      specWrap.setPointerCapture(e.pointerId);
      setCursor(nmAt(e.clientX));
    });
    specWrap.addEventListener('pointerleave', function () {
      setCursor(452);          // back to the default reading
    });
    specWrap.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 25 : 5;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        setCursor(cursorNm - step); e.preventDefault();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        setCursor(cursorNm + step); e.preventDefault();
      } else if (e.key === 'Home') {
        setCursor(NM0); e.preventDefault();
      } else if (e.key === 'End') {
        setCursor(NM1); e.preventDefault();
      }
    });
    specWrap.addEventListener('focus', function () { setCursor(cursorNm); });
    setCursor(452);
  }

  // ------------------------------------------------------- legend and dots

  var legend = document.getElementById('legend');
  var draft = document.getElementById('draft');

  if (legend && draft) {
    var marks = draft.querySelectorAll('.draft__mk');
    var setActive = function (idx) {
      Array.prototype.forEach.call(marks, function (m) {
        m.classList.toggle('is-active', m.getAttribute('data-dot') === String(idx));
      });
    };
    var clear = function () {
      Array.prototype.forEach.call(marks, function (m) {
        m.classList.remove('is-active');
      });
    };
    Array.prototype.forEach.call(legend.querySelectorAll('.legend__btn'), function (btn) {
      var idx = btn.getAttribute('data-dot');
      btn.addEventListener('pointerenter', function () { setActive(idx); });
      btn.addEventListener('focus', function () { setActive(idx); });
      btn.addEventListener('click', function () { setActive(idx); });
      btn.addEventListener('blur', clear);
    });
    legend.addEventListener('pointerleave', clear);
  }

  // ---------------------------------------------------------------- reserve

  var form = document.getElementById('reserveForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('email');
      var note = document.getElementById('reserveNote');
      var value = (input.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        input.focus();
        note.textContent = 'That address is missing something — check it and try again.';
        note.className = 'reserve__note';
        return;
      }
      form.innerHTML =
        '<p class="reserve__ok">Reserved — ' + value.replace(/[<>&]/g, '') + '</p>' +
        '<p class="reserve__note">You are on the list for the first run. ' +
        'We email once, when it ships.</p>';
    });
  }

  // ----------------------------------------------------------------- resize

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      drawSpectrum();
      if (EMBEDDED) return;      // one set only; nothing to upgrade to
      var next = pickSet();
      if (next !== setName && next === 'lg') {
        // Only ever upgrade: never re-download a smaller set mid-session.
        setName = next;
        for (var i = 0; i < FRAMES; i++) { ready[i] = false; }
        readyCount = 0;
        restStarted = false;
        for (var j = 0; j < PRIORITY; j++) load(j, false);
        rest();
      }
    }, 180);
  });
})();
