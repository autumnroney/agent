import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler, { SERIES } from "../netlify/functions/fred.mjs";

const FAKE_KEY = "abcdefabcdefabcdefabcdefabcdef12";
const realFetch = globalThis.fetch;
let calls;

function req(qs) {
  return new Request(`https://example.netlify.app/api/fred?${qs}`);
}

beforeEach(() => {
  calls = [];
  process.env.FRED_API_KEY = FAKE_KEY;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({
        observations: [
          { date: "2024-01-01", value: "3.7" },
          { date: "2024-02-01", value: "." },
          { date: "2024-03-01", value: "3.9" },
        ],
      }),
      { status: 200 }
    );
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.FRED_API_KEY;
});

test("returns clean observations for a whitelisted series", async () => {
  const res = await handler(req("series=UNRATE&start=2015-01-01"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.series, "UNRATE");
  assert.deepEqual(body.observations, [
    { date: "2024-01-01", value: 3.7 },
    { date: "2024-03-01", value: 3.9 },
  ]);
  const called = new URL(calls[0]);
  assert.equal(called.searchParams.get("series_id"), "UNRATE");
  assert.equal(called.searchParams.get("observation_start"), "2015-01-01");
});

test("uses the right FRED units transform for each series", async () => {
  for (const [id, meta] of Object.entries(SERIES)) {
    await handler(req(`series=${id}`));
    assert.equal(new URL(calls.at(-1)).searchParams.get("units"), meta.units, id);
  }
  assert.equal(SERIES.CPIAUCSL.units, "pc1");
  assert.equal(SERIES.GDPC1.units, "pca");
});

test("whitelist is exactly the nine v2 series with the PRD's units", () => {
  const expected = {
    CPIAUCSL: "pc1",
    UNRATE: "lin",
    FEDFUNDS: "lin",
    GDPC1: "pca",
    USREC: "lin",
    PCEPI: "pc1",
    PCEPILFE: "pc1",
    NROU: "lin",
    T10Y3M: "lin",
  };
  assert.deepEqual(Object.keys(SERIES).sort(), Object.keys(expected).sort());
  for (const [id, units] of Object.entries(expected)) assert.equal(SERIES[id].units, units, id);
});

test("every whitelisted series returns 200 with the contract's fields", async () => {
  for (const id of Object.keys(SERIES)) {
    const res = await handler(req(`series=${id}`));
    assert.equal(res.status, 200, id);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ["frequency", "observations", "series", "title", "units"], id);
    assert.equal(body.series, id);
    assert.equal(typeof body.title, "string");
    assert.equal(typeof body.units, "string");
    assert.equal(typeof body.frequency, "string");
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600", id);
  }
});

test("series ids are case-insensitive", async () => {
  const res = await handler(req("series=pcepilfe"));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).series, "PCEPILFE");
});

test("T10Y3M asks FRED for a monthly average of the daily data", async () => {
  await handler(req("series=T10Y3M&start=2000-01-01"));
  const called = new URL(calls.at(-1)).searchParams;
  assert.equal(called.get("frequency"), "m");
  assert.equal(called.get("aggregation_method"), "avg");
  assert.equal(called.get("units"), "lin");
  assert.equal(called.get("observation_start"), "2000-01-01");
});

test("T10Y3M returns FRED's monthly observations (dated the 1st)", async () => {
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({
        observations: [
          { date: "2024-01-01", value: "-1.2345" },
          { date: "2024-02-01", value: "-1.3" },
          { date: "2024-03-01", value: "." },
        ],
      }),
      { status: 200 }
    );
  };
  const body = await (await handler(req("series=T10Y3M"))).json();
  assert.deepEqual(body.observations, [
    { date: "2024-01-01", value: -1.2345 },
    { date: "2024-02-01", value: -1.3 },
  ]);
  assert.ok(body.observations.every((o) => o.date.endsWith("-01")));
});

test("other series never send a frequency or aggregation to FRED", async () => {
  for (const id of Object.keys(SERIES).filter((s) => s !== "T10Y3M")) {
    await handler(req(`series=${id}`));
    const called = new URL(calls.at(-1)).searchParams;
    assert.equal(called.get("frequency"), null, id);
    assert.equal(called.get("aggregation_method"), null, id);
  }
});

test("the browser cannot override units, frequency or aggregation", async () => {
  await handler(req("series=UNRATE&units=pch&frequency=a&aggregation_method=sum&api_key=evil"));
  let called = new URL(calls.at(-1)).searchParams;
  assert.equal(called.get("units"), "lin");
  assert.equal(called.get("frequency"), null);
  assert.equal(called.get("aggregation_method"), null);
  assert.equal(called.get("api_key"), FAKE_KEY);

  await handler(req("series=T10Y3M&frequency=d&aggregation_method=eop"));
  called = new URL(calls.at(-1)).searchParams;
  assert.equal(called.get("frequency"), "m");
  assert.equal(called.get("aggregation_method"), "avg");
});

test("NROU is returned as FRED sends it, CBO projections included", async () => {
  // CBO's NROU runs years past today; trimming to the latest UNRATE date is done client-side (lib/econ.js).
  const projected = [
    { date: "2025-07-01", value: "4.27" },
    { date: "2025-10-01", value: "4.26" },
    { date: "2030-01-01", value: "4.18" },
    { date: "2035-10-01", value: "4.10" },
  ];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ observations: projected }), { status: 200 });
  };
  const body = await (await handler(req("series=NROU&start=2025-01-01"))).json();
  assert.equal(body.frequency, "Quarterly");
  assert.deepEqual(
    body.observations,
    projected.map((o) => ({ date: o.date, value: Number(o.value) }))
  );
});

test("USREC 0/1 values come back as numbers", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ observations: [{ date: "2020-02-01", value: "0" }, { date: "2020-03-01", value: "1" }] }),
      { status: 200 }
    );
  const body = await (await handler(req("series=USREC&start=2020-01-01"))).json();
  assert.deepEqual(body.observations, [
    { date: "2020-02-01", value: 0 },
    { date: "2020-03-01", value: 1 },
  ]);
});

test("rejects unknown series without calling FRED", async () => {
  for (const qs of ["series=FOO", "series=DGS10", "series=", "", "series=UNRATE%26units%3Dpch"]) {
    const res = await handler(req(qs));
    assert.equal(res.status, 400, qs);
    assert.match((await res.json()).error, /Unknown series/, qs);
  }
  assert.equal(calls.length, 0);
});

test("rejects a malformed start date", async () => {
  const res = await handler(req("series=UNRATE&start=2015-1-1"));
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("explains how to fix a missing API key", async () => {
  delete process.env.FRED_API_KEY;
  const res = await handler(req("series=UNRATE"));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /FRED_API_KEY/);
});

test("returns 502 when FRED fails", async () => {
  globalThis.fetch = async () => new Response("nope", { status: 500 });
  const res = await handler(req("series=UNRATE"));
  assert.equal(res.status, 502);
});

test("never leaks the API key in any response", async () => {
  globalThis.fetch = async () => new Response("nope", { status: 400 });
  for (const qs of ["series=UNRATE", "series=FOO", "series=GDPC1&start=bad", "series=T10Y3M"]) {
    const text = await (await handler(req(qs))).text();
    assert.ok(!text.includes(FAKE_KEY), qs);
  }
});
