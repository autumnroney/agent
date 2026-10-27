# Handoff: where the v2 build left off

**Say in the morning:** "continue to do what we were doing last night". Claude should read this file first.

## Process (keep using it)
Source of truth: `docs/PRD-v2.md` §8, milestones M6–M12. For each milestone:
1. Use the project agents in `.claude/agents/`: econ-content-writer writes copy first, then the lead owner builds, then qa-tester signs off. (Earlier, a general-purpose builder agent that acts as that milestone's owner agents (see `.claude/agents/` and PRD §11 file ownership). It implemented each milestone's scope, ran `npm test` and browser-tested with the mock server.)
2. Run QA: `npm test`, `node --check` on every JS file, scan for API keys (`git grep -nE '[0-9a-f]{32}'`; only the test FAKE_KEY may match), and confirm the browser checks.
3. Commit as "M<n>: ..." and push to the working branch `claude/busy-tesla-9wq512`. Fast-forward `main` once the milestone passes (Netlify deploys `main`; the owner approved this on Oct 27).
4. Move on to the next milestone until M12 is done.

## Status
| Milestone | Status |
|---|---|
| v1 (M1–M5) | Done, live on Netlify (dashing-kheer-aa0aeb.netlify.app) |
| Plan v2 (PRD-v2 + new agents) | Done |
| M6 Foundation | Done: commit cbb476f, on `main` |
| M7 Smarter charts + Recession Watch | Done: on `main` (77/77 tests) |
| M8 Policy Lab I: Taylor rule | Done: on `main` (89/89 tests, QA PASS) |
| M9 Policy Lab II: Phillips curve + policy stance | **NEXT**: the content writer writes the copy in content.js first, then econ-modeling-engineer builds the page, then qa-tester signs off |
| M10 Live-data Quiz | Not started |
| M11 Class Mode | Not started |
| M12 Hardening | Not started |

## Open notes from M7
- The About line "Figures are seasonally adjusted" doesn't apply to USREC or T10Y3M. The econ-content-writer should fix it in a later milestone.
- `SOURCES` (the agency for each series) is in `public/content.js` already. M11 citations should reuse it.
- `public/lib/charts.js` has shared helpers (shading, reference lines, CSV, tables). The Policy Lab (M8/M9) should reuse them.

## Testing notes
- This sandbox blocks FRED and cdnjs. Browser tests use a mock server that sends synthetic data through the real function, with cdnjs requests routed to a local Chart.js. Those scripts live in the session scratchpad, which won't exist in a new session. Recreate them like this:
  - `npm pack chart.js@4.4.1` and extract it.
  - Run a small Node server that serves `public/` and calls `netlify/functions/fred.mjs` with a mocked `globalThis.fetch` that returns synthetic observations for every whitelisted series.
  - In Playwright, `page.route("https://cdnjs.cloudflare.com/**")` to the local `chart.umd.js`.
- None of this has been tested against real FRED data yet. After each deploy, check the live site, including `/api/fred?series=UNRATE`.

## Owner's to-dos
- Netlify env var must be named exactly `FRED_API_KEY`. It was briefly mistyped as `FED_API_KEY`. Redeploy after any change.
- The Netlify project must be **public** for the instructor to view it.
