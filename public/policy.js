// Policy Lab (owned by the econ-modeling-engineer agent). Three tabs: Taylor rule (M8), Phillips curve
// and Policy stance (M9). All copy comes from content.js (POLICY_LAB, rendered with textContent); all math
// from lib/econ.js; data only via lib/fred-client.js (/api/fred). Each tab loads only the series it needs,
// once; slider moves, era toggles and tab switches recompute from data already in memory and update the
// charts in place: no refetching. Settings, including the active tab, live in the URL hash.

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
  ERAS,
  phillipsPoints,
  realRate,
  policyStance,
} from "./lib/econ.js";
import { periodLabel, taylorRightNow, stanceRightNow, compareAtDisplay, fillTemplate } from "./lib/narrate.js";
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
const P = POLICY_LAB.phillips;
const S = POLICY_LAB.stance;
const UI = POLICY_LAB.ui ?? {};
// Interface chrome from content.js, with inline fallbacks in case a string is missing.
const ui = {
  rangeGroup: UI.rangeGroup ?? "Time range",
  loading: UI.loading ?? "Loading…",
  unavailable: UI.unavailable ?? "Unavailable",
  symbolsSummary: UI.symbolsSummary ?? "What the symbols mean",
  percentSuffix: UI.percentSuffix ?? " (%)",
  chartLibFailed: UI.chartLibFailed ?? "Couldn't load the charting library. Check your connection and reload the page.",
};
const TABS = ["taylor", "phillips", "stance"];

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
// Range buttons (Taylor and Stance charts). "1990" is the Taylor default view (F30); Stance defaults to
// all history (from 1960). Labels come from POLICY_LAB.ui.ranges, keyed by these ids.
const RANGES = [
  { id: "5", label: "5Y", years: 5 },
  { id: "10", label: "10Y", years: 10 },
  { id: "20", label: "20Y", years: 20 },
  { id: "1990", label: "Since 1990", since: "1990-01-01" },
  { id: "max", label: "Max", since: null },
].map((r) => ({ ...r, label: UI.ranges?.[r.id] ?? r.label }));
const DEFAULT_RANGE = "1990";
const DEFAULT_STANCE_RANGE = "max";

// Phillips curve (F36/F37): inflation measures for the scatter; CPI covers every era (from 1948).
const PH_MEASURES = ["CPIAUCSL", "PCEPILFE"];
const DEFAULT_PH_MEASURE = "CPIAUCSL";
const ERA_IDS = ERAS.map((e) => e.id);
/** Color (CSS custom property in policy.css, AA in both themes, CVD-checked) and marker shape per era. */
const ERA_STYLE = {
  postwar: { color: "--era1", shape: "circle" },
  stagflation: { color: "--era2", shape: "triangle" },
  moderation: { color: "--era3", shape: "rect" },
  recession: { color: "--era4", shape: "rectRot" },
  pandemic: { color: "--era5", shape: "crossRot" },
};
const ERA_COPY = Object.fromEntries((P.eras ?? []).map((e) => [e.id, e]));
const eraLabel = (id) => ERA_COPY[id]?.label ?? id;
// Policy stance (F38) always uses core PCE, whatever the Taylor tab's measure.
const STANCE_INFLATION = "PCEPILFE";

const DEFAULTS = {
  ...TAYLOR_PRESETS.taylor1993,
  okun: 2,
  uStarMode: "cbo",
  uStarFixed: USTAR_FIXED.def,
  measure: DEFAULT_MEASURE,
  zlb: false,
  range: DEFAULT_RANGE,
  tab: "taylor",
  pm: DEFAULT_PH_MEASURE, // Phillips inflation measure
  eras: ERA_IDS, // visible Phillips eras (never mutated: replaced on change)
  connect: "", // era whose months are connected in date order ("" = off)
  srg: DEFAULT_STANCE_RANGE, // Stance chart range
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

const SERIES_NAMES = Object.fromEntries(
  [...T.sources.series, ...(P.sources?.series ?? []), ...(S.sources?.series ?? [])].map((s) => [s.id, s.name])
);
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

const loadingIds = new Set(); // series with a request in flight

/**
 * Start loading any of `ids` not already in memory (failed ones are retried). Called on first load and on
 * user actions (tab switch, measure change), never from render(), so a failing series isn't hammered.
 * Each settled request redraws.
 */
function ensure(ids) {
  for (const id of new Set(ids)) {
    if (bodies.has(id) || loadingIds.has(id)) continue;
    loadingIds.add(id);
    load(id)
      .catch(() => {})
      .finally(() => {
        loadingIds.delete(id);
        render();
      });
  }
}

/** Every series in `ids` has finished loading, successfully or not. */
const settled = (ids) => ids.every((id) => !loadingIds.has(id) && (bodies.has(id) || failed.has(id)));
/** The first of `ids` that failed (and isn't being retried), or null. */
const firstFailed = (ids) => ids.find((id) => failed.has(id) && !loadingIds.has(id)) ?? null;

/** Series each tab needs (F61: at most 6 function calls on first load, whichever tab opens first). */
function tabNeeds(tab) {
  if (tab === "phillips") return ["UNRATE", state.pm];
  if (tab === "stance") return ["FEDFUNDS", STANCE_INFLATION];
  return ["FEDFUNDS", "UNRATE", "NROU", state.measure];
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
  if (TABS.includes(h.tab)) out.tab = h.tab;
  if (PH_MEASURES.includes(h.pm)) out.pm = h.pm;
  if (h.pe !== undefined) {
    const want = new Set(h.pe.split(","));
    out.eras = ERA_IDS.filter((id) => want.has(id)); // "pe=" (empty) = every era hidden
  }
  if (ERA_IDS.includes(h.pc)) out.connect = h.pc;
  if (RANGES.some((r) => r.id === h.srg)) out.srg = h.srg;
  return out;
}

function hashFromState() {
  const o = { tab: state.tab };
  for (const s of SLIDERS) o[s.hash] = state[s.key];
  o.us = state.uStarMode === "cbo" ? "cbo" : state.uStarFixed;
  o.inf = state.measure;
  o.zlb = state.zlb ? 1 : 0;
  o.rg = state.range;
  o.pm = state.pm;
  o.pe = state.eras.length === ERA_IDS.length ? null : state.eras.join(","); // omitted when all are shown
  o.pc = state.connect || null;
  o.srg = state.srg;
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
  setText("lab-intro", POLICY_LAB.introAllTools ?? POLICY_LAB.intro);
  const tabs = POLICY_LAB.tabs ?? {};
  $("lab-tabs").setAttribute("aria-label", tabs.label ?? "Policy Lab tools");
  for (const t of TABS) setText(`tab-${t}`, tabs[t] ?? { taylor: T.heading, phillips: P.heading, stance: S.heading }[t]);
  $("range").setAttribute("aria-label", ui.rangeGroup);
  $("st-range").setAttribute("aria-label", ui.rangeGroup);
  for (const id of ["chart-loading", "ph-loading", "st-loading"]) setText(id, ui.loading);
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
  renderTryThis("try-this", "try-heading", T.tryThis);
  renderSources("sources", "sources-heading", T.sources);
  renderPhillipsCopy();
  renderStanceCopy();
}

/** "What the symbols mean" disclosure with a term list. */
function symbolsDetails(terms) {
  const dl = el("dl", { class: "terms" });
  for (const t of terms ?? []) dl.append(el("dt", {}, el("span", { class: "sym", text: t.symbol }), ` ${t.name}`), el("dd", { text: t.definition }));
  return el("details", { class: "glossary" }, el("summary", { text: ui.symbolsSummary }), dl);
}

function renderExplainer() {
  const E = T.explainer;
  const root = $("explainer");
  root.append(
    el("h3", { id: "explainer-heading", text: E.heading }),
    el("p", { text: E.whatItSays }),
    el("p", { class: "formula formula-main", text: E.formula }),
    el("p", { class: "muted", text: E.formulaWords }),
    el("p", { text: E.whyPiTwice }),
    el("p", { text: E.onTarget }),
    symbolsDetails(E.terms),
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

function renderTryThis(rootId, headingId, copy) {
  $(rootId).append(
    el("h3", { id: headingId, text: copy.heading }),
    el("ul", {}, ...copy.prompts.map((p) => el("li", { text: p })))
  );
}

function renderSources(rootId, headingId, S) {
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
  $(rootId).append(el("h3", { id: headingId, text: S.heading }), el("p", { class: "muted", text: S.note }), list, refs);
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
    showChartError(ui.chartLibFailed, { keepCard: true });
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
    [R.actualRate, hasActual ? pct(row.actual) : ui.unavailable, "big actual"],
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
        el("th", { scope: "col", text: `${T.rightNow.ruleRate}${ui.percentSuffix}` }),
        el("th", { scope: "col", text: `${T.rightNow.actualRate}${ui.percentSuffix}` })
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

// =============================================================================================
// M9: Phillips curve tab (F36, F37, F39)
// =============================================================================================

let phChart = null;
let phKey = ""; // measure/theme the scatter was built for
let phPointsKey = "";
let phPoints = []; // phillipsPoints() for the current measure
let phTableOpen = false;
let phTableAll = false;
let connectChoice = "pandemic"; // era picked in the "Era to connect" select (kept while the box is off)

const SVG_NS = "http://www.w3.org/2000/svg";
/** Small inline SVG marker matching the chart's point style, colored with the era's CSS variable. */
function markerSVG(eraId) {
  const { color, shape } = ERA_STYLE[eraId];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("marker");
  svg.style.color = `var(${color})`;
  const shapes = {
    circle: ["circle", { cx: 8, cy: 8, r: 5.5 }],
    triangle: ["polygon", { points: "8,1.5 14.5,13.5 1.5,13.5" }],
    rect: ["rect", { x: 2.5, y: 2.5, width: 11, height: 11 }],
    rectRot: ["polygon", { points: "8,1 15,8 8,15 1,8" }],
    crossRot: ["path", { d: "M3 3 L13 13 M13 3 L3 13", class: "stroke-only" }],
  };
  const [tag, attrs] = shapes[shape];
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  svg.append(n);
  return svg;
}

function renderPhillipsCopy() {
  setText("phillips-heading", P.heading);
  setText("phillips-lead", P.lead);
  setText("ph-chart-heading", P.chart.heading);
  $("ph-chart").setAttribute("aria-label", P.chart.ariaLabel);
  setText("ph-eras-legend", P.legend.label);
  setText("ph-eras-help", P.legend.help);
  setText("eras-show-all", P.legend.showAll);
  setText("eras-hide-all", P.legend.hideAll);
  setText("ph-connect-label", P.connect.label);
  setText("ph-connect-era-label", P.connect.eraLabel);
  setText("ph-connect-help", P.connect.help);
  setText("ph-measure-label", P.inflation.label);
  setText("ph-measure-why", P.inflation.defaultWhy);
  setText("ph-table-toggle", CHART_UI.showTable);

  // Era notes: marker + label + blurb for each era (the legend's longer form).
  const notes = $("ph-era-notes");
  notes.append(
    el("h3", { id: "ph-era-notes-heading", text: P.erasHeading ?? "The five eras" }),
    el(
      "dl",
      { class: "era-list" },
      ...ERA_IDS.flatMap((id) => [
        el("dt", {}, markerSVG(id), el("span", { text: eraLabel(id) })),
        el("dd", { text: ERA_COPY[id]?.blurb ?? "" }),
      ])
    )
  );

  const E = P.explainer;
  $("ph-explainer").append(
    el("h3", { id: "ph-explainer-heading", text: E.heading }),
    el("p", { text: E.whatItSays }),
    el("p", { class: "formula formula-main", text: E.formula }),
    el("p", { class: "muted", text: E.formulaWords }),
    symbolsDetails(E.terms),
    el("p", { text: E.expectations }),
    el("p", { text: E.supplyShocks }),
    el("p", { text: E.flattening }),
    el("p", { text: E.whatItLeavesOut }),
    el("h4", { text: E.caveatsHeading }),
    el("ul", { class: "caveats" }, ...E.caveats.map((c) => el("li", { text: c })))
  );
  renderTryThis("ph-try-this", "ph-try-heading", P.tryThis);
  renderSources("ph-sources", "ph-sources-heading", P.sources);
}

function renderEraButtons() {
  const host = $("era-buttons");
  host.replaceChildren(
    ...ERA_IDS.map((id) => {
      const b = el(
        "button",
        { type: "button", class: "era-btn", "data-era": id, "aria-pressed": "true" },
        markerSVG(id),
        el("span", { text: eraLabel(id) })
      );
      return b;
    })
  );
}

function setEras(ids) {
  state.eras = ERA_IDS.filter((id) => ids.includes(id));
  render();
}

function mountPhillipsControls() {
  renderEraButtons();
  // Native buttons: click, Enter and Space all toggle (aria-pressed).
  $("era-buttons").addEventListener("click", (e) => {
    const b = e.target.closest("[data-era]");
    if (!b) return;
    const id = b.dataset.era;
    setEras(state.eras.includes(id) ? state.eras.filter((x) => x !== id) : [...state.eras, id]);
  });
  $("eras-show-all").addEventListener("click", () => setEras(ERA_IDS));
  $("eras-hide-all").addEventListener("click", () => setEras([]));

  const cSel = $("ph-connect-era");
  for (const id of ERA_IDS) cSel.append(el("option", { value: id, text: eraLabel(id) }));
  const connectTo = (id) => {
    state.connect = id;
    // Connecting an era you can't see would draw nothing: show it.
    if (id && !state.eras.includes(id)) state.eras = ERA_IDS.filter((x) => x === id || state.eras.includes(x));
    render();
  };
  $("ph-connect").addEventListener("change", (e) => connectTo(e.target.checked ? cSel.value : ""));
  cSel.addEventListener("change", () => {
    connectChoice = cSel.value;
    if (state.connect) connectTo(cSel.value);
  });

  const mSel = $("ph-measure");
  for (const id of PH_MEASURES) mSel.append(el("option", { value: id, text: P.inflation.options[id]?.label ?? id }));
  mSel.addEventListener("change", () => {
    state.pm = mSel.value;
    onSettingsChanged({ data: true });
  });
  $("ph-controls").addEventListener("submit", (e) => e.preventDefault());

  $("ph-table-toggle").addEventListener("click", () => {
    phTableOpen = !phTableOpen;
    $("ph-table-toggle").setAttribute("aria-expanded", String(phTableOpen));
    setText("ph-table-toggle", phTableOpen ? CHART_UI.hideTable : CHART_UI.showTable);
    $("ph-table").hidden = !phTableOpen;
    if (phTableOpen) renderPhillipsTable();
  });
}

function syncPhillipsControls() {
  document.querySelectorAll("[data-era]").forEach((b) => b.setAttribute("aria-pressed", String(state.eras.includes(b.dataset.era))));
  if (state.connect) connectChoice = state.connect;
  $("ph-connect").checked = Boolean(state.connect);
  $("ph-connect-era").value = connectChoice;
  $("ph-measure").value = state.pm;
  setText("ph-measure-note", P.inflation.options[state.pm]?.note ?? "");
  $("eras-show-all").disabled = state.eras.length === ERA_IDS.length;
  $("eras-hide-all").disabled = state.eras.length === 0;
}

const phMeasureName = () => (P.inflation.options[state.pm]?.label ?? state.pm).replace(/\s*\(default\)\s*/i, "");

/** Tooltip copy split at " · " when the chart is narrow, so it never overflows a phone screen. */
function tooltipParts(text, chartObj) {
  return chartObj.width < 520 ? text.split(" · ") : [text];
}

/** Chart.js plugin: label the latest month next to its emphasized point. */
function latestLabelPlugin(getText, getColor) {
  return {
    id: "latestLabel",
    afterDatasetsDraw(c) {
      const idx = c.data.datasets.findIndex((d) => d.isLatest);
      if (idx < 0) return;
      const pt = c.getDatasetMeta(idx).data[0];
      if (!pt) return;
      const { ctx, chartArea: a } = c;
      const text = getText();
      ctx.save();
      ctx.font = "600 12px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      const w = ctx.measureText(text).width;
      let x = pt.x + 13;
      if (x + w > a.right) x = pt.x - 13 - w; // flip to the left near the right edge
      const y = Math.min(a.bottom - 8, Math.max(a.top + 8, pt.y - 12));
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = resolveColor("--surface");
      ctx.strokeText(text, x, y); // halo so the label reads over dots
      ctx.fillStyle = getColor();
      ctx.fillText(text, x, y);
      ctx.restore();
    },
  };
}

function eraDataset(id, pts, small) {
  const color = resolveColor(ERA_STYLE[id].color);
  const cross = ERA_STYLE[id].shape === "crossRot";
  return {
    label: eraLabel(id),
    eraId: id,
    data: pts.filter((p) => p.era === id).map((p) => ({ x: p.u, y: p.pi, date: p.date, era: id })),
    pointStyle: ERA_STYLE[id].shape,
    pointRadius: cross ? (small ? 3 : 3.5) : small ? 2.5 : 3,
    pointHoverRadius: 6,
    pointBorderWidth: cross ? 1.6 : 1,
    borderColor: color,
    backgroundColor: `color-mix(in srgb, ${color} 55%, transparent)`,
    hidden: !state.eras.includes(id),
    order: 2,
  };
}

function buildPhillipsChart() {
  const canvas = $("ph-chart");
  const theme = chartTheme();
  const small = canvas.parentElement.clientWidth < 480;
  const xs = phPoints.map((p) => p.u);
  const ys = phPoints.map((p) => p.pi);
  const bounds = {
    // Suggested bounds from every era's data, so hiding eras never rescales the axes (Chart.js rounds
    // them out to nice tick values).
    x: { suggestedMin: Math.floor(Math.min(...xs)) - 0.5, suggestedMax: Math.ceil(Math.max(...xs)) + 0.5 },
    y: { suggestedMin: Math.floor(Math.min(...ys)) - 0.5, suggestedMax: Math.ceil(Math.max(...ys)) + 0.5 },
  };
  const text = resolveColor("--text");
  const latest = phPoints.at(-1);
  // The Fed's 2% target is for PCE inflation: draw it only on the core PCE view, never on CPI.
  const refLines = state.pm === "PCEPILFE" ? [{ y: 2, label: CHART_UI.targetLegend, color: theme.ref, width: 1.5 }] : [];
  phChart?.destroy();
  phChart = new globalThis.Chart(canvas, {
    type: "scatter",
    data: {
      datasets: [
        ...ERA_IDS.map((id) => eraDataset(id, phPoints, small)),
        {
          label: "path",
          isPath: true,
          type: "line",
          data: [],
          showLine: true,
          borderWidth: 1.75,
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHitRadius: 0,
          tension: 0,
          hidden: true,
          order: 1,
        },
        {
          label: "latest",
          isLatest: true,
          data: [{ x: latest.u, y: latest.pi, date: latest.date, era: latest.era }],
          pointStyle: "circle",
          pointRadius: small ? 7 : 8,
          pointHoverRadius: 9,
          pointBorderWidth: 3,
          borderColor: text,
          backgroundColor: "transparent",
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "nearest", axis: "xy", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          // One point per hover: skip the path and the duplicate "latest" marker when an era dot is there.
          filter: (item, i, items) => i === items.findIndex((x) => !x.dataset.isPath),
          callbacks: {
            title: (items) => {
              const r = items[0]?.raw;
              if (!r) return "";
              const t = fillTemplate(P.chart.tooltip, { month: formatMonth(r.date), u: formatNumber(r.x, 1), pi: formatNumber(r.y, 1) });
              return tooltipParts(t, items[0].chart);
            },
            label: (item) => fillTemplate(P.chart.tooltipEra, { era: eraLabel(item.raw.era) }),
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          ...bounds.x,
          grid: { color: theme.grid },
          title: { display: true, text: P.chart.xAxis, color: theme.text },
          ticks: { color: theme.text, maxRotation: 0, callback: (v) => `${v}%` },
        },
        y: {
          type: "linear",
          ...bounds.y,
          grid: { color: theme.grid },
          border: { display: false },
          title: { display: true, text: small ? P.chart.yAxis.replace(/,.*$/, " (%)") : P.chart.yAxis, color: theme.text },
          ticks: { color: theme.text, callback: (v) => `${v}%` },
        },
      },
    },
    plugins: [
      referenceLinesPlugin(refLines),
      latestLabelPlugin(
        () => fillTemplate(P.legend.latest, { month: formatMonth(latest.date) }),
        () => resolveColor("--text")
      ),
    ],
  });
}

/** Apply era visibility and the connect-the-dots path without rebuilding the chart. */
function updatePhillipsChart() {
  for (const ds of phChart.data.datasets) {
    if (ds.eraId) ds.hidden = !state.eras.includes(ds.eraId);
    if (ds.isPath) {
      const on = Boolean(state.connect) && state.eras.includes(state.connect);
      ds.hidden = !on;
      ds.data = on ? phPoints.filter((p) => p.era === state.connect).map((p) => ({ x: p.u, y: p.pi, date: p.date, era: p.era })) : [];
      ds.label = on ? eraLabel(state.connect) : "path";
      if (on) ds.borderColor = resolveColor(ERA_STYLE[state.connect].color);
    }
  }
  phChart.update("none");
}

function renderPhillipsLegend() {
  const items = [{ cls: "key-latest", text: fillTemplate(P.legend.latest, { month: formatMonth(phPoints.at(-1).date) }) }];
  if (state.pm === "PCEPILFE") items.push({ cls: "key-target", text: CHART_UI.targetLegend });
  if (state.connect && state.eras.includes(state.connect)) {
    items.push({ cls: `key-line key-path era-${state.connect}`, text: `${P.connect.label}: ${eraLabel(state.connect)}` });
  }
  $("ph-legend").replaceChildren(...items.map((i) => el("span", { class: `key ${i.cls}`, text: i.text })));
}

function renderPhillips() {
  const card = $("ph-card");
  const err = $("ph-error");
  const need = tabNeeds("phillips");
  const missing = firstFailed(need);
  $("ph-loading").hidden = Boolean(missing) || settled(need);
  if (missing) {
    err.textContent = fillTemplate(P.errors.missingSeries, { name: inSentence(SERIES_NAMES[missing] ?? missing) });
    err.hidden = false;
    card.classList.add("no-data");
    phChart?.destroy();
    phChart = null;
    phKey = "";
    return;
  }
  err.hidden = true;
  if (!need.every((id) => bodies.has(id))) return; // still loading

  const pk = `${state.pm}`;
  if (pk !== phPointsKey) {
    phPoints = phillipsPoints({ unrate: obsOf("UNRATE"), inflation: obsOf(state.pm) });
    phPointsKey = pk;
  }
  if (!phPoints.length) return;
  card.classList.remove("no-data");
  renderPhillipsLegend();
  if (phTableOpen) renderPhillipsTable();
  if (typeof globalThis.Chart === "undefined") {
    err.textContent = ui.chartLibFailed;
    err.hidden = false;
    return;
  }
  const key = `${state.pm}|${phPoints.length}`;
  if (!phChart || key !== phKey) {
    buildPhillipsChart();
    phKey = key;
  }
  updatePhillipsChart();
}

function renderPhillipsTable() {
  const wrap = $("ph-table");
  const rows = phPoints.filter((p) => state.eras.includes(p.era));
  const shown = tableRows(rows, { all: phTableAll });
  const measure = phMeasureName();
  wrap.setAttribute("aria-label", `${P.chart.heading}: data table`);
  const table = el(
    "table",
    {},
    el("caption", { text: fillTemplate(CHART_UI.tableCaption, { name: P.chart.heading, range: measure }) }),
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", { scope: "col", text: CHART_UI.dateHeader }),
        el("th", { scope: "col", text: `${P.chart.tableUnemployment}${ui.percentSuffix}` }),
        el("th", { scope: "col", text: `${fillTemplate(P.chart.tableInflation, { measure })}${ui.percentSuffix}` }),
        el("th", { scope: "col", text: P.chart.tableEra })
      )
    ),
    el(
      "tbody",
      {},
      ...shown.map((r) =>
        el(
          "tr",
          {},
          el("th", { scope: "row", text: formatMonth(r.date) }),
          el("td", { text: formatNumber(r.u, 1) }),
          el("td", { text: formatNumber(r.pi, 1) }),
          el("td", { class: "era-cell", text: eraLabel(r.era) })
        )
      )
    )
  );
  const parts = [table];
  if (rows.length > 24) {
    const more = el("button", {
      type: "button",
      class: "tool",
      text: fillTemplate(phTableAll ? CHART_UI.showFewer : CHART_UI.showAll, { n: phTableAll ? 24 : rows.length }),
    });
    more.addEventListener("click", () => {
      phTableAll = !phTableAll;
      renderPhillipsTable();
      wrap.querySelector("button")?.focus();
    });
    parts.push(more);
  }
  wrap.replaceChildren(...parts);
}

// =============================================================================================
// M9: Policy stance tab (F38, F39): real fed funds rate vs. the r* from the Taylor tab
// =============================================================================================

let stChart = null;
let stKey = "";
let stRows = []; // realRate() rows, core PCE
let stTableOpen = false;
let stTableAll = false;
const stRefLines = []; // mutated in place: [r* line, zero line]

function renderStanceCopy() {
  setText("stance-heading", S.heading);
  setText("stance-lead", S.lead);
  setText("st-chart-heading", S.chart.heading);
  $("st-chart").setAttribute("aria-label", S.chart.ariaLabel);
  setText("st-rn-heading", S.rightNow.heading);
  setText("st-formula-symbols", S.explainer.formula);
  setText("st-rstar-help", S.rStarLine.help);
  setText("st-rstar-link", S.rStarLine.link);
  setText("st-table-toggle", CHART_UI.showTable);
  const E = S.explainer;
  $("st-explainer").append(
    el("h3", { id: "st-explainer-heading", text: E.heading }),
    el("p", { text: E.whatItSays }),
    el("p", { class: "formula formula-main", text: E.formula }),
    el("p", { class: "muted", text: E.formulaWords }),
    el("p", { text: E.fisher }),
    el("p", { text: E.rStar }),
    el("p", { text: E.whatItLeavesOut }),
    el("h4", { text: E.caveatsHeading }),
    el("ul", { class: "caveats" }, ...E.caveats.map((c) => el("li", { text: c })))
  );
  renderTryThis("st-try-this", "st-try-heading", S.tryThis);
  renderSources("st-sources", "st-sources-heading", S.sources);
}

function mountStanceControls() {
  const rg = $("st-range");
  for (const r of RANGES) {
    const b = el("button", { type: "button", "data-srange": r.id, text: r.label, "aria-pressed": "false" });
    b.addEventListener("click", () => {
      state.srg = r.id;
      render();
    });
    rg.append(b);
  }
  // r* lives on the Taylor tab (one r* for the whole lab): jump there and focus its slider.
  $("st-rstar-link").addEventListener("click", () => {
    selectTab("taylor");
    const input = $("s-rStar");
    input.focus();
    input.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  $("st-table-toggle").addEventListener("click", () => {
    stTableOpen = !stTableOpen;
    $("st-table-toggle").setAttribute("aria-expanded", String(stTableOpen));
    setText("st-table-toggle", stTableOpen ? CHART_UI.hideTable : CHART_UI.showTable);
    $("st-table").hidden = !stTableOpen;
    if (stTableOpen) renderStanceTable();
  });
}

function stanceVisibleRows() {
  const r = RANGES.find((x) => x.id === state.srg);
  if (!stRows.length) return [];
  if (r.since) return stRows.filter((x) => x.date >= r.since);
  if (r.years) {
    const start = shiftYears(stRows.at(-1).date, -r.years);
    return stRows.filter((x) => x.date >= start);
  }
  return stRows;
}

const rStarLabel = () => fillTemplate(S.rStarLine.label, { rStar: fmtParam(state.rStar) });

function setStanceRefLines() {
  const theme = chartTheme();
  stRefLines.length = 0;
  stRefLines.push({ y: 0, color: theme.ref, dash: [], width: 1 }); // zero line, unlabeled (axis shows 0%)
  stRefLines.push({ y: state.rStar, label: rStarLabel(), color: resolveColor("--text"), dash: [6, 4], width: 2 });
}

/** Shade between the real rate and r*: above r* = tighter than neutral, below = looser. */
const stanceFill = () => ({ target: { value: state.rStar }, above: resolveColor("--tight-fill"), below: resolveColor("--loose-fill") });

function buildStanceChart(rows) {
  const canvas = $("st-chart");
  const theme = chartTheme();
  const labels = rows.map((r) => r.date);
  const lineColor = resolveColor("--real-line");
  const bands = periods ? bandIndices(labels, periods) : [];
  setStanceRefLines();
  stChart?.destroy();
  stChart = new globalThis.Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: S.chart.realLine,
          data: rows.map((r) => r.real),
          borderColor: lineColor,
          backgroundColor: lineColor,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.1,
          fill: stanceFill(),
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
        filler: { propagate: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const r = rows[items[0].dataIndex];
              const t = fillTemplate(S.chart.tooltip, {
                month: formatMonth(r.date),
                real: formatNumber(r.real, 1),
                ff: formatNumber(r.ff, 1),
                pi: formatNumber(r.pi, 1),
              });
              return tooltipParts(t, items[0].chart);
            },
            label: () => "",
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
          title: { display: true, text: S.chart.yAxis, color: theme.text },
          ticks: { color: theme.text, callback: (v) => `${v}%` },
        },
      },
    },
    plugins: [recessionShadingPlugin(bands, theme.recession), referenceLinesPlugin(stRefLines)],
  });
}

function renderStanceLegend() {
  const items = [
    { cls: "key-line key-real", text: S.chart.realLine },
    { cls: "key-rstar", text: rStarLabel() },
    { cls: "key-tight", text: S.chart.tighterShade },
    { cls: "key-loose", text: S.chart.looserShade },
  ];
  if (periods) items.push({ cls: "key-rec", text: RECESSION_SHADING.note });
  $("st-legend").replaceChildren(...items.map((i) => el("span", { class: `key ${i.cls}`, text: i.text })));
}

function renderStanceNow() {
  const box = $("st-now");
  const row = stRows.at(-1);
  if (!row) {
    box.classList.add("no-data");
    return;
  }
  box.classList.remove("no-data");
  const R = S.rightNow;
  setText("st-rn-asof", fillTemplate(R.asOf, { date: periodLabel(row.date) }));
  const st = policyStance(row.real, state.rStar, 1);
  const items = [
    [R.realRate, pct(row.real), "big real"],
    [R.difference, `${formatChange(st.diff)} pts`, "big diff"],
    [R.fedFunds, pct(row.ff)],
    [R.inflation, pct(row.pi)],
    [R.rStar, `${fmtParam(state.rStar)}%`],
  ];
  $("st-rn-grid").replaceChildren(
    ...items.map(([dt, dd, cls]) => el("div", { class: `rn-item ${cls ?? ""}`.trim() }, el("dt", { text: dt }), el("dd", { text: dd })))
  );
  const sentences = stanceRightNow({ real: row.real, rStar: state.rStar }, R);
  const host = $("st-rn-sentences");
  const joined = sentences.join("|");
  if (host.dataset.text !== joined) {
    host.dataset.text = joined;
    host.replaceChildren(...sentences.map((s, i) => el("p", { class: i === sentences.length - 1 ? "rn-note" : "rn-sentence", text: s })));
  }
  const f2 = (v) => formatNumber(v, 2);
  setText(
    "st-formula",
    fillTemplate(R.formulaTemplate ?? "real rate ≈ {ff} − {pi} = {real}", { ff: f2(row.ff), pi: f2(row.pi), real: f2(row.real) })
  );
}

function renderStanceTable() {
  const wrap = $("st-table");
  const rows = stanceVisibleRows();
  const shown = tableRows(rows, { all: stTableAll });
  const rangeLabel = RANGES.find((r) => r.id === state.srg).label;
  wrap.setAttribute("aria-label", `${S.chart.heading}: data table`);
  const f = (v) => formatNumber(v, 2);
  const table = el(
    "table",
    {},
    el("caption", { text: fillTemplate(CHART_UI.tableCaption, { name: S.chart.heading, range: rangeLabel }) }),
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", { scope: "col", text: CHART_UI.dateHeader }),
        el("th", { scope: "col", text: `${S.chart.tableFedFunds}${ui.percentSuffix}` }),
        el("th", { scope: "col", text: `${S.chart.tableInflation}${ui.percentSuffix}` }),
        el("th", { scope: "col", text: `${S.chart.tableReal}${ui.percentSuffix}` })
      )
    ),
    el(
      "tbody",
      {},
      ...shown.map((r) =>
        el("tr", {}, el("th", { scope: "row", text: formatMonth(r.date) }), el("td", { text: f(r.ff) }), el("td", { text: f(r.pi) }), el("td", { text: f(r.real) }))
      )
    )
  );
  const parts = [table];
  if (rows.length > 24) {
    const more = el("button", {
      type: "button",
      class: "tool",
      text: fillTemplate(stTableAll ? CHART_UI.showFewer : CHART_UI.showAll, { n: stTableAll ? 24 : rows.length }),
    });
    more.addEventListener("click", () => {
      stTableAll = !stTableAll;
      renderStanceTable();
      wrap.querySelector("button")?.focus();
    });
    parts.push(more);
  }
  wrap.replaceChildren(...parts);
}

function renderStance() {
  document.querySelectorAll("[data-srange]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.srange === state.srg)));
  const card = $("st-card");
  const err = $("st-error");
  const need = tabNeeds("stance");
  const missing = firstFailed(need);
  $("st-loading").hidden = Boolean(missing) || settled(need);
  if (missing) {
    err.textContent = fillTemplate(S.errors.missingSeries, { name: inSentence(SERIES_NAMES[missing] ?? missing) });
    err.hidden = false;
    card.classList.add("no-data");
    $("st-now").classList.add("no-data");
    stChart?.destroy();
    stChart = null;
    stKey = "";
    return;
  }
  err.hidden = true;
  if (!need.every((id) => bodies.has(id))) return;

  if (!stRows.length) stRows = realRate({ fedfunds: obsOf("FEDFUNDS"), inflation: obsOf(STANCE_INFLATION) });
  const rows = stanceVisibleRows();
  if (!rows.length) return;
  card.classList.remove("no-data");
  renderStanceLegend();
  renderStanceNow();
  if (stTableOpen) renderStanceTable();
  if (typeof globalThis.Chart === "undefined") {
    err.textContent = ui.chartLibFailed;
    err.hidden = false;
    return;
  }
  const key = `${state.srg}|${rows[0].date}|${rows.at(-1).date}|${rows.length}|${Boolean(periods)}`;
  if (!stChart || key !== stKey) {
    buildStanceChart(rows);
    stKey = key;
  } else {
    // r* changed on the Taylor tab: move the line and the tighter/looser shading in place.
    setStanceRefLines();
    stChart.data.datasets[0].fill = stanceFill();
    stChart.update("none");
  }
}

/** Which required rule input failed, if any (UNRATE or the chosen inflation measure). */
function missingRuleInput() {
  return firstFailed(["UNRATE", state.measure]);
}

/** Taylor tab: recompute the rule from data in memory and redraw. */
function renderTaylor() {
  // Wait for all four series (as in M8), so u* (CBO or fixed fallback) and the actual line are settled.
  if (!settled(tabNeeds("taylor"))) {
    $("chart-loading").hidden = false;
    return;
  }
  $("chart-loading").hidden = true;
  const missing = missingRuleInput();
  if (missing) {
    showChartError(fillTemplate(T.errors.missingSeries, { name: inSentence(SERIES_NAMES[missing] ?? missing) }));
    return;
  }
  const err = $("chart-error");
  if (failed.has("FEDFUNDS")) {
    err.textContent =
      T.errors.fedfundsFailed ??
      `Couldn't load the ${inSentence(SERIES_NAMES.FEDFUNDS)} right now, so only the rule line is shown. Try again in a minute.`;
    err.hidden = false;
  } else err.hidden = true;

  series = taylorSeries(currentInputs(), ruleParams());
  renderChart();
  renderRightNow();
  if (tableOpen) renderTable();
}

/** Recompute and redraw the active tab from data in memory. Never fetches. */
function render() {
  syncControls();
  syncTabs();
  syncPhillipsControls();
  writeHash();
  if (state.tab === "taylor") renderTaylor();
  else if (state.tab === "phillips") renderPhillips();
  else renderStance();
}

function onSettingsChanged({ data = false } = {}) {
  if (matchPreset(state) === "custom") lastCustom = { rStar: state.rStar, piStar: state.piStar, aPi: state.aPi, aY: state.aY };
  if (data) ensure(tabNeeds(state.tab)); // loads a new measure, or retries one that failed earlier
  render();
}

// ---------- tabs (Taylor · Phillips · Stance) ----------

function syncTabs() {
  for (const t of TABS) {
    const tab = $(`tab-${t}`);
    const on = t === state.tab;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    $(t).hidden = !on;
  }
}

function selectTab(id, { focus = false } = {}) {
  if (!TABS.includes(id)) return;
  state.tab = id;
  onSettingsChanged({ data: true });
  if (focus) $(`tab-${id}`).focus();
}

/** WAI-ARIA tabs pattern: click, or Left/Right/Home/End with automatic activation. */
function mountTabs() {
  const list = $("lab-tabs");
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[role=tab]");
    if (b) selectTab(b.dataset.tab);
  });
  list.addEventListener("keydown", (e) => {
    const i = TABS.indexOf(state.tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(TABS[(next + TABS.length) % TABS.length], { focus: true });
  });
}

// ---------- page ----------

function loadRecessions() {
  load("USREC", { start: USREC_START }).then(
    (body) => {
      periods = recessionPeriods(body.observations);
      render();
    },
    () => {
      for (const id of ["shading-status", "st-shading-status"]) {
        const s = $(id);
        s.textContent = RECESSION_SHADING.unavailable;
        s.hidden = false;
      }
    }
  );
}

function init() {
  mountNav("policy");
  renderCopy();
  mountControls();
  mountTabs();
  mountPhillipsControls();
  mountStanceControls();
  Object.assign(state, stateFromHash(location.hash));
  if (matchPreset(state) === "custom") lastCustom = { rStar: state.rStar, piStar: state.piStar, aPi: state.aPi, aY: state.aY };

  // F61, ≤ 6 function calls on first load: the open tab's series plus USREC (shading on Taylor and Stance).
  // Taylor: FEDFUNDS, UNRATE, NROU, its inflation measure. Phillips: UNRATE + CPI (or core PCE).
  // Stance: FEDFUNDS + core PCE. Other tabs load their series the first time they're opened. No `start`
  // (full history), so the dashboard's sessionStorage cache for the same series is reused.
  loadRecessions();
  ensure(tabNeeds(state.tab));
  render();

  addEventListener("hashchange", () => {
    if (location.hash === hashFromState()) return;
    Object.assign(state, stateFromHash(location.hash));
    onSettingsChanged({ data: true });
  });
  // Redraw with the new palette when the system theme flips.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    chartRangeKey = "";
    phKey = "";
    stKey = "";
    renderEraButtons();
    render();
  });
}

init();
