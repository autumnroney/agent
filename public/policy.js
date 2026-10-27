// Policy Lab, M8: Taylor rule (owned by the econ-modeling-engineer agent).
// All copy comes from content.js (POLICY_LAB, rendered with textContent); all math from lib/econ.js;
// data only via lib/fred-client.js (/api/fred). Slider moves recompute the rule from data already in
// memory and update the chart in place: no refetching.

import { POLICY_LAB, SOURCES, RECESSION_SHADING, CHART_UI } from "./content.js";
import { getSeries } from "./lib/fred-client.js";
import { formatMonth, formatNumber, formatChange, parseHash, buildHash, shiftYears } from "./lib/format.js";
import {
  TAYLOR_PRESETS,
  matchPreset,
  taylorInputs,
  taylorSeries,
  latestComplete,
  latestRule,
  recessionPeriods,
} from "./lib/econ.js";
import { periodLabel, taylorRightNow, compareAtDisplay, fillTemplate } from "./lib/narrate.js";
import { mountNav } from "./lib/nav.js";
import {
  USREC_START,
  bandIndices,
  recessionShadingPlugin,
  referenceLinesPlugin,
  chartTheme,
  resolveColor,
  tableRows,
} from "./lib/charts.js";

const T = POLICY_LAB.taylor;
const C = T.controls;

// ---------- settings (PRD F31 ranges and defaults) ----------

/** Sliders in display order. `hash` is the URL-hash key (F35). */
const SLIDERS = [
  { key: "rStar", hash: "r", min: -1, max: 4, step: 0.1, def: 2, unit: "%", copy: C.rStar },
  { key: "piStar", hash: "pt", min: 0, max: 4, step: 0.1, def: 2, unit: "%", copy: C.piStar },
  { key: "aPi", hash: "api", min: 0, max: 1.5, step: 0.1, def: 0.5, unit: "", copy: C.aPi },
  { key: "aY", hash: "ay", min: 0, max: 1.5, step: 0.1, def: 0.5, unit: "", copy: C.aY },
  { key: "okun", hash: "ok", min: 1.5, max: 3, step: 0.1, def: 2, unit: "", copy: C.okun },
];
const USTAR_FIXED = { key: "uStarFixed", hash: "us", min: 3, max: 7, step: 0.1, def: 4.5, unit: "%" };
const MEASURES = ["PCEPILFE", "PCEPI", "CPIAUCSL"];
const DEFAULT_MEASURE = "PCEPILFE";
// Range buttons. "1990" is the PRD default view (F30). Labels are UI chrome, not explanatory copy.
const RANGES = [
  { id: "5", label: "5Y", years: 5 },
  { id: "10", label: "10Y", years: 10 },
  { id: "20", label: "20Y", years: 20 },
  { id: "1990", label: "Since 1990", since: "1990-01-01" },
  { id: "max", label: "Max", since: null },
];
const DEFAULT_RANGE = "1990";

const DEFAULTS = {
  ...TAYLOR_PRESETS.taylor1993,
  okun: 2,
  uStarMode: "cbo",
  uStarFixed: USTAR_FIXED.def,
  measure: DEFAULT_MEASURE,
  zlb: false,
  range: DEFAULT_RANGE,
};

const state = { ...DEFAULTS };
let lastCustom = null; // the most recent "Your rule" settings, restored by the Your rule button

// ---------- data ----------

const bodies = new Map(); // series id -> API body
const failed = new Map(); // series id -> error message
let periods = null; // NBER recession periods (null while loading or if USREC failed)
let inputsKey = ""; // cache key for `inputs`
let inputs = null; // taylorInputs() rows for the current measure / u* choice
let chart = null;
let chartRangeKey = ""; // labels/bands the current chart was built for
let tableOpen = false;
let tableAll = false;

const SERIES_NAMES = Object.fromEntries(T.sources.series.map((s) => [s.id, s.name]));
/** "Unemployment rate" -> "unemployment rate" (keeps acronyms like "PCE ..." / "CPI"). */
const inSentence = (name) => (/^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name);

function load(id, opts) {
  return getSeries(id, opts).then(
    (body) => {
      bodies.set(id, body);
      failed.delete(id);
      return body;
    },
    (err) => {
      failed.set(id, err.message);
      throw err;
    }
  );
}

const obsOf = (id) => bodies.get(id)?.observations ?? null;
const nrouOK = () => bodies.has("NROU");
const effectiveUStarMode = () => (state.uStarMode === "cbo" && nrouOK() ? "cbo" : "fixed");

/** Aligned monthly inputs for the current measure and u* choice (recomputed only when those change). */
function currentInputs() {
  const mode = effectiveUStarMode();
  const key = `${state.measure}|${mode}|${mode === "fixed" ? state.uStarFixed : ""}|${bodies.has("FEDFUNDS")}`;
  if (key !== inputsKey) {
    inputs = taylorInputs({
      inflation: obsOf(state.measure),
      unrate: obsOf("UNRATE"),
      nrou: obsOf("NROU"),
      uStarFixed: mode === "fixed" ? state.uStarFixed : null,
      fedfunds: obsOf("FEDFUNDS"),
    });
    inputsKey = key;
  }
  return inputs;
}

const ruleParams = () => ({
  rStar: state.rStar,
  piStar: state.piStar,
  aPi: state.aPi,
  aY: state.aY,
  okun: state.okun,
  zlb: state.zlb,
});

// ---------- small DOM helpers ----------

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("aria-") || k === "for" || k === "role" || k === "id" || k.startsWith("data-")) n.setAttribute(k, v);
    else n[k] = v;
  }
  for (const c of children) if (c) n.append(c);
  return n;
};
/** Set text only when it changed, so live regions don't re-announce identical text on every slider step. */
const setText = (id, text) => {
  const n = $(id);
  if (n.textContent !== (text ?? "")) n.textContent = text ?? "";
};

const fmtParam = (v) => formatNumber(v, 1);
const pct = (v, digits = 1) => `${formatNumber(v, digits)}%`;

// ---------- hash state (F35) ----------

function snap(v, s) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(s.max, Math.max(s.min, n));
  return Number((s.min + Math.round((clamped - s.min) / s.step) * s.step).toFixed(2));
}

/** Read settings from the URL hash; anything missing or invalid falls back to the default. */
function stateFromHash(hash) {
  const h = parseHash(hash);
  const out = { ...DEFAULTS };
  for (const s of SLIDERS) if (h[s.hash] !== undefined && h[s.hash] !== "") out[s.key] = snap(h[s.hash], s) ?? s.def;
  if (h.us === "cbo") out.uStarMode = "cbo";
  else if (h.us !== undefined && snap(h.us, USTAR_FIXED) !== null) {
    out.uStarMode = "fixed";
    out.uStarFixed = snap(h.us, USTAR_FIXED);
  }
  if (MEASURES.includes(h.inf)) out.measure = h.inf;
  if (h.zlb === "1" || h.zlb === "0") out.zlb = h.zlb === "1";
  if (RANGES.some((r) => r.id === h.rg)) out.range = h.rg;
  return out;
}

function hashFromState() {
  const o = {};
  for (const s of SLIDERS) o[s.hash] = state[s.key];
  o.us = state.uStarMode === "cbo" ? "cbo" : state.uStarFixed;
  o.inf = state.measure;
  o.zlb = state.zlb ? 1 : 0;
  o.rg = state.range;
  return buildHash(o);
}

let hashTimer = 0;
function writeHash() {
  // Debounced: Safari throttles frequent replaceState calls while a slider is dragged.
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    try {
      history.replaceState(null, "", hashFromState());
    } catch {
      // replaceState can throw when throttled; the next change writes it again.
    }
  }, 150);
}

const shareURL = () => `${location.origin}${location.pathname}${location.search}${hashFromState()}`;

// ---------- static copy ----------

function renderCopy() {
  setText("lab-title", POLICY_LAB.title);
  setText("lab-intro", POLICY_LAB.intro);
  setText("taylor-heading", T.heading);
  setText("taylor-lead", T.lead);
  setText("chart-heading", T.chart.heading);
  $("taylor-chart").setAttribute("aria-label", T.chart.ariaLabel);
  setText("controls-heading", C.heading);
  setText("presets-label", T.presets.label);
  setText("inflation-label", T.inflation.label);
  setText("inflation-why", T.inflation.defaultWhy);
  setText("ustar-legend", C.uStar.label);
  setText("ustar-cbo", C.uStar.cboOption);
  setText("ustar-fixed", C.uStar.fixedOption);
  setText("ustar-help", C.uStar.help);
  setText("zlb-label", T.zlb.label);
  setText("zlb-help", T.zlb.help);
  setText("copy-link", T.share.copyLink);
  setText("rn-heading", T.rightNow.heading);
  setText("rn-formula-heading", T.rightNow.formulaHeading);
  setText("rn-formula-symbols", T.explainer.formula);
  setText("table-toggle", CHART_UI.showTable);
  renderExplainer();
  renderTryThis();
  renderSources();
}

function renderExplainer() {
  const E = T.explainer;
  const root = $("explainer");
  const terms = el("dl", { class: "terms" });
  for (const t of E.terms) terms.append(el("dt", {}, el("span", { class: "sym", text: t.symbol }), ` ${t.name}`), el("dd", { text: t.definition }));
  root.append(
    el("h3", { id: "explainer-heading", text: E.heading }),
    el("p", { text: E.whatItSays }),
    el("p", { class: "formula formula-main", text: E.formula }),
    el("p", { class: "muted", text: E.formulaWords }),
    el("p", { text: E.whyPiTwice }),
    el("p", { text: E.onTarget }),
    el("details", { class: "glossary" }, el("summary", { text: "What the symbols mean" }), terms),
    el("h4", { text: E.okun.heading }),
    el("p", { text: E.okun.text }),
    el("p", { class: "formula", text: E.okun.formula }),
    el("p", { class: "muted", text: E.okun.example }),
    el("p", { text: E.uStar }),
    el("p", { text: E.whatItLeavesOut }),
    el("h4", { text: E.caveatsHeading }),
    el("ul", { class: "caveats" }, ...E.caveats.map((c) => el("li", { text: c })))
  );
}

function renderTryThis() {
  $("try-this").append(
    el("h3", { id: "try-heading", text: T.tryThis.heading }),
    el("ul", {}, ...T.tryThis.prompts.map((p) => el("li", { text: p })))
  );
}

function renderSources() {
  const S = T.sources;
  const list = el(
    "ul",
    { class: "source-list" },
    ...S.series.map((s) =>
      el(
        "li",
        {},
        el("a", { href: `https://fred.stlouisfed.org/series/${s.id}`, target: "_blank", rel: "noopener", text: s.id }),
        ` · ${s.name} · ${SOURCES[s.id] ?? "FRED"}`
      )
    )
  );
  const refs = el(
    "ul",
    { class: "source-list" },
    ...S.references.map((r) =>
      el("li", {}, `${r.text} `, el("a", { href: r.url, target: "_blank", rel: "noopener", text: r.url }))
    )
  );
  $("sources").append(el("h3", { id: "sources-heading", text: S.heading }), el("p", { class: "muted", text: S.note }), list, refs);
}

// ---------- controls ----------

function sliderBlock(s, copy) {
  const id = `s-${s.key}`;
  const out = el("output", { id: `${id}-out`, for: id, class: "val" });
  const input = el("input", {
    type: "range",
    id,
    min: s.min,
    max: s.max,
    step: s.step,
    "aria-describedby": `${id}-help`,
    "data-key": s.key,
  });
  return el(
    "div",
    { class: "field slider" },
    el("div", { class: "slider-head" }, el("label", { for: id, text: copy.label }), out),
    input,
    el("p", { class: "help", id: `${id}-help`, text: copy.help })
  );
}

function mountControls() {
  // Presets (F32).
  const pb = $("preset-buttons");
  for (const key of ["taylor1993", "balanced", "custom"]) {
    const b = el("button", { type: "button", "data-preset": key, text: T.presets[key].label, "aria-pressed": "false" });
    b.addEventListener("click", () => applyPreset(key));
    pb.append(b);
  }

  // Sliders (F31).
  const host = $("sliders");
  for (const s of SLIDERS) host.append(sliderBlock(s, s.copy));
  $("ustar-slider").append(sliderBlock(USTAR_FIXED, { label: C.uStar.fixedLabel, help: "" }));
  $(`s-${USTAR_FIXED.key}-help`).remove();
  $(`s-${USTAR_FIXED.key}`).removeAttribute("aria-describedby");

  for (const s of [...SLIDERS, USTAR_FIXED]) {
    const input = $(`s-${s.key}`);
    input.addEventListener("input", () => {
      state[s.key] = snap(input.value, s);
      if (s === USTAR_FIXED) inputsKey = ""; // u* change: re-align inputs
      onSettingsChanged();
    });
  }

  // Inflation measure.
  const sel = $("inflation-select");
  for (const id of MEASURES) sel.append(el("option", { value: id, text: T.inflation.options[id].label }));
  sel.addEventListener("change", () => {
    state.measure = sel.value;
    onSettingsChanged({ data: true });
  });

  // u* source.
  document.querySelectorAll('input[name="ustar-mode"]').forEach((r) =>
    r.addEventListener("change", () => {
      if (!r.checked) return;
      state.uStarMode = r.value;
      onSettingsChanged();
    })
  );

  // Zero lower bound (F34).
  $("zlb").addEventListener("change", (e) => {
    state.zlb = e.target.checked;
    onSettingsChanged();
  });

  // Range buttons.
  const rg = $("range");
  for (const r of RANGES) {
    const b = el("button", { type: "button", "data-range": r.id, text: r.label, "aria-pressed": "false" });
    b.addEventListener("click", () => {
      state.range = r.id;
      onSettingsChanged();
    });
    rg.append(b);
  }

  // Share (F35).
  $("copy-link").addEventListener("click", copyLink);
  $("controls").addEventListener("submit", (e) => e.preventDefault());

  // Data table toggle (text alternative for the chart).
  $("table-toggle").addEventListener("click", () => {
    tableOpen = !tableOpen;
    $("table-toggle").setAttribute("aria-expanded", String(tableOpen));
    setText("table-toggle", tableOpen ? CHART_UI.hideTable : CHART_UI.showTable);
    $("taylor-table").hidden = !tableOpen;
    if (tableOpen) renderTable();
  });
}

function applyPreset(key) {
  if (key === "custom") {
    if (!lastCustom) {
      $(`s-${SLIDERS[0].key}`).focus(); // nothing to restore yet: start building one with the sliders
      return;
    }
    Object.assign(state, lastCustom);
  } else {
    Object.assign(state, TAYLOR_PRESETS[key]);
  }
  onSettingsChanged();
}

/** Reflect `state` in every control (after a preset, a hash change or on load). */
function syncControls() {
  for (const s of [...SLIDERS, USTAR_FIXED]) {
    const input = $(`s-${s.key}`);
    if (Number(input.value) !== state[s.key]) input.value = String(state[s.key]);
    $(`s-${s.key}-out`).textContent = `${fmtParam(state[s.key])}${s.unit}`;
  }
  $("inflation-select").value = state.measure;
  setText("inflation-note", T.inflation.options[state.measure].note);

  const mode = effectiveUStarMode();
  document.querySelectorAll('input[name="ustar-mode"]').forEach((r) => {
    r.checked = r.value === mode;
    if (r.value === "cbo") r.disabled = failed.has("NROU");
  });
  $("ustar-slider").hidden = mode !== "fixed";
  const fb = $("ustar-fallback");
  if (failed.has("NROU")) {
    fb.textContent = fillTemplate(T.errors.uStarFallback, { x: fmtParam(state.uStarFixed) });
    fb.hidden = false;
  } else fb.hidden = true;

  $("zlb").checked = state.zlb;
  document.querySelectorAll("[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === state.range)));

  const preset = matchPreset(state);
  document.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === preset)));
  const p = T.presets[preset];
  setText("preset-desc", [p.description, p.note].filter(Boolean).join(" "));
}

async function copyLink() {
  writeHash();
  const status = $("share-status");
  try {
    await navigator.clipboard.writeText(shareURL());
    status.textContent = T.share.copied;
  } catch {
    try {
      history.replaceState(null, "", hashFromState());
    } catch {
      /* ignore */
    }
    status.textContent = T.share.copyFailed;
  }
}

// ---------- rendering ----------

let series = []; // taylorSeries rows for the current settings

function visibleRows() {
  const r = RANGES.find((x) => x.id === state.range);
  const firstRule = series.findIndex((x) => x.rule !== null);
  if (firstRule < 0) return [];
  let rows = series.slice(firstRule);
  if (r.since) rows = rows.filter((x) => x.date >= r.since);
  else if (r.years) {
    const start = shiftYears(rows.at(-1).date, -r.years);
    rows = rows.filter((x) => x.date >= start);
  }
  return rows;
}

function presetLabel() {
  return T.presets[matchPreset(state)].label;
}

function renderLegend() {
  const items = [
    { cls: "key-line key-rule", text: fillTemplate(T.chart.ruleLine, { preset: presetLabel() }) },
  ];
  if (bodies.has("FEDFUNDS")) items.push({ cls: "key-line key-actual", text: T.chart.actualLine });
  if (periods) items.push({ cls: "key-rec", text: RECESSION_SHADING.note });
  if (state.zlb) items.push({ cls: "key-ref", text: T.zlb.legendNote });
  const legend = $("chart-legend");
  legend.replaceChildren(...items.map((i) => el("span", { class: `key ${i.cls}`, text: i.text })));
}

function buildChart(rows) {
  const canvas = $("taylor-chart");
  const theme = chartTheme();
  const labels = rows.map((r) => r.date);
  const ruleColor = resolveColor("--c1");
  const actualColor = resolveColor("--c2");
  const bands = periods ? bandIndices(labels, periods) : [];
  const refLines = [{ y: 0, label: T.chart.zeroLine, dash: [], color: theme.ref, width: 1 }];
  chart?.destroy();
  chart = new globalThis.Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: fillTemplate(T.chart.ruleLine, { preset: presetLabel() }),
          data: rows.map((r) => r.rule),
          borderColor: ruleColor,
          backgroundColor: ruleColor,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.1,
          spanGaps: false,
        },
        {
          label: T.chart.actualLine,
          data: rows.map((r) => r.actual),
          borderColor: actualColor,
          backgroundColor: actualColor,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.1,
          hidden: !bodies.has("FEDFUNDS"),
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
            title: (items) => formatMonth(items[0].label),
            label: (item) =>
              item.parsed.y === null ? "" : ` ${item.dataset.label}: ${formatNumber(item.parsed.y, 2)}%`,
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
            maxTicksLimit: 7,
            callback(value) {
              const iso = this.getLabelForValue(value);
              return labels.length <= 24 ? formatMonth(iso) : iso.slice(0, 4);
            },
          },
        },
        y: {
          grid: { color: theme.grid },
          border: { display: false },
          suggestedMin: 0,
          title: { display: true, text: T.chart.yAxis, color: theme.text },
          ticks: { color: theme.text, callback: (v) => `${v}%` },
        },
      },
    },
    plugins: [recessionShadingPlugin(bands, theme.recession), referenceLinesPlugin(refLines)],
  });
}

/** Redraw the chart: in place when only rule values changed (sliders), rebuilt when the x-axis changed. */
function renderChart() {
  const rows = visibleRows();
  const card = $("chart-card");
  if (!rows.length) return;
  card.classList.remove("no-data");
  renderLegend();
  if (typeof globalThis.Chart === "undefined") {
    showChartError("Couldn't load the charting library. Check your connection and reload the page.", { keepCard: true });
    return;
  }
  const key = `${state.range}|${rows[0].date}|${rows.at(-1).date}|${rows.length}|${Boolean(periods)}|${state.measure}|${effectiveUStarMode()}`;
  if (!chart || key !== chartRangeKey) {
    buildChart(rows);
    chartRangeKey = key;
  } else {
    const ds = chart.data.datasets[0];
    ds.data = rows.map((r) => r.rule);
    ds.label = fillTemplate(T.chart.ruleLine, { preset: presetLabel() });
    chart.update("none");
  }
}

function renderRightNow() {
  const box = $("right-now");
  const R = T.rightNow;
  const hasActual = bodies.has("FEDFUNDS");
  const row = hasActual ? latestComplete(series) : latestRule(series);
  if (!row) {
    box.classList.add("no-data");
    return;
  }
  box.classList.remove("no-data");
  setText("rn-asof", fillTemplate(R.asOf, { date: periodLabel(row.date) }));

  const measureName = T.inflation.options[state.measure].label.replace(/\s*\(default\)\s*/i, "");
  const cmp = hasActual ? compareAtDisplay(row.rule, row.actual, 1) : null;
  const items = [
    [R.ruleRate, pct(row.rule), "big rule"],
    [R.actualRate, hasActual ? pct(row.actual) : "Unavailable", "big actual"],
    [R.difference, cmp ? `${formatChange(cmp.diff)} pts` : "—", "big diff"],
    [fillTemplate(R.inflation, { measure: measureName }), pct(row.pi)],
    [R.unemployment, pct(row.u)],
    [R.uStar, pct(row.uStar)],
    [R.outputGap, `${formatChange(row.gap)}%`],
  ];
  $("rn-grid").replaceChildren(
    ...items.map(([dt, dd, cls]) =>
      el(
        "div",
        { class: `rn-item ${cls ?? ""}`.trim() },
        el("dt", { text: dt }),
        el("dd", { text: dd })
      )
    )
  );
  setText("rn-actual-help", R.actualHelp);

  const sentences = taylorRightNow({ rule: row.rule, raw: row.raw, actual: hasActual ? row.actual : null, zlb: state.zlb }, R);
  const box2 = $("rn-sentences");
  if (box2.dataset.text === sentences.join("|")) return renderFormula(row);
  box2.dataset.text = sentences.join("|");
  box2.replaceChildren(
    ...sentences.map((s, i) => el("p", { class: i === sentences.length - 1 ? "rn-note" : "rn-sentence", text: s }))
  );
  renderFormula(row);
}

/** The formula with today's numbers plugged in (F33). */
function renderFormula(row) {
  const R = T.rightNow;
  const f2 = (v) => formatNumber(v, 2);
  setText("rn-gap-formula", fillTemplate(R.gapTemplate, { okun: fmtParam(state.okun), u: f2(row.u), uStar: f2(row.uStar), gap: f2(row.gap) }));
  setText(
    "rn-formula",
    fillTemplate(R.formulaTemplate, {
      i: f2(row.raw),
      rStar: fmtParam(state.rStar),
      pi: f2(row.pi),
      aPi: fmtParam(state.aPi),
      piStar: fmtParam(state.piStar),
      aY: fmtParam(state.aY),
      gap: f2(row.gap),
    })
  );
}

function renderTable() {
  const wrap = $("taylor-table");
  const rows = visibleRows();
  const shown = tableRows(rows, { all: tableAll });
  const rangeLabel = RANGES.find((r) => r.id === state.range).label;
  const fmt = (v) => (v === null ? "—" : formatNumber(v, 2));
  wrap.setAttribute("aria-label", `${T.chart.heading}: data table`);
  const table = el(
    "table",
    {},
    el("caption", { text: fillTemplate(CHART_UI.tableCaption, { name: T.chart.heading, range: rangeLabel }) }),
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", { scope: "col", text: CHART_UI.dateHeader }),
        el("th", { scope: "col", text: `${T.rightNow.ruleRate} (%)` }),
        el("th", { scope: "col", text: `${T.rightNow.actualRate} (%)` })
      )
    ),
    el(
      "tbody",
      {},
      ...shown.map((r) =>
        el("tr", {}, el("th", { scope: "row", text: formatMonth(r.date) }), el("td", { text: fmt(r.rule) }), el("td", { text: fmt(r.actual) }))
      )
    )
  );
  const parts = [table];
  if (rows.length > 24) {
    const more = el("button", {
      type: "button",
      class: "tool",
      text: fillTemplate(tableAll ? CHART_UI.showFewer : CHART_UI.showAll, { n: tableAll ? 24 : rows.length }),
    });
    more.addEventListener("click", () => {
      tableAll = !tableAll;
      renderTable();
      wrap.querySelector("button")?.focus();
    });
    parts.push(more);
  }
  wrap.replaceChildren(...parts);
}

function showChartError(message, { keepCard = false } = {}) {
  const card = $("chart-card");
  const err = $("chart-error");
  err.textContent = message;
  err.hidden = false;
  if (!keepCard) {
    card.classList.add("no-data");
    chart?.destroy();
    chart = null;
    chartRangeKey = "";
    $("right-now").classList.add("no-data");
  }
}

/** Which required rule input failed, if any (UNRATE or the chosen inflation measure). */
function missingRuleInput() {
  for (const id of ["UNRATE", state.measure]) if (failed.has(id)) return id;
  return null;
}

let dataReady = false;

/** Recompute and redraw everything from data in memory. Never fetches. */
function render() {
  syncControls();
  writeHash();
  if (!dataReady) return;
  $("chart-loading").hidden = true;
  const missing = missingRuleInput();
  if (missing) {
    showChartError(fillTemplate(T.errors.missingSeries, { name: inSentence(SERIES_NAMES[missing] ?? missing) }));
    return;
  }
  if (!bodies.has(state.measure) || !bodies.has("UNRATE")) {
    $("chart-loading").hidden = false; // inflation measure still loading
    return;
  }
  const err = $("chart-error");
  if (failed.has("FEDFUNDS")) {
    err.textContent = `Couldn't load the ${inSentence(SERIES_NAMES.FEDFUNDS)} right now, so only the rule line is shown. Try again in a minute.`;
    err.hidden = false;
  } else err.hidden = true;

  series = taylorSeries(currentInputs(), ruleParams());
  renderChart();
  renderRightNow();
  if (tableOpen) renderTable();
}

function onSettingsChanged({ data = false } = {}) {
  if (matchPreset(state) === "custom") lastCustom = { rStar: state.rStar, piStar: state.piStar, aPi: state.aPi, aY: state.aY };
  if (data && !bodies.has(state.measure) && !failed.has(state.measure)) {
    load(state.measure).then(render, render);
  } else if (data && failed.has(state.measure)) {
    load(state.measure).then(render, render); // retry a measure that failed earlier
  }
  render();
}

// ---------- page ----------

function loadRecessions() {
  load("USREC", { start: USREC_START }).then(
    (body) => {
      periods = recessionPeriods(body.observations);
      render();
    },
    () => {
      const s = $("shading-status");
      s.textContent = RECESSION_SHADING.unavailable;
      s.hidden = false;
    }
  );
}

async function init() {
  mountNav("policy");
  renderCopy();
  mountControls();
  Object.assign(state, stateFromHash(location.hash));
  if (matchPreset(state) === "custom") lastCustom = { rStar: state.rStar, piStar: state.piStar, aPi: state.aPi, aY: state.aY };
  syncControls();

  loadRecessions();
  // ≤ 6 function calls on first load (F61): FEDFUNDS, UNRATE, NROU, the inflation measure, USREC.
  // No `start`, so the dashboard's sessionStorage cache for the same series is reused.
  await Promise.allSettled(["FEDFUNDS", "UNRATE", "NROU", state.measure].map((id) => load(id)));
  dataReady = true;
  inputsKey = "";
  render();

  addEventListener("hashchange", () => {
    if (location.hash === hashFromState()) return;
    Object.assign(state, stateFromHash(location.hash));
    onSettingsChanged({ data: true });
  });
  // Redraw with the new palette when the system theme flips.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    chartRangeKey = "";
    render();
  });
}

init();
