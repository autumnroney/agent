import { test } from "node:test";
import assert from "node:assert/strict";
import {
  yearAgo,
  recessionPeriods,
  threeMonthAvg,
  sahmSeries,
  sahmRule,
  sahmTriggered,
  yieldCurve,
  SAHM_THRESHOLD,
  OKUN_DEFAULT,
  TAYLOR_PRESETS,
  okunGap,
  taylorRule,
  applyZLB,
  matchPreset,
  trimToLatest,
  stepFillMonthly,
  alignMonthly,
  taylorInputs,
  taylorSeries,
  latestComplete,
  latestRule,
  ERAS,
  eraOf,
  phillipsPoints,
  realRate,
  policyStance,
} from "../public/lib/econ.js";
import {
  periodLabel,
  changePhrase,
  latestSentence,
  dashboardSummary,
  sahmSentence,
  yieldCurveSentence,
  fillTemplate,
  compareAtDisplay,
  taylorRightNow,
  stanceRightNow,
} from "../public/lib/narrate.js";
import { POLICY_LAB } from "../public/content.js";

const monthly = (start, values) => {
  const [y, m] = start.split("-").map(Number);
  return values.map((value, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return { date: d.toISOString().slice(0, 10), value };
  });
};

test("yearAgo: monthly series returns the same month one year earlier", () => {
  const obs = monthly("2024-09-01", [4.1, 4.1, 4.2, 4.2, 4.0, 4.1, 4.2, 4.2, 4.1, 4.2, 4.2, 4.3, 4.3]);
  assert.equal(obs.at(-1).date, "2025-09-01");
  assert.deepEqual(yearAgo(obs), { date: "2024-09-01", value: 4.1 });
});

test("yearAgo: quarterly series returns the same quarter one year earlier", () => {
  const obs = [
    { date: "2024-04-01", value: 3.0 },
    { date: "2024-07-01", value: 3.1 },
    { date: "2024-10-01", value: 2.4 },
    { date: "2025-01-01", value: -0.5 },
    { date: "2025-04-01", value: 3.8 },
    { date: "2025-07-01", value: 2.9 },
  ];
  assert.deepEqual(yearAgo(obs), { date: "2024-07-01", value: 3.1 });
});

test("yearAgo: a missing month falls back to the latest earlier observation (by date, not index)", () => {
  // Oct 2024 is missing (e.g. a skipped release); the series has 12 points, so index math would be wrong.
  const obs = monthly("2024-08-01", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).filter(
    (o) => o.date !== "2024-10-01"
  );
  assert.equal(obs.at(-1).date, "2025-09-01");
  assert.deepEqual(yearAgo(obs), { date: "2024-09-01", value: 2 });

  const gap = obs.filter((o) => o.date !== "2024-09-01");
  assert.deepEqual(yearAgo(gap), { date: "2024-08-01", value: 1 });
});

test("yearAgo: returns null when history is shorter than a year or empty", () => {
  assert.equal(yearAgo(monthly("2025-01-01", [1, 2, 3, 4, 5, 6])), null);
  assert.equal(yearAgo([]), null);
  assert.equal(yearAgo(undefined), null);
  assert.equal(yearAgo([{ date: "2025-01-01", value: 1 }]), null);
});

test("yearAgo: daily-dated Feb 29 compares with Feb 28 of the prior year", () => {
  const obs = [
    { date: "2023-02-27", value: 1 },
    { date: "2023-02-28", value: 2 },
    { date: "2023-03-01", value: 3 },
    { date: "2024-02-29", value: 4 },
  ];
  assert.deepEqual(yearAgo(obs), { date: "2023-02-28", value: 2 });
});

// ---------- M7: recession periods ----------

test("recessionPeriods: runs of USREC = 1 become inclusive start/end months (FRED's marking)", () => {
  // USREC as FRED marks the last three recessions (peak month excluded, trough month included).
  const usrec = monthly("2000-01-01", Array(24 * 12 - 1).fill(0)).map((o) => ({
    ...o,
    value:
      (o.date >= "2001-04-01" && o.date <= "2001-11-01") ||
      (o.date >= "2008-01-01" && o.date <= "2009-06-01") ||
      (o.date >= "2020-03-01" && o.date <= "2020-04-01")
        ? 1
        : 0,
  }));
  assert.equal(usrec.at(-1).date, "2023-11-01");
  assert.deepEqual(recessionPeriods(usrec), [
    { start: "2001-04-01", end: "2001-11-01", ongoing: false },
    { start: "2008-01-01", end: "2009-06-01", ongoing: false },
    { start: "2020-03-01", end: "2020-04-01", ongoing: false },
  ]);
});

test("recessionPeriods: single-month, ongoing, gaps and empty input", () => {
  assert.deepEqual(recessionPeriods(monthly("2020-01-01", [0, 1, 0, 1, 1])), [
    { start: "2020-02-01", end: "2020-02-01", ongoing: false },
    { start: "2020-04-01", end: "2020-05-01", ongoing: true },
  ]);
  // A missing month splits a run (joined by date, never by index).
  const gappy = monthly("2020-01-01", [1, 1, 1, 1]).filter((o) => o.date !== "2020-03-01");
  assert.deepEqual(recessionPeriods(gappy), [
    { start: "2020-01-01", end: "2020-02-01", ongoing: false },
    { start: "2020-04-01", end: "2020-04-01", ongoing: true },
  ]);
  assert.deepEqual(recessionPeriods([]), []);
  assert.deepEqual(recessionPeriods(undefined), []);
  assert.deepEqual(recessionPeriods(monthly("2020-01-01", [0, 0])), []);
});

// ---------- M7: 3-month average ----------

test("threeMonthAvg: trailing average of t, t−1, t−2; skips months without all three", () => {
  const avg = threeMonthAvg(monthly("2020-01-01", [3, 6, 9, 12]));
  assert.deepEqual(avg, [
    { date: "2020-03-01", value: 6 },
    { date: "2020-04-01", value: 9 },
  ]);
  const gappy = monthly("2020-01-01", [1, 2, 3, 4, 5, 6]).filter((o) => o.date !== "2020-03-01");
  // Mar is missing, so Mar/Apr/May have no complete window; Jun (Apr, May, Jun) does.
  assert.deepEqual(threeMonthAvg(gappy), [{ date: "2020-06-01", value: 5 }]);
  assert.deepEqual(threeMonthAvg([]), []);
});

// ---------- M7: Sahm rule ----------

// UNRATE as currently revised, Jan 2019 – Jun 2020 (FRED). Hand computation:
//   3-mo avg Mar 2020 = (3.5 + 3.5 + 4.4) / 3 = 3.8000
//   lowest 3-mo avg Mar 2019 – Feb 2020 = Feb 2020 = (3.6 + 3.5 + 3.5) / 3 = 3.5333
//   Sahm Mar 2020 = 0.2667  -> not triggered
//   3-mo avg Apr 2020 = (3.5 + 4.4 + 14.8) / 3 = 7.5667; prior low (Apr 2019 – Mar 2020) = 3.5333
//   Sahm Apr 2020 = 4.0333  -> triggered (the first trigger month in 2020)
const UNRATE_2019_2020 = monthly(
  "2019-01-01",
  [4.0, 3.8, 3.8, 3.7, 3.6, 3.6, 3.7, 3.6, 3.5, 3.6, 3.6, 3.6, 3.5, 3.5, 4.4, 14.8, 13.2, 11.0]
);

test("sahmSeries: hand-computed 2020 values (first defined month is Mar 2020)", () => {
  const s = sahmSeries(UNRATE_2019_2020);
  // Needs 2 months for the first average + 12 prior averages: Jan 2019 data -> first value Mar 2020.
  assert.equal(s[0].date, "2020-03-01");
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
  close(s[0].avg3, 3.8);
  close(s[0].priorMin, (3.6 + 3.5 + 3.5) / 3);
  close(s[0].value, 3.8 - 10.6 / 3);
  assert.equal(s[0].value.toFixed(2), "0.27");
  const apr = s.find((x) => x.date === "2020-04-01");
  close(apr.value, (3.5 + 4.4 + 14.8) / 3 - 10.6 / 3);
  assert.equal(apr.value.toFixed(2), "4.03");
  assert.deepEqual(
    s.map((x) => [x.date, sahmTriggered(x.value)]),
    [
      ["2020-03-01", false],
      ["2020-04-01", true],
      ["2020-05-01", true],
      ["2020-06-01", true],
    ]
  );
});

test("sahmRule: latest reading with threshold and trigger flag", () => {
  const r = sahmRule(UNRATE_2019_2020);
  assert.equal(r.date, "2020-06-01");
  assert.equal(r.threshold, 0.5);
  assert.equal(SAHM_THRESHOLD, 0.5);
  assert.equal(r.triggered, true);
  // Mar 2020 alone: 0.27, not triggered.
  const mar = sahmRule(UNRATE_2019_2020.filter((o) => o.date <= "2020-03-01"));
  assert.equal(mar.triggered, false);
  assert.equal(mar.value.toFixed(2), "0.27");
});

test("sahmRule: exactly 0.50 triggers (despite float noise); 0.47 does not", () => {
  // 14 months at 3.5, then three at 4.0: the 3-mo average rises exactly 0.50 above its prior low.
  const base = Array(14).fill(3.5);
  const exact = sahmRule(monthly("2023-01-01", [...base, 4.0, 4.0, 4.0]));
  assert.ok(Math.abs(exact.value - 0.5) < 1e-9);
  assert.equal(exact.triggered, true);
  // (3.9 + 4.0 + 4.0)/3 − 3.5 = 0.4667 -> below the signal.
  const below = sahmRule(monthly("2023-01-01", [...base, 3.9, 4.0, 4.0]));
  assert.equal(below.value.toFixed(2), "0.47");
  assert.equal(below.triggered, false);
  // Floating-point noise around 0.5 still triggers at display precision.
  assert.equal(sahmTriggered(0.49999999999), true);
  assert.equal(sahmTriggered(0.494), false);
  assert.equal(sahmTriggered(NaN), false);
});

test("sahmRule: the prior-12-month low excludes the current month and can make the value negative", () => {
  // Falling unemployment: the current 3-mo average is below every prior one.
  const s = sahmRule(monthly("2023-01-01", [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4]));
  // Prior low = the t−1 average (5 + 4 + 4) / 3 = 4.3333; current average = 4.0 -> −0.33.
  assert.ok(Math.abs(s.value - (4 - 13 / 3)) < 1e-9);
  assert.ok(s.value < 0);
  assert.equal(s.triggered, false);
});

test("sahmRule: too little history or a gap in the 12-month window gives no reading", () => {
  assert.equal(sahmRule(monthly("2023-01-01", Array(14).fill(4))), null); // needs 15 months
  assert.notEqual(sahmRule(monthly("2023-01-01", Array(15).fill(4))), null);
  const gappy = monthly("2023-01-01", Array(20).fill(4)).filter((o) => o.date !== "2023-12-01");
  // Dec 2023 missing breaks the 3-mo averages for Dec–Feb, so no month has 12 complete prior averages.
  assert.equal(sahmRule(gappy), null);
  assert.equal(sahmRule([]), null);
});

// ---------- M7: yield curve ----------

test("yieldCurve: inverted means T10Y3M < 0; counts the current inversion streak", () => {
  const spread = monthly("2023-01-01", [0.4, -0.2, -0.5, -0.1]);
  assert.deepEqual(yieldCurve(spread), { date: "2023-04-01", value: -0.1, inverted: true, invertedMonths: 3 });
  assert.deepEqual(yieldCurve(monthly("2024-01-01", [-1, 0])), {
    date: "2024-02-01",
    value: 0,
    inverted: false,
    invertedMonths: 0,
  });
  assert.equal(yieldCurve([]), null);
});

// ---------- M7: narrate.js ----------

test("periodLabel / changePhrase", () => {
  assert.equal(periodLabel("2026-09-01"), "September 2026");
  assert.equal(periodLabel("2026-04-01", "Quarterly"), "Q2 2026");
  assert.equal(changePhrase(0.2), "up 0.2 points");
  assert.equal(changePhrase(-1), "down 1.0 points");
  assert.equal(changePhrase(0.04), "unchanged");
  assert.equal(changePhrase(4.3 - 4.1), "up 0.2 points");
});

test("latestSentence: latest value, date and change vs. a year earlier", () => {
  const obs = monthly("2025-09-01", [4.1, 4.1, 4.2, 4.2, 4.0, 4.1, 4.2, 4.2, 4.1, 4.2, 4.2, 4.3, 4.3]);
  assert.equal(
    latestSentence({ label: "Unemployment", obs }),
    "Unemployment was 4.3% in September 2026, up 0.2 points from September 2025."
  );
  // Compared as displayed: 4.26 vs 4.34 shows 4.3 vs 4.3.
  const flat = monthly("2025-01-01", [4.34, ...Array(11).fill(4), 4.26]);
  assert.equal(latestSentence({ label: "Unemployment", obs: flat }), "Unemployment was 4.3% in January 2026, unchanged from January 2025.");
  const gdp = [
    { date: "2025-04-01", value: 3.0 },
    { date: "2025-07-01", value: 2.5 },
    { date: "2025-10-01", value: 1.0 },
    { date: "2026-01-01", value: -0.6 },
    { date: "2026-04-01", value: 2.1 },
  ];
  assert.equal(
    latestSentence({ label: "Real GDP growth (annual rate)", obs: gdp, frequency: "Quarterly" }),
    "Real GDP growth (annual rate) was 2.1% in Q2 2026, down 0.9 points from Q2 2025."
  );
  assert.equal(latestSentence({ label: "X", obs: monthly("2026-01-01", [-0.25]) }), "X was −0.3% in January 2026.");
  assert.equal(latestSentence({ label: "X", obs: [] }), "");
});

test("dashboardSummary joins the sentences of the series that loaded", () => {
  const a = { label: "A", obs: monthly("2026-01-01", [1]) };
  const b = { label: "B", obs: [] };
  const c = { label: "C", obs: monthly("2026-02-01", [2]) };
  assert.equal(dashboardSummary([a, b, c]), "A was 1.0% in January 2026. C was 2.0% in February 2026.");
  assert.equal(dashboardSummary([]), "");
});

test("sahmSentence / yieldCurveSentence state facts with dates", () => {
  assert.equal(
    sahmSentence({ date: "2026-09-01", value: 0.2667, triggered: false }),
    "In September 2026 the Sahm rule reading was 0.27 points, below the 0.50-point signal level."
  );
  assert.match(sahmSentence({ date: "2020-04-01", value: 4.03, triggered: true }), /at or above the 0\.50-point/);
  assert.equal(sahmSentence(null), "");
  assert.equal(
    yieldCurveSentence({ date: "2026-09-01", value: 0.85, inverted: false, invertedMonths: 0 }),
    "In September 2026 the 10-year Treasury yield averaged 0.85 points above the 3-month yield, so the yield curve was not inverted."
  );
  assert.equal(
    yieldCurveSentence({ date: "2023-06-01", value: -1.6, inverted: true, invertedMonths: 8 }),
    "In June 2023 the 10-year Treasury yield averaged 1.60 points below the 3-month yield, so the yield curve was inverted. It has been inverted for 8 months in a row."
  );
  assert.match(yieldCurveSentence({ date: "2023-06-01", value: 0.001, inverted: false, invertedMonths: 0 }), /about the same/);
  for (const s of [sahmSentence({ date: "2020-04-01", value: 4, triggered: true }), yieldCurveSentence({ date: "2023-06-01", value: -1, inverted: true, invertedMonths: 1 })]) {
    assert.doesNotMatch(s, /will|forecast|predict|because/i);
  }
});

// ---------- M8: Okun gap and Taylor rule ----------

const T1993 = TAYLOR_PRESETS.taylor1993;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} expected ${b}, got ${a}`);

test("okunGap: gap ≈ −k(u − u*), default k = 2", () => {
  assert.equal(OKUN_DEFAULT, 2);
  assert.equal(okunGap(5, 4), -2); // u − u* = +1 → gap −2
  assert.equal(okunGap(3.5, 4.5), 2); // tight labor market → positive gap
  assert.equal(okunGap(4.4, 4.4), 0);
  assert.ok(!Object.is(okunGap(4.4, 4.4), -0), "no negative zero");
  close(okunGap(6, 4.5, 2.5), -3.75);
  close(okunGap(5.2, 4.2, 1.5), -1.5);
});

test("taylorRule: Taylor (1993) acceptance numbers (PRD M8)", () => {
  assert.deepEqual(T1993, { rStar: 2, piStar: 2, aPi: 0.5, aY: 0.5 });
  // π = 2, gap = 0 → 2 + 2 + 0.5·0 + 0.5·0 = 4.0
  assert.equal(taylorRule({ pi: 2, gap: 0, ...T1993 }), 4.0);
  // π = 4, gap = 0 → 2 + 4 + 0.5·2 = 7.0
  assert.equal(taylorRule({ pi: 4, gap: 0, ...T1993 }), 7.0);
  // π = 2, u − u* = +1, Okun 2 → gap −2 → 2 + 2 + 0 + 0.5·(−2) = 3.0
  const gap = okunGap(5, 4, 2);
  assert.equal(gap, -2);
  assert.equal(taylorRule({ pi: 2, gap, ...T1993 }), 3.0);
  // Defaults are Taylor (1993).
  assert.equal(taylorRule({ pi: 2, gap: 0 }), 4.0);
});

test("taylorRule: balanced approach and general weights", () => {
  const B = TAYLOR_PRESETS.balanced;
  assert.deepEqual(B, { rStar: 2, piStar: 2, aPi: 0.5, aY: 1.0 });
  // gap −2 with a_y = 1 → 2 + 2 + 0 − 2 = 2.0
  assert.equal(taylorRule({ pi: 2, gap: -2, ...B }), 2.0);
  // r* = 0.5 shifts the rate down exactly 1.5 points.
  assert.equal(taylorRule({ pi: 3, gap: -1, ...T1993 }) - taylorRule({ pi: 3, gap: -1, ...T1993, rStar: 0.5 }), 1.5);
  // Taylor principle: +1 point of inflation → +(1 + a_π) points.
  close(taylorRule({ pi: 3.5, gap: 0, ...T1993 }) - taylorRule({ pi: 2.5, gap: 0, ...T1993 }), 1.5);
  // Hand-computed: r*=1, π=3.2, π*=2, a_π=0.8, a_y=0.3, gap=−1.5 → 1 + 3.2 + 0.96 − 0.45 = 4.71
  close(taylorRule({ pi: 3.2, gap: -1.5, rStar: 1, piStar: 2, aPi: 0.8, aY: 0.3 }), 4.71);
});

test("applyZLB: floors at 0 only when on", () => {
  assert.equal(applyZLB(-3.2, true), 0);
  assert.equal(applyZLB(-3.2, false), -3.2);
  assert.equal(applyZLB(1.7, true), 1.7);
  assert.equal(applyZLB(0, true), 0);
});

test("matchPreset: only r*, π*, a_π, a_y identify a preset", () => {
  assert.equal(matchPreset({ rStar: 2, piStar: 2, aPi: 0.5, aY: 0.5, okun: 2.7 }), "taylor1993");
  // Starting from Taylor (1993) and moving a_y to 1.0 → Balanced approach.
  assert.equal(matchPreset({ ...T1993, aY: 1.0 }), "balanced");
  assert.equal(matchPreset({ ...T1993, aY: 0.1 + 0.2 + 0.7 }), "balanced"); // float noise tolerated
  assert.equal(matchPreset({ ...T1993, rStar: 0.5 }), "custom");
  assert.equal(matchPreset({ ...T1993, aPi: 0.6 }), "custom");
  assert.equal(matchPreset({}), "custom");
});

// ---------- M8: NROU trimming, step-fill, alignment ----------

// CBO's NROU (quarterly) runs years past the latest data; the tail is projections.
const NROU_FIXTURE = [
  { date: "2025-10-01", value: 4.33 },
  { date: "2026-01-01", value: 4.32 },
  { date: "2026-04-01", value: 4.31 },
  { date: "2026-07-01", value: 4.3 },
  { date: "2026-10-01", value: 4.29 }, // projection
  { date: "2027-01-01", value: 4.28 }, // projection
  { date: "2036-07-01", value: 4.2 }, // projection
];

test("trimToLatest: drops NROU projections dated after the latest UNRATE observation", () => {
  const trimmed = trimToLatest(NROU_FIXTURE, "2026-09-01");
  assert.deepEqual(
    trimmed.map((o) => o.date),
    ["2025-10-01", "2026-01-01", "2026-04-01", "2026-07-01"]
  );
  // The quarter that starts in the latest UNRATE month is kept; the next one isn't.
  assert.equal(trimToLatest(NROU_FIXTURE, "2026-07-01").at(-1).date, "2026-07-01");
  assert.equal(trimToLatest(NROU_FIXTURE, "2026-06-01").at(-1).date, "2026-04-01");
  assert.notEqual(trimToLatest(NROU_FIXTURE), NROU_FIXTURE, "returns a copy");
  assert.deepEqual(trimToLatest(undefined, "2026-01-01"), []);
});

test("stepFillMonthly: each quarter's value is held for its three months", () => {
  const filled = stepFillMonthly(trimToLatest(NROU_FIXTURE, "2026-09-01"));
  assert.equal(filled.length, 12);
  assert.deepEqual(filled.slice(-4), [
    { date: "2026-06-01", value: 4.31 },
    { date: "2026-07-01", value: 4.3 },
    { date: "2026-08-01", value: 4.3 },
    { date: "2026-09-01", value: 4.3 },
  ]);
  // A missing quarter isn't filled across: Q1 holds 3 months, then Q3 starts.
  const gappy = stepFillMonthly([
    { date: "2020-01-01", value: 5 },
    { date: "2020-07-01", value: 6 },
  ]);
  assert.deepEqual(
    gappy.map((o) => `${o.date}=${o.value}`),
    ["2020-01-01=5", "2020-02-01=5", "2020-03-01=5", "2020-07-01=6", "2020-08-01=6", "2020-09-01=6"]
  );
  assert.deepEqual(stepFillMonthly([]), []);
});

test("alignMonthly: inner join by month, never by array index", () => {
  // Different lengths, different start months, one gap: index-based pairing would mismatch every row.
  const a = monthly("2020-01-01", [1, 2, 3, 4, 5]).filter((o) => o.date !== "2020-03-01");
  const b = monthly("2020-02-01", [20, 30, 40, 50, 60, 70]);
  assert.deepEqual(alignMonthly({ a, b }), [
    { date: "2020-02-01", a: 2, b: 20 },
    { date: "2020-04-01", a: 4, b: 40 },
    { date: "2020-05-01", a: 5, b: 50 },
  ]);
  // Day-of-month doesn't matter (dates are matched by month).
  assert.deepEqual(alignMonthly({ a: [{ date: "2020-01-15", value: 1 }], b: [{ date: "2020-01-01", value: 2 }] }), [
    { date: "2020-01-01", a: 1, b: 2 },
  ]);
  assert.deepEqual(alignMonthly({}), []);
});

test("taylorInputs: NROU trimmed + step-filled, joined by date; FEDFUNDS outer-joined", () => {
  const unrate = monthly("2026-05-01", [4.4, 4.5, 4.6, 4.7, 4.8]); // May–Sep 2026
  const inflation = monthly("2026-05-01", [2.8, 2.9, 3.0, 3.1]); // May–Aug (one month behind)
  const fedfunds = monthly("2026-06-01", [3.9, 3.9, 3.8, 3.6]); // Jun–Sep
  const rows = taylorInputs({ inflation, unrate, nrou: NROU_FIXTURE, fedfunds });
  assert.deepEqual(rows, [
    { date: "2026-05-01", pi: 2.8, u: 4.4, uStar: 4.31, actual: null },
    { date: "2026-06-01", pi: 2.9, u: 4.5, uStar: 4.31, actual: 3.9 },
    { date: "2026-07-01", pi: 3.0, u: 4.6, uStar: 4.3, actual: 3.9 },
    { date: "2026-08-01", pi: 3.1, u: 4.7, uStar: 4.3, actual: 3.8 },
    { date: "2026-09-01", pi: null, u: null, uStar: null, actual: 3.6 },
  ]);
  // No projection month (Oct 2026 onward) ever appears.
  assert.ok(rows.every((r) => r.date <= "2026-09-01"));

  // Fixed u* replaces NROU for every month.
  const fixed = taylorInputs({ inflation, unrate, nrou: NROU_FIXTURE, uStarFixed: 4.5, fedfunds: null });
  assert.deepEqual(fixed.map((r) => r.uStar), [4.5, 4.5, 4.5, 4.5]);
  assert.ok(fixed.every((r) => r.actual === null));
});

test("taylorSeries: rule per month, ZLB floor, latest complete row", () => {
  const rows = [
    { date: "2009-06-01", pi: 1.0, u: 9.5, uStar: 5.0, actual: 0.21 }, // deep slack
    { date: "2019-12-01", pi: 2.0, u: 4.0, uStar: 4.0, actual: 1.55 }, // on target, no gap
    { date: "2020-01-01", pi: 4.0, u: 5.0, uStar: 4.0, actual: 1.55 },
    { date: "2020-02-01", pi: null, u: null, uStar: null, actual: 1.58 },
  ];
  const off = taylorSeries(rows, { ...T1993, okun: 2, zlb: false });
  // 2009-06: gap = −2(9.5 − 5) = −9 → 2 + 1 + 0.5(−1) + 0.5(−9) = −2.0
  assert.equal(off[0].gap, -9);
  close(off[0].raw, -2.0);
  close(off[0].rule, -2.0, "below zero with ZLB off");
  assert.equal(off[1].rule, 4.0);
  // π = 4, gap = −2 → 2 + 4 + 1 − 1 = 6.0
  assert.equal(off[2].rule, 6.0);
  assert.equal(off[3].rule, null);

  const on = taylorSeries(rows, { ...T1993, okun: 2, zlb: true });
  assert.equal(on[0].rule, 0, "floored at 0 with ZLB on");
  close(on[0].raw, -2.0, "raw keeps the unfloored value");
  assert.equal(on[1].rule, 4.0, "positive values untouched");

  assert.equal(latestComplete(off).date, "2020-01-01");
  assert.equal(latestRule(off).date, "2020-01-01");
  assert.equal(latestComplete([{ ...rows[0], rule: 1, actual: null }]), null);
  assert.equal(latestComplete([]), null);

  // Okun coefficient flows through: k = 3 → gap −3 for u − u* = 1 → 2 + 4 + 1 − 1.5 = 5.5
  assert.equal(taylorSeries([rows[2]], { ...T1993, okun: 3 })[0].rule, 5.5);
});

// ---------- M8: "Right now" sentences ----------

const RN = POLICY_LAB.taylor.rightNow;

test("compareAtDisplay: compares values rounded as shown", () => {
  assert.deepEqual(compareAtDisplay(4.64, 4.04), { diff: 0.6, direction: "higher", x: "0.6" });
  assert.deepEqual(compareAtDisplay(3.0, 4.33), { diff: -1.3, direction: "lower", x: "1.3" });
  // 4.04 → 4.0 and 3.96 → 4.0: same as displayed even though the raw gap is 0.08.
  assert.deepEqual(compareAtDisplay(4.04, 3.96), { diff: 0, direction: "same", x: "0.0" });
});

test("taylorRightNow: higher / lower / same / floored, note always last", () => {
  assert.deepEqual(taylorRightNow({ rule: 4.64, raw: 4.64, actual: 4.04, zlb: false }, RN), [
    "The rule says rates should be 0.6 points higher than they are.",
    RN.note,
  ]);
  assert.deepEqual(taylorRightNow({ rule: 3, raw: 3, actual: 4.33, zlb: false }, RN), [
    "The rule says rates should be 1.3 points lower than they are.",
    RN.note,
  ]);
  assert.deepEqual(taylorRightNow({ rule: 4.04, raw: 4.04, actual: 3.96, zlb: true }, RN), [RN.same, RN.note]);
  // ZLB on, rule negative: compared as shown (0.0 vs 0.04 → 0.0: same) plus the unfloored value.
  assert.deepEqual(taylorRightNow({ rule: 0, raw: -3.24, actual: 0.04, zlb: true }, RN), [
    RN.same,
    "The rule is shown at 0 because the zero-lower-bound toggle is on; without it, the rule would be −3.2%.",
    RN.note,
  ]);
  // ZLB off: no floored line even when negative.
  assert.deepEqual(taylorRightNow({ rule: -3.24, raw: -3.24, actual: 0.08, zlb: false }, RN), [
    "The rule says rates should be 3.3 points lower than they are.",
    RN.note,
  ]);
  // No actual rate (FEDFUNDS failed): just the note.
  assert.deepEqual(taylorRightNow({ rule: 2, raw: 2, actual: null, zlb: false }, RN), [RN.note]);
  assert.equal(fillTemplate("{a} and {b}", { a: 1 }), "1 and ");
});

// ---------- M9: Phillips curve, real rate, policy stance ----------

test("ERAS: five contiguous eras from 1948, matching the copy in content.js (ids and dates)", () => {
  assert.deepEqual(
    ERAS.map((e) => [e.id, e.start, e.end]),
    [
      ["postwar", "1948-01", "1969-12"],
      ["stagflation", "1970-01", "1983-12"],
      ["moderation", "1984-01", "2007-12"],
      ["recession", "2008-01", "2019-12"],
      ["pandemic", "2020-01", null],
    ]
  );
  // The writer's era copy must agree with the math, or legends would mislabel dots.
  assert.deepEqual(
    POLICY_LAB.phillips.eras.map((e) => [e.id, e.start, e.end]),
    ERAS.map((e) => [e.id, e.start, e.end])
  );
  for (const e of POLICY_LAB.phillips.eras) assert.ok(e.label && e.blurb, e.id);
  assert.ok(Object.isFrozen(ERAS) && Object.isFrozen(ERAS[0]));
});

test("eraOf: inclusive month boundaries; nothing before 1948", () => {
  assert.equal(eraOf("1947-12-01"), null);
  assert.equal(eraOf("1948-01-01"), "postwar");
  assert.equal(eraOf("1969-12-01"), "postwar");
  assert.equal(eraOf("1970-01-01"), "stagflation");
  assert.equal(eraOf("1983-12-01"), "stagflation");
  assert.equal(eraOf("1984-01-01"), "moderation");
  assert.equal(eraOf("2007-12-01"), "moderation");
  assert.equal(eraOf("2008-01-01"), "recession");
  assert.equal(eraOf("2019-12-01"), "recession");
  assert.equal(eraOf("2020-01-01"), "pandemic");
  assert.equal(eraOf("2026-09-01"), "pandemic"); // open-ended: through the latest data
  assert.equal(eraOf("1975-06"), "stagflation");
});

test("phillipsPoints: inner join by month (never by index), one point per month, era tagged", () => {
  // CPI 12-month change starts Jan 1948 (FRED's pc1 needs a year of index levels); UNRATE also starts 1948.
  // Inflation is offset and has a gap: a by-index join would pair the wrong months.
  const unrate = monthly("1947-11", [3.9, 3.8, 3.4, 3.8, 4.0]); // Nov 1947 … Mar 1948
  const inflation = [
    { date: "1948-01-01", value: 10.2 },
    // Feb 1948 missing
    { date: "1948-03-01", value: 6.8 },
    { date: "1948-04-01", value: 8.6 }, // no UNRATE for April
  ];
  assert.deepEqual(phillipsPoints({ unrate, inflation }), [
    { date: "1948-01-01", u: 3.4, pi: 10.2, era: "postwar" },
    { date: "1948-03-01", u: 4.0, pi: 6.8, era: "postwar" },
  ]);

  // Hand-checked months around era boundaries, including the 1975 tooltip example (Jun 1975: 8.8%, 9.4%).
  const u2 = [
    { date: "1969-12-01", value: 3.5 },
    { date: "1970-01-01", value: 3.9 },
    { date: "1975-06-01", value: 8.8 },
    { date: "2020-04-01", value: 14.8 },
  ];
  const pi2 = [
    { date: "1969-12-01", value: 6.2 },
    { date: "1970-01-01", value: 6.16 },
    { date: "1975-06-01", value: 9.4 },
    { date: "2020-04-01", value: 0.3 },
  ];
  const pts = phillipsPoints({ unrate: u2, inflation: pi2 });
  assert.deepEqual(
    pts.map((p) => [p.date.slice(0, 7), p.era, p.u, p.pi]),
    [
      ["1969-12", "postwar", 3.5, 6.2],
      ["1970-01", "stagflation", 3.9, 6.16],
      ["1975-06", "stagflation", 8.8, 9.4],
      ["2020-04", "pandemic", 14.8, 0.3],
    ]
  );

  // Months before 1948 never become dots; empty/missing input gives no points.
  assert.deepEqual(phillipsPoints({ unrate: [{ date: "1947-06-01", value: 4 }], inflation: [{ date: "1947-06-01", value: 9 }] }), []);
  assert.deepEqual(phillipsPoints({ unrate: null, inflation: [] }), []);
});

test("phillipsPoints: core PCE view starts in 1960 because its 12-month change does", () => {
  const unrate = monthly("1959-11", [5.8, 5.3, 5.2, 4.8]);
  const corePce = monthly("1960-01", [2.0, 1.9]);
  assert.deepEqual(
    phillipsPoints({ unrate, inflation: corePce }).map((p) => p.date),
    ["1960-01-01", "1960-02-01"]
  );
});

test("realRate: FEDFUNDS − 12-month inflation, aligned by month (hand-computed)", () => {
  // FEDFUNDS has a month PCE lacks (PCE is released later) and PCE starts before FEDFUNDS.
  const fedfunds = [
    { date: "2021-06-01", value: 0.08 },
    { date: "2021-07-01", value: 0.1 },
    { date: "2024-06-01", value: 5.33 },
    { date: "2024-07-01", value: 5.33 }, // no PCE yet for this month
  ];
  const corePce = [
    { date: "2021-05-01", value: 3.1 }, // no FEDFUNDS for this month
    { date: "2021-06-01", value: 3.6 },
    { date: "2021-07-01", value: 3.7 },
    { date: "2024-06-01", value: 2.6 },
  ];
  const rows = realRate({ fedfunds, inflation: corePce });
  assert.deepEqual(rows.map((r) => r.date), ["2021-06-01", "2021-07-01", "2024-06-01"]);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(rows[0].real, -3.52), String(rows[0].real)); // 0.08 − 3.6
  assert.ok(near(rows[1].real, -3.6), String(rows[1].real)); // 0.10 − 3.7
  assert.ok(near(rows[2].real, 2.73), String(rows[2].real)); // 5.33 − 2.6
  assert.equal(rows[2].ff, 5.33);
  assert.equal(rows[2].pi, 2.6);

  // Same data with FEDFUNDS shifted one slot (an index join would give 0.10 − 3.6): still by date.
  const shifted = realRate({ fedfunds: fedfunds.slice(1), inflation: corePce });
  assert.ok(near(shifted[0].real, -3.6) && shifted[0].date === "2021-07-01");
  assert.deepEqual(realRate({ fedfunds: null, inflation: corePce }), []);
});

test("policyStance: tighter above r*, looser below, near when the shown gap rounds to 0.0", () => {
  assert.deepEqual(policyStance(2.73, 2), { stance: "tighter", diff: 0.7, x: "0.7" });
  assert.deepEqual(policyStance(-3.52, 2), { stance: "looser", diff: -5.5, x: "5.5" });
  assert.deepEqual(policyStance(2.04, 2), { stance: "near", diff: 0, x: "0.0" });
  assert.deepEqual(policyStance(0.46, 0.5), { stance: "near", diff: 0, x: "0.0" }); // 0.5 − 0.5 as shown
  assert.deepEqual(policyStance(0.36, 0.5), { stance: "looser", diff: -0.1, x: "0.1" });
  assert.deepEqual(policyStance(-0.8, -1), { stance: "tighter", diff: 0.2, x: "0.2" });
  // Same real rate, different r*: the verdict depends on the r* you assume.
  assert.equal(policyStance(1.2, 2).stance, "looser");
  assert.equal(policyStance(1.2, 0.5).stance, "tighter");
});

test("stanceRightNow: tighter / looser / near sentences with r*, note always last", () => {
  const SR = POLICY_LAB.stance.rightNow;
  assert.deepEqual(stanceRightNow({ real: 2.73, rStar: 2 }, SR), [
    "The real rate is 0.7 points above your r* of 2.0%: tighter than neutral.",
    SR.note,
  ]);
  assert.deepEqual(stanceRightNow({ real: -3.52, rStar: 0.5 }, SR), [
    "The real rate is 4.0 points below your r* of 0.5%: looser than neutral.",
    SR.note,
  ]);
  assert.deepEqual(stanceRightNow({ real: 1.04, rStar: 1 }, SR), [
    "The real rate is about equal to your r* of 1.0%: close to neutral.",
    SR.note,
  ]);
  assert.deepEqual(stanceRightNow({ real: null, rStar: 2 }, SR), [SR.note]);
});
