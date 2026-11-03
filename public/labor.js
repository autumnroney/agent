// Labor Market page (M13): four BLS cards. Copy from LABOR in content.js; math from econ.js / format.js.
import { LABOR, CHART_UI, RECESSION_SHADING, SOURCES } from "./content.js";
import { RANGES, DEFAULT_RANGE } from "./indicators.js";
import { getSeries } from "./lib/fred-client.js";
import { getBlsSeries } from "./lib/bls-client.js";
import { yearAgo, recessionPeriods } from "./lib/econ.js";
import {
  formatDate,
  formatValue,
  formatChange,
  formatNumber,
  formatMillions,
  formatJobsChange,
  monthChange,
  latestGap,
  gapSentence,
  fillTemplate,
} from "./lib/format.js";
import { mountNav } from "./lib/nav.js";
import {
  USREC_START,
  sliceRange,
  createLineChart,
  resolveColor,
  toCSV,
  csvFilename,
  todayISO,
  downloadText,
  tableRows,
} from "./lib/charts.js";

const T = LABOR.templates;
const FL = "LASST120000000000003";
const US = "LNS14000000";

const bodies = new Map(); // BLS series id -> API body
let periods = null; // NBER periods from USREC (null: unshaded)
let range = DEFAULT_RANGE;
const views = [];

const rangeYears = () => RANGES.find((r) => r.label === range).years;
const chartLibReady = () => typeof Chart !== "undefined";
const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const prelim = (obs) => (obs?.preliminary ? ` (${T.preliminary})` : "");

// Card definitions. `series` lists one or more lines; the first is the primary line.
const CARDS = [
  {
    key: "unemployment",
    color: "--c1",
    unit: "%",
    digits: 1,
    unitNote: "Percent of the labor force, seasonally adjusted",
    series: [
      { id: FL, name: "Florida", color: "--c1" },
      { id: US, name: "U.S.", color: "--c2", dash: [6, 4] },
    ],
  },
  {
    key: "earnings",
    color: "--c2",
    unit: "",
    digits: 2,
    unitNote: "Dollars per hour, seasonally adjusted, not adjusted for inflation",
    series: [{ id: "CES0500000003", name: "Average hourly earnings", color: "--c2" }],
  },
  {
    key: "payrolls",
    color: "--c3",
    unit: "",
    digits: 0,
    unitNote: "Thousands of jobs, seasonally adjusted",
    series: [{ id: "CES0000000001", name: "Nonfarm payroll employment", color: "--c3" }],
  },
  {
    key: "openings",
    color: "--c4",
    unit: "",
    digits: 0,
    unitNote: "Thousands of openings, seasonally adjusted",
    series: [{ id: "JTS000000000000000JOL", name: "Job openings", color: "--c4" }],
  },
];

// ---------- card markup ----------

function cardHTML(def) {
  const c = LABOR.cards[def.key];
  const csvButtons = def.series
    .map(
      (s, i) =>
        `<button type="button" class="tool" data-act="csv" data-i="${i}">${escapeHTML(CHART_UI.downloadCSV)}${
          def.series.length > 1 ? ` (${escapeHTML(s.name)})` : ""
        }</button>`
    )
    .join("");
  return `
    <header class="card-head">
      <div>
        <h2>${escapeHTML(c.title)}</h2>
        <p class="unit-note">${escapeHTML(def.unitNote)} · ${def.series
          .map((s) => `<a href="https://data.bls.gov/timeseries/${s.id}" target="_blank" rel="noopener">${s.id}</a>`)
          .join(", ")}</p>
      </div>
      <div class="latest" aria-live="polite">
        <span class="value">—</span>
        <span class="as-of">Loading…</span>
        <span class="change"></span>
      </div>
    </header>
    <p class="reading" hidden></p>
    <div class="chart-wrap"><canvas role="img" aria-label="${escapeHTML(c.title)} line chart"></canvas></div>
    <p class="chart-legend"></p>
    <p class="error" role="status" hidden></p>
    <div class="chart-tools">${csvButtons}
      <button type="button" class="tool" data-act="table" aria-expanded="false" aria-controls="table-${def.key}">${escapeHTML(
        CHART_UI.showTable
      )}</button>
    </div>
    <div class="table-wrap" id="table-${def.key}" role="region" tabindex="0" aria-label="" hidden></div>
    <dl class="explain">
      <dt>What it is</dt><dd>${escapeHTML(c.whatItIs)}</dd>
      <dt>Why it matters</dt><dd>${escapeHTML(c.whyItMatters)}</dd>
      <dt>Good to know</dt><dd>${escapeHTML(c.goodToKnow)}</dd>
    </dl>`;
}

// ---------- rendering ----------

const obsOf = (id) => bodies.get(id)?.observations;
const ready = (view) => view.def.series.every((s) => bodies.has(s.id));

function renderLegend(view) {
  const items = [];
  if (periods) items.push(`<span class="key key-rec">${escapeHTML(RECESSION_SHADING.note)}</span>`);
  if (view.def.series.length > 1) {
    for (const s of view.def.series) {
      items.push(`<span class="key key-line${s.dash ? " dashed" : ""}" style="--line:var(${s.color})">${escapeHTML(s.name)}</span>`);
    }
  }
  view.root.querySelector(".chart-legend").innerHTML = items.join("");
}

function drawChart(view) {
  const { def } = view;
  const years = rangeYears();
  const [primary, ...rest] = def.series;
  const visible = sliceRange(obsOf(primary.id), years);
  view.chart?.destroy();
  view.chart = createLineChart(view.canvas, {
    obs: visible,
    color: primary.color,
    unit: def.unit,
    digits: def.digits,
    frequency: "Monthly",
    shortRange: (years ?? Infinity) <= 1,
    periods,
  });
  const chart = view.chart;
  if (def.series.length > 1) {
    chart.data.datasets[0].label = primary.name;
    const labels = chart.data.labels;
    for (const s of rest) {
      const byDate = new Map(obsOf(s.id).map((o) => [o.date, o.value]));
      const color = resolveColor(s.color);
      chart.data.datasets.push({
        label: s.name,
        data: labels.map((d) => byDate.get(d) ?? null),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        borderDash: s.dash ?? [],
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.15,
        spanGaps: true,
      });
    }
    chart.options.plugins.tooltip.callbacks.label = (item) =>
      ` ${item.dataset.label}: ${formatNumber(item.parsed.y, def.digits)}${def.unit}`;
    chart.update();
  }
}

function renderView(view) {
  if (!ready(view)) return;
  view.root.classList.remove("no-data");
  renderLegend(view);
  if (chartLibReady()) drawChart(view);
  if (view.tableOpen) renderTable(view);
}

function renderTable(view) {
  const { def } = view;
  const wrap = view.tableEl;
  if (!ready(view)) {
    wrap.innerHTML = "";
    return;
  }
  const title = LABOR.cards[def.key].title;
  const visible = sliceRange(obsOf(def.series[0].id), rangeYears());
  const rows = tableRows(visible, { all: view.tableAll });
  const lookups = def.series.map((s) => new Map(obsOf(s.id).map((o) => [o.date, o.value])));
  const body = rows
    .map(
      (r) =>
        `<tr><th scope="row">${formatDate(r.date, "Monthly")}</th>${lookups
          .map((m) => `<td>${m.has(r.date) ? formatNumber(m.get(r.date), def.digits) : "—"}</td>`)
          .join("")}</tr>`
    )
    .join("");
  const heads = def.series
    .map((s) => `<th scope="col">${escapeHTML(def.series.length > 1 ? s.name : CHART_UI.valueHeader)}${def.unit === "%" ? " (%)" : ""}</th>`)
    .join("");
  const more =
    visible.length > 24
      ? `<button type="button" class="tool" data-act="all">${escapeHTML(
          fillTemplate(view.tableAll ? CHART_UI.showFewer : CHART_UI.showAll, { n: view.tableAll ? 24 : visible.length })
        )}</button>`
      : "";
  wrap.setAttribute("aria-label", `${title}: data table`);
  wrap.innerHTML = `
    <table>
      <caption>${escapeHTML(fillTemplate(CHART_UI.tableCaption, { name: title, range }))}</caption>
      <thead><tr><th scope="col">${escapeHTML(CHART_UI.dateHeader)}</th>${heads}</tr></thead>
      <tbody>${body}</tbody>
    </table>${more}`;
  wrap.querySelector('[data-act="all"]')?.addEventListener("click", () => {
    view.tableAll = !view.tableAll;
    renderTable(view);
    wrap.querySelector('[data-act="all"]')?.focus();
  });
}

function downloadCSV(view, i) {
  const s = view.def.series[i];
  const body = bodies.get(s.id);
  if (!body) return;
  const today = todayISO();
  const csv = toCSV(sliceRange(body.observations, rangeYears()), {
    id: s.id,
    title: body.title,
    units: body.units,
    frequency: body.frequency,
    source: `${SOURCES[s.id] ?? "U.S. Bureau of Labor Statistics"} via the BLS Public Data API`,
    url: `https://data.bls.gov/timeseries/${s.id}`,
    range,
    retrieved: today,
  });
  downloadText(csvFilename(s.id, range, today), csv);
}

function showError(view, message, { dataMissing = true } = {}) {
  view.root.classList.add("has-error");
  if (dataMissing) {
    view.root.classList.add("no-data");
    view.root.querySelector(".as-of").textContent = "Unavailable";
    view.root.querySelector(".value").textContent = "—";
    view.chart?.destroy();
    view.chart = null;
  }
  const el = view.root.querySelector(".error");
  el.textContent = message;
  el.hidden = false;
}

// Latest-value text per card.
function renderLatest(view) {
  const { def, root } = view;
  const set = (sel, text) => (root.querySelector(sel).textContent = text);
  const reading = root.querySelector(".reading");
  const first = obsOf(def.series[0].id);
  const last = first.at(-1);
  const month = formatDate(last.date, "Monthly");
  reading.hidden = true;

  if (def.key === "unemployment") {
    const usLast = obsOf(US).at(-1);
    set(".value", formatValue(last.value, "%"));
    set(".as-of", `Florida, ${month}${prelim(last)}`);
    set(".change", `U.S. ${formatValue(usLast.value, "%")}, ${formatDate(usLast.date, "Monthly")}${prelim(usLast)}`);
    const sentence = gapSentence(latestGap(first, obsOf(US)), T);
    reading.textContent = sentence;
    reading.hidden = !sentence;
  } else if (def.key === "earnings") {
    set(".value", `$${formatNumber(last.value, 2)}`);
    set(".as-of", `${month}${prelim(last)}`);
    const prev = yearAgo(first);
    set(".change", prev ? fillTemplate(T.yoy, { change: `${formatChange(((last.value / prev.value) - 1) * 100)}%` }) : "");
  } else if (def.key === "payrolls") {
    set(".value", formatMillions(last.value));
    set(".as-of", `${month}${prelim(last)}`);
    const mc = monthChange(first);
    set(".change", mc ? fillTemplate(T.monthChange, { change: formatJobsChange(mc.change) }) : "");
  } else {
    set(".value", formatMillions(last.value));
    set(".as-of", `${month}${prelim(last)}`);
    set(".change", "");
  }
}

function renderAll() {
  views.forEach(renderView);
}

async function showCard(view) {
  const results = await Promise.allSettled(
    view.def.series.map((s) => getBlsSeries(s.id).then((b) => bodies.set(s.id, b)))
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed) {
    showError(view, `Couldn't load this chart: ${failed.reason?.message ?? "unknown error"}`);
    return;
  }
  renderLatest(view);
  renderView(view);
  if (!chartLibReady()) {
    showError(view, "Couldn't load the charting library. Check your connection and reload the page.", { dataMissing: false });
  }
}

function mountCard(def, grid) {
  const root = document.createElement("article");
  root.className = "card labor-card no-data";
  root.id = `card-${def.key}`;
  root.style.setProperty("--accent", `var(${def.color})`);
  root.innerHTML = cardHTML(def);
  grid.appendChild(root);
  const view = {
    def,
    root,
    chart: null,
    tableOpen: false,
    tableAll: false,
    canvas: root.querySelector("canvas"),
    tableEl: root.querySelector(".table-wrap"),
  };
  root.querySelectorAll('[data-act="csv"]').forEach((b) => b.addEventListener("click", () => downloadCSV(view, Number(b.dataset.i))));
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

function renderRangeButtons() {
  const group = document.getElementById("range");
  for (const r of RANGES.filter((x) => x.years !== null)) {
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

function loadRecessions() {
  getSeries("USREC", { start: USREC_START }).then(
    (body) => {
      periods = recessionPeriods(body.observations);
      renderAll();
    },
    () => {
      const el = document.getElementById("shading-status");
      el.textContent = RECESSION_SHADING.unavailable;
      el.hidden = false;
    }
  );
}

function init() {
  mountNav("labor");
  document.getElementById("labor-title").textContent = LABOR.heading;
  document.getElementById("labor-intro").textContent = LABOR.intro;
  document.getElementById("labor-source").textContent = LABOR.sourceLine;
  document.getElementById("labor-revisions").textContent = LABOR.revisionsNote;
  const grid = document.getElementById("cards");
  const cardViews = CARDS.map((def) => mountCard(def, grid));
  renderRangeButtons();
  cardViews.forEach(showCard);
  loadRecessions();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
}

init();
