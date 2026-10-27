// Data-driven plain-English sentences (owned by the econ-modeling-engineer agent).
// Pure: no DOM, no fetch. Sentences state facts with dates — no causes, forecasts or advice.

import { formatNumber, formatQuarter } from "./format.js";
import { yearAgo, SAHM_THRESHOLD, policyStance } from "./econ.js";

const longMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** "September 2026" for monthly data, "Q2 2026" for quarterly data. */
export function periodLabel(iso, frequency) {
  return /^q(uarterly)?$/i.test(String(frequency ?? "")) ? formatQuarter(iso) : longMonth.format(new Date(`${iso}T00:00:00Z`));
}

/**
 * Direction of a change, compared at display precision: "up 0.2 points", "down 1.0 points", "unchanged".
 * @param {number} diff  change in percentage points
 */
export function changePhrase(diff, digits = 1) {
  const rounded = Number(Number(diff).toFixed(digits));
  if (rounded === 0) return "unchanged";
  return `${rounded > 0 ? "up" : "down"} ${Math.abs(rounded).toFixed(digits)} points`;
}

/**
 * One sentence about the latest observation and the change from a year earlier, e.g.
 * "Unemployment was 4.3% in September 2026, up 0.2 points from September 2025."
 * Returns "" for an empty series.
 * @param {{label: string, obs: {date: string, value: number}[], unit?: string, frequency?: string, digits?: number}} item
 */
export function latestSentence({ label, obs, unit = "%", frequency, digits = 1 }) {
  if (!Array.isArray(obs) || obs.length === 0) return "";
  const last = obs.at(-1);
  const head = `${label} was ${formatNumber(last.value, digits)}${unit} in ${periodLabel(last.date, frequency)}`;
  const prev = yearAgo(obs);
  if (!prev) return `${head}.`;
  // Compare the values as displayed, so the sentence agrees with the card.
  const diff = Number(last.value.toFixed(digits)) - Number(prev.value.toFixed(digits));
  const change = changePhrase(diff, digits);
  const from = periodLabel(prev.date, frequency);
  return change === "unchanged"
    ? `${head}, unchanged from ${from}.`
    : `${head}, ${change} from ${from}.`;
}

/** The dashboard's one-paragraph summary: one sentence per indicator that loaded, in order. */
export function dashboardSummary(items) {
  return (items ?? []).map(latestSentence).filter(Boolean).join(" ");
}

/**
 * "In September 2026 the Sahm rule reading was 0.27 points, below the 0.50-point signal level."
 * @param {{date: string, value: number, triggered: boolean} | null} sahm  from econ.sahmRule()
 */
export function sahmSentence(sahm) {
  if (!sahm) return "";
  const where = sahm.triggered ? "at or above" : "below";
  return (
    `In ${periodLabel(sahm.date)} the Sahm rule reading was ${formatNumber(sahm.value, 2)} points, ` +
    `${where} the ${SAHM_THRESHOLD.toFixed(2)}-point signal level.`
  );
}

/**
 * "In September 2026 the 10-year Treasury yield averaged 0.85 points above the 3-month yield, so the
 * yield curve was not inverted."
 * @param {{date: string, value: number, inverted: boolean, invertedMonths: number} | null} yc  from econ.yieldCurve()
 */
export function yieldCurveSentence(yc) {
  if (!yc) return "";
  const when = `In ${periodLabel(yc.date)}`;
  const gap = formatNumber(Math.abs(yc.value), 2);
  if (Number(gap) === 0) return `${when} the 10-year and 3-month Treasury yields averaged about the same.`;
  if (!yc.inverted) {
    return `${when} the 10-year Treasury yield averaged ${gap} points above the 3-month yield, so the yield curve was not inverted.`;
  }
  const streak =
    yc.invertedMonths > 1 ? ` It has been inverted for ${yc.invertedMonths} months in a row.` : "";
  return `${when} the 10-year Treasury yield averaged ${gap} points below the 3-month yield, so the yield curve was inverted.${streak}`;
}

// ---------- M8: Policy Lab "Right now" ----------

/** Fill "{x}"-style placeholders; unknown keys become "". */
export function fillTemplate(template, values = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (_, k) => (values[k] ?? "") + "");
}

/**
 * Compare a rule rate with the actual rate at display precision, so the sentence agrees with the numbers
 * shown: diff = round(rule) − round(actual). `direction` is "higher" | "lower" | "same" (rounds to 0.0).
 * `x` is the absolute difference as displayed, e.g. "0.6".
 */
export function compareAtDisplay(rule, actual, digits = 1) {
  const r = Number(Number(rule).toFixed(digits));
  const a = Number(Number(actual).toFixed(digits));
  const diff = Number((r - a).toFixed(digits));
  const direction = diff > 0 ? "higher" : diff < 0 ? "lower" : "same";
  return { diff: diff === 0 ? 0 : diff, direction, x: Math.abs(diff).toFixed(digits) };
}

/**
 * Plain-English "Right now" sentences for the Taylor rule, using the copy templates passed in
 * (content.js POLICY_LAB.taylor.rightNow: higher, lower, same, floored, note).
 * - Comparison (higher/lower/same) uses the rule rate as shown (floored when the ZLB toggle is on).
 * - `floored` is added when the ZLB is on and the unfloored rule is negative (at 1 decimal); {x} = the unfloored rate.
 * - `note` is always last. With no actual rate, only the floored line (if any) and the note are returned.
 * @param {{rule: number, raw: number, actual: number|null, zlb: boolean}} r
 * @param {{higher: string, lower: string, same: string, floored: string, note: string}} copy
 * @returns {string[]}
 */
export function taylorRightNow({ rule, raw, actual, zlb }, copy) {
  const out = [];
  if (Number.isFinite(actual) && Number.isFinite(rule)) {
    const c = compareAtDisplay(rule, actual, 1);
    out.push(fillTemplate(copy[c.direction], { x: c.x }));
  }
  // Only when the unfloored rate is negative as displayed (−0.04 would read "0.0%").
  if (zlb && Number.isFinite(raw) && Number(raw.toFixed(1)) < 0) out.push(fillTemplate(copy.floored, { x: formatNumber(raw, 1) }));
  out.push(copy.note);
  return out;
}

// ---------- M9: Policy Lab "Policy stance" ----------

/**
 * Plain-English "Right now" sentences for the policy stance, using the copy templates passed in
 * (content.js POLICY_LAB.stance.rightNow: tighter, looser, near, note). {x} = |real − r*| as displayed
 * (1 decimal), {rStar} = r* at 1 decimal. `near` when that rounds to 0.0. `note` is always last.
 * @param {{real: number, rStar: number}} r
 * @param {{tighter: string, looser: string, near: string, note: string}} copy
 * @returns {string[]}
 */
export function stanceRightNow({ real, rStar }, copy) {
  const out = [];
  if (Number.isFinite(real) && Number.isFinite(rStar)) {
    const s = policyStance(real, rStar, 1);
    out.push(fillTemplate(copy[s.stance], { x: s.x, rStar: formatNumber(rStar, 1) }));
  }
  out.push(copy.note);
  return out;
}
