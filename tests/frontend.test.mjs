import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatDate,
  formatMonth,
  formatQuarter,
  formatNumber,
  formatValue,
  formatChange,
  shiftYears,
  parseHash,
  buildHash,
} from "../public/lib/format.js";
import { createFredClient, FredError, getSeries } from "../public/lib/fred-client.js";
import { NAV_ITEMS, navHTML, pageFromPath, comingSoonHTML } from "../public/lib/nav.js";
import * as content from "../public/content.js";
import { INDICATORS } from "../public/indicators.js";

// ---------- helpers ----------

const OBS = [
  { date: "2024-08-01", value: 4.2 },
  { date: "2024-09-01", value: 4.1 },
];
const BODY = { series: "UNRATE", title: "Unemployment rate", units: "%", frequency: "Monthly", observations: OBS };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** fetch mock that records URLs and answers with `respond(url)` (default: BODY). */
function mockFetch(respond = () => jsonResponse(BODY)) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    return respond(String(url));
  };
  fn.calls = calls;
  return fn;
}

/** Minimal Storage implementation. */
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  get length() {
    return this.map.size;
  }
  key(i) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

class ThrowingStorage {
  get length() {
    throw new Error("SecurityError");
  }
  key() {
    throw new Error("SecurityError");
  }
  getItem() {
    throw new Error("SecurityError");
  }
  setItem() {
    throw new Error("QuotaExceededError");
  }
  removeItem() {
    throw new Error("SecurityError");
  }
}

// ---------- format.js ----------

describe("format.js", () => {
  test("formatDate: monthly vs quarterly labels", () => {
    assert.equal(formatMonth("2026-09-01"), "Sep 2026");
    assert.equal(formatQuarter("2026-07-01"), "Q3 2026");
    assert.equal(formatQuarter("2026-01-01"), "Q1 2026");
    assert.equal(formatQuarter("2025-10-01"), "Q4 2025");
    assert.equal(formatDate("2026-07-01", "Quarterly"), "Q3 2026");
    assert.equal(formatDate("2026-07-01", "Monthly"), "Jul 2026");
    assert.equal(formatDate("2026-07-01"), "Jul 2026");
    // v1 call style: a series id
    assert.equal(formatDate("2026-04-01", "GDPC1"), "Q2 2026");
    assert.equal(formatDate("2026-04-01", "NROU"), "Q2 2026");
    assert.equal(formatDate("2026-04-01", "UNRATE"), "Apr 2026");
  });

  test("formatDate uses UTC (no off-by-one month in western time zones)", () => {
    assert.equal(formatMonth("2026-01-01"), "Jan 2026");
    assert.equal(formatQuarter("2026-04-01"), "Q2 2026");
  });

  test("formatNumber / formatValue use a typographic minus and never show −0.0", () => {
    assert.equal(formatNumber(3.14159), "3.1");
    assert.equal(formatNumber(-1.25, 2), "−1.25");
    assert.equal(formatNumber(-0.04), "0.0");
    assert.equal(formatValue(4.26, "%"), "4.3%");
    assert.equal(formatValue(-0.5, "%"), "−0.5%");
    assert.equal(formatValue(2), "2.0");
  });

  test("formatChange signs at display precision", () => {
    assert.equal(formatChange(0.2), "+0.2");
    assert.equal(formatChange(-0.2), "−0.2");
    assert.equal(formatChange(0), "±0.0");
    assert.equal(formatChange(0.04), "±0.0"); // rounds to zero: no misleading "+"
    assert.equal(formatChange(4.3 - 4.1), "+0.2"); // float noise
    assert.equal(formatChange(-1.234, 2), "−1.23");
  });

  test("shiftYears moves whole years and clamps Feb 29", () => {
    assert.equal(shiftYears("2026-09-01", -1), "2025-09-01");
    assert.equal(shiftYears("2026-09-01", -20), "2006-09-01");
    assert.equal(shiftYears("2024-02-29", -1), "2023-02-28");
    assert.equal(shiftYears("2024-02-29", 4), "2028-02-29");
    assert.equal(shiftYears("2025-12-31", 1), "2026-12-31");
  });

  test("parseHash / buildHash round-trip", () => {
    assert.deepEqual(parseHash("#r=2&pt=2&api=0.5"), { r: "2", pt: "2", api: "0.5" });
    assert.deepEqual(parseHash("r=1"), { r: "1" });
    assert.deepEqual(parseHash(""), {});
    assert.deepEqual(parseHash(), {});
    assert.equal(buildHash({ r: 2, pt: 2, api: 0.5, skip: undefined, none: null }), "#r=2&pt=2&api=0.5");
    assert.equal(buildHash({}), "");
    const state = { r: "0.5", infl: "core pce", u: "cbo" };
    assert.deepEqual(parseHash(buildHash(state)), state);
  });
});

// ---------- fred-client.js ----------

describe("fred-client.js", () => {
  test("calls /api/fred with the series and start, resolves to the API body", async () => {
    const fetch = mockFetch();
    const { getSeries } = createFredClient({ fetch, storage: null });
    const body = await getSeries("unrate", { start: "2015-01-01" });
    assert.deepEqual(body, BODY);
    assert.equal(fetch.calls.length, 1);
    const url = new URL(fetch.calls[0], "http://x");
    assert.equal(url.pathname, "/api/fred");
    assert.equal(url.searchParams.get("series"), "UNRATE");
    assert.equal(url.searchParams.get("start"), "2015-01-01");
  });

  test("omits start when not given", async () => {
    const fetch = mockFetch();
    await createFredClient({ fetch, storage: null }).getSeries("UNRATE");
    assert.equal(fetch.calls[0], "/api/fred?series=UNRATE");
  });

  test("never calls FRED directly", async () => {
    const fetch = mockFetch();
    await createFredClient({ fetch, storage: null }).getSeries("CPIAUCSL");
    assert.ok(!fetch.calls[0].includes("stlouisfed.org"));
    assert.ok(!fetch.calls[0].includes("api_key"));
  });

  test("de-duplicates concurrent requests for the same series", async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const fetch = mockFetch(async () => {
      await gate;
      return jsonResponse(BODY);
    });
    const { getSeries } = createFredClient({ fetch, storage: null });
    const a = getSeries("UNRATE");
    const b = getSeries("UNRATE");
    const c = getSeries("UNRATE", { start: "2020-01-01" }); // different key -> separate request
    release();
    const [ra, rb] = await Promise.all([a, b, c]);
    assert.equal(ra, rb);
    assert.equal(fetch.calls.length, 2);
  });

  test("caches in memory: a second call doesn't refetch", async () => {
    const fetch = mockFetch();
    const { getSeries } = createFredClient({ fetch, storage: null });
    await getSeries("UNRATE");
    await getSeries("UNRATE");
    assert.equal(fetch.calls.length, 1);
  });

  test("sessionStorage cache survives a page change (new client, same storage)", async () => {
    const storage = new MemoryStorage();
    const first = mockFetch();
    await createFredClient({ fetch: first, storage }).getSeries("UNRATE");
    assert.equal(first.calls.length, 1);
    assert.equal(storage.length, 1);

    // Simulates Dashboard -> Quiz -> Dashboard: a fresh module instance on the next page.
    const second = mockFetch();
    const body = await createFredClient({ fetch: second, storage }).getSeries("UNRATE");
    assert.equal(second.calls.length, 0);
    assert.deepEqual(body, BODY);
  });

  test("cached entries expire after maxAgeMs", async () => {
    const storage = new MemoryStorage();
    let t = 1_000_000;
    const now = () => t;
    const fetch = mockFetch();
    await createFredClient({ fetch, storage, now, maxAgeMs: 1000 }).getSeries("UNRATE");
    t += 999;
    await createFredClient({ fetch, storage, now, maxAgeMs: 1000 }).getSeries("UNRATE");
    assert.equal(fetch.calls.length, 1);
    t += 1;
    await createFredClient({ fetch, storage, now, maxAgeMs: 1000 }).getSeries("UNRATE");
    assert.equal(fetch.calls.length, 2);
  });

  test("works when sessionStorage throws (blocked or full)", async () => {
    const fetch = mockFetch();
    const client = createFredClient({ fetch, storage: new ThrowingStorage() });
    assert.deepEqual(await client.getSeries("UNRATE"), BODY);
    assert.deepEqual(await client.getSeries("UNRATE"), BODY); // memory cache still works
    assert.equal(fetch.calls.length, 1);
    assert.doesNotThrow(() => client.clearCache());
  });

  test("ignores corrupt cache entries and refetches", async () => {
    const storage = new MemoryStorage();
    storage.setItem("fred:v1:UNRATE|", "{not json");
    storage.setItem("fred:v1:FEDFUNDS|", JSON.stringify({ t: Date.now(), body: { nope: true } }));
    const fetch = mockFetch();
    const { getSeries } = createFredClient({ fetch, storage });
    await getSeries("UNRATE");
    await getSeries("FEDFUNDS");
    assert.equal(fetch.calls.length, 2);
  });

  test("HTTP error: uses the function's error message, sets status/kind, isn't cached", async () => {
    let fail = true;
    const fetch = mockFetch(() =>
      fail ? jsonResponse({ error: "Unknown series. Allowed: ..." }, 400) : jsonResponse(BODY)
    );
    const storage = new MemoryStorage();
    const { getSeries } = createFredClient({ fetch, storage });
    await assert.rejects(getSeries("UNRATE"), (err) => {
      assert.ok(err instanceof FredError);
      assert.equal(err.kind, "http");
      assert.equal(err.status, 400);
      assert.equal(err.series, "UNRATE");
      assert.equal(err.message, "Unknown series. Allowed: ...");
      return true;
    });
    assert.equal(storage.length, 0);
    fail = false;
    assert.deepEqual(await getSeries("UNRATE"), BODY); // retry goes back to the network
    assert.equal(fetch.calls.length, 2);
  });

  test("HTTP error with a non-JSON body falls back to the status code", async () => {
    const fetch = mockFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    await assert.rejects(createFredClient({ fetch, storage: null }).getSeries("UNRATE"), {
      name: "FredError",
      kind: "http",
      status: 502,
      message: "Request failed (HTTP 502)",
    });
  });

  test("network failure becomes a friendly FredError", async () => {
    const fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(createFredClient({ fetch, storage: null }).getSeries("UNRATE"), (err) => {
      assert.equal(err.kind, "network");
      assert.match(err.message, /Couldn't reach the data server/);
      return true;
    });
  });

  test("200 with a non-JSON or malformed body is a bad-response error", async () => {
    for (const res of [
      () => new Response("not json", { status: 200 }),
      () => jsonResponse({ series: "UNRATE" }),
    ]) {
      await assert.rejects(createFredClient({ fetch: mockFetch(res), storage: null }).getSeries("UNRATE"), {
        kind: "bad-response",
      });
    }
  });

  test("empty observations is an error with a clear message", async () => {
    const fetch = mockFetch(() => jsonResponse({ ...BODY, observations: [] }));
    await assert.rejects(createFredClient({ fetch, storage: null }).getSeries("UNRATE"), {
      kind: "empty",
      message: "FRED returned no data for this series.",
    });
  });

  test("rejects bad ids and dates without a request", async () => {
    const fetch = mockFetch();
    const { getSeries } = createFredClient({ fetch, storage: null });
    for (const id of ["", "UN RATE", "UNRATE&units=pch", "../x", undefined]) {
      await assert.rejects(getSeries(id), { kind: "invalid" }, String(id));
    }
    await assert.rejects(getSeries("UNRATE", { start: "2015-1-1" }), { kind: "invalid" });
    assert.equal(fetch.calls.length, 0);
  });

  test("clearCache empties memory and only this client's sessionStorage keys", async () => {
    const storage = new MemoryStorage();
    storage.setItem("other-app", "keep me");
    const fetch = mockFetch();
    const client = createFredClient({ fetch, storage });
    await client.getSeries("UNRATE");
    client.clearCache();
    assert.equal(storage.getItem("other-app"), "keep me");
    assert.equal(storage.length, 1);
    await client.getSeries("UNRATE");
    assert.equal(fetch.calls.length, 2);
  });

  test("default export is importable in Node without sessionStorage", () => {
    assert.equal(typeof getSeries, "function");
  });
});

// ---------- nav.js ----------

describe("nav.js", () => {
  test("nav lists the five v2 destinations in order", () => {
    assert.deepEqual(
      NAV_ITEMS.map((i) => i.label),
      ["Dashboard", "Policy Lab", "Quiz", "Class Mode", "About"]
    );
  });

  test("exactly the current page gets aria-current=page", () => {
    for (const page of ["dashboard", "policy", "quiz", "present"]) {
      const html = navHTML(page);
      const current = [...html.matchAll(/<a href="([^"]+)" aria-current="page">([^<]+)<\/a>/g)];
      assert.equal(current.length, 1, page);
      assert.equal(current[0][1], NAV_ITEMS.find((i) => i.page === page).href, page);
      assert.equal((html.match(/aria-current/g) || []).length, 1, page);
    }
    assert.ok(!navHTML("about").includes("aria-current"));
    assert.ok(!navHTML(null).includes("aria-current"));
  });

  test("nav is a labelled <nav> with real links", () => {
    const html = navHTML("quiz");
    assert.match(html, /<nav aria-label="Main">/);
    assert.equal((html.match(/<a /g) || []).length, NAV_ITEMS.length + 1); // + brand link
    assert.match(html, /href="\.\/#about"/);
  });

  test("pageFromPath maps URLs (with or without .html) to page ids", () => {
    assert.equal(pageFromPath("/"), "dashboard");
    assert.equal(pageFromPath("/index.html"), "dashboard");
    assert.equal(pageFromPath("/policy.html"), "policy");
    assert.equal(pageFromPath("/quiz"), "quiz");
    assert.equal(pageFromPath("/present.html"), "present");
    assert.equal(pageFromPath("/nope.html"), null);
  });

  test("coming-soon stubs exist for every unbuilt page and escape copy", () => {
    for (const page of ["policy", "quiz", "present"]) {
      const html = comingSoonHTML(page);
      assert.match(html, /<h1>/, page);
      assert.match(html, /href="\.\/"/, page);
    }
    assert.equal(comingSoonHTML("nope"), "");
  });
});

// ---------- copy modules ----------

describe("copy modules", () => {
  test("content.js exports the page copy as plain data", () => {
    assert.equal(typeof content.SITE.title, "string");
    assert.equal(typeof content.SITE.tagline, "string");
    assert.ok(content.ABOUT.paragraphs.length >= 1);
    assert.match(content.FOOTER, /not endorsed or certified/);
    for (const page of ["policy", "quiz", "present"]) {
      const c = content.COMING_SOON[page];
      assert.ok(c.title && c.lead && c.bullets.length, page);
    }
  });

  test("indicators.js still describes the four v1 cards", () => {
    assert.deepEqual(
      INDICATORS.map((i) => i.id),
      ["CPIAUCSL", "UNRATE", "FEDFUNDS", "GDPC1"]
    );
  });
});
