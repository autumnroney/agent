import { INDICATORS, RANGES, DEFAULT_RANGE } from "./indicators.js";
import { SITE, ABOUT } from "./content.js";
import { getSeries } from "./lib/fred-client.js";
import { formatDate, formatValue, formatChange, shiftYears } from "./lib/format.js";
import { yearAgo } from "./lib/econ.js";
import { mountNav } from "./lib/nav.js";

const data = new Map(); // series id -> observations [{date, value}]
const charts = new Map(); // series id -> Chart instance
let range = DEFAULT_RANGE;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderCardShell(ind) {
  const card = document.createElement("article");
  card.className = "card";
  card.id = `card-${ind.id}`;
  card.style.setProperty("--accent", `var(${ind.color})`);
  card.innerHTML = `
    <header class="card-head">
      <div>
        <h2>${ind.name}</h2>
        <p class="unit-note">${ind.unitNote} · <a href="https://fred.stlouisfed.org/series/${ind.id}" target="_blank" rel="noopener">${ind.id}</a></p>
      </div>
      <div class="latest" aria-live="polite">
        <span class="value">—</span>
        <span class="as-of">Loading…</span>
        <span class="change"></span>
      </div>
    </header>
    <div class="chart-wrap"><canvas role="img" aria-label="${ind.name} line chart"></canvas></div>
    <p class="error" hidden></p>
    <dl class="explain">
      <dt>What it is</dt><dd>${ind.what}</dd>
      <dt>Why the Fed cares</dt><dd>${ind.whyFed}</dd>
      <dt>Good to know</dt><dd>${ind.goodToKnow}</dd>
    </dl>`;
  return card;
}

function renderLatest(ind) {
  const card = document.getElementById(`card-${ind.id}`);
  const obs = data.get(ind.id);
  const last = obs.at(-1);
  card.querySelector(".value").textContent = formatValue(last.value, ind.unit);
  card.querySelector(".as-of").textContent = `as of ${formatDate(last.date, ind.id)}`;

  const prev = yearAgo(obs);
  if (prev) {
    card.querySelector(".change").textContent =
      `${formatChange(last.value - prev.value)} pts vs. ${formatDate(prev.date, ind.id)}`;
  }
}

function renderChart(ind) {
  const all = data.get(ind.id);
  if (!all || typeof Chart === "undefined") return;
  const years = RANGES.find((r) => r.label === range).years;
  const start = years ? shiftYears(all.at(-1).date, -years) : "";
  const obs = all.filter((o) => o.date >= start);

  const color = cssVar(ind.color);
  const grid = cssVar("--grid");
  const text = cssVar("--muted");
  const canvas = document.querySelector(`#card-${ind.id} canvas`);

  charts.get(ind.id)?.destroy();
  charts.set(
    ind.id,
    new Chart(canvas, {
      type: "line",
      data: {
        labels: obs.map((o) => o.date),
        datasets: [
          {
            data: obs.map((o) => o.value),
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2,
            pointRadius: obs.length < 30 ? 2 : 0,
            pointHoverRadius: 4,
            tension: 0.15,
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
              title: (items) => formatDate(items[0].label, ind.id),
              label: (item) => ` ${item.parsed.y.toFixed(2)}${ind.unit}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: text,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 6,
              callback(value) {
                const iso = this.getLabelForValue(value);
                return years && years <= 1 ? formatDate(iso, ind.id) : iso.slice(0, 4);
              },
            },
          },
          y: {
            grid: { color: grid },
            border: { display: false },
            ticks: { color: text, callback: (v) => `${v}${ind.unit}` },
          },
        },
      },
    })
  );
}

function showError(ind, message, { dataMissing = true } = {}) {
  const card = document.getElementById(`card-${ind.id}`);
  card.classList.add("has-error");
  if (dataMissing) card.querySelector(".as-of").textContent = "Unavailable";
  const errEl = card.querySelector(".error");
  errEl.textContent = message;
  errEl.hidden = false;
}

async function load(ind) {
  let body;
  try {
    body = await getSeries(ind.id);
  } catch (err) {
    showError(ind, `Couldn't load this chart: ${err.message}`);
    return;
  }
  data.set(ind.id, body.observations);
  renderLatest(ind);
  if (typeof Chart === "undefined") {
    showError(ind, "Couldn't load the charting library. Check your connection and reload the page.", {
      dataMissing: false,
    });
    return;
  }
  renderChart(ind);
}

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
      INDICATORS.forEach(renderChart);
    });
    group.appendChild(btn);
  }
}

function renderCopy() {
  document.getElementById("site-title").textContent = SITE.title;
  document.getElementById("site-tagline").textContent = SITE.tagline;
  const about = document.getElementById("about");
  document.getElementById("about-heading").textContent = ABOUT.heading;
  for (const html of ABOUT.paragraphs) {
    const p = document.createElement("p");
    p.innerHTML = html; // trusted static copy from content.js
    about.appendChild(p);
  }
}

function init() {
  mountNav("dashboard");
  renderCopy();
  const grid = document.getElementById("cards");
  INDICATORS.forEach((ind) => grid.appendChild(renderCardShell(ind)));
  renderRangeButtons();
  INDICATORS.forEach(load);
  // Redraw with the new palette when the system theme flips.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => INDICATORS.forEach(renderChart));
  // "About" in the nav is an in-page link; honor it once the copy exists.
  if (location.hash === "#about") document.getElementById("about").scrollIntoView();
}

init();
