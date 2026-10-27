# FRED Macro Dashboard

Live U.S. macro indicators from the St. Louis Fed's [FRED API](https://fred.stlouisfed.org/docs/api/fred/), with plain-English explanations for Principles of Macroeconomics students.

Built by Autumn Roney (M.S. Economics, FAU) for ISM 6427C with a team of Claude Code sub-agents (see `.claude/agents/`). Requirements are in [`docs/PRD.md`](docs/PRD.md).

| Indicator | FRED series | Shown as |
|---|---|---|
| Inflation | CPIAUCSL | % change from a year ago |
| Unemployment rate | UNRATE | % |
| Effective federal funds rate | FEDFUNDS | % |
| Real GDP growth | GDPC1 | % change, annualized (q/q) |

## How it works

`public/` is a static site (HTML/CSS/JS + Chart.js). It calls `/api/fred?series=ID`, which `netlify.toml` routes to the Netlify Function `netlify/functions/fred.mjs`. The function adds the API key from the `FRED_API_KEY` environment variable, so the key never reaches the browser or the repo. Only the four series above are allowed.

## Deploy on Netlify (one time)

1. Netlify → **Add new site → Import an existing project → GitHub** → pick this repo. Leave the build settings blank; `netlify.toml` handles them.
2. **Site configuration → Environment variables** → add `FRED_API_KEY` = your key (free at <https://fredaccount.stlouisfed.org/apikeys>).
3. **Deploys → Trigger deploy**. After this, every push to the deployed branch redeploys automatically.

## How to test the live site

- `https://<your-site>.netlify.app/api/fred?series=UNRATE` → JSON with observations.
- `https://<your-site>.netlify.app/api/fred?series=FOO` → 400 error.
- Open the site: four charts load, each with its latest value and date. Compare UNRATE with <https://fred.stlouisfed.org/series/UNRATE>.
- Click **20Y**: charts reach back to ~2006 and show the 2008–09 recession. Click **1Y**: only the last year.
- On a phone, the cards stack in one column. Switching the system to dark mode switches the colors.

## Development

```
npm test   # unit tests for the function, with FRED mocked (no key or network needed)
```
