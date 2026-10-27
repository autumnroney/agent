# PRD — FRED Macro Dashboard

**Owner:** Autumn Roney, M.S. Economics, FAU
**Course:** ISM 6427C — AI for Business Innovation (Ch 9 in-class build: custom sub-agents)
**Status:** v1.0

## 1. Executive summary

FRED Macro Dashboard is a free, mobile-friendly website that shows four headline U.S. macro indicators — CPI inflation, unemployment, the effective federal funds rate and real GDP growth — as live charts pulled from the St. Louis Fed's FRED API. Every chart comes with a short plain-English explanation written for students in a Principles of Macroeconomics course. The FRED API key lives only in a Netlify environment variable; the browser talks to a Netlify Function, never to FRED directly.

## 2. Value proposition

- **For students:** "What's the economy doing right now, and what does that number even mean?" answered on one page, in under a minute, without learning FRED's interface.
- **For instructors:** a link they can drop into a lecture slide that is always current.
- **Versus FRED itself:** FRED is powerful but built for researchers — thousands of series, unit menus, no narrative. This dashboard picks the four numbers the Fed watches most and explains them.

## 3. Target user persona

**"Maya," 19, sophomore business major taking ECO 2013 (Principles of Macro).**

- *Demographics:* full-time student, works ~20 hrs/week, mostly on her phone.
- *Psychographics:* pragmatic and grade-motivated, but curious when something connects to her own life (rent, gas prices, whether she'll find an internship). Mildly intimidated by charts with jargon; trusts sources that feel official (the Fed) more than social media takes. Prefers short, skimmable explanations and will tap "learn more" only if the first sentence hooks her. Values feeling "in the know" when the news mentions a Fed meeting.
- *Jobs to be done:* check the latest number before class or an exam; connect a textbook concept (Phillips curve, Taylor rule, business cycle) to real data; cite a real figure in a discussion post.
- *Frustrations:* paywalled news, outdated textbook tables, FRED's dense UI.

Secondary persona: an intro-macro instructor who wants a clean, current visual for class.

## 4. Features

| # | Feature | Priority |
|---|---------|----------|
| F1 | Netlify Function `/api/fred` that proxies a whitelisted set of FRED series; key read from `FRED_API_KEY`; response cached | Must |
| F2 | Four indicator cards: CPI YoY % (CPIAUCSL, `pc1`), unemployment rate (UNRATE), effective fed funds rate (FEDFUNDS), real GDP growth, annualized q/q % (GDPC1, `pca`) | Must |
| F3 | Line chart per indicator, last 10 years by default | Must |
| F4 | Date-range selector: 1Y / 5Y / 10Y / 20Y / Max, applied to all charts | Must |
| F5 | Latest value + observation date + change vs. a year earlier on each card | Must |
| F6 | Plain-English "What it is" and "Why the Fed cares" text per indicator | Must |
| F7 | About section: built by Autumn Roney, M.S. Economics, FAU; data source credit to FRED | Must |
| F8 | Responsive layout, light/dark mode, accessible (labels, contrast, keyboard) | Should |
| F9 | Friendly error states (missing key, FRED down) per card | Should |

**Out of scope (v1):** user accounts, custom series search, forecasts.

## 5. Tech stack

- **Front end:** static HTML/CSS/vanilla JS in `public/`, Chart.js 4 (cdnjs) for charts. No build step.
- **Back end:** one Netlify Function (`netlify/functions/fred.mjs`, Node 18+ native `fetch`), routed to `/api/fred` via `netlify.toml`.
- **Secrets:** `FRED_API_KEY` env var in Netlify; `.env` git-ignored; `.env.example` committed.
- **Tests:** Node built-in test runner (`npm test`) with a mocked `fetch` — no network or key needed.
- **Hosting/CI:** GitHub → Netlify auto-deploy on push.

## 6. Milestones

Each milestone leaves something clickable.

### M1 — Skeleton site + deploy config
Static page with header, four placeholder cards, About section; `netlify.toml`, `.gitignore`, `.env.example`.
*How to test:* open the Netlify URL (or `public/index.html`) → you see the title, four cards and the About section.

### M2 — FRED proxy function
`/api/fred?series=UNRATE&start=2015-01-01` returns clean JSON `{series, title, units, observations:[{date,value}]}`; rejects unknown series; never echoes the key; returns a clear error when the key is missing.
*How to test:* visit `https://<site>.netlify.app/api/fred?series=UNRATE` → JSON with observations. Visit `?series=FOO` → 400 error.

### M3 — Live charts
Each card fetches its series and draws a 10-year line chart with the latest value and date.
*How to test:* open the site → four charts render with real numbers; the latest UNRATE value matches fred.stlouisfed.org/series/UNRATE.

### M4 — Date-range selector + year-over-year change
1Y/5Y/10Y/20Y/Max buttons redraw all charts; each card shows change vs. one year earlier.
*How to test:* click **20Y** → charts extend back to ~2006 and show the 2008–09 recession; click **1Y** → only the last year.

### M5 — Economics content, polish, accessibility
Plain-English explanations, recession-friendly tooltips, dark mode, mobile layout, error states, unit tests.
*How to test:* open on a phone → cards stack in one column; toggle system dark mode → colors switch; read each card's "Why the Fed cares".

## 7. Success metrics

- All four charts load in < 3 s on a cold Netlify function.
- Key never appears in page source, network responses, or the repo.
- An intro-macro student can explain each indicator after reading its card.
