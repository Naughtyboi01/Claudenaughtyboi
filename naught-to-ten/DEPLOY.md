# Going live

Host: **Netlify**, free tier. Chosen because it deploys straight from the
GitHub repo, gives HTTPS and a custom domain without configuration, serves the
clean `/contact/` URLs as-is, and handles the enquiry forms with no backend.

It is a US company, which is why the privacy notice names it, says where the
data goes, and states the safeguard: the **Standard Contractual Clauses** under
Implementing Decision (EU) 2021/914, which Netlify pre-signs as data importer
in its DPA. That agreement is incorporated into Netlify's terms, so it takes
effect on signup — no separate paperwork.

---

## 1. Register the domain

`naughttoten.ie` through any Irish registrar (Blacknight, Register365, Hosting
Ireland). `.ie` requires a demonstrable connection to Ireland — a Galway
business address covers it.

If you end up on a different domain, change it everywhere in one pass:

```bash
python3 set-domain.py whatever.ie --dry   # report
python3 set-domain.py whatever.ie         # apply
python3 build-offline.py --both && python3 build-offline-site.py --both
```

## 2. Deploy

1. Sign in to netlify.com with GitHub.
2. **Add new site → Import an existing project**, pick this repository.
3. Set **Base directory** to `naught-to-ten`. Leave the build command empty and
   the publish directory as `.` — `netlify.toml` already declares both.
4. Deploy. You get a `something.netlify.app` URL immediately.

Every push to the branch redeploys automatically.

## 3. Point the domain at it

**Domain management → Add a domain**, enter `naughttoten.ie`, and follow the DNS
records Netlify gives you. Set `www` to redirect to the bare domain (or the
reverse — just pick one and make sure `canonical` in the HTML matches). HTTPS is
issued automatically once DNS resolves; wait for the padlock before announcing
anything.

## 4. Check the forms arrive

There are two, kept separate so the fields do not clash:

| Form | Where | Fields |
|---|---|---|
| `enquiry` | `/contact/` | name, company, email, phone, budget, timing, message |
| `enquiry-home` | `/` | name, company, email, budget, message |

Netlify detects both from the HTML on first deploy. Under **Forms**, add an
email notification for each so submissions land in `naughttoten@outlook.ie`
rather than sitting in a dashboard you never open.

**Then submit a real test through each one** and confirm it arrives. Until you
have seen that happen, assume it does not work.

Spam is handled by a honeypot field, not a CAPTCHA — deliberately, so the site
keeps making no third-party requests.

## 5. The data processing agreement

The privacy notice states that Netlify processes data under a written agreement
and that transfers rest on the **Standard Contractual Clauses** published under
Implementing Decision (EU) 2021/914.

Netlify pre-signs those clauses as data importer inside its DPA, and the DPA is
incorporated by reference into Netlify's terms of service — so it takes effect
when you accept the terms on signup. **Download a copy and keep it on file**;
if you are ever asked to demonstrate the safeguard, that document is the answer.

Do the same for Microsoft 365 if you have not already. Their DPA is part of the
standard online services terms.

## 6. Check the notice still matches reality

- Retention periods should match what you actually do. The notice promises form
  submissions are cleared from Netlify within three months — set a calendar
  reminder, or it becomes untrue by neglect.
- The Data Protection Commission's current contact details, from
  `dataprotection.ie`.
- If you ever add a supplier, a tool or a tracker, the processor table and the
  transfer section both need updating, and so does the date at the top.

## 7. Then

- **Google Business Profile.** For "web design Galway" this outranks anything
  on the site. Verify the Mervue address; the structured data already tells
  Google the listing and the site are the same business.
- **Google Search Console.** Add the property, submit `sitemap.xml`, watch for
  crawl errors.
- Analytics only if you want it — and note that any tool storing anything on a
  visitor's device needs a consent banner under the Irish ePrivacy regulations
  (S.I. 336/2011). A cookieless EU-hosted tool avoids the banner. Adding one
  means updating the privacy notice again.

---

## Before you announce it

Content that is still placeholder and reads as fact:

- **Six invented case studies** on `/work/` and the home rail — Aureate,
  Halcyon Atelier, Meridian Rye, Nocturne, Vantage Labs, Fold — illustrated
  with crops from the hero film.
- **Invented figures**: 46 brands launched, 98+ median Lighthouse, founded
  2019, four engagements a quarter, from €38,000.
- **`/terms/` states** that the project names under work "belong to the clients
  concerned and appear as a record of work carried out". That sentence is
  false while the projects are invented.

None of it is in the structured data, so nothing false is being asserted to
search engines — but a visitor will read all of it as true.
