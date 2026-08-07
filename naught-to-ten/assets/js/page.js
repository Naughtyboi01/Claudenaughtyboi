/* ==========================================================================
   Naught to Ten — sub-page behaviour
   The one-pager's main.js is all scroll choreography and frame decoding, none
   of which these pages have. This is the small remainder they do need.
   ========================================================================== */
(function () {
'use strict';

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

/* ── reveals ────────────────────────────────────────────────────────────── */
if ('IntersectionObserver' in window) {
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  $$('[data-rev]').forEach(function (el) { io.observe(el); });
} else {
  $$('[data-rev]').forEach(function (el) { el.classList.add('is-in'); });
}

/* ── enquiry form ───────────────────────────────────────────────────────────
   Client side only — nothing leaves the page. Wire it to a real endpoint
   before launch; the privacy notice describes it as it stands today.
   ────────────────────────────────────────────────────────────────────────── */
var form = $('#contactForm'), note = $('#formNote');
if (form) {
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#fName'), mail = $('#fMail');
    var bad = [];
    if (!name.value.trim()) bad.push(name);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.value.trim())) bad.push(mail);

    $$('.field').forEach(function (f) { f.classList.remove('is-bad'); });
    note.classList.remove('is-good', 'is-bad');

    if (bad.length) {
      bad.forEach(function (i) { i.closest('.field').classList.add('is-bad'); });
      note.textContent = 'A name and a working email, and we are away.';
      note.classList.add('is-bad');
      bad[0].focus();
      return;
    }
    form.classList.add('is-sent');
    note.textContent = 'Received. You will hear back within two working days.';
    note.classList.add('is-good');
  });
}

})();
