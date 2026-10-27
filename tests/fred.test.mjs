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

test("rejects unknown series without calling FRED", async () => {
  const res = await handler(req("series=FOO"));
  assert.equal(res.status, 400);
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
  for (const qs of ["series=UNRATE", "series=FOO", "series=GDPC1&start=bad"]) {
    const text = await (await handler(req(qs))).text();
    assert.ok(!text.includes(FAKE_KEY), qs);
  }
});
