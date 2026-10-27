// Data-driven plain-English sentences (owned by the econ-modeling-engineer agent).
// Pure: no DOM, no fetch. Sentences state facts with dates — no causes, forecasts or advice.

import { formatNumber, formatQuarter } from "./format.js";
import { yearAgo, SAHM_THRESHOLD } from "./econ.js";

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
