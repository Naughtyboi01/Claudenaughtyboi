/* ═══════════════════════════════════════════════════════════════════
   FrostByte® — scroll choreography

   The hero pins for 300vh and maps that range onto the campaign film's
   full 0–5.04s. Nothing here animates a layout property: the film is
   driven by currentTime, everything else by transform and opacity only.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var root = document.documentElement;
  var hero = document.getElementById('hero');
  var pin = hero && hero.querySelector('.hero__pin');
  var video = document.getElementById('heroVideo');
  var chrome = document.getElementById('heroChrome');
  var wordmark = document.getElementById('heroWordmark');

  if (!hero || !pin || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  var reduced = root.classList.contains('reduced-motion');
  var staticHero = root.classList.contains('static-hero');

  /* Nominal duration of the supplied clip; replaced by the real value as
     soon as metadata lands. */
  var FILM_DURATION = 5.041667;

  /* ── will-change, applied only while something is actually moving ── */

  function markAnimating(els, on) {
    for (var i = 0; i < els.length; i++) {
      if (!els[i]) continue;
      els[i].classList.toggle('is-animating', on);
    }
  }

  /* ═══════════════  the film  ═══════════════════════════════════════ */

  var scrubEnabled = !staticHero && !!video;
  var targetTime = 0;
  var appliedTime = -1;
  var seeking = false;
  var seekStartedAt = 0;
  var seekFailures = 0;
  var rafId = 0;

  function goStatic(reason) {
    if (!scrubEnabled) return;
    scrubEnabled = false;
    root.classList.add('static-hero');
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (video) { video.removeAttribute('src'); video.load(); }
    if (window.console && console.info) {
      console.info('[FrostByte] scrub disabled — ' + reason + '; showing the poster frame.');
    }
  }

  if (scrubEnabled) {
    video.addEventListener('loadedmetadata', function () {
      if (video.duration && isFinite(video.duration)) FILM_DURATION = video.duration;
      ScrollTrigger.refresh();
    });

    video.addEventListener('seeked', function () {
      seeking = false;
      seekFailures = 0;
    });

    video.addEventListener('error', function () { goStatic('the film failed to load'); });

    /* Seeks are applied on a rAF pump rather than straight from the scroll
       handler: assigning currentTime faster than the decoder can answer
       queues seeks up and the scrub visibly lags behind the wheel. */
    var pump = function () {
      rafId = requestAnimationFrame(pump);
      if (!scrubEnabled || video.readyState < 2) return;

      if (seeking && performance.now() - seekStartedAt > 400) {
        /* the decoder never answered — count it, and give up after a few */
        seeking = false;
        if (++seekFailures >= 4) { goStatic('seeking is unreliable here'); return; }
      }

      if (!seeking && Math.abs(targetTime - appliedTime) > 0.008) {
        appliedTime = targetTime;
        seeking = true;
        seekStartedAt = performance.now();
        try {
          video.currentTime = targetTime;
        } catch (err) {
          goStatic('the browser refused the seek');
        }
      }
    };

    /* H.264 first — it has hardware decode almost everywhere, which is what
       makes seeking cheap. VP9 covers builds shipped without the
       proprietary codecs (Chromium on Linux, most notably). */
    var mp4 = video.canPlayType('video/mp4; codecs="avc1.4d401f"');
    video.src = (mp4 === 'probably' || mp4 === 'maybe')
      ? video.getAttribute('data-src')
      : video.getAttribute('data-src-webm');
    video.load();
    rafId = requestAnimationFrame(pump);
  }

  /* ═══════════════  hero timeline  ══════════════════════════════════ */

  var onyx = hero.querySelector('.callout--onyx');
  var garnet = hero.querySelector('.callout--garnet');
  var movers = [chrome, wordmark, onyx, garnet];

  var slide = reduced ? 0 : 1;   /* reduced motion keeps the cue, drops the travel */

  var tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: 'bottom bottom',
      pin: pin,
      pinSpacing: false,
      scrub: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: function (self) {
        targetTime = self.progress * FILM_DURATION;
      },
      onToggle: function (self) {
        markAnimating(movers, self.isActive);
      }
    }
  });

  /* Chrome and wordmark hold, then leave over the final 20% of the pin.
     The wordmark is tweened on its own so nothing wraps it in an extra
     stacking context — that would isolate its difference blend. */
  tl.to(chrome, { opacity: 0, duration: 0.2 }, 0.8)
    .to(wordmark, { opacity: 0, duration: 0.2 }, 0.8);

  /* 01 — black onyx, upper hand. Fully resolved at 40% progress. */
  tl.fromTo(onyx,
      { opacity: 0, x: 18 * slide },
      { opacity: 1, x: 0, duration: 0.1 }, 0.30)
    .fromTo(onyx.querySelector('.callout__rule'),
      { scaleX: 0 },
      { scaleX: 1, duration: 0.1 }, 0.32)
    .to(onyx, { opacity: 0, x: 14 * slide, duration: 0.06 }, 0.52);

  /* 04 — garnet signet, lower hand. Fully resolved at 70% progress. */
  tl.fromTo(garnet,
      { opacity: 0, x: -18 * slide },
      { opacity: 1, x: 0, duration: 0.1 }, 0.60)
    .fromTo(garnet.querySelector('.callout__rule'),
      { scaleX: 0 },
      { scaleX: 1, duration: 0.1 }, 0.62)
    .to(garnet, { opacity: 0, x: -14 * slide, duration: 0.06 }, 0.84);

  /* ═══════════════  section reveals  ════════════════════════════════ */

  if (!reduced) {
    var reveals = document.querySelectorAll(
      '.statement > *, .section-head, .card, .note, .craft__fig, .footer__grid, .footer__mark'
    );

    reveals.forEach(function (el) {
      gsap.set(el, { opacity: 0, y: 22 });
      ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: function () {
          el.classList.add('is-animating');
          gsap.to(el, {
            opacity: 1,
            y: 0,
            duration: 1.05,
            ease: 'expo.out',
            onComplete: function () { el.classList.remove('is-animating'); }
          });
        }
      });
    });
  }

  /* Fonts change metrics, which changes where every trigger sits. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }

  window.addEventListener('pagehide', function () {
    if (rafId) cancelAnimationFrame(rafId);
  });
})();
