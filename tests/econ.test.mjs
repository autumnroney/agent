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
} from "../public/lib/econ.js";
import {
  periodLabel,
  changePhrase,
  latestSentence,
  dashboardSummary,
  sahmSentence,
  yieldCurveSentence,
} from "../public/lib/narrate.js";

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
