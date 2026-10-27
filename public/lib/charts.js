// Shared Chart.js helpers (owned by the frontend-engineer agent): theme colors, recession shading,
// horizontal reference lines, range slicing, CSV export and data-table rows.
// Importing this module touches no DOM and doesn't need Chart.js; only createLineChart(),
// chartTheme() and downloadText() use the browser, and only when called.

import { addMonths, shiftYears, formatDate, formatNumber } from "./format.js";

/** USREC starts in 1854; request it from here (before the first observation any chart shows). */
export const USREC_START = "1947-01-01";

const ms = (iso) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Observations inside a range button's window: from `years` before the latest date through the latest.
 * `years` null/0 = all history. Charts, CSV and data tables all use this, so they always agree.
 */
export function sliceRange(obs, years) {
  if (!Array.isArray(obs) || obs.length === 0) return [];
  if (!years) return obs.slice();
  const start = shiftYears(obs.at(-1).date, -years);
  return obs.filter((o) => o.date >= start);
}

/**
 * Position of a date on a category axis whose labels are sorted ISO dates, as a fractional index
 * (linear in time between neighboring labels; extrapolated past either end with the edge spacing).
 */
export function dateToIndex(labels, iso) {
  const n = labels.length;
  if (n === 0) return NaN;
  const t = ms(iso);
  if (n === 1) return t === ms(labels[0]) ? 0 : t < ms(labels[0]) ? -Infinity : Infinity;
  const t0 = ms(labels[0]);
  const tn = ms(labels[n - 1]);
  if (t <= t0) return (t - t0) / (ms(labels[1]) - t0);
  if (t >= tn) return n - 1 + (t - tn) / (tn - ms(labels[n - 2]));
  let lo = 0;
  let hi = n - 1; // invariant: labels[lo] <= iso < labels[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ms(labels[mid]) <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - ms(labels[lo])) / (ms(labels[hi]) - ms(labels[lo]));
}

/**
 * Recession bands for a chart, in fractional category indices, clipped to the visible labels.
 * A period { start, end } (inclusive months, from econ.recessionPeriods) covers start-of-`start` to the
 * end of the `end` month, i.e. up to the first day of the next month. Periods fully outside are dropped.
 * @returns {{from: number, to: number}[]}
 */
export function bandIndices(labels, periods) {
  if (!labels?.length || !periods?.length) return [];
  const last = labels.length - 1;
  const out = [];
  for (const p of periods) {
    const from = dateToIndex(labels, p.start);
    const to = dateToIndex(labels, addMonths(p.end, 1));
    if (!(to > 0) || !(from <= last)) continue;
    out.push({ from: Math.max(0, from), to: Math.min(last, to) });
  }
  return out;
}

/** Chart.js plugin that paints recession bands behind the data. */
export function recessionShadingPlugin(bands, color) {
  return {
    id: "recessionShading",
    beforeDatasetsDraw(chart) {
      if (!bands.length) return;
      const { ctx, chartArea: a, scales } = chart;
      ctx.save();
      ctx.fillStyle = color;
      for (const b of bands) {
        let x0 = Math.max(a.left, scales.x.getPixelForValue(b.from));
        let x1 = Math.min(a.right, scales.x.getPixelForValue(b.to));
        if (x1 - x0 < 2) x1 = Math.min(a.right, x0 + 2); // keep one-month bands visible on long ranges
        if (x1 - x0 < 2) x0 = x1 - 2;
        ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top);
      }
      ctx.restore();
    },
  };
}

/** Chart.js plugin that draws horizontal reference lines (2% target, 0.50 signal, zero line). */
export function referenceLinesPlugin(lines) {
  return {
    id: "referenceLines",
    beforeDatasetsDraw(chart) {
      if (!lines.length) return;
      const { ctx, chartArea: a, scales } = chart;
      ctx.save();
      for (const l of lines) {
        const y = scales.y.getPixelForValue(l.y);
        if (y < a.top - 0.5 || y > a.bottom + 0.5) continue;
        ctx.strokeStyle = l.color;
        ctx.lineWidth = l.width ?? 1.5;
        ctx.setLineDash(l.dash ?? [6, 4]);
        ctx.beginPath();
        ctx.moveTo(a.left, y);
        ctx.lineTo(a.right, y);
        ctx.stroke();
        if (l.label) {
          ctx.setLineDash([]);
          ctx.font = "600 11px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
          ctx.fillStyle = l.color;
          // Label above the line, or below it when there's no room at the top of the plot.
          const above = y - 15 >= a.top;
          ctx.textBaseline = above ? "bottom" : "top";
          ctx.fillText(l.label, a.left + 6, above ? y - 3 : y + 3);
        }
      }
      ctx.restore();
    },
  };
}

/** Current theme colors from CSS custom properties (call in the browser). */
export function chartTheme(doc = document) {
  const css = getComputedStyle(doc.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return { grid: v("--grid"), text: v("--muted"), recession: v("--recession"), ref: v("--ref-line"), neg: v("--neg-fill") };
}

/** Resolve "--c2" to its current color; plain colors pass through. */
export function resolveColor(color, doc = document) {
  return color?.startsWith("--") ? getComputedStyle(doc.documentElement).getPropertyValue(color).trim() : color;
}

/**
 * Draw a single-series time line chart (browser only; needs the Chart.js UMD global).
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   obs: {date: string, value: number}[],   // already sliced to the visible range
 *   color: string,                          // CSS color or "--var"
 *   unit?: string, digits?: number, frequency?: string, shortRange?: boolean,
 *   periods?: {start: string, end: string}[] | null,
 *   refLines?: {y: number, label?: string, color?: string, dash?: number[]}[],
 *   fillBelowZero?: boolean,
 * }} o
 * @returns {object} the Chart instance
 */
export function createLineChart(canvas, o) {
  const theme = chartTheme(canvas.ownerDocument);
  const color = resolveColor(o.color, canvas.ownerDocument);
  const labels = o.obs.map((x) => x.date);
  const unit = o.unit ?? "";
  const digits = o.digits ?? 2;
  const refLines = (o.refLines ?? []).map((l) => ({ ...l, color: l.color ?? theme.ref }));
  const refYs = refLines.map((l) => l.y);
  const bands = o.periods ? bandIndices(labels, o.periods) : [];

  return new globalThis.Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: o.obs.map((x) => x.value),
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: labels.length < 30 ? 2 : 0,
          pointHoverRadius: 4,
          tension: 0.15,
          fill: o.fillBelowZero ? { target: { value: 0 }, above: "transparent", below: theme.neg } : false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => formatDate(items[0].label, o.frequency),
            label: (item) => ` ${formatNumber(item.parsed.y, digits)}${unit}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: theme.text,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6,
            callback(value) {
              const iso = this.getLabelForValue(value);
              return o.shortRange ? formatDate(iso, o.frequency) : iso.slice(0, 4);
            },
          },
        },
        y: {
          grid: { color: theme.grid },
          border: { display: false },
          // Keep reference lines in view even when the data never reach them.
          ...(refYs.length ? { suggestedMin: Math.min(...refYs), suggestedMax: Math.max(...refYs) } : {}),
          ticks: { color: theme.text, callback: (v) => `${v}${o.tickUnit ?? unit}` },
        },
      },
    },
    plugins: [recessionShadingPlugin(bands, theme.recession), referenceLinesPlugin(refLines)],
  });
}

// ---------- CSV (F21) ----------

/** Quote a CSV field when it contains a comma, quote or line break. */
export function csvField(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV text for exactly the observations given (the visible range), with header rows describing them.
 * Excel and Google Sheets read the header rows as two-column key/value lines, then the date,value table.
 * @param {{date: string, value: number}[]} obs
 * @param {{ id: string, title: string, units: string, frequency?: string, source: string, url?: string,
 *           range?: string, retrieved: string }} meta
 */
export function toCSV(obs, meta) {
  const head = [
    ["Series ID", meta.id],
    ["Title", meta.title],
    ["Units", meta.units],
    ["Frequency", meta.frequency ?? ""],
    ["Source", meta.source],
    ["URL", meta.url ?? `https://fred.stlouisfed.org/series/${meta.id}`],
    ["Range shown", obs.length ? `${meta.range ?? ""} (${obs[0].date} to ${obs.at(-1).date})`.trim() : meta.range ?? ""],
    ["Retrieved", meta.retrieved],
  ];
  const lines = head.map((r) => r.map(csvField).join(","));
  lines.push("", "date,value");
  for (const o of obs) lines.push(`${o.date},${o.value}`);
  return lines.join("\r\n") + "\r\n";
}

/** "UNRATE_20Y_2026-10-27.csv" */
export function csvFilename(id, rangeLabel, isoDate) {
  return `${id}_${rangeLabel}_${isoDate}.csv`.replace(/[^A-Za-z0-9_.-]/g, "-");
}

/** Today's local date as YYYY-MM-DD (the retrieval date in CSV headers and file names). */
export function todayISO(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Save text as a file in the browser. A BOM makes Excel read the file as UTF-8. */
export function downloadText(filename, text, { type = "text/csv;charset=utf-8", doc = document } = {}) {
  const url = URL.createObjectURL(new Blob(["﻿", text], { type }));
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename;
  a.hidden = true;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- data table (F22) ----------

/**
 * Rows for the accessible data table: newest first, limited to `limit` unless `all`.
 * @returns {{date: string, value: number}[]}
 */
export function tableRows(obs, { limit = 24, all = false } = {}) {
  const rows = (obs ?? []).slice().reverse();
  return all ? rows : rows.slice(0, limit);
}
