// Date/number formatting and URL-hash state helpers (owned by the frontend-engineer agent).
// Pure functions: no DOM access, so Node tests can import this module.

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const MINUS = "−"; // typographic minus sign

/** Parse "YYYY-MM-DD" as a UTC date. */
export function parseISODate(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

/** "Q3 2026" for a quarterly observation date. */
export function formatQuarter(iso) {
  const d = parseISODate(iso);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

/** "Sep 2026" for a monthly observation date. */
export function formatMonth(iso) {
  return monthFmt.format(parseISODate(iso));
}

/**
 * Label an observation date the way FRED users read it.
 * `frequency` may be "Quarterly"/"q" or anything else (monthly). For backward compatibility a series id
 * is also accepted: GDPC1 and NROU are quarterly.
 */
export function formatDate(iso, frequency) {
  return isQuarterly(frequency) ? formatQuarter(iso) : formatMonth(iso);
}

const QUARTERLY_IDS = new Set(["GDPC1", "NROU"]);
function isQuarterly(f) {
  if (!f) return false;
  return QUARTERLY_IDS.has(f) || /^q(uarterly)?$/i.test(f);
}

/** Fixed-decimal number with a typographic minus: -1.23 -> "−1.2". */
export function formatNumber(value, digits = 1) {
  const s = Number(value).toFixed(digits);
  // Avoid "−0.0" for values that round to zero.
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.replace("-", MINUS);
}

/** Value with its unit suffix: (3.71, "%") -> "3.7%". */
export function formatValue(value, unit = "", digits = 1) {
  return `${formatNumber(value, digits)}${unit}`;
}

/** Signed change: 0.2 -> "+0.2", -0.2 -> "−0.2", 0 -> "±0.0" (compared at display precision). */
export function formatChange(diff, digits = 1) {
  const rounded = Number(Number(diff).toFixed(digits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? MINUS : "±";
  return `${sign}${Math.abs(rounded).toFixed(digits)}`;
}

/**
 * Shift an ISO date by whole years (negative = back). Feb 29 clamps to Feb 28 in non-leap years
 * instead of rolling into March.
 */
export function shiftYears(iso, years) {
  const d = parseISODate(iso);
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  if (d.getUTCMonth() !== month) d.setUTCDate(0); // rolled over: go to the last day of the intended month
  return d.toISOString().slice(0, 10);
}

/**
 * Shift a first-of-month ISO date by whole months (negative = back): ("2009-06-01", 1) -> "2009-07-01".
 * Days past the end of the target month clamp to its last day.
 */
export function addMonths(iso, months) {
  const d = parseISODate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/** "#a=1&b=x" or "a=1&b=x" -> { a: "1", b: "x" }. Values stay strings; callers validate. */
export function parseHash(hash = "") {
  const out = {};
  const params = new URLSearchParams(String(hash).replace(/^#/, ""));
  for (const [k, v] of params) out[k] = v;
  return out;
}

/** { a: 1, b: "x" } -> "#a=1&b=x". Skips null/undefined values; keeps key order. */
export function buildHash(state = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v !== undefined && v !== null) params.set(k, String(v));
  const s = params.toString();
  return s ? `#${s}` : "";
}

// ---------- Labor Market helpers (M13) ----------

/** Fill {placeholders} in a copy template. */
export function fillTemplate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
}

/** Thousands -> millions text: 7143 -> "7.1 million". */
export function formatMillions(thousands, digits = 1) {
  return `${formatNumber(Number(thousands) / 1000, digits)} million`;
}

/** Signed thousands with grouping: 142 -> "+142,000"; -33 -> "−33,000"; 0 -> "±0". */
export function formatJobsChange(thousands) {
  const n = Math.round(Number(thousands) * 1000);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "±";
  return `${sign}${Math.abs(n).toLocaleString("en-US")}`;
}

/** Latest value minus the one in the immediately preceding calendar month; null if that month is missing. */
export function monthChange(obs) {
  if (!Array.isArray(obs) || obs.length < 2) return null;
  const last = obs.at(-1);
  const prev = obs.at(-2);
  if (addMonths(last.date, -1) !== prev.date) return null;
  return { change: last.value - prev.value, prev };
}

/** Florida minus U.S. for the same month: the latest month both series share. Null if none. */
export function latestGap(fl, us) {
  const byDate = new Map((us ?? []).map((o) => [o.date, o]));
  for (let i = (fl ?? []).length - 1; i >= 0; i--) {
    const u = byDate.get(fl[i].date);
    if (u) return { date: fl[i].date, florida: fl[i].value, us: u.value, gap: Number((fl[i].value - u.value).toFixed(6)) };
  }
  return null;
}

/**
 * "Florida is 0.3 percentage points below the U.S. rate." from LABOR.templates. Compares at one decimal.
 * @param {{gap:number}|null} g  result of latestGap
 */
export function gapSentence(g, t) {
  if (!g) return "";
  const rounded = Number(Math.abs(g.gap).toFixed(1));
  if (rounded === 0) return t.equal;
  return fillTemplate(t.gap, { gap: rounded.toFixed(1), dir: g.gap > 0 ? t.above : t.below });
}
