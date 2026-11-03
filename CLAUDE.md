# CLAUDE.md — FRED Macro Dashboard

## Persona
You are building a teaching tool for intro-macroeconomics students on behalf of Autumn Roney (M.S. Economics, FAU). Accuracy of the economics and protection of the API key matter more than flashy features. Explanations are plain English, short, and correct.

## Context
- Source of truth: `docs/PRD-v2.md` (v2: milestones M6–M12, file ownership in §11; M13 Labor Market/BLS adds to it). `docs/PRD.md` is the shipped v1 plan, kept as history. Build milestone by milestone; every milestone must leave a clickable UI and "how to test" steps.
- Data: St. Louis Fed FRED API. v1 series: CPIAUCSL (units `pc1`), UNRATE (`lin`), FEDFUNDS (`lin`), GDPC1 (`pca`). v2 adds USREC (`lin`), PCEPI (`pc1`), PCEPILFE (`pc1`), NROU (`lin`), T10Y3M (`lin`, monthly average) — see PRD-v2 §5.
- Each file has exactly one owner agent (PRD-v2 §11, `.claude/agents/`); only the owner edits it.
- The browser NEVER calls FRED directly. It calls `/api/fred`, a Netlify Function that reads `FRED_API_KEY` from the environment.
- Data (M13): BLS Public Data API v2, all monthly, seasonally adjusted: LASST120000000000003 (Florida unemployment rate), LNS14000000 (U.S. unemployment rate), CES0500000003 (average hourly earnings), CES0000000001 (nonfarm payrolls), JTS000000000000000JOL (job openings). The browser NEVER calls BLS directly. It calls `/api/bls`, a Netlify Function that reads `BLS_API_KEY` from the environment.

## File structure
```
public/                 static multi-page site, vanilla ES modules, no build step
  index.html, app.js    Dashboard (4 indicator cards)
  labor.html/.js        Labor Market (BLS: FL vs U.S. unemployment, earnings, payrolls, openings; M13)
  policy.html/.js       Policy Lab ("Coming soon" stub until M8)
  quiz.html/.js         Quiz ("Coming soon" stub until M10)
  present.html/.js      Class Mode ("Coming soon" stub until M11)
  styles.css            global styles (nav, cards, stubs, dark mode)
  indicators.js         per-indicator metadata + copy
  content.js            all other copy (header, About, footer, stub pages; later glossary/explainers)
  lib/                  shared modules, importable in Node (no DOM at import time)
    fred-client.js      getSeries(id, {start}): /api/fred + errors + in-flight dedupe + sessionStorage cache
    bls-client.js       getBlsSeries(id, {start}): same client pointed at /api/bls (cache prefix bls:v1:)
    format.js           date/number formatting, URL-hash helpers
    nav.js              shared skip link, top nav, footer, "Coming soon" body
    econ.js             pure economics math (yearAgo; more from M7)
netlify/functions/      fred.mjs — FRED proxy; bls.mjs — BLS proxy (whitelisted series only)
netlify.toml            publish dir, functions dir, /api/fred and /api/bls redirects
tests/                  node:test unit tests (mocked fetch, no network): fred, bls (bls.test.mjs), frontend, econ
docs/PRD-v2.md          product requirements (v2, source of truth); docs/PRD.md = v1 history
.claude/agents/         sub-agent definitions
```

## Rules
- Never commit an API key (`FRED_API_KEY` or `BLS_API_KEY`). `.env` is git-ignored; document variables in `.env.example`.
- Only whitelisted series may be proxied, by either function (`fred.mjs`, `bls.mjs`); validate `start` as `YYYY-MM-DD`.
- No build step; Chart.js loads from cdnjs with a pinned version.
- Run `npm test` before every commit.
- Commit after each milestone with a message naming the milestone.
