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

Done — **`ntt.ie`** is registered. `.ie` requires a demonstrable connection to
Ireland, which the Mervue business address covers.

**Point it at Netlify before announcing it anywhere**, and get a working
mailbox on the domain before the site goes live — see the callout at the
bottom of this file. `joshua@ntt.ie` is on every page right now; if nothing
receives mail for that address yet, every one of those is a dead end.

If you ever end up on a different domain again, change it everywhere in one pass:

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

**Domain management → Add a domain**, enter `ntt.ie`, and follow the DNS
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

Netlify detects both from the HTML on first deploy.

**Where submissions go is a dashboard setting, not something in the code.**
Under **Forms → Form notifications**, add an *Email notification* for each of
the two forms and set the address to `joshua@ntt.ie`. Until you do that,
submissions are captured but sit in the Netlify dashboard where you will
never look at them — and until `joshua@ntt.ie` is a real, working mailbox,
setting this doesn't help either. See the callout below.

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

## The mailbox has to exist before the address does

Buying `ntt.ie` gives you a domain, not a mailbox. `joshua@ntt.ie` is now on
every page — the nav, the footer, every `mailto:` link, the enquiry form's
failure message, the structured data — but **none of that makes email for
that address arrive anywhere** until you point the domain's MX records at an
actual mail provider and create the mailbox there. Until you do:

- anyone who clicks "email us" gets a bounce, not a studio;
- the Netlify form-notification address above receives nothing;
- and worse than either, nothing tells a visitor it failed — the `mailto:`
  link opens their mail client and looks completely normal.

Send yourself a real test email to `joshua@ntt.ie` before this goes live, from
an account you don't control, and confirm it lands somewhere you check.

**This also changes a claim in `/privacy/`.** The processor table currently
names **Microsoft**, based in the **European Union**, as the party handling
"our mailbox, where enquiries and email land" — carried over from the old
Outlook/Hotmail address. Whatever you point `ntt.ie`'s mail at (Microsoft 365,
Google Workspace, Zoho, the registrar's own forwarding, anything) becomes the
actual processor and the actual jurisdiction, and the privacy notice has to
name the real one. If it's still Microsoft, nothing to change. If it's Google
Workspace or anything US-based, the notice needs a second Standard Contractual
Clauses paragraph like the one already written for Netlify. This file cannot
guess which — it needs your answer.

## Before you announce it

The fictional client work is gone. `/work/` is now a single real case study —
this website — and the sentence in `/terms/` asserting those client names were
genuine has been removed.

The two invented figures — *46 brands launched* and *98+ median Lighthouse* —
are gone from the manifesto stat row. What replaced them is measurable:

| Figure | Where it comes from |
|---|---|
| **10** services | The ten on `/services/` |
| **0** cookies, trackers, third parties | Measured: zero third-party requests, zero cookies, zero storage entries |
| **1.1 MB** before it appears | Measured on a throttled 1.6 Mbps connection, to first paint of the hero |
| **2** working days to a reply | A promise, not a measurement — so keep it |

The middle two are true of the site as built. **If you ever add a font from
Google, an analytics script, a chat widget or an embedded map, both become
false immediately** — and so does the privacy notice. That is the cost of the
claim, and it is worth paying.

Still assumed rather than decided by you: the **50/50 payment split** and
**14-day invoice terms** in `/terms/`, and the **two revision rounds** quoted
in both `/terms/` and the FAQ.
