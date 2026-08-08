/* ==========================================================================
   Naught to Ten — mobile navigation
   Loaded on every page, ahead of main.js and page.js.

   Below 900px the link row does not fit, so it becomes a full-screen panel
   behind a button. Without JavaScript the button is never shown and the links
   fall back to a small wrapped row — the one thing that must not happen is a
   phone with no way to reach the rest of the site.
   ========================================================================== */
(function () {
'use strict';

var nav = document.getElementById('nav');
if (!nav) return;

var links = nav.querySelector('.nav__links');
var toggle = nav.querySelector('.nav__toggle');
if (!links || !toggle) return;

var lastFocus = null;

function focusables() {
  return Array.prototype.slice.call(
    links.querySelectorAll('a[href], button:not([disabled])')
  ).filter(function (el) { return el.offsetParent !== null; });
}

function open() {
  lastFocus = document.activeElement;
  links.classList.add('is-open');
  document.body.classList.add('is-navopen');
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-label', 'Close menu');
  var f = focusables();
  if (f.length) f[0].focus();
}

function close(restore) {
  links.classList.remove('is-open');
  document.body.classList.remove('is-navopen');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open menu');
  if (restore !== false && lastFocus && lastFocus.focus) lastFocus.focus();
}

toggle.addEventListener('click', function () {
  if (links.classList.contains('is-open')) close(); else open();
});

/* Any link closes it. On the one-pager these are in-page anchors, so without
   this the panel would stay over the section it just jumped to. */
links.addEventListener('click', function (e) {
  if (e.target.closest('a')) close(false);
});

document.addEventListener('keydown', function (e) {
  if (!links.classList.contains('is-open')) return;

  if (e.key === 'Escape') { close(); return; }

  /* keep tabbing inside the panel while it is over everything else */
  if (e.key === 'Tab') {
    var f = focusables();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/* Resizing past the breakpoint with the panel open would leave the body
   scroll-locked and the panel styling stranded. */
window.addEventListener('resize', function () {
  if (window.innerWidth > 900 && links.classList.contains('is-open')) close(false);
});

})();
