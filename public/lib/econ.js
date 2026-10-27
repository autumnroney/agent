// Pure economics math (owned by the econ-modeling-engineer agent).
// No DOM, no fetch: every function takes observations [{date: "YYYY-MM-DD", value: number}] sorted by date.
// M6: yearAgo. M7: recession periods, 3-month average, Sahm rule, yield curve. Later: Okun gap,
// Taylor rule, real rate, series alignment and Phillips points.

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
