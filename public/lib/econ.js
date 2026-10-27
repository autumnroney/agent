// Pure economics math (owned by the econ-modeling-engineer agent).
// No DOM, no fetch: every function takes observations [{date: "YYYY-MM-DD", value: number}] sorted by date.
// M6 seeds this module with yearAgo; later milestones add recession periods, Sahm rule, Okun gap,
// Taylor rule, real rate, series alignment and Phillips points.

import { shiftYears } from "./format.js";

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
