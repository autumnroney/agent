// Client data layer (owned by the frontend-engineer agent).
// getSeries(id, { start }) calls /api/fred (never FRED directly), normalizes errors, shares in-flight
// requests, and caches successful responses in memory and in sessionStorage so moving between pages
// in the same tab doesn't refetch. No DOM access at import time; storage is optional.

const ID_RE = /^[A-Z0-9]{1,30}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_PREFIX = "fred:v1:";
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000; // matches the function's Cache-Control: max-age=3600

/** Every getSeries failure is a FredError with a student-readable message. */
export class FredError extends Error {
  /**
   * @param {string} message  plain-English message, safe to show in a card
   * @param {{ series?: string, status?: number, kind: "invalid"|"network"|"http"|"bad-response"|"empty" }} info
   */
  constructor(message, { series, status = 0, kind }) {
    super(message);
    this.name = "FredError";
    this.series = series;
    this.status = status;
    this.kind = kind;
  }
}

function defaultStorage() {
  try {
    return globalThis.sessionStorage ?? null; // accessing it can throw when storage is blocked
  } catch {
    return null;
  }
}

/**
 * Build a client. Pages use the default `getSeries` export; tests inject `fetch`, `storage` and `now`.
 * @param {{ fetch?: typeof fetch, storage?: Storage|null, endpoint?: string, maxAgeMs?: number, now?: () => number }} [opts]
 */
export function createFredClient(opts = {}) {
  const endpoint = opts.endpoint ?? "/api/fred";
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = opts.now ?? (() => Date.now());
  const getFetch = () => opts.fetch ?? globalThis.fetch;
  const getStorage = () => ("storage" in opts ? opts.storage : defaultStorage());

  const memory = new Map(); // key -> { t, body }
  const inFlight = new Map(); // key -> Promise<body>

  function readStored(key) {
    const mem = memory.get(key);
    if (mem && now() - mem.t < maxAgeMs) return mem.body;
    try {
      const raw = getStorage()?.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || typeof entry.t !== "number" || !Array.isArray(entry.body?.observations)) return null;
      if (now() - entry.t >= maxAgeMs) return null;
      memory.set(key, entry);
      return entry.body;
    } catch {
      return null; // blocked storage or corrupt JSON: just refetch
    }
  }

  function writeStored(key, body) {
    const entry = { t: now(), body };
    memory.set(key, entry);
    try {
      getStorage()?.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Quota exceeded or storage disabled: the in-memory copy still serves this page.
    }
  }

  async function request(id, start) {
    const params = new URLSearchParams({ series: id });
    if (start) params.set("start", start);
    const doFetch = getFetch();

    let res;
    try {
      res = await doFetch(`${endpoint}?${params}`);
    } catch {
      throw new FredError("Couldn't reach the data server. Check your connection and try again.", {
        series: id,
        kind: "network",
      });
    }

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      const msg = typeof body?.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status})`;
      throw new FredError(msg, { series: id, status: res.status, kind: "http" });
    }
    if (!body || !Array.isArray(body.observations)) {
      throw new FredError("The data server sent an unexpected response.", {
        series: id,
        status: res.status,
        kind: "bad-response",
      });
    }
    if (body.observations.length === 0) {
      throw new FredError("FRED returned no data for this series.", { series: id, status: res.status, kind: "empty" });
    }
    return body;
  }

  /**
   * Fetch one whitelisted series through /api/fred.
   * Resolves to the API body `{ series, title, units, frequency, observations: [{date, value}] }`.
   * Treat the result as read-only: it is shared with every other caller of the same series.
   * Rejects with a FredError.
   * @param {string} id  FRED series id, e.g. "UNRATE"
   * @param {{ start?: string }} [options]  start as YYYY-MM-DD
   */
  function getSeries(id, { start } = {}) {
    const sid = String(id ?? "").toUpperCase();
    if (!ID_RE.test(sid)) {
      return Promise.reject(new FredError("Unknown data series.", { series: sid, kind: "invalid" }));
    }
    if (start && !DATE_RE.test(start)) {
      return Promise.reject(new FredError("Start date must be YYYY-MM-DD.", { series: sid, kind: "invalid" }));
    }

    const key = `${sid}|${start || ""}`;
    const cached = readStored(key);
    if (cached) return Promise.resolve(cached);
    if (inFlight.has(key)) return inFlight.get(key);

    const p = request(sid, start)
      .then((body) => {
        writeStored(key, body);
        return body;
      })
      .finally(() => inFlight.delete(key)); // failures aren't cached, so a later call retries
    inFlight.set(key, p);
    return p;
  }

  /** Forget cached responses (memory and sessionStorage) for this client's prefix. */
  function clearCache() {
    memory.clear();
    try {
      const storage = getStorage();
      if (!storage) return;
      const keys = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => storage.removeItem(k));
    } catch {
      // storage unavailable: nothing persisted to clear
    }
  }

  return { getSeries, clearCache };
}

const defaultClient = createFredClient();

/** Shared default client for pages: `const { observations } = await getSeries("UNRATE")`. */
export const getSeries = defaultClient.getSeries;
export const clearCache = defaultClient.clearCache;
