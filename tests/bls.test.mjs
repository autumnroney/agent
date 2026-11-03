import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler, { SERIES } from "../netlify/functions/bls.mjs";

const FAKE_KEY = "FAKE_BLS_KEY";
const realFetch = globalThis.fetch;
const THIS_YEAR = new Date().getUTCFullYear();
let calls;

function req(qs) {
  return new Request(`https://example.netlify.app/api/bls?${qs}`);
}

function blsBody(data) {
  return JSON.stringify({
    status: "REQUEST_SUCCEEDED",
    message: [],
    Results: { series: [{ seriesID: "X", data }] },
  });
}

const SAMPLE = [
  // BLS returns newest first
  { year: "2024", period: "M03", periodName: "March", value: "3.9", footnotes: [{ code: "P", text: "Preliminary" }] },
  { year: "2024", period: "M02", periodName: "February", value: "-", footnotes: [{}] },
  { year: "2024", period: "M01", periodName: "January", value: "3.7", footnotes: [{}] },
  { year: "2023", period: "M13", periodName: "Annual", value: "3.6", footnotes: [{}] },
  { year: "2023", period: "M12", periodName: "December", value: "3.8", footnotes: [{ code: "R", text: "Revised" }] },
];

beforeEach(() => {
  calls = [];
  process.env.BLS_API_KEY = FAKE_KEY;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(blsBody(SAMPLE), { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.BLS_API_KEY;
});

test("normalizes BLS data: drops M13 and '-', sorts ascending, flags preliminary", async () => {
  const res = await handler(req("series=LNS14000000&start=2023-01-01"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.series, "LNS14000000");
  assert.equal(body.source, "U.S. Bureau of Labor Statistics");
  assert.equal(body.frequency, "Monthly");
  assert.deepEqual(body.observations, [
    { date: "2023-12-01", value: 3.8 },
    { date: "2024-01-01", value: 3.7 },
    { date: "2024-03-01", value: 3.9, preliminary: true },
  ]);
  assert.ok(!("preliminary" in body.observations[0]));
});

test("sends a POST with the documented body, key included", async () => {
  await handler(req("series=ces0500000003&start=2015-06-01"));
  const { url, init } = calls[0];
  assert.equal(url, "https://api.bls.gov/publicAPI/v2/timeseries/data/");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), {
    seriesid: ["CES0500000003"],
    startyear: String(Math.max(2015, THIS_YEAR - 19)),
    endyear: String(THIS_YEAR),
    registrationkey: FAKE_KEY,
  });
});

test("default window is the last 20 years", async () => {
  await handler(req("series=LNS14000000"));
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.endyear, String(THIS_YEAR));
  assert.equal(sent.startyear, String(THIS_YEAR - 19));
});

test("clamps an old start to 20 years and keeps a recent start", async () => {
  await handler(req("series=LNS14000000&start=1948-01-01"));
  assert.equal(JSON.parse(calls[0].init.body).startyear, String(THIS_YEAR - 19));
  await handler(req(`series=LNS14000000&start=${THIS_YEAR - 4}-01-01`));
  assert.equal(JSON.parse(calls[1].init.body).startyear, String(THIS_YEAR - 4));
});

test("whitelist is exactly the five BLS series", () => {
  assert.deepEqual(Object.keys(SERIES).sort(), [
    "CES0000000001",
    "CES0500000003",
    "JTS000000000000000JOL",
    "LASST120000000000003",
    "LNS14000000",
  ]);
});

test("every whitelisted id is accepted with the contract's fields and cache header", async () => {
  for (const id of Object.keys(SERIES)) {
    const res = await handler(req(`series=${id}`));
    assert.equal(res.status, 200, id);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ["frequency", "observations", "series", "source", "title", "units"], id);
    assert.equal(body.series, id);
    assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600", id);
    assert.deepEqual(JSON.parse(calls.at(-1).init.body).seriesid, [id]);
  }
});

test("rejects unknown series without calling BLS", async () => {
  for (const qs of ["series=FOO", "series=UNRATE", "series=", ""]) {
    const res = await handler(req(qs));
    assert.equal(res.status, 400, qs);
    assert.match((await res.json()).error, /Unknown series.*LNS14000000/, qs);
  }
  assert.equal(calls.length, 0);
});

test("rejects a malformed start date", async () => {
  for (const s of ["2015-1-1", "20150101", "2015-13-45"]) {
    const res = await handler(req(`series=LNS14000000&start=${s}`));
    assert.equal(res.status, 400, s);
  }
  assert.equal(calls.length, 0);
});

test("explains how to fix a missing API key", async () => {
  delete process.env.BLS_API_KEY;
  const res = await handler(req("series=LNS14000000"));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /BLS_API_KEY is not set/);
  assert.equal(calls.length, 0);
});

test("returns 502 when fetch throws", async () => {
  globalThis.fetch = async () => {
    throw new Error(`connect failed for ${FAKE_KEY}`);
  };
  const res = await handler(req("series=LNS14000000"));
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.match(text, /Could not reach BLS/);
  assert.ok(!text.includes(FAKE_KEY));
});

test("returns 502 on an HTTP error from BLS", async () => {
  globalThis.fetch = async () => new Response("nope", { status: 500 });
  const res = await handler(req("series=LNS14000000"));
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /HTTP 500/);
});

test("returns 502 with BLS's message when the request is not processed", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "REQUEST_NOT_PROCESSED",
        message: [`daily threshold reached for ${FAKE_KEY}`, "second"],
        Results: {},
      }),
      { status: 200 }
    );
  const res = await handler(req("series=LNS14000000"));
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.match(text, /BLS could not process the request: daily threshold reached/);
  assert.ok(!text.includes(FAKE_KEY));
});

test("never leaks the API key in any response body", async () => {
  const cases = [
    ["series=LNS14000000", async () => new Response(blsBody(SAMPLE), { status: 200 })],
    ["series=LNS14000000", async () => new Response("nope", { status: 400 })],
    ["series=FOO", null],
    ["series=LNS14000000&start=bad", null],
  ];
  for (const [qs, f] of cases) {
    if (f) globalThis.fetch = f;
    const text = await (await handler(req(qs))).text();
    assert.ok(!text.includes(FAKE_KEY), qs);
  }
});
