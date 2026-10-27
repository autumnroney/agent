# FRED Macro Dashboard

Live U.S. macro indicators from the St. Louis Fed's [FRED API](https://fred.stlouisfed.org/docs/api/fred/), with plain-English explanations for Principles of Macroeconomics students.

Built by Autumn Roney (M.S. Economics, FAU) for ISM 6427C with a team of Claude Code sub-agents (see `.claude/agents/`). Requirements are in [`docs/PRD-v2.md`](docs/PRD-v2.md) (v2, current); [`docs/PRD.md`](docs/PRD.md) is the shipped v1 plan.

## Pages

| Page | URL | Status |
|---|---|---|
| Dashboard | `/` | Four live charts with range buttons, latest value, change vs. a year earlier |
| Policy Lab | `/policy.html` | Coming soon (M8–M9) |
| Quiz | `/quiz.html` | Coming soon (M10) |
| Class Mode | `/present.html` | Coming soon (M11) |
| About | `/#about` | Section of the dashboard |

Every page shares one top navigation bar (`public/lib/nav.js`), with the current page marked `aria-current="page"`.

## Data series

The function proxies only these FRED series (PRD-v2 §5.1). Units and frequency are fixed server-side; the browser can't change them.

| FRED series | What | Units sent to FRED | Frequency | Used on |
|---|---|---|---|---|
| CPIAUCSL | CPI inflation | `pc1` (% change from a year ago) | Monthly | Dashboard |
| UNRATE | Unemployment rate | `lin` | Monthly | Dashboard |
| FEDFUNDS | Effective federal funds rate | `lin` | Monthly | Dashboard |
| GDPC1 | Real GDP growth | `pca` (annualized q/q) | Quarterly | Dashboard |
| USREC | NBER recession indicator (1 = recession) | `lin` | Monthly | Recession shading (M7) |
| PCEPI | PCE inflation (the Fed's 2% target measure) | `pc1` | Monthly | M7+ |
| PCEPILFE | Core PCE inflation | `pc1` | Monthly | Policy Lab (M8) |
| NROU | CBO noncyclical rate of unemployment (u*) | `lin` | Quarterly, **includes CBO projections** | Policy Lab (M8) |
| T10Y3M | 10-year minus 3-month Treasury spread | `lin`, `frequency=m`, `aggregation_method=avg` | Daily → monthly average | Recession Watch (M7) |

## How it works

`public/` is a static multi-page site (HTML/CSS/vanilla ES modules + Chart.js 4.4.1 from cdnjs, no build step). Pages load data with `getSeries(id, {start})` from `public/lib/fred-client.js`, which calls `/api/fred`, turns failures into readable messages, shares in-flight requests and caches responses in `sessionStorage` for an hour, so moving between pages doesn't refetch. `netlify.toml` routes `/api/fred` to the Netlify Function `netlify/functions/fred.mjs`, which adds the API key from the `FRED_API_KEY` environment variable, so the key never reaches the browser or the repo.

### API contract

`GET /api/fred?series=ID&start=YYYY-MM-DD` (`start` optional) →
`{ series, title, units, frequency, observations: [{ date, value }] }` with `Cache-Control: public, max-age=3600`.

- Unknown series → 400; malformed `start` → 400; missing key → 500 with a setup hint; FRED failure → 502.
- FRED's missing values (`"."`) are dropped; values are numbers.
- A whitelist entry may carry a server-side frequency/aggregation (only T10Y3M does: monthly average, dated the 1st of each month). Any `units`, `frequency` or `aggregation_method` in the query string is ignored.
- NROU comes back exactly as FRED sends it, CBO projections included. Clients must drop observations after the latest UNRATE date (`lib/econ.js`, M8).

## Deploy on Netlify (one time)

1. Netlify → **Add new site → Import an existing project → GitHub** → pick this repo. Leave the build settings blank; `netlify.toml` handles them.
2. **Site configuration → Environment variables** → add `FRED_API_KEY` = your key (free at <https://fredaccount.stlouisfed.org/apikeys>).
3. **Deploys → Trigger deploy**. After this, every push to the deployed branch redeploys automatically.

## How to test the live site

- `/api/fred?series=UNRATE` → JSON with observations. `/api/fred?series=USREC`, `?series=PCEPILFE`, `?series=NROU`, `?series=T10Y3M` → JSON; T10Y3M dates are the 1st of each month.
- `/api/fred?series=DGS10` → 400 error.
- Open `/`: four charts load, each with its latest value and date; the top bar shows Dashboard · Policy Lab · Quiz · Class Mode · About with Dashboard highlighted. Compare UNRATE with <https://fred.stlouisfed.org/series/UNRATE>.
- Click **20Y**: charts reach back about 20 years and show the 2008–09 recession. Click **1Y**: only the last year.
- Click **Policy Lab** → "Coming soon" page with the same nav. Click **Dashboard** → charts appear at once, and DevTools → Network shows no new `/api/fred` calls.
- Tab from the top of any page: "Skip to content", then the nav links, each with a visible focus ring.
- On a phone (375 px), the nav fits and the cards stack in one column with no sideways scrolling. Switching the system to dark mode switches the colors.

## Development

```
npm test   # node:test unit tests: the function (FRED mocked), fred-client/format/nav, econ math. No key or network needed.
```
