// BLS proxy: the browser calls /api/bls, this function adds the API key server-side.
const BLS_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

// Whitelist (M13). Units and frequency are fixed here; the browser can't choose them.
export const SERIES = {
  LASST120000000000003: { title: "Florida unemployment rate", unitsLabel: "%", frequency: "Monthly" },
  LNS14000000: { title: "U.S. unemployment rate", unitsLabel: "%", frequency: "Monthly" },
  CES0500000003: {
    title: "Average hourly earnings, all private employees",
    unitsLabel: "dollars per hour",
    frequency: "Monthly",
  },
  CES0000000001: { title: "Total nonfarm payroll employment", unitsLabel: "thousands of jobs", frequency: "Monthly" },
  JTS000000000000000JOL: { title: "Job openings, total nonfarm", unitsLabel: "thousands", frequency: "Monthly" },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_YEARS = 20; // BLS v2 allows 20 years per request

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export default async function handler(request) {
  const params = new URL(request.url).searchParams;
  const id = (params.get("series") || "").toUpperCase();
  const start = params.get("start");

  const meta = SERIES[id];
  if (!meta) {
    return json(400, { error: `Unknown series. Allowed: ${Object.keys(SERIES).join(", ")}` });
  }
  if (start && (!DATE_RE.test(start) || Number.isNaN(Date.parse(start)))) {
    return json(400, { error: "start must be a date in YYYY-MM-DD format" });
  }

  const apiKey = process.env.BLS_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: "BLS_API_KEY is not set. Add it in Netlify under Site configuration → Environment variables, then redeploy.",
    });
  }

  const endYear = new Date().getUTCFullYear();
  const earliest = endYear - (MAX_SPAN_YEARS - 1);
  let startYear = start ? Number(start.slice(0, 4)) : earliest;
  startYear = Math.min(Math.max(startYear, earliest), endYear);

  let upstream;
  try {
    upstream = await fetch(BLS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seriesid: [id],
        startyear: String(startYear),
        endyear: String(endYear),
        registrationkey: apiKey,
      }),
    });
  } catch {
    return json(502, { error: "Could not reach BLS. Try again in a minute." });
  }
  if (!upstream.ok) {
    return json(502, { error: `BLS returned an error (HTTP ${upstream.status}).` });
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return json(502, { error: "BLS returned a response that could not be read." });
  }
  if (data.status !== "REQUEST_SUCCEEDED") {
    const first = String((Array.isArray(data.message) && data.message[0]) || "unknown error").split(apiKey).join("");
    return json(502, { error: "BLS could not process the request: " + first });
  }

  const rows = data.Results?.series?.[0]?.data || [];
  const observations = rows
    .filter((r) => /^M(0[1-9]|1[0-2])$/.test(r.period)) // drop M13 annual averages
    .map((r) => {
      const obs = { date: `${r.year}-${r.period.slice(1)}-01`, value: Number(r.value) };
      if (r.value === "" || r.value == null || !Number.isFinite(obs.value)) return null; // BLS uses "-"
      if (Array.isArray(r.footnotes) && r.footnotes.some((f) => f && f.code === "P")) obs.preliminary = true;
      return obs;
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return json(
    200,
    {
      series: id,
      title: meta.title,
      units: meta.unitsLabel,
      frequency: meta.frequency,
      source: "U.S. Bureau of Labor Statistics",
      observations,
    },
    // BLS allows 500 queries/day; CDN and browser caching keep us far under that.
    { "Cache-Control": "public, max-age=3600" }
  );
}
