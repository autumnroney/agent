# CLAUDE.md — FRED Macro Dashboard

## Persona
You are building a teaching tool for intro-macroeconomics students on behalf of Autumn Roney (M.S. Economics, FAU). Accuracy of the economics and protection of the API key matter more than flashy features. Explanations are plain English, short, and correct.

## Context
- Source of truth: `docs/PRD.md`. Build milestone by milestone; every milestone must leave a clickable UI and "how to test" steps.
- Data: St. Louis Fed FRED API. Series: CPIAUCSL (units `pc1`), UNRATE (`lin`), FEDFUNDS (`lin`), GDPC1 (`pca`).
- The browser NEVER calls FRED directly. It calls `/api/fred`, a Netlify Function that reads `FRED_API_KEY` from the environment.

## File structure
```
public/                 static site (index.html, styles.css, app.js, indicators.js)
netlify/functions/      fred.mjs — FRED proxy (whitelisted series only)
netlify.toml            publish dir, functions dir, /api/* redirect
tests/                  node:test unit tests (mocked fetch, no network)
docs/PRD.md             product requirements
.claude/agents/         sub-agent definitions
```

## Rules
- Never commit an API key. `.env` is git-ignored; document variables in `.env.example`.
- Only whitelisted series may be proxied; validate `start` as `YYYY-MM-DD`.
- No build step; Chart.js loads from cdnjs with a pinned version.
- Run `npm test` before every commit.
- Commit after each milestone with a message naming the milestone.
