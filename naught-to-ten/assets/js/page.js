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
   Posts to Netlify Forms. Netlify reads the form's markup at deploy time and
   accepts a urlencoded POST to the page's own path, so there is no endpoint
   to configure and no third-party request on page load — the browser only
   talks to this domain, and only when someone actually submits.

   Spam is caught by a honeypot field rather than a CAPTCHA. A CAPTCHA would
   mean a third-party request, an international transfer, and terminal-
   equipment access needing consent; a hidden input costs none of that.
   ────────────────────────────────────────────────────────────────────────── */
window.NTT_bindForm = function (form) {
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  var note = form.querySelector('.form__note');
  var btn = form.querySelector('button[type=submit]');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.querySelector('input[name="name"]');
    var mail = form.querySelector('input[name="email"]');
    var bad = [];
    if (name && !name.value.trim()) bad.push(name);
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.value.trim())) bad.push(mail);

    Array.prototype.forEach.call(form.querySelectorAll('.field'), function (f) {
      f.classList.remove('is-bad');
    });
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
      note.innerHTML = 'That did not send. Email <a href="mailto:naughttoten@outlook.ie">' +
                       'naughttoten@outlook.ie</a> and it will reach us.';
      note.classList.add('is-bad');
    });
  });
};

window.NTT_bindForm($('#contactForm'));

})();
