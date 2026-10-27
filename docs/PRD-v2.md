# PRD v2 — FRED Macro Dashboard → "Macro Lab"

**Owner:** Autumn Roney, M.S. Economics, FAU
**Course:** ISM 6427C — AI for Business Innovation (Ch 9 in-class build: custom sub-agents)
**Status:** v2.0 draft — current source of truth (supersedes `docs/PRD.md` for all new work; v1 stays as history)
**PRD owner agent:** `product-strategist`

---

## 1. Executive summary

v1 answers *"what is the economy doing right now?"* with four live charts and plain-English copy. v2 turns the dashboard into a small **macro lab** that also answers *"how do these numbers fit together?"* and *"do I actually understand this?"* — the two questions every Principles-of-Macro student hits right before an exam.

v2 adds, in build order:

1. **Shared foundation** — one navigation bar across pages, a shared client data layer with caching, and a slightly larger FRED whitelist.
2. **Smarter charts** — NBER recession shading on every chart, per-chart CSV download and data-table view, and a **Recession Watch** panel (Sahm rule computed live + 10-year/3-month yield curve).
3. **Policy Lab: Taylor rule** — sliders for r\*, the inflation target, the weights and the natural rate of unemployment; the output gap is approximated from unemployment with Okun's law; the rule-implied rate is plotted against the actual fed funds rate.
4. **Policy Lab: Phillips curve + policy stance** — an unemployment-vs-inflation scatter colored by era, plus a real-interest-rate chart that shows whether policy is tight or loose.
5. **Live-data Quiz** — questions generated from today's FRED data (never stale), concept questions with explanations, an "estimate first" calibration mode, and seeded quizzes so a whole class gets the same set.
6. **Class Mode** — presentation slides that build themselves from live data, a "then vs. now" time machine, copy-ready citations and a printable one-page handout.
7. **Hardening** — accessibility, performance, security headers, docs.

Everything stays **static HTML/CSS/vanilla JS + Chart.js 4.4.1 (cdnjs) + the one existing Netlify Function**. No accounts, no database, no paid services, no new API keys.

---

## 2. What v1 does, and its gaps

**v1 (live today):** four cards — CPI inflation YoY (CPIAUCSL, `pc1`), unemployment (UNRATE), effective fed funds rate (FEDFUNDS), real GDP growth annualized q/q (GDPC1, `pca`); 1Y/5Y/10Y/20Y/Max range; latest value, date and change vs. a year earlier; "What it is / Why the Fed cares / Good to know" copy; About; dark mode; per-card errors; function unit tests.

| Gap | Why it matters | v2 answer |
|---|---|---|
| Charts show *what* happened but not *when the economy was in recession* | Students can't connect spikes in unemployment to the business cycle | Recession shading (USREC) |
| Indicators are shown in isolation | The course is about relationships: Taylor rule, Phillips curve, Fisher equation, Okun's law | Policy Lab |
| No way to check understanding | Students are grade-motivated; reading ≠ learning | Live-data Quiz |
| Data can't leave the page | Students cite numbers in discussion posts; instructors want a slide | CSV, citations, Class Mode |
| CPI is shown but the Fed's 2% target is **PCE** | A correctness trap the v1 copy explains but can't show | Add PCEPI / PCEPILFE; use PCE wherever the target is compared |
| "Are we heading into a recession?" is the #1 question in the news | v1 has no forward-looking-but-honest signal | Recession Watch: Sahm rule + yield curve, with caveats |
| Single page, no navigation | v2 has several pages | Shared nav |
| Charts are canvas-only | Screen-reader users get only an aria-label | Data-table toggle |

---

## 3. Personas

### 3.1 "Maya," 19 — sophomore business major in ECO 2013 (primary)
- *Demographics:* full-time student, works ~20 hrs/week, mostly on her phone, between classes and on the bus.
- *Psychographics:* pragmatic and grade-motivated, curious when something touches her life (rent, gas, internship odds). Intimidated by jargon; trusts official sources (the Fed) over social media; skims, taps "learn more" only if the first sentence hooks her. Likes feeling "in the know" when the news mentions the Fed. Responds to quick wins (streaks, "you got it") more than long reading.
- *Jobs to be done:* check the latest number before class; connect a textbook graph (Phillips curve, Taylor rule, AD-AS) to real data; practice for the exam in 5-minute bursts; cite a real figure in a discussion post.
- *v2 wins:* Quiz on her phone, Phillips curve with real dots, one-tap citation.

### 3.2 "Dr. Reyes," 41 — adjunct/lecturer teaching three sections of intro macro (150+ students each)
- *Psychographics:* time-poor, cares about accuracy (a wrong number in front of 150 students is embarrassing), skeptical of ed-tech that needs logins, LMS integration or student data. Wants to *show* rather than *tell*. Reuses what works semester to semester.
- *Jobs to be done:* open a current, clean visual at the start of lecture ("this month in the economy"); run a Taylor-rule what-if live ("what if the Fed weighted unemployment more?"); give the whole class the same practice quiz; hand out a one-page data sheet.
- *Frustrations:* stale textbook tables; FRED graphs that need 10 clicks to configure; tools that need accounts or collect student data.
- *v2 wins:* Class Mode, shareable Policy-Lab URLs, seeded quizzes, printable handout. Zero setup.

### 3.3 "Ms. Carter," 34 — high-school AP Macroeconomics teacher
- *Psychographics:* follows the AP course framework closely (Unit 5 covers the Phillips curve and monetary policy); district blocks many sites and anything with sign-ups; values free and ad-free.
- *Jobs to be done:* bell-ringer question from today's data; a Phillips-curve activity that shows short-run vs. long-run behavior with real data.
- *v2 wins:* Quiz "question of the day", Phillips curve by era, no accounts.

### 3.4 "Leo," 24 — M.S. Economics student / TA and econ-curious professional
- *Psychographics:* knows the theory, wants to poke at it; enjoys a well-built tool; shares links on LinkedIn and with study groups; cares that assumptions are stated.
- *Jobs to be done:* quickly compare a Taylor-rule variant to actual policy; grab a CSV; check the Sahm rule after a jobs report.
- *v2 wins:* Policy Lab with stated formulas, CSV, Recession Watch.

---

## 4. Value proposition

- **For students:** "See the textbook happen in real data, then check you get it" — live charts, the Phillips curve and the Taylor rule with today's numbers, and a quiz that is never out of date.
- **For instructors:** "A lecture-ready macro lab with zero setup" — a link that builds its own slides, a what-if Taylor rule you can run in front of class, the same quiz for every student via a URL, no logins and no student data collected.
- **Versus FRED:** FRED has the data but not the narrative, the models or the assessment. **Versus textbook publisher platforms:** free, current, no accounts. **Versus news:** explains *why*, states assumptions, no spin.

---

## 5. Data: series and economics conventions

### 5.1 FRED whitelist (function `netlify/functions/fred.mjs`)

| Series | Units param | Frequency | Used for | New in v2 |
|---|---|---|---|---|
| CPIAUCSL | `pc1` | Monthly | CPI inflation YoY, Phillips curve | — |
| UNRATE | `lin` | Monthly | Unemployment, Sahm rule, Okun gap, Phillips | — |
| FEDFUNDS | `lin` | Monthly | Effective fed funds, Taylor comparison, real rate | — |
| GDPC1 | `pca` | Quarterly | Real GDP growth | — |
| USREC | `lin` | Monthly | NBER recession shading (1 = recession month) | ✔ |
| PCEPI | `pc1` | Monthly | PCE inflation YoY (the measure in the Fed's 2% target) | ✔ |
| PCEPILFE | `pc1` | Monthly | Core PCE inflation YoY (default inflation input to the Taylor rule) | ✔ |
| NROU | `lin` | Quarterly | CBO noncyclical rate of unemployment (u\*) | ✔ |
| T10Y3M | `lin`, FRED `frequency=m`, `aggregation_method=avg` | Daily → monthly average | 10-year minus 3-month Treasury spread (yield curve) | ✔ |

API contract is unchanged: `GET /api/fred?series=ID&start=YYYY-MM-DD` → `{series, title, units, frequency, observations:[{date, value}]}`. Whitelist entries may carry an optional server-side `frequency`/`aggregation` setting (used only by T10Y3M); the browser can't choose units or frequency. Response cache stays `public, max-age=3600`.

**Gotchas builders must handle:**
- **NROU includes CBO projections years into the future.** Drop NROU observations dated after the latest UNRATE observation before using them.
- NROU and GDPC1 are quarterly; when combined with monthly series, step-fill each quarter's value to its three months.
- USREC starts in 1854 — request it with a `start` no earlier than the earliest date being charted.
- FRED revises data; quiz answers and slides must say "data as of <date>".

### 5.2 Economics conventions (must be correct)

- **Fed's 2% target is for PCE inflation** (FOMC Statement on Longer-Run Goals). Any "above/below target" comparison uses PCE (headline or core), never CPI. CPI may be shown and labelled as CPI.
- **Taylor rule (Taylor 1993):** `i = r* + π + 0.5(π − π*) + 0.5·gap`, with r\* = 2, π\* = 2, π = inflation over the previous four quarters (Taylor used the GDP deflator), gap = % deviation of real GDP from potential. General form in the lab: `i = r* + π + a_π(π − π*) + a_y·gap`.
- **"Balanced-approach" rule** (used in the Fed's *Monetary Policy Report*): same form with a_π = 0.5, a_y = 1.0.
- **Okun's law** (gap version): `gap ≈ −2 × (u − u*)`. The coefficient (~2) is an empirical rule of thumb, adjustable in the lab (range 1.5–3).
- **r\*** is the *real* neutral rate. Taylor's 2 is the 1993 assumption; recent estimates (e.g., the Laubach-Williams model, the FOMC's longer-run projections) are lower, roughly 0.5–1.5. Copy must say estimates are uncertain; no single "true" value.
- **Effective lower bound:** the rule can prescribe a negative rate; the Fed held the target range at 0–0.25% instead (2008–15, 2020–22). Show this, don't hide it.
- **Real interest rate (ex post):** `fed funds − inflation over the past year` — an approximation of the Fisher equation (the ex ante rate uses *expected* inflation). Policy is "tighter" when the real rate is above r\*, "looser" when below.
- **Phillips curve:** short-run tradeoff between unemployment and inflation that shifts with inflation expectations and supply shocks; it looked steep in the 1960s, broke down in the 1970s (stagflation), and was very flat from the mid-1990s to 2019. Present the scatter as *evidence to interpret*, not a stable law.
- **Sahm rule (Claudia Sahm, 2019):** recession signal when the 3-month moving average of the unemployment rate is ≥ 0.50 percentage points above its lowest 3-month average of the previous 12 months. It is a historical pattern, not a forecast; it triggered in mid-2024 without a recession being declared. Computed client-side from UNRATE as currently revised (FRED's real-time version uses first-release data, so values can differ slightly).
- **Yield curve:** the 10-year minus 3-month spread turned negative before each U.S. recession since the late 1960s, with long and variable lead times, and stayed inverted from late 2022 into 2024 without a recession through that period. Present as a signal economists watch, never a prediction.
- **Recessions:** dated by the NBER Business Cycle Dating Committee, not "two negative quarters".
- No forecasts, no political opinions, no investment advice.

---

## 6. Feature list (prioritized)

Priorities: **Must** = v2 is not done without it; **Should** = planned in a milestone, can slip one milestone; **Could** = only if the milestone is otherwise done.

### 6.1 Foundation
| # | Feature | Priority |
|---|---|---|
| F10 | Shared top navigation (Dashboard · Policy Lab · Quiz · Class Mode · About) on every page, rendered by one module, current page marked `aria-current="page"`; collapses cleanly at 375px | Must |
| F11 | Client data layer `getSeries(id, {start})`: calls `/api/fred`, normalizes errors, de-duplicates in-flight requests, caches in `sessionStorage` (try/catch; works without it) so moving between pages doesn't refetch | Must |
| F12 | Expanded whitelist (§5.1) with unit tests | Must |
| F13 | All page copy (About, explainers, glossary) lives in `public/content.js` / `public/indicators.js`, not hard-coded in HTML | Must |

### 6.2 Dashboard upgrades
| # | Feature | Priority |
|---|---|---|
| F20 | NBER recession shading (USREC) behind every time-series chart, with a legend note "Shaded = recession (NBER)" | Must |
| F21 | Per-chart **Download CSV** (exactly the range shown; header rows with series ID, units, source, retrieval date) | Must |
| F22 | Per-chart **Show data table** toggle (accessible `<table>`, last 24 rows by default, "show all") | Should |
| F23 | **Recession Watch** panel: Sahm-rule value vs. 0.50 threshold (computed from UNRATE) and the 10Y–3M spread chart with zero line; both shaded; both with honest caveats | Must |
| F24 | One-line auto summary at the top of the dashboard ("Unemployment was 4.3% in September 2026, up 0.2 points from a year earlier…") generated from data, no causal claims | Should |
| F25 | PCE inflation shown alongside CPI on the inflation card (toggle CPI / PCE / core PCE), with the 2% target line drawn only on PCE views | Should |

### 6.3 Policy Lab (`policy.html`)
| # | Feature | Priority |
|---|---|---|
| F30 | **Taylor rule** chart: rule-implied rate vs. actual effective fed funds rate, 1990–today by default (range buttons) with recession shading | Must |
| F31 | Sliders/inputs: r\* (−1 to 4, default 2), π\* (0–4, default 2), a_π (0–1.5, default 0.5), a_y (0–1.5, default 0.5), Okun coefficient (1.5–3, default 2), u\* ("CBO estimate" default or a fixed value slider 3–7); inflation measure select: core PCE (default), PCE, CPI | Must |
| F32 | Presets: **Taylor (1993)**, **Balanced approach**, **Your rule** | Must |
| F33 | "Right now" readout: latest rule rate vs. actual, the gap in points, and a plain-English line ("The rule says rates should be 0.6 points higher than they are"), plus the formula with today's numbers plugged in | Must |
| F34 | Toggle "Respect the zero lower bound" (floors the rule at 0) with an explainer | Should |
| F35 | Lab state in the URL hash (`#r=2&pt=2&api=0.5&ay=1&...`) + "Copy link to this scenario" | Should |
| F36 | **Phillips curve** scatter: x = unemployment, y = inflation (CPI default; core PCE option), monthly since 1948, points colored by era; era legend toggles; optional "connect the dots" path for a chosen era; latest point highlighted | Must |
| F37 | Era definitions: 1948–69 Postwar & '60s · 1970–83 Stagflation & Volcker disinflation · 1984–2007 Great Moderation · 2008–19 Great Recession & recovery · 2020–now Pandemic & inflation surge | Must |
| F38 | **Policy stance** chart: real fed funds rate (FEDFUNDS − core PCE YoY) vs. the chosen r\* line; shaded "tighter / looser than neutral" | Should |
| F39 | Short explainer per tool (what the model says, what it leaves out, one "try this" prompt) | Must |

### 6.4 Quiz (`quiz.html`)
| # | Feature | Priority |
|---|---|---|
| F40 | **Live-data questions** generated from the latest FRED data, each showing "data as of …" and linking to the relevant chart. Template bank (≥ 12 templates), e.g.: unemployment higher/lower/unchanged vs. a year ago; which value is closest to the latest CPI inflation; did the Fed raise, cut or hold over the last 3 months; is PCE inflation above or below the 2% target; is the real fed funds rate positive; was real GDP growth negative in either of the last two quarters; is the yield curve inverted; is the Sahm rule triggered; is the economy currently in an NBER recession (careful: USREC lags — phrase as "according to the NBER dates in FRED"); what does the Taylor (1993) rule prescribe vs. actual (higher/lower) | Must |
| F41 | **Concept questions** (≥ 30) across: measuring inflation, unemployment definitions, GDP/real vs nominal, Fed tools & mandate, Taylor rule, Phillips curve, Okun's law, business cycle, Fisher equation. Each with a 1–3 sentence explanation of the right answer *and* why the tempting wrong answer is wrong | Must |
| F42 | Rounds of 10 (mix ≈ 6 live / 4 concept, configurable by topic); immediate feedback; final score with review list | Must |
| F43 | **Estimate first** mode: "Guess the current unemployment rate" slider → reveal the real number and how far off you were; tally of over/under-estimates (people systematically misperceive inflation and unemployment — this is a novel calibration exercise) | Should |
| F44 | **Seeded quizzes:** `quiz.html?seed=ECO2013-wk9` gives everyone the same questions and answer order (deterministic PRNG); instructor can append `&key=1` for a printable answer key. Stated clearly as practice, not secure assessment | Should |
| F45 | Personal best and streak in `localStorage` (try/catch; no server) | Could |
| F46 | If a series fails to load, its templates are skipped silently and the round fills with concept questions | Must |

### 6.5 Class Mode (`present.html`)
| # | Feature | Priority |
|---|---|---|
| F50 | **Auto-built slides** from live data: title ("This month in the U.S. economy — data as of …"), one slide per indicator (big number, change vs. a year ago, shaded sparkline, one generated sentence), Recession Watch, Taylor rule "right now", "Question for the class" (one live quiz question with reveal), sources slide | Must |
| F51 | Keyboard ←/→/Space, `F` fullscreen, slide counter, large type readable from the back of a lecture hall (≥ 48px headline numbers), high-contrast theme toggle | Must |
| F52 | **Then vs. Now time machine:** pick any month since 1960 (`?compare=1980-03`) → side-by-side slide of all indicators then vs. now, with recession status | Should |
| F53 | **Copy citation** on every card and slide. APA style: "U.S. Bureau of Labor Statistics. (2026). *Unemployment rate* [UNRATE]. FRED, Federal Reserve Bank of St. Louis. Retrieved October 27, 2026, from https://fred.stlouisfed.org/series/UNRATE". Second button gives FRED's own suggested format | Must |
| F54 | **Copy summary for LMS / discussion post:** plain-text paragraph of the latest numbers with dates and sources | Should |
| F55 | **Printable one-page handout** (print stylesheet: four numbers, mini charts, one Phillips/Taylor takeaway, sources) | Should |
| F56 | QR code on the title slide linking to the site (qrcodejs 1.0.0 from cdnjs, pinned) | Could |

### 6.6 Cross-cutting
| # | Feature | Priority |
|---|---|---|
| F60 | Accessibility: every chart has a text alternative (data table or summary), sliders keyboard-operable with visible values, AA contrast light/dark, focus styles, `prefers-reduced-motion` respected | Must |
| F61 | Performance: dashboard first chart < 3 s on a cold function; no page fetches a series twice per session; Policy Lab ≤ 6 function calls on first load | Must |
| F62 | Security: key never in browser/repo; whitelist enforced; Content-Security-Policy and other security headers in `netlify.toml` (scripts only from self + cdnjs) | Must |
| F63 | Glossary (≈ 25 terms) in `content.js`, shown as a section on the dashboard and reused by quiz explanations | Should |

### 6.7 Explicitly not in v2
User accounts, saved progress across devices, class rosters/grade sync, free-text series search, forecasts, any LLM/AI features in the site itself, ads/analytics trackers. See §9.

---

## 7. Information architecture and file plan

```
public/
  index.html          Dashboard (frontend-engineer)
  app.js              Dashboard logic (frontend-engineer)
  styles.css          Global styles + print + present styles (frontend-engineer)
  present.html        Class Mode (frontend-engineer)
  present.js          Class Mode logic (frontend-engineer)
  policy.html         Policy Lab (econ-modeling-engineer)
  policy.js           Policy Lab logic (econ-modeling-engineer)
  policy.css          Policy Lab page styles (econ-modeling-engineer)
  quiz.html           Quiz (quiz-designer)
  quiz.js             Quiz UI logic (quiz-designer)
  quiz.css            Quiz page styles (quiz-designer)
  quiz-bank.js        Concept question bank (quiz-designer)
  indicators.js       Indicator metadata + per-indicator copy (econ-content-writer)
  content.js          All other copy: About, glossary, explainers, era blurbs, citations metadata (econ-content-writer)
  lib/
    fred-client.js    getSeries(): fetch /api/fred, cache, errors (frontend-engineer)
    charts.js         Chart.js helpers: theme, recession shading plugin, CSV export, data table (frontend-engineer)
    nav.js            Shared header/nav + footer (frontend-engineer)
    format.js         Date/number formatting, URL-hash state helpers (frontend-engineer)
    econ.js           Pure economics math: yearAgo, align, Sahm, real rate, Okun gap, Taylor rule, recession periods, Phillips points, ERAS (econ-modeling-engineer)
    narrate.js        Data-driven plain-English sentences (econ-modeling-engineer)
    quiz-gen.js       Live-question templates, seeded PRNG, round builder (quiz-designer)
netlify/functions/fred.mjs   FRED proxy (data-api-engineer)
tests/
  fred.test.mjs       (data-api-engineer)
  frontend.test.mjs   format.js, charts.js pure helpers (CSV), fred-client.js with mocked fetch (frontend-engineer)
  econ.test.mjs       econ.js + narrate.js (econ-modeling-engineer)
  quiz.test.mjs       quiz-gen.js + quiz-bank.js integrity (quiz-designer)
netlify.toml, package.json, .env.example, .gitignore, README.md, CLAUDE.md   (architect)
docs/PRD.md, docs/PRD-v2.md                                                  (product-strategist)
.claude/agents/*.md                                                          (meta-agent)
```

**Module rules:** all `public/lib/*.js`, `indicators.js`, `content.js` and `quiz-bank.js` must be importable in Node (no DOM access at import time) so `npm test` can cover them. Pages may *import* any module; only the owner *edits* it. A change another agent needs in a file it doesn't own goes to that file's owner (via the orchestrator).

---

## 8. Milestones (build order)

Every milestone ends with: `npm test` green, qa-tester PASS, commit named after the milestone, auto-deploy, and the live-site "How to test" steps passing. No milestone leaves a broken link: nav entries for unbuilt pages point to a simple "Coming soon" page that the owner replaces later.

### M6 — Foundation: shared nav, data layer, expanded whitelist
*(Numbered after v1's M1–M5.)*
- **Goal:** Make the single page a multi-page site without changing what users see on the dashboard.
- **Scope:** F10, F11, F12, F13. "Coming soon" stubs for `policy.html`, `quiz.html`, `present.html` (each with nav). Refactor `app.js` to use `lib/fred-client.js`, `lib/format.js`, `lib/nav.js`; move About copy into `content.js`. Move `yearAgo` into `lib/econ.js`.
- **Files:** `netlify/functions/fred.mjs`, `tests/fred.test.mjs`; `public/lib/fred-client.js`, `public/lib/format.js`, `public/lib/nav.js`, `public/app.js`, `public/index.html`, `public/styles.css`, `tests/frontend.test.mjs`; `public/content.js`; `public/lib/econ.js` (yearAgo only), `tests/econ.test.mjs`; stub `public/policy.html` (econ-modeling-engineer), `public/quiz.html` (quiz-designer), `public/present.html` (frontend-engineer); `README.md`, `CLAUDE.md` file-structure section.
- **Owners:** data-api-engineer (whitelist), frontend-engineer (lib + dashboard + present stub), econ-content-writer (content.js), econ-modeling-engineer (econ.js seed + policy stub), quiz-designer (quiz stub), architect (contract note, README/CLAUDE.md structure).
- **Acceptance:** all 9 series return 200 from `/api/fred`; T10Y3M returns monthly (not daily) observations; unknown series still 400; NROU tests cover projection data being returned as-is (filtering is client-side). Dashboard looks and behaves exactly like v1. Nav on all four pages, keyboard-reachable, `aria-current` correct. Navigating Dashboard → Quiz stub → Dashboard makes no new `/api/fred` requests (sessionStorage). `npm test` covers fred-client error handling.
- **How to test (live):**
  1. Open `/` → four charts load as before; the top bar shows Dashboard · Policy Lab · Quiz · Class Mode · About, with Dashboard highlighted.
  2. Click **Policy Lab** → "Coming soon" page with the same nav. Click **Dashboard** → charts appear instantly; DevTools → Network shows no new `/api/fred` calls.
  3. Visit `/api/fred?series=USREC`, `?series=PCEPILFE`, `?series=NROU`, `?series=T10Y3M` → JSON; T10Y3M dates are the 1st of each month.
  4. Visit `/api/fred?series=DGS10` → 400.
  5. Resize to 375 px → nav wraps or collapses, no horizontal scroll.

### M7 — Smarter charts + Recession Watch
- **Goal:** Put every chart in business-cycle context and let data leave the page.
- **Scope:** F20, F21, F22, F23, F24, F25 (Should items may slip to M11).
- **Files:** `public/lib/charts.js`, `public/app.js`, `public/index.html`, `public/styles.css`, `tests/frontend.test.mjs` (frontend-engineer); `public/lib/econ.js` (recessionPeriods, sahmRule, threeMonthAvg), `public/lib/narrate.js`, `tests/econ.test.mjs` (econ-modeling-engineer); `public/indicators.js`, `public/content.js` (Recession Watch copy, shading note, PCE vs CPI copy) (econ-content-writer).
- **Owners:** frontend-engineer (lead), econ-modeling-engineer, econ-content-writer.
- **Acceptance:** shaded bands match NBER dates (2020-03→2020-04, 2008-01→2009-06, 2001-04→2001-11 as FRED USREC marks them); shading respects range buttons and theme. CSV for the visible range opens in Excel/Sheets with correct dates/values and header rows. Sahm value unit-tested against a hand-computed fixture (including a known trigger month, e.g. 2020); Recession Watch shows value, threshold, date and caveat. Yield-curve chart has a zero line; negative region visibly distinct. 2% target line appears only on PCE views. A failure of USREC leaves charts unshaded but working.
- **How to test (live):**
  1. Open `/`, click **20Y** → gray bands at 2008–09 and 2020 on all four charts; the unemployment spike sits inside the 2020 band.
  2. Click **Download CSV** on the unemployment card → file `UNRATE_20Y_<date>.csv`; last row matches the card's latest value.
  3. Click **Show data table** → table appears under the chart; Tab reaches it; it lists the latest rows.
  4. Scroll to **Recession Watch** → Sahm value like "0.3 pts (signal at 0.5)" with a date; yield-curve chart with a zero line; read the caveat.
  5. On the inflation card choose **Core PCE** → line changes and a dashed 2% line appears; choose **CPI** → 2% line disappears.
  6. Toggle system dark mode → shading and lines stay readable.

### M8 — Policy Lab I: Taylor rule
- **Goal:** Let students and instructors compare a transparent policy rule with what the Fed actually did.
- **Scope:** F30–F35, F39 (Taylor part). Replaces the `policy.html` stub.
- **Files:** `public/policy.html`, `public/policy.js`, `public/policy.css`, `public/lib/econ.js` (okunGap, taylorRule, alignMonthly, trimToLatest), `tests/econ.test.mjs` (econ-modeling-engineer); `public/content.js` (Taylor explainer, presets text, "try this" prompts) (econ-content-writer); reuses `lib/charts.js`, `lib/fred-client.js`, `lib/format.js` (hash-state helpers added by frontend-engineer if missing).
- **Owners:** econ-modeling-engineer (lead), econ-content-writer, frontend-engineer (only if a shared lib helper must change).
- **Acceptance:** with preset **Taylor (1993)** and inputs π = 2, gap = 0 the readout shows i = 4.0 (unit test); π = 4, gap = 0 → 7.0; π = 2, u − u\* = +1 with Okun 2 → gap −2 → i = 3.0. NROU projections beyond the latest UNRATE date are dropped (test). Changing any slider redraws in < 100 ms without refetching. Rule line drops below zero in 2009 and 2020 when ZLB toggle is off, floors at 0 when on. URL hash round-trips all settings. Formula with live numbers is shown. Inflation select defaults to core PCE and the copy says why.
- **How to test (live):**
  1. Click **Policy Lab** → chart with two lines (rule vs. actual fed funds) since 1990, recession shading, and a "Right now" box.
  2. Click **Taylor (1993)** preset → sliders jump to r\*=2, π\*=2, 0.5, 0.5.
  3. Drag **a_y** to 1.0 → line moves; preset label switches to **Balanced approach**.
  4. Drag **r\*** from 2 to 0.5 → whole rule line shifts down 1.5 points; "Right now" gap updates.
  5. Turn on **Respect zero lower bound** → 2009–2015 rule line flattens at 0.
  6. Click **Copy link**, open in a new tab → same settings restored.
  7. On a phone, sliders are usable with a thumb and show their values.

### M9 — Policy Lab II: Phillips curve + policy stance
- **Goal:** Show the Phillips curve and the real interest rate with real data, including where the textbook story breaks.
- **Scope:** F36, F37, F38, F39 (Phillips + stance parts).
- **Files:** `public/policy.html`, `public/policy.js`, `public/policy.css`, `public/lib/econ.js` (phillipsPoints, ERAS, realRate), `tests/econ.test.mjs` (econ-modeling-engineer); `public/content.js` (era blurbs, Phillips & stance explainers) (econ-content-writer).
- **Owners:** econ-modeling-engineer (lead), econ-content-writer.
- **Acceptance:** scatter has one point per month from 1948 on with both series present (inner join on date), five era colors meeting AA contrast against the background in both themes and distinguishable for common color-vision deficiencies (plus shape or legend toggle so color isn't the only cue). Tooltip shows month, u, π. Latest point emphasized. Era toggles work by click and keyboard. Real-rate chart = FEDFUNDS − core PCE YoY, aligned by month (unit-tested), with r\* line tied to the Taylor r\* slider. Page tabs/sections: Taylor · Phillips · Stance; each section's explainer present.
- **How to test (live):**
  1. Policy Lab → **Phillips curve** tab → colorful scatter; hover a 1970s point → tooltip like "Jun 1975 · 8.8% unemployment · 9.4% inflation" (values approximate; check against FRED).
  2. Toggle off all eras except **1960s** → a downward-sloping cloud; then only **1970s** → points drift up and right (stagflation).
  3. Turn on **Connect the dots** for **2020–now** → path loops from the 2020 unemployment spike to the 2022 inflation peak and back.
  4. **Policy stance** tab → real rate line with the r\* line; in 2021 the real rate is deeply negative ("looser than neutral"), in 2024 it is positive.
  5. Change r\* on the Taylor tab → r\* line on the Stance tab moves too.

### M10 — Live-data Quiz
- **Goal:** Give students a fast, always-current way to check understanding, and instructors a no-login shared quiz.
- **Scope:** F40–F46. Replaces the `quiz.html` stub.
- **Files:** `public/quiz.html`, `public/quiz.js`, `public/quiz.css`, `public/quiz-bank.js`, `public/lib/quiz-gen.js`, `tests/quiz.test.mjs` (quiz-designer); reuses `lib/econ.js` (Sahm, real rate, Taylor), `lib/fred-client.js`, `content.js` glossary. econ-content-writer reviews concept questions (review only; edits go back through quiz-designer).
- **Owners:** quiz-designer (lead), econ-content-writer (review).
- **Acceptance:** ≥ 12 live templates and ≥ 30 concept questions; every question has exactly one correct answer, an explanation, a topic tag and (for live) a source series + "as of" date — enforced by tests. Live answer keys are computed by the same functions that render the number, using values rounded as displayed (unit tests with fixed fixtures, incl. ties → "about the same"). Same seed → identical questions and option order (test). Missing series → round still has 10 questions. Fully keyboard-operable; feedback announced via `aria-live`. No question compares CPI to the 2% target.
- **How to test (live):**
  1. Click **Quiz** → **Start** → question 1 shows "Data as of <month year>" and four options.
  2. Answer → green/red feedback with a short explanation and "See the chart" link that opens the dashboard.
  3. Finish 10 questions → score and a review list.
  4. Open `/quiz.html?seed=demo` on two devices → identical questions in identical order. Add `&key=1` → printable answer key.
  5. Choose **Estimate first** → guess unemployment with the slider → reveal shows the real value and your error.
  6. Check one live answer by hand on the dashboard (e.g., unemployment vs. a year ago) → it agrees.

### M11 — Class Mode: slides, time machine, citations, handout
- **Goal:** Make the site the instructor's opening slide and the student's citation source.
- **Scope:** F50–F56, and any M7 Should items that slipped. Replaces the `present.html` stub; adds Copy citation (F53) to dashboard cards and Policy Lab.
- **Files:** `public/present.html`, `public/present.js`, `public/styles.css` (present + print rules), `public/app.js` (citation buttons), `public/lib/format.js` (citation formatter) , `tests/frontend.test.mjs` (frontend-engineer); `public/lib/narrate.js` (slide sentences, LMS summary), `tests/econ.test.mjs` (econ-modeling-engineer); `public/content.js` (citation source agencies per series, slide copy) (econ-content-writer); `public/policy.js` (citation button) (econ-modeling-engineer); `public/lib/quiz-gen.js` must expose `pickOne(data, seed)` (quiz-designer, if not already).
- **Owners:** frontend-engineer (lead), econ-modeling-engineer, econ-content-writer, quiz-designer (one export).
- **Acceptance:** slides build from live data with no manual input; ←/→/Space/F work; headline numbers ≥ 48px at 1280×720; a failed series shows a graceful slide instead of breaking the deck. `?compare=YYYY-MM` shows then vs. now for each indicator with the then-value taken from the latest observation on or before that month (quarterly GDP handled), and says if that month was a recession. Citation strings match APA format with the correct source agency per series (as FRED lists them: BLS for CPIAUCSL/UNRATE; BEA for GDPC1/PCEPI/PCEPILFE; Board of Governors of the Federal Reserve System for FEDFUNDS; Federal Reserve Bank of St. Louis for USREC (based on NBER dates) and T10Y3M; Congressional Budget Office for NROU) and today's retrieval date (unit-tested). Print preview of the handout fits one US-letter page.
- **How to test (live):**
  1. Click **Class Mode** → title slide with today's data date; press → to step through indicator slides, Recession Watch, Taylor "right now", a class question (press Space to reveal), sources.
  2. Press **F** → fullscreen; text readable from across the room.
  3. Open `/present.html?compare=1980-03` → "Then vs. Now" slide: inflation ~14.8% then vs. today's value; marked as a recession month.
  4. On the dashboard click **Copy citation** on Unemployment → paste into a doc → APA citation with today's date.
  5. Click **Copy summary** → paste into a discussion post → one paragraph with numbers, dates and sources.
  6. Print (Ctrl/Cmd+P) from Class Mode → **Handout** → one-page preview.

### M12 — Hardening: accessibility, performance, security, docs
- **Goal:** Ship v2 as something an instructor can trust in front of 150 students.
- **Scope:** F60–F63, glossary section, security headers, README/CLAUDE.md refresh, full regression of every earlier "How to test".
- **Files:** `netlify.toml` (headers incl. CSP: `default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'`), `README.md`, `CLAUDE.md`, `package.json` (version 2.0.0) (architect); `public/index.html`, `public/app.js`, `public/styles.css`, `public/lib/*.js` owned by frontend (glossary section, a11y fixes) (frontend-engineer); `public/content.js` (glossary) (econ-content-writer); page-owner fixes in policy/quiz files (econ-modeling-engineer, quiz-designer); `docs/PRD-v2.md` status → v2.0 shipped (product-strategist).
- **Owners:** qa-tester (lead auditor, report only), architect, frontend-engineer, econ-content-writer; page owners fix their own findings.
- **Acceptance:** every page passes a keyboard-only walkthrough and an automated a11y check (axe or Lighthouse ≥ 95 accessibility) in light and dark; no console errors on any page; CSP header present and nothing blocked (Chart.js from cdnjs still loads); Lighthouse performance ≥ 85 on mobile for `/`; repo grep finds no key; README documents all pages, series and how to test; all M6–M11 test steps pass on the live site.
- **How to test (live):**
  1. DevTools → Network → `/` response headers include `Content-Security-Policy`; Console shows no CSP violations on all four pages.
  2. Unplug the mouse: Tab through Dashboard, Policy Lab sliders (arrow keys change values), Quiz and Class Mode.
  3. Run Lighthouse (mobile) on `/` and `/policy.html` → Accessibility ≥ 95, Performance ≥ 85.
  4. Scroll to **Glossary** on the dashboard → terms such as "output gap", "r\*", "core inflation".
  5. Re-run every "How to test" list from M6–M11.

---

## 9. Future roadmap — not in v2

Needs accounts, a database, a different backend or other APIs, so it is out of scope for v2's static + one-function architecture:

- **Class accounts & grade sync:** rosters, saved scores, LMS (Canvas LTI) gradebook pass-back. Needs auth + database + FERPA review.
- **Cross-device progress / spaced repetition:** needs user storage.
- **AI tutor ("explain this chart to me", free-text answers graded by an LLM):** needs an LLM API key and cost controls.
- **Real-time "what the Fed saw" mode:** ALFRED vintage data (`realtime_start/end`) to show first-release numbers and replay decisions with the data available at the time — feasible with the FRED API but needs a more complex function contract and caching; strong v3 candidate.
- **State and metro dashboards** (state unemployment, Florida focus): hundreds of series; needs a pattern-based whitelist and abuse limits.
- **FOMC meeting calendar, dot plot, Summary of Economic Projections:** not in FRED as clean series; would need another source.
- **Free-text series search / custom charts:** turns the proxy into an open relay for the API key; needs rate limiting and quotas.
- **Spanish-language version** (valuable for FAU's student body): buildable statically but needs a translation review owner; defer until copy stabilizes after v2.
- **Email/SMS alerts** on new data releases or the Sahm rule triggering: needs a scheduler and a mail provider.
- **Forecasts or nowcasts:** out of scope by design (accuracy and liability).

---

## 10. Success metrics

- Dashboard: first chart < 3 s on a cold function; every page works at 375 px with no horizontal scroll.
- Economics: zero factual errors found in instructor review of all copy, quiz explanations and Policy Lab formulas (Autumn signs off).
- Quiz: in a pilot section, students who take two quizzes improve their concept score from the first to the second (self-reported or in-class tally — no tracking).
- Instructor adoption: at least one instructor uses Class Mode in a lecture and a seeded quiz during the semester.
- Ops: Netlify function invocations stay within the free tier (CDN cache + sessionStorage); API key never appears in page source, network responses or the repo.

## 11. Agent roster for v2

| Agent | Owns (edits) |
|---|---|
| product-strategist | `docs/PRD.md`, `docs/PRD-v2.md` |
| architect | `netlify.toml`, `package.json`, `.env.example`, `.gitignore`, `README.md`, `CLAUDE.md` |
| data-api-engineer | `netlify/functions/fred.mjs`, `tests/fred.test.mjs` |
| frontend-engineer | `public/index.html`, `public/app.js`, `public/styles.css`, `public/present.html`, `public/present.js`, `public/lib/fred-client.js`, `public/lib/charts.js`, `public/lib/nav.js`, `public/lib/format.js`, `tests/frontend.test.mjs` |
| econ-modeling-engineer | `public/policy.html`, `public/policy.js`, `public/policy.css`, `public/lib/econ.js`, `public/lib/narrate.js`, `tests/econ.test.mjs` |
| quiz-designer | `public/quiz.html`, `public/quiz.js`, `public/quiz.css`, `public/quiz-bank.js`, `public/lib/quiz-gen.js`, `tests/quiz.test.mjs` |
| econ-content-writer | `public/indicators.js`, `public/content.js` |
| meta-agent | `.claude/agents/*.md` |
| orchestrator, qa-tester | no files (coordinate / verify) |
