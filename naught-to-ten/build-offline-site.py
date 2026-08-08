#!/usr/bin/env python3
"""
Bundle the *whole site* — every page — into one self-contained .html file.

`build-offline.py` bundles the one-pager alone and sends its sub-page links to
the live domain. This does the other thing: it folds the contact, work, privacy
and terms pages into the same document and wires the links between them, so the
entire site works from a single file with no server and no network.

    python3 build-offline-site.py            # desktop, 1600px frames
    python3 build-offline-site.py --frames sm
    python3 build-offline-site.py --both

How it holds together:

* One shared nav and one shared footer. The pages each contributed an identical
  copy; keeping five would mean five elements with id="nav".
* Each page's <main> becomes a route container. A hash router shows one at a
  time — `#/contact`, `#/work`, and so on — and anything that is not a known
  route resolves to the one-pager, so plain anchors like `#scale` still work
  and the browser's back button behaves.
* Sub-page ids are prefixed. The contact form and the one-pager's enquiry form
  both used `fName`, `fMail`, `formNote` and `form`; duplicated in one document
  the first would win and the second would be unreachable.
* main.js is included as-is and drives only the one-pager. It reads
  `window.__NTT_ROUTE` and does nothing while a sub-page is showing, and the
  router calls `window.__NTT_REMEASURE()` on the way back, because everything
  measured to zero while the page was hidden.
"""

import argparse
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.resolve()

MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
}

VIDEO = 'assets/media/naught-to-ten-loop.mp4'
VIDEO_EL = 'filmV'

# slug -> (folder, nav label, document title)
PAGES = [
    ('services', 'services', 'Services', 'Web Design Services in Galway — Naught to Ten'),
    ('faq',      'faq',      'FAQ',      'Web Design FAQ — Naught to Ten'),
    ('contact', 'contact', 'Contact', 'Contact — Naught to Ten'),
    ('work',    'work',    'Work',    'Selected Work — Naught to Ten'),
    ('privacy', 'privacy', 'Privacy', 'Privacy — Naught to Ten'),
    ('terms',   'terms',   'Terms',   'Terms — Naught to Ten'),
]
HOME_TITLE = 'Naught to Ten — Web Design Studio in Galway, Ireland'

_cache: dict[Path, str] = {}


def data_uri(path: Path) -> str:
    if path not in _cache:
        mime = MIME.get(path.suffix.lower(), 'application/octet-stream')
        _cache[path] = f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"
    return _cache[path]


def grab(html: str, tag: str, attr_match: str) -> str:
    """Pull one whole element out of a document by its opening-tag signature."""
    m = re.search(rf'<{tag}[^>]*{attr_match}[^>]*>', html)
    if not m:
        raise SystemExit(f'! could not find <{tag} … {attr_match}>')
    start = m.start()
    depth, i = 0, m.start()
    for t in re.finditer(rf'</?{tag}\b[^>]*>', html[start:]):
        depth += -1 if t.group(0).startswith(f'</{tag}') else 1
        if depth == 0:
            i = start + t.end()
            break
    return html[start:i]


def prefix_ids(fragment: str, prefix: str) -> str:
    """Namespace every id in a sub-page so it cannot collide with the home page."""
    ids = set(re.findall(r'\bid="([^"]+)"', fragment))
    for old in sorted(ids, key=len, reverse=True):
        new = f'{prefix}-{old}'
        fragment = fragment.replace(f'id="{old}"', f'id="{new}"')
        fragment = fragment.replace(f'for="{old}"', f'for="{new}"')
        fragment = fragment.replace(f'href="#{old}"', f'href="#{new}"')
        fragment = fragment.replace(f'aria-labelledby="{old}"', f'aria-labelledby="{new}"')
    return fragment


def relink(fragment: str) -> str:
    """Point every cross-page link at its hash route."""
    for slug, folder, _, _ in PAGES:
        for form in (f'href="{folder}/"', f'href="../{folder}/"'):
            fragment = fragment.replace(form, f'href="#/{slug}"')
    fragment = fragment.replace('href="../#', 'href="#')      # home anchors
    fragment = fragment.replace('href="../"', 'href="#/"')
    fragment = fragment.replace('href="#top"', 'href="#/"')
    return fragment


def inline_css(css: str, css_dir: Path) -> str:
    def repl(m):
        raw = m.group(1).strip().strip('\'"')
        if raw.startswith(('data:', 'http:', 'https:', '#')):
            return m.group(0)
        target = (css_dir / raw).resolve()
        return f"url('{data_uri(target)}')" if target.is_file() else m.group(0)
    return re.sub(r'url\(([^)]+)\)', repl, css)


ROUTER = """
/* ── hash router ─────────────────────────────────────────────────────────
   Every page is in this document; one shows at a time. Anything that is not
   a known route falls through to the one-pager, so ordinary in-page anchors
   keep working and so does the back button.
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var TITLES = __TITLES__;
  var views = {};
  Array.prototype.forEach.call(document.querySelectorAll('[data-route]'), function (el) {
    views[el.getAttribute('data-route')] = el;
  });
  var nav = document.getElementById('nav');

  function parse() {
    var h = (location.hash || '').replace(/^#/, '');
    if (h.charAt(0) === '/') {
      var slug = h.slice(1);
      if (views[slug]) return { route: slug, anchor: '' };
      return { route: 'home', anchor: '' };
    }
    return { route: 'home', anchor: h };          /* #scale, #founder, … */
  }

  function show(state, initial) {
    window.__NTT_ROUTE = state.route;
    for (var k in views) views[k].hidden = (k !== state.route);
    document.body.classList.toggle('page', state.route !== 'home');
    nav.classList.toggle('nav--static', state.route !== 'home');
    if (state.route !== 'home') {
      nav.classList.remove('is-dark');
      nav.classList.add('is-in', 'is-solid');
    }
    document.title = TITLES[state.route] || TITLES.home;

    if (state.route === 'home' && window.__NTT_REMEASURE) window.__NTT_REMEASURE();

    if (initial) return;
    if (state.anchor) {
      var t = document.getElementById(state.anchor);
      if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    }
    /* 'instant', not scrollTo(0,0) — the stylesheet sets scroll-behavior:
       smooth, so a plain reset animates from wherever the last page was and
       the new one arrives part-scrolled. */
    try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
    catch (e) { window.scrollTo(0, 0); }
  }

  window.addEventListener('hashchange', function () { show(parse(), false); });
  show(parse(), true);

  /* the home view starts hidden if we booted straight into a sub-page */
  document.addEventListener('DOMContentLoaded', function () { show(parse(), true); });
})();

/* ── sub-page behaviour ──────────────────────────────────────────────────
   main.js owns the one-pager. These are the two things the route views need:
   reveal-on-scroll, and the enquiry form. Forms are handled generically and
   scoped to themselves, so this never touches the one-pager's own form.
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var routes = document.querySelectorAll('[data-route]:not([data-route="home"])');

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    Array.prototype.forEach.call(routes, function (r) {
      Array.prototype.forEach.call(r.querySelectorAll('[data-rev]'), function (el) { io.observe(el); });
    });
  }

  Array.prototype.forEach.call(routes, function (r) {
    var form = r.querySelector('form.form');
    if (!form) return;
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
      /* This copy is detached from the site, so there is nowhere to post to.
         Say so plainly rather than showing a confirmation that means nothing. */
      note.innerHTML = 'This is an offline copy — the form cannot send from here. ' +
                       'Email <a href="mailto:naughttoten@outlook.ie">naughttoten@outlook.ie</a>.';
      note.classList.add('is-bad');
      if (btn) btn.blur();
    });
  });
})();
"""


def build(frame_set: str, out_name: str) -> None:
    home = (ROOT / 'index.html').read_text()

    # ── shared chrome, taken from the one-pager ──────────────────────────
    boot = grab(home, 'div', 'id="boot"')
    nav = grab(home, 'header', 'class="nav"')
    footer = grab(home, 'footer', 'class="foot"')
    home_main = grab(home, 'main', 'id="top"')

    nav = relink(nav)
    footer = relink(footer)
    # the one-pager's own body links out too — the services teaser and the
    # work rail both point at sub-pages
    home_main = relink(home_main)

    # ── route views ──────────────────────────────────────────────────────
    views = [f'<div data-route="home">{home_main}</div>']
    titles = {'home': HOME_TITLE}
    for slug, folder, _, title in PAGES:
        page = (ROOT / folder / 'index.html').read_text()
        main = grab(page, 'main', '>')
        main = prefix_ids(main, slug)
        main = relink(main)
        # sub-page assets sit one level up from their own folder
        main = main.replace('src="../assets/', 'src="assets/')
        views.append(f'<div data-route="{slug}" hidden>{main}</div>')
        titles[slug] = title
        print(f'  · folded in /{folder}/')

    # ── document ─────────────────────────────────────────────────────────
    head = home[home.index('<head>'):home.index('</head>')]
    # crawl metadata is meaningless in a detached file
    head = re.sub(r'\s*<link rel="(?:canonical|manifest|preload)"[^>]*>', '', head)
    head = re.sub(r'\s*<script type="application/ld\+json">.*?</script>', '', head, flags=re.S)
    head = re.sub(r'\s*<meta (?:name|property)="(?:og:|twitter:|robots|geo\.)[^"]*"[^>]*>', '', head)

    styles = []
    for href in re.findall(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', head):
        p = ROOT / href
        styles.append(inline_css(p.read_text(), p.parent))
    # the sub-page layer is not linked from index.html
    pcss = ROOT / 'assets' / 'css' / 'page.css'
    styles.append(inline_css(pcss.read_text(), pcss.parent))
    head = re.sub(r'\s*<link rel="stylesheet"[^>]*>', '', head)
    head += '\n<style>\n' + '\n'.join(styles) + '\n</style>\n'
    head += '<style>[data-route][hidden]{display:none}</style>\n'

    body = boot + '\n' + nav + '\n' + '\n'.join(views) + '\n' + footer
    doc = f'<!DOCTYPE html>\n<html lang="en-IE">\n<head>{head}</head>\n<body>\n{body}\n'

    # ── assets ───────────────────────────────────────────────────────────
    for icon in set(re.findall(r'<link rel="(?:apple-touch-)?icon"[^>]*href="(assets/[^"]+)"', doc)):
        doc = doc.replace(f'href="{icon}"', f'href="{data_uri(ROOT / icon)}"')

    refs = re.findall(r'\b(src|poster|data-img)="(assets/[^"]+\.(?:jpg|jpeg|png|svg))"', doc)
    for attr, src in sorted(set(refs)):
        doc = doc.replace(f'{attr}="{src}"', f'{attr}="{data_uri(ROOT / src)}"')
    doc = re.sub(r"""url\((['"]?)(assets/[^)'"]+\.(?:jpg|jpeg|png|svg))\1\)""",
                 lambda m: f"url('{data_uri(ROOT / m.group(2))}')", doc)

    frames = sorted((ROOT / 'assets' / 'frames' / frame_set).glob('*.jpg'))
    if not frames:
        raise SystemExit(f'no frames in {frame_set}')
    uris = [data_uri(f) for f in frames]
    raw = sum(f.stat().st_size for f in frames)
    print(f'  · {len(frames)} frames from {frame_set}/ ({raw/1e6:.1f} MB raw)')

    video = ROOT / VIDEO
    video_b64 = base64.b64encode(video.read_bytes()).decode()
    doc = doc.replace(f' src="{VIDEO}"', '')

    payload = f"""<script>
window.__FRAMES = {json.dumps(uris)};
(function () {{
  var bin = atob("{video_b64}"), buf = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  var v = document.getElementById('{VIDEO_EL}');
  if (v) v.src = URL.createObjectURL(new Blob([buf], {{ type: 'video/mp4' }}));
}})();
</script>
"""
    router = ROUTER.replace('__TITLES__', json.dumps(titles))
    nav_js = (ROOT / 'assets' / 'js' / 'nav.js').read_text()
    main_js = (ROOT / 'assets' / 'js' / 'main.js').read_text()

    doc += payload
    doc += f'<script>\n{nav_js}\n</script>\n'
    doc += f'<script>\n{router}\n</script>\n'
    doc += f'<script>\n{main_js}\n</script>\n'
    doc += '</body>\n</html>\n'

    leftover = re.findall(r'(?:src|href|poster|data-img)="((?:\.\./)?assets/[^"]+)"', doc)
    leftover += re.findall(r'href="(?!#|https?:|mailto:|tel:|data:)([^"]+)"', doc)
    if leftover:
        raise SystemExit(f'  ! unresolved: {sorted(set(leftover))}')

    out = ROOT / out_name
    out.write_text(doc)
    print(f'  → {out.name}  ({out.stat().st_size/1e6:.1f} MB)\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', default='lg', choices=['lg', 'sm'])
    ap.add_argument('-o', '--out')
    ap.add_argument('--both', action='store_true')
    args = ap.parse_args()

    names = {'lg': 'naught-to-ten-site-desktop.html',
             'sm': 'naught-to-ten-site-mobile.html'}
    if args.both:
        for fs in ('lg', 'sm'):
            build(fs, names[fs])
    else:
        build(args.frames, args.out or names[args.frames])


if __name__ == '__main__':
    main()
