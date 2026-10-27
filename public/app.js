import { INDICATORS, RANGES, DEFAULT_RANGE } from "./indicators.js";
import { SITE, ABOUT, SUMMARY, RECESSION_SHADING, RECESSION_WATCH, CHART_UI, SOURCES } from "./content.js";
import { getSeries } from "./lib/fred-client.js";
import { formatDate, formatValue, formatChange, formatNumber } from "./lib/format.js";
import { yearAgo, recessionPeriods, sahmSeries, sahmRule, yieldCurve, SAHM_THRESHOLD } from "./lib/econ.js";
import { dashboardSummary, sahmSentence, yieldCurveSentence } from "./lib/narrate.js";
import { mountNav } from "./lib/nav.js";
import {
  USREC_START,
  sliceRange,
  createLineChart,
  toCSV,
  csvFilename,
  todayISO,
  downloadText,
  tableRows,
} from "./lib/charts.js";

const RW = RECESSION_WATCH;
const bodies = new Map(); // series id -> API body { series, title, units, frequency, observations }
let periods = null; // NBER recession periods from USREC; null while loading or if USREC failed
let range = DEFAULT_RANGE;
const views = []; // every chart on the page: 4 indicator cards + 2 Recession Watch panels

const rangeYears = () => RANGES.find((r) => r.label === range).years;
const chartLibReady = () => typeof Chart !== "undefined";
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function loadBody(id, opts) {
  return getSeries(id, opts).then((body) => {
    bodies.set(id, body);
    return body;
  });
}

// ---------- shared chart block: canvas, legend, error, CSV + table tools ----------

function chartBlockHTML(key, ariaLabel) {
  return `
    <div class="chart-wrap"><canvas role="img" aria-label="${escapeHTML(ariaLabel)}"></canvas></div>
    <p class="chart-legend"></p>
    <p class="error" role="status" hidden></p>
    <div class="chart-tools">
      <button type="button" class="tool" data-act="csv">${escapeHTML(CHART_UI.downloadCSV)}</button>
      <button type="button" class="tool" data-act="table" aria-expanded="false" aria-controls="table-${key}">${escapeHTML(
        CHART_UI.showTable
      )}</button>
    </div>
    <div class="table-wrap" id="table-${key}" role="region" tabindex="0" aria-label="" hidden></div>`;
}

/**
 * A view ties a DOM block to a `spec()` describing what it currently shows:
 * { id, csvId?, name, obs, title, units, frequency, source, url?, color, unit, tickUnit?, digits,
 *   refLines, fillBelowZero?, legend: [{cls, text}] } — or null while its data is missing.
 */
function makeView(key, root, spec) {
  const view = {
    key,
    root,
    spec,
    chart: null,
    tableOpen: false,
    tableAll: false,
    canvas: root.querySelector("canvas"),
    tableEl: root.querySelector(".table-wrap"),
  };
  root.querySelector('[data-act="csv"]').addEventListener("click", () => downloadCSV(view));
  const tableBtn = root.querySelector('[data-act="table"]');
  tableBtn.addEventListener("click", () => {
    view.tableOpen = !view.tableOpen;
    tableBtn.setAttribute("aria-expanded", String(view.tableOpen));
    tableBtn.textContent = view.tableOpen ? CHART_UI.hideTable : CHART_UI.showTable;
    view.tableEl.hidden = !view.tableOpen;
    if (view.tableOpen) renderTable(view);
  });
  views.push(view);
  return view;
}

function renderLegend(view, s) {
  const items = [];
  if (periods) items.push({ cls: "key-rec", text: RECESSION_SHADING.note });
  items.push(...(s.legend ?? []));
  view.root.querySelector(".chart-legend").innerHTML = items
    .map((i) => `<span class="key ${i.cls}">${escapeHTML(i.text)}</span>`)
    .join("");
}

function renderView(view) {
  const s = view.spec();
  if (!s) return;
  view.root.classList.remove("no-data");
  renderLegend(view, s);
  const visible = sliceRange(s.obs, rangeYears());
  if (chartLibReady()) {
    view.chart?.destroy();
    view.chart = createLineChart(view.canvas, {
      obs: visible,
      color: s.color,
      unit: s.unit,
      tickUnit: s.tickUnit,
      digits: s.digits,
      frequency: s.frequency,
      shortRange: (rangeYears() ?? Infinity) <= 1,
      periods,
      refLines: s.refLines,
      fillBelowZero: s.fillBelowZero,
    });
  }
  if (view.tableOpen) renderTable(view);
}

function renderAll() {
  views.forEach(renderView);
}

function renderTable(view) {
  const s = view.spec();
  const wrap = view.tableEl;
  if (!s) {
    wrap.innerHTML = "";
    return;
  }
  const visible = sliceRange(s.obs, rangeYears());
  const rows = tableRows(visible, { all: view.tableAll });
  const unitLabel = s.unit.trim() === "%" ? " (%)" : s.unit.trim() ? ` (${s.unit.trim()})` : "";
  wrap.setAttribute("aria-label", `${s.name}: data table`);
  const body = rows
    .map((r) => `<tr><th scope="row">${formatDate(r.date, s.frequency)}</th><td>${formatNumber(r.value, s.digits)}</td></tr>`)
    .join("");
  const more =
    visible.length > 24
      ? `<button type="button" class="tool" data-act="all">${escapeHTML(
          fill(view.tableAll ? CHART_UI.showFewer : CHART_UI.showAll, { n: view.tableAll ? 24 : visible.length })
        )}</button>`
      : "";
  wrap.innerHTML = `
    <table>
      <caption>${escapeHTML(fill(CHART_UI.tableCaption, { name: s.name, range }))}</caption>
      <thead><tr><th scope="col">${escapeHTML(CHART_UI.dateHeader)}</th><th scope="col">${escapeHTML(
        CHART_UI.valueHeader + unitLabel
      )}</th></tr></thead>
      <tbody>${body}</tbody>
    </table>${more}`;
  wrap.querySelector('[data-act="all"]')?.addEventListener("click", () => {
    view.tableAll = !view.tableAll;
    renderTable(view);
    wrap.querySelector('[data-act="all"]')?.focus();
  });
}

function downloadCSV(view) {
  const s = view.spec();
  if (!s) return;
  const today = todayISO();
  const csv = toCSV(sliceRange(s.obs, rangeYears()), {
    id: s.id,
    title: s.title,
    units: s.units,
    frequency: s.frequency,
    source: s.source,
    url: s.url,
    range,
    retrieved: today,
  });
  downloadText(csvFilename(s.csvId ?? s.id, range, today), csv);
}

function showError(view, message, { dataMissing = true } = {}) {
  view.root.classList.add("has-error");
  if (dataMissing) {
    view.root.classList.add("no-data");
    const asOf = view.root.querySelector(".as-of");
    if (asOf) asOf.textContent = "Unavailable";
    view.chart?.destroy();
    view.chart = null;
  }
  const errEl = view.root.querySelector(".error");
  errEl.textContent = message;
  errEl.hidden = false;
}

function clearError(view) {
  view.root.classList.remove("has-error", "no-data");
  view.root.querySelector(".error").hidden = true;
}

const sourceLine = (id) => `${SOURCES[id] ?? "FRED"} via FRED, Federal Reserve Bank of St. Louis`;

// ---------- indicator cards ----------

const currentVariant = (view) => view.ind.variants?.[view.variant] ?? view.ind;

function indicatorSpec(view) {
  const ind = view.ind;
  const v = currentVariant(view);
  const body = bodies.get(v.id);
  if (!body) return null;
  const target = v.target ?? null;
  return {
    id: v.id,
    name: v.name ?? ind.name,
    obs: body.observations,
    title: body.title,
    units: body.units,
    frequency: body.frequency,
    source: sourceLine(v.id),
    color: ind.color,
    unit: ind.unit,
    digits: 2,
    refLines: target !== null ? [{ y: target, label: `${target}% target` }] : [],
    legend: target !== null ? [{ cls: "key-target", text: CHART_UI.targetLegend }] : [],
  };
}

function renderCardShell(ind) {
  const card = document.createElement("article");
  card.className = "card no-data";
  card.id = `card-${ind.id}`;
  card.style.setProperty("--accent", `var(${ind.color})`);
  const toggle = ind.variants
    ? `<div class="measure">
        <div class="seg" role="group" aria-label="${escapeHTML(CHART_UI.measureLabel)}">${ind.variants
          .map(
            (v, i) =>
              `<button type="button" data-variant="${i}" aria-pressed="${i === 0}">${escapeHTML(v.label)}</button>`
          )
          .join("")}</div>
        <p class="variant-note"></p>
      </div>`
    : "";
  card.innerHTML = `
    <header class="card-head">
      <div>
        <h2>${escapeHTML(ind.name)}</h2>
        <p class="unit-note"><span class="unit-text">${escapeHTML(ind.unitNote)}</span> · <a href="https://fred.stlouisfed.org/series/${ind.id}" target="_blank" rel="noopener">${ind.id}</a></p>
      </div>
      <div class="latest" aria-live="polite">
        <span class="value">—</span>
        <span class="as-of">Loading…</span>
        <span class="change"></span>
      </div>
    </header>
    ${toggle}
    ${chartBlockHTML(ind.id, `${ind.name} line chart`)}
    <dl class="explain">
      <dt>What it is</dt><dd>${ind.what}</dd>
      <dt>Why the Fed cares</dt><dd>${ind.whyFed}</dd>
      <dt>Good to know</dt><dd>${ind.goodToKnow}</dd>
    </dl>`;
  return card;
}

function renderVariantText(view) {
  const ind = view.ind;
  const v = currentVariant(view);
  const card = view.root;
  card.querySelector("h2").textContent = v.name ?? ind.name;
  card.querySelector(".unit-text").textContent = v.unitNote ?? ind.unitNote;
  const link = card.querySelector(".unit-note a");
  link.href = `https://fred.stlouisfed.org/series/${v.id}`;
  link.textContent = v.id;
  view.canvas.setAttribute("aria-label", `${v.name ?? ind.name} line chart`);
  const note = card.querySelector(".variant-note");
  if (note) note.textContent = v.note ?? "";
  card.querySelectorAll("[data-variant]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.variant) === view.variant)));
}

function renderLatest(view) {
  const ind = view.ind;
  const s = view.spec();
  const card = view.root;
  if (!s) return;
  const last = s.obs.at(-1);
  card.querySelector(".value").textContent = formatValue(last.value, ind.unit);
  card.querySelector(".as-of").textContent = `as of ${formatDate(last.date, s.frequency)}`;
  const prev = yearAgo(s.obs);
  card.querySelector(".change").textContent = prev
    ? `${formatChange(last.value - prev.value)} pts vs. ${formatDate(prev.date, s.frequency)}`
    : "";
}

async function showIndicator(view) {
  const v = currentVariant(view);
  const wanted = view.variant;
  clearError(view);
  if (!bodies.has(v.id)) {
    view.root.classList.add("no-data");
    view.root.querySelector(".value").textContent = "—";
    view.root.querySelector(".as-of").textContent = "Loading…";
    view.root.querySelector(".change").textContent = "";
    try {
      await loadBody(v.id);
    } catch (err) {
      if (view.variant === wanted) showError(view, `Couldn't load this chart: ${err.message}`);
      return;
    }
    if (view.variant !== wanted) return; // the user picked another measure meanwhile
  }
  renderLatest(view);
  renderView(view);
  if (!chartLibReady()) {
    showError(view, "Couldn't load the charting library. Check your connection and reload the page.", {
      dataMissing: false,
    });
  }
}

function mountIndicator(ind, grid) {
  const card = renderCardShell(ind);
  grid.appendChild(card);
  const view = makeView(ind.id, card, () => indicatorSpec(view));
  view.ind = ind;
  view.variant = 0;
  card.querySelectorAll("[data-variant]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.variant);
      if (i === view.variant) return;
      view.variant = i;
      renderVariantText(view);
      showIndicator(view);
    })
  );
  if (ind.variants) renderVariantText(view);
  return view;
}

// ---------- Recession Watch ----------

function panelHTML(key, c, ariaLabel) {
  return `
    <header class="card-head">
      <div>
        <h3>${escapeHTML(c.title)}</h3>
        <p class="unit-note">${escapeHTML(c.formula ?? "")}</p>
      </div>
      <div class="latest" aria-live="polite">
        <span class="value">—</span>
        <span class="sub"></span>
        <span class="as-of">Loading…</span>
      </div>
    </header>
    <p class="status" hidden></p>
    <p class="reading"></p>
    ${chartBlockHTML(key, ariaLabel)}
    <p class="panel-what">${escapeHTML(c.what)}</p>
    <p class="caveat"><strong>Caveat:</strong> ${escapeHTML(c.caveat)}</p>`;
}

function sahmSpec() {
  const body = bodies.get("UNRATE");
  if (!body) return null;
  return {
    id: "UNRATE",
    csvId: "SAHM-from-UNRATE",
    name: RW.sahm.title,
    // Rounded to the 2 decimals the panel shows; the trigger check uses the same rounding.
    obs: sahmSeries(body.observations).map((x) => ({ date: x.date, value: Math.round(x.value * 100) / 100 })),
    title: "Sahm rule reading, computed by this site from UNRATE (3-month average unemployment rate minus its lowest 3-month average in the previous 12 months)",
    units: "percentage points",
    frequency: "Monthly",
    source: `Computed from UNRATE (${SOURCES.UNRATE}) via FRED, Federal Reserve Bank of St. Louis`,
    url: "https://fred.stlouisfed.org/series/UNRATE",
    color: "--c2",
    unit: " pts",
    tickUnit: "",
    digits: 2,
    refLines: [{ y: SAHM_THRESHOLD, label: RW.sahm.thresholdLine }],
    legend: [{ cls: "key-ref", text: RW.sahm.thresholdLine }],
  };
}

function spreadSpec() {
  const body = bodies.get("T10Y3M");
  if (!body) return null;
  return {
    id: "T10Y3M",
    name: RW.yieldCurve.title,
    obs: body.observations,
    title: body.title,
    units: body.units,
    frequency: body.frequency,
    source: sourceLine("T10Y3M"),
    color: "--brand",
    unit: " pts",
    tickUnit: "",
    digits: 2,
    refLines: [{ y: 0, label: RW.yieldCurve.zeroLine, dash: [] }],
    fillBelowZero: true,
    legend: [{ cls: "key-neg", text: RW.yieldCurve.legendBelowZero }],
  };
}

function setStatus(panel, text, alert) {
  const el = panel.querySelector(".status");
  el.textContent = text;
  el.hidden = false;
  el.classList.toggle("alert", alert);
}

function renderSahmReadout(view) {
  const p = view.root;
  const r = sahmRule(bodies.get("UNRATE").observations);
  if (!r) {
    showError(view, "Not enough unemployment history to compute the Sahm rule.");
    return;
  }
  p.querySelector(".value").textContent = `${formatNumber(r.value, 2)} pts`;
  p.querySelector(".sub").textContent = `(${RW.sahm.signalLabel})`;
  p.querySelector(".as-of").textContent = `as of ${formatDate(r.date)}`;
  setStatus(p, r.triggered ? RW.sahm.triggered : RW.sahm.notTriggered, r.triggered);
  p.querySelector(".reading").textContent =
    `${sahmSentence(r)} 3-month average: ${formatNumber(r.avg3, 2)}%; lowest in the prior 12 months: ${formatNumber(r.priorMin, 2)}%.`;
}

function renderSpreadReadout(view) {
  const p = view.root;
  const yc = yieldCurve(bodies.get("T10Y3M").observations);
  p.querySelector(".value").textContent = `${formatChange(yc.value, 2)} pts`;
  p.querySelector(".sub").textContent = "";
  p.querySelector(".as-of").textContent = `as of ${formatDate(yc.date)}`;
  setStatus(p, yc.inverted ? RW.yieldCurve.inverted : RW.yieldCurve.notInverted, yc.inverted);
  p.querySelector(".reading").textContent = yieldCurveSentence(yc);
}

function mountRecessionWatch() {
  const section = document.getElementById("recession-watch");
  section.querySelector("#watch-heading").textContent = RW.heading;
  section.querySelector(".watch-intro").textContent = RW.intro;
  const grid = section.querySelector(".watch-grid");

  const panels = [
    { key: "sahm", copy: RW.sahm, spec: sahmSpec, series: "UNRATE", readout: renderSahmReadout },
    { key: "yield", copy: RW.yieldCurve, spec: spreadSpec, series: "T10Y3M", readout: renderSpreadReadout },
  ];
  for (const p of panels) {
    const el = document.createElement("article");
    el.className = "card panel no-data";
    el.id = `panel-${p.key}`;
    el.innerHTML = panelHTML(p.key, p.copy, p.copy.chartLabel);
    grid.appendChild(el);
    const view = makeView(p.key, el, p.spec);
    loadBody(p.series).then(
      () => {
        p.readout(view);
        if (view.root.classList.contains("has-error")) return;
        renderView(view);
        if (!chartLibReady()) {
          showError(view, "Couldn't load the charting library. Check your connection and reload the page.", {
            dataMissing: false,
          });
        }
      },
      (err) => showError(view, `Couldn't load this indicator: ${err.message}`)
    );
  }
}

// ---------- page ----------

function renderRangeButtons() {
  const group = document.getElementById("range");
  for (const r of RANGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = r.label;
    btn.setAttribute("aria-pressed", String(r.label === range));
    btn.addEventListener("click", () => {
      range = r.label;
      group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      renderAll();
    });
    group.appendChild(btn);
  }
}

function renderCopy() {
  document.getElementById("site-title").textContent = SITE.title;
  document.getElementById("site-tagline").textContent = SITE.tagline;
  document.getElementById("summary-heading").textContent = SUMMARY.heading;
  document.getElementById("summary-note").textContent = SUMMARY.note;
  const about = document.getElementById("about");
  document.getElementById("about-heading").textContent = ABOUT.heading;
  for (const html of ABOUT.paragraphs) {
    const p = document.createElement("p");
    p.innerHTML = html; // trusted static copy from content.js
    about.appendChild(p);
  }
}

function renderSummary() {
  const items = INDICATORS.filter((ind) => bodies.has(ind.id)).map((ind) => ({
    label: ind.summaryLabel ?? ind.name,
    obs: bodies.get(ind.id).observations,
    unit: ind.unit,
    frequency: bodies.get(ind.id).frequency,
  }));
  const text = dashboardSummary(items);
  if (!text) return;
  document.getElementById("summary-text").textContent = text;
  document.getElementById("summary").hidden = false;
}

function loadRecessions() {
  loadBody("USREC", { start: USREC_START }).then(
    (body) => {
      periods = recessionPeriods(body.observations);
      renderAll();
    },
    () => {
      // Charts keep working, just unshaded.
      const el = document.getElementById("shading-status");
      el.textContent = RECESSION_SHADING.unavailable;
      el.hidden = false;
    }
  );
}

function init() {
  mountNav("dashboard");
  renderCopy();
  const grid = document.getElementById("cards");
  const cardViews = INDICATORS.map((ind) => mountIndicator(ind, grid));
  renderRangeButtons();
  Promise.allSettled(cardViews.map(showIndicator)).then(renderSummary);
  mountRecessionWatch();
  loadRecessions();
  // Redraw with the new palette when the system theme flips.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
  // "About" in the nav is an in-page link; honor it once the copy exists.
  if (location.hash === "#about") document.getElementById("about").scrollIntoView();
}

init();
