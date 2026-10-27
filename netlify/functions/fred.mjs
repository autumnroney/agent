// FRED proxy: the browser calls /api/fred, this function adds the API key server-side.
const FRED_URL = "https://api.stlouisfed.org/fred/series/observations";

export const SERIES = {
  CPIAUCSL: { title: "CPI inflation", units: "pc1", unitsLabel: "% change from a year ago", frequency: "Monthly" },
  UNRATE: { title: "Unemployment rate", units: "lin", unitsLabel: "%", frequency: "Monthly" },
  FEDFUNDS: { title: "Effective federal funds rate", units: "lin", unitsLabel: "%", frequency: "Monthly" },
  GDPC1: { title: "Real GDP growth", units: "pca", unitsLabel: "% change, annualized (quarter over quarter)", frequency: "Quarterly" },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: "FRED_API_KEY is not set. Add it in Netlify under Site configuration → Environment variables, then redeploy.",
    });
  }

  const url = new URL(FRED_URL);
  url.searchParams.set("series_id", id);
  url.searchParams.set("units", meta.units);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("api_key", apiKey);
  if (start) url.searchParams.set("observation_start", start);

  let upstream;
  try {
    upstream = await fetch(url);
  } catch {
    return json(502, { error: "Could not reach FRED. Try again in a minute." });
  }
  if (!upstream.ok) {
    return json(502, { error: `FRED returned an error (HTTP ${upstream.status}).` });
  }

  const data = await upstream.json();
  const observations = (data.observations || [])
    .filter((o) => o.value !== "." && o.value !== "")
    .map((o) => ({ date: o.date, value: Number(o.value) }))
    .filter((o) => Number.isFinite(o.value));

  return json(
    200,
    { series: id, title: meta.title, units: meta.unitsLabel, frequency: meta.frequency, observations },
    // FRED updates at most daily; let browsers and Netlify's CDN reuse responses for an hour.
    { "Cache-Control": "public, max-age=3600" }
  );
}
