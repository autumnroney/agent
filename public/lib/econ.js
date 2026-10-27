// Pure economics math (owned by the econ-modeling-engineer agent).
// No DOM, no fetch: every function takes observations [{date: "YYYY-MM-DD", value: number}] sorted by date.
// M6: yearAgo. M7: recession periods, 3-month average, Sahm rule, yield curve. M8: Okun gap,
// Taylor rule, presets, NROU trimming, step-fill and series alignment. M9: Phillips eras/points, real rate.

import { shiftYears, addMonths } from "./format.js";

/**
 * The observation to compare the latest one against for a "change from a year earlier":
 * the latest observation dated on or before the same day one year before the latest date.
 * Works for monthly and quarterly series and tolerates gaps (matches by date, never by index).
 * Returns null when the series is empty or doesn't reach back a year.
 * @param {{date: string, value: number}[]} obs
 */
export function yearAgo(obs) {
  if (!Array.isArray(obs) || obs.length === 0) return null;
  const target = shiftYears(obs.at(-1).date, -1);
  for (let i = obs.length - 1; i >= 0; i--) if (obs[i].date <= target) return obs[i];
  return null;
}

// ---------------------------------------------------------------------------------------------
// M7: recession periods, Sahm rule, yield curve.
// ---------------------------------------------------------------------------------------------

/** Sahm-rule signal level, in percentage points (Sahm 2019). */
export const SAHM_THRESHOLD = 0.5;

/** "YYYY-MM" key for a date, so monthly series join by month, never by array index. */
const monthKey = (iso) => String(iso).slice(0, 7);

/**
 * NBER recession periods from FRED's USREC (1 = recession month, 0 = expansion).
 * Each run of consecutive recession months becomes { start, end } where both are inclusive
 * first-of-month dates as FRED marks them (e.g. 2008-01-01 → 2009-06-01). A missing month ends a run.
 * `ongoing` is true when the series ends inside a recession.
 * @param {{date: string, value: number}[]} usrec
 * @returns {{start: string, end: string, ongoing: boolean}[]}
 */
export function recessionPeriods(usrec) {
  if (!Array.isArray(usrec)) return [];
  const out = [];
  let cur = null;
  let prevMonth = null;
  for (const o of usrec) {
    const contiguous = prevMonth !== null && monthKey(addMonths(`${prevMonth}-01`, 1)) === monthKey(o.date);
    if (cur && !contiguous) {
      out.push(cur);
      cur = null;
    }
    if (o.value === 1) {
      if (cur) cur.end = o.date;
      else cur = { start: o.date, end: o.date, ongoing: false };
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
    prevMonth = monthKey(o.date);
  }
  if (cur) {
    cur.ongoing = true;
    out.push(cur);
  }
  return out;
}

/**
 * Trailing 3-month moving average of a monthly series: the value for month t averages t, t−1 and t−2.
 * Months without all three observations (start of the series or a gap) are skipped.
 * @param {{date: string, value: number}[]} obs  monthly observations
 * @returns {{date: string, value: number}[]}
 */
export function threeMonthAvg(obs) {
  if (!Array.isArray(obs)) return [];
  const byMonth = new Map(obs.map((o) => [monthKey(o.date), o.value]));
  const out = [];
  for (const o of obs) {
    const vals = [0, -1, -2].map((k) => byMonth.get(monthKey(addMonths(o.date, k))));
    if (vals.every((v) => Number.isFinite(v))) out.push({ date: o.date, value: (vals[0] + vals[1] + vals[2]) / 3 });
  }
  return out;
}

/**
 * Sahm rule for every month where it is defined:
 *   value = (3-month average unemployment in month t)
 *         − (lowest 3-month average in the previous 12 months, t−1 … t−12).
 * Needs all 12 prior averages; earlier months are skipped. Computed from UNRATE as currently revised,
 * so it can differ slightly from FRED's real-time SAHMREALTIME (first-release data).
 * @param {{date: string, value: number}[]} unrate  monthly unemployment rate, %
 * @returns {{date: string, value: number, avg3: number, priorMin: number}[]}
 */
export function sahmSeries(unrate) {
  const avg = threeMonthAvg(unrate);
  const byMonth = new Map(avg.map((a) => [monthKey(a.date), a.value]));
  const out = [];
  for (const a of avg) {
    let priorMin = Infinity;
    let complete = true;
    for (let k = 1; k <= 12; k++) {
      const v = byMonth.get(monthKey(addMonths(a.date, -k)));
      if (!Number.isFinite(v)) {
        complete = false;
        break;
      }
      priorMin = Math.min(priorMin, v);
    }
    if (complete) out.push({ date: a.date, value: a.value - priorMin, avg3: a.value, priorMin });
  }
  return out;
}

/**
 * True when a Sahm value meets the 0.50-point signal. Compared at the 2 decimals we display, so the
 * status never disagrees with the number shown (and float noise like 0.49999… counts as 0.50).
 */
export function sahmTriggered(value) {
  return Number.isFinite(value) && Math.round(value * 100) / 100 >= SAHM_THRESHOLD;
}

/**
 * Latest Sahm-rule reading, or null when UNRATE is too short (needs 15 consecutive months).
 * @returns {{date: string, value: number, avg3: number, priorMin: number, threshold: number, triggered: boolean} | null}
 */
export function sahmRule(unrate) {
  const last = sahmSeries(unrate).at(-1);
  if (!last) return null;
  return { ...last, threshold: SAHM_THRESHOLD, triggered: sahmTriggered(last.value) };
}

/**
 * Latest yield-curve reading from T10Y3M (10-year minus 3-month Treasury spread, percentage points).
 * Inverted means the spread is below zero. `invertedMonths` counts consecutive inverted observations
 * ending at the latest one (0 when not inverted).
 * @param {{date: string, value: number}[]} spread
 * @returns {{date: string, value: number, inverted: boolean, invertedMonths: number} | null}
 */
export function yieldCurve(spread) {
  if (!Array.isArray(spread) || spread.length === 0) return null;
  const last = spread.at(-1);
  let invertedMonths = 0;
  for (let i = spread.length - 1; i >= 0 && spread[i].value < 0; i--) invertedMonths++;
  return { date: last.date, value: last.value, inverted: last.value < 0, invertedMonths };
}

// ---------------------------------------------------------------------------------------------
// M8: Okun gap, Taylor rule, series alignment (Policy Lab I).
// ---------------------------------------------------------------------------------------------

/** Default Okun coefficient: output about 2% below potential per point of unemployment above u*. */
export const OKUN_DEFAULT = 2;

/** Rule parameters that identify a preset (PRD §5.2). Okun, u* and the inflation measure aren't part of it. */
export const TAYLOR_PRESETS = {
  taylor1993: { rStar: 2, piStar: 2, aPi: 0.5, aY: 0.5 },
  balanced: { rStar: 2, piStar: 2, aPi: 0.5, aY: 1.0 },
};
export const PRESET_KEYS = ["rStar", "piStar", "aPi", "aY"];

/**
 * Output gap from unemployment with Okun's law (gap version): gap ≈ −k × (u − u*), in percent of potential GDP.
 * @param {number} u      unemployment rate, %
 * @param {number} uStar  natural rate of unemployment, %
 * @param {number} [k]    Okun coefficient (default 2)
 */
export function okunGap(u, uStar, k = OKUN_DEFAULT) {
  const gap = -k * (u - uStar);
  return gap === 0 ? 0 : gap; // no −0
}

/**
 * Taylor-type rule (Taylor 1993, general form): i = r* + π + a_π(π − π*) + a_y·gap.
 * Defaults are Taylor (1993): r* = 2, π* = 2, a_π = 0.5, a_y = 0.5.
 * @param {{pi: number, gap: number, rStar?: number, piStar?: number, aPi?: number, aY?: number}} p
 * @returns {number} rule-implied nominal policy rate, %
 */
export function taylorRule({ pi, gap, rStar = 2, piStar = 2, aPi = 0.5, aY = 0.5 }) {
  return rStar + pi + aPi * (pi - piStar) + aY * gap;
}

/** Floor a rule rate at the zero lower bound when `on`; otherwise return it unchanged. */
export function applyZLB(rate, on = true) {
  return on && rate < 0 ? 0 : rate;
}

/**
 * Which preset a set of rule parameters matches ("taylor1993", "balanced"), or "custom".
 * Compares only r*, π*, a_π and a_y, with a small tolerance for slider float noise.
 */
export function matchPreset(params, presets = TAYLOR_PRESETS) {
  for (const [key, values] of Object.entries(presets)) {
    if (PRESET_KEYS.every((k) => Math.abs(Number(params?.[k]) - values[k]) < 1e-9)) return key;
  }
  return "custom";
}

/**
 * Drop observations dated after `latestDate` (e.g. CBO's NROU projections beyond the latest UNRATE month).
 * Returns a new array; with no `latestDate` it returns a copy.
 */
export function trimToLatest(obs, latestDate) {
  if (!Array.isArray(obs)) return [];
  if (!latestDate) return obs.slice();
  return obs.filter((o) => o.date <= latestDate);
}

/**
 * Turn a lower-frequency series into monthly observations by holding each value for `months` months
 * (3 for quarterly: Q3 dated 2026-07-01 fills Jul, Aug and Sep), stopping early at the next observation.
 * @param {{date: string, value: number}[]} obs  sorted by date, first-of-period dates
 * @param {number} [months]
 */
export function stepFillMonthly(obs, months = 3) {
  if (!Array.isArray(obs)) return [];
  const out = [];
  for (let i = 0; i < obs.length; i++) {
    const next = obs[i + 1] ? monthKey(obs[i + 1].date) : null;
    for (let k = 0; k < months; k++) {
      const date = addMonths(`${monthKey(obs[i].date)}-01`, k);
      if (next && monthKey(date) >= next) break;
      out.push({ date, value: obs[i].value });
    }
  }
  return out;
}

/**
 * Join monthly series by month (never by array index). Inner join: a month appears only when every
 * named series has a finite value for it. Dates come out as first-of-month, sorted ascending.
 * @param {Record<string, {date: string, value: number}[]>} named  e.g. { pi: [...], u: [...] }
 * @returns {Array<{date: string} & Record<string, number>>}
 */
export function alignMonthly(named) {
  const keys = Object.keys(named ?? {});
  if (keys.length === 0) return [];
  const maps = keys.map((k) => {
    const m = new Map();
    for (const o of named[k] ?? []) if (Number.isFinite(o?.value)) m.set(monthKey(o.date), o.value);
    return m;
  });
  const months = [...maps[0].keys()].filter((mk) => maps.every((m) => m.has(mk))).sort();
  return months.map((mk) => {
    const row = { date: `${mk}-01` };
    keys.forEach((k, j) => (row[k] = maps[j].get(mk)));
    return row;
  });
}

/**
 * Monthly inputs for the Taylor rule, joined by date.
 * - `nrou` (CBO, quarterly) is trimmed to the latest UNRATE date, then held for each quarter's three months.
 * - If `uStarFixed` is a number it is used for every month instead of NROU.
 * - Months come from the inputs (π, u, u*) joined with FEDFUNDS by outer join: `actual` is null where
 *   FEDFUNDS is missing, and π/u/u* are null where any rule input is missing.
 * @param {{ inflation: object[], unrate: object[], nrou?: object[]|null, uStarFixed?: number|null, fedfunds?: object[]|null }} s
 * @returns {{date: string, pi: number|null, u: number|null, uStar: number|null, actual: number|null}[]}
 */
export function taylorInputs({ inflation, unrate, nrou = null, uStarFixed = null, fedfunds = null }) {
  const u = unrate ?? [];
  let uStarObs;
  if (Number.isFinite(uStarFixed)) uStarObs = u.map((o) => ({ date: o.date, value: uStarFixed }));
  else uStarObs = stepFillMonthly(trimToLatest(nrou ?? [], u.at(-1)?.date), 3);
  const rule = alignMonthly({ pi: inflation ?? [], u, uStar: uStarObs });
  const ruleByMonth = new Map(rule.map((r) => [monthKey(r.date), r]));
  const ffByMonth = new Map();
  for (const o of fedfunds ?? []) if (Number.isFinite(o?.value)) ffByMonth.set(monthKey(o.date), o.value);
  const months = [...new Set([...ruleByMonth.keys(), ...ffByMonth.keys()])].sort();
  return months.map((mk) => {
    const r = ruleByMonth.get(mk);
    return {
      date: `${mk}-01`,
      pi: r ? r.pi : null,
      u: r ? r.u : null,
      uStar: r ? r.uStar : null,
      actual: ffByMonth.has(mk) ? ffByMonth.get(mk) : null,
    };
  });
}

/**
 * Apply a rule to aligned inputs. For each month: gap (Okun), the unfloored rule rate `raw`,
 * and `rule` (floored at 0 when `zlb` is on). Months without rule inputs get nulls.
 * @param {ReturnType<typeof taylorInputs>} rows
 * @param {{rStar: number, piStar: number, aPi: number, aY: number, okun?: number, zlb?: boolean}} p
 */
export function taylorSeries(rows, p) {
  const k = p.okun ?? OKUN_DEFAULT;
  return (rows ?? []).map((r) => {
    if (r.pi === null || r.u === null || r.uStar === null) return { ...r, gap: null, raw: null, rule: null };
    const gap = okunGap(r.u, r.uStar, k);
    const raw = taylorRule({ pi: r.pi, gap, rStar: p.rStar, piStar: p.piStar, aPi: p.aPi, aY: p.aY });
    return { ...r, gap, raw, rule: applyZLB(raw, Boolean(p.zlb)) };
  });
}

/** Latest row where both the rule and the actual rate exist ("Right now"), or null. */
export function latestComplete(rows) {
  for (let i = (rows?.length ?? 0) - 1; i >= 0; i--) if (rows[i].rule !== null && rows[i].actual !== null) return rows[i];
  return null;
}

/** Latest row with a rule rate (used when FEDFUNDS is unavailable), or null. */
export function latestRule(rows) {
  for (let i = (rows?.length ?? 0) - 1; i >= 0; i--) if (rows[i].rule !== null) return rows[i];
  return null;
}

// ---------------------------------------------------------------------------------------------
// M9: Phillips curve eras and points, real interest rate (Policy Lab II).
// ---------------------------------------------------------------------------------------------

/**
 * Phillips-curve eras (PRD F37). `start`/`end` are inclusive "YYYY-MM" months; `end: null` = latest data.
 * Copy (labels, blurbs) lives in content.js POLICY_LAB.phillips.eras, which must use the same ids and dates.
 */
export const ERAS = Object.freeze([
  Object.freeze({ id: "postwar", start: "1948-01", end: "1969-12" }),
  Object.freeze({ id: "stagflation", start: "1970-01", end: "1983-12" }),
  Object.freeze({ id: "moderation", start: "1984-01", end: "2007-12" }),
  Object.freeze({ id: "recession", start: "2008-01", end: "2019-12" }),
  Object.freeze({ id: "pandemic", start: "2020-01", end: null }),
]);

/** The id of the era containing a date ("YYYY-MM-DD" or "YYYY-MM"), or null when it's before the first era. */
export function eraOf(date, eras = ERAS) {
  const mk = monthKey(date);
  for (const e of eras) if (mk >= e.start && (e.end === null || mk <= e.end)) return e.id;
  return null;
}

/**
 * Phillips-curve scatter points: one per month in which both unemployment and inflation exist
 * (inner join by month, never by array index), from the first era's start (1948) on.
 * @param {{unrate: {date: string, value: number}[], inflation: {date: string, value: number}[]}} s
 *   inflation = 12-month % change (FRED units pc1)
 * @returns {{date: string, u: number, pi: number, era: string}[]} sorted by date
 */
export function phillipsPoints({ unrate, inflation }, eras = ERAS) {
  const out = [];
  for (const r of alignMonthly({ u: unrate ?? [], pi: inflation ?? [] })) {
    const era = eraOf(r.date, eras);
    if (era) out.push({ date: r.date, u: r.u, pi: r.pi, era });
  }
  return out;
}

/**
 * Ex post real federal funds rate for each month with both inputs (inner join by month):
 * real = fed funds − inflation over the past 12 months (an approximation of the Fisher equation;
 * the ex ante rate would use expected inflation).
 * @param {{fedfunds: {date: string, value: number}[], inflation: {date: string, value: number}[]}} s
 * @returns {{date: string, ff: number, pi: number, real: number}[]}
 */
export function realRate({ fedfunds, inflation }) {
  return alignMonthly({ ff: fedfunds ?? [], pi: inflation ?? [] }).map((r) => ({ ...r, real: r.ff - r.pi }));
}

/**
 * Policy stance of a real rate against a neutral rate r*, compared at display precision so the verdict
 * agrees with the numbers shown: diff = round(real) − round(r*). "near" when that rounds to 0.
 * Tighter than neutral = real rate above r*; looser = below.
 * @returns {{stance: "tighter"|"looser"|"near", diff: number, x: string}}
 */
export function policyStance(real, rStar, digits = 1) {
  const r = Number(Number(real).toFixed(digits));
  const s = Number(Number(rStar).toFixed(digits));
  const diff = Number((r - s).toFixed(digits));
  const stance = diff > 0 ? "tighter" : diff < 0 ? "looser" : "near";
  return { stance, diff: diff === 0 ? 0 : diff, x: Math.abs(diff).toFixed(digits) };
}
