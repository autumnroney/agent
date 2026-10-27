import { INDICATORS, RANGES, DEFAULT_RANGE } from "./indicators.js";

const data = new Map(); // series id -> observations [{date, value}]
const charts = new Map(); // series id -> Chart instance
let range = DEFAULT_RANGE;

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const quarterOf = (d) => `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;

function formatDate(iso, id) {
  const d = new Date(iso + "T00:00:00Z");
  return id === "GDPC1" ? quarterOf(d) : monthFmt.format(d);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function yearsBefore(iso, years) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

// Latest observation on or before the same date one year earlier.
function yearAgo(obs) {
  const target = yearsBefore(obs.at(-1).date, 1);
  for (let i = obs.length - 1; i >= 0; i--) if (obs[i].date <= target) return obs[i];
  return null;
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
  card.querySelector(".value").textContent = `${last.value.toFixed(1).replace("-", "−")}${ind.unit}`;
  card.querySelector(".as-of").textContent = `as of ${formatDate(last.date, ind.id)}`;

  const prev = yearAgo(obs);
  const changeEl = card.querySelector(".change");
  if (prev) {
    const diff = last.value - prev.value;
    const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
    changeEl.textContent = `${sign}${Math.abs(diff).toFixed(1)} pts vs. ${formatDate(prev.date, ind.id)}`;
  }
}

function renderChart(ind) {
  const all = data.get(ind.id);
  if (!all) return;
  const years = RANGES.find((r) => r.label === range).years;
  const start = years ? yearsBefore(all.at(-1).date, years) : "";
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

async function load(ind) {
  const card = document.getElementById(`card-${ind.id}`);
  try {
    const res = await fetch(`/api/fred?series=${ind.id}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (HTTP ${res.status})`);
    if (!body.observations?.length) throw new Error("FRED returned no data for this series.");
    data.set(ind.id, body.observations);
    renderLatest(ind);
    renderChart(ind);
  } catch (err) {
    card.classList.add("has-error");
    card.querySelector(".as-of").textContent = "Unavailable";
    const errEl = card.querySelector(".error");
    errEl.textContent = `Couldn't load this chart: ${err.message}`;
    errEl.hidden = false;
  }
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

function init() {
  const grid = document.getElementById("cards");
  INDICATORS.forEach((ind) => grid.appendChild(renderCardShell(ind)));
  renderRangeButtons();
  INDICATORS.forEach(load);
  // Redraw with the new palette when the system theme flips.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => INDICATORS.forEach(renderChart));
}

init();
