import { test } from "node:test";
import assert from "node:assert/strict";
import { yearAgo } from "../public/lib/econ.js";

const monthly = (start, values) => {
  const [y, m] = start.split("-").map(Number);
  return values.map((value, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return { date: d.toISOString().slice(0, 10), value };
  });
};

test("yearAgo: monthly series returns the same month one year earlier", () => {
  const obs = monthly("2024-09-01", [4.1, 4.1, 4.2, 4.2, 4.0, 4.1, 4.2, 4.2, 4.1, 4.2, 4.2, 4.3, 4.3]);
  assert.equal(obs.at(-1).date, "2025-09-01");
  assert.deepEqual(yearAgo(obs), { date: "2024-09-01", value: 4.1 });
});

test("yearAgo: quarterly series returns the same quarter one year earlier", () => {
  const obs = [
    { date: "2024-04-01", value: 3.0 },
    { date: "2024-07-01", value: 3.1 },
    { date: "2024-10-01", value: 2.4 },
    { date: "2025-01-01", value: -0.5 },
    { date: "2025-04-01", value: 3.8 },
    { date: "2025-07-01", value: 2.9 },
  ];
  assert.deepEqual(yearAgo(obs), { date: "2024-07-01", value: 3.1 });
});

test("yearAgo: a missing month falls back to the latest earlier observation (by date, not index)", () => {
  // Oct 2024 is missing (e.g. a skipped release); the series has 12 points, so index math would be wrong.
  const obs = monthly("2024-08-01", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).filter(
    (o) => o.date !== "2024-10-01"
  );
  assert.equal(obs.at(-1).date, "2025-09-01");
  assert.deepEqual(yearAgo(obs), { date: "2024-09-01", value: 2 });

  const gap = obs.filter((o) => o.date !== "2024-09-01");
  assert.deepEqual(yearAgo(gap), { date: "2024-08-01", value: 1 });
});

test("yearAgo: returns null when history is shorter than a year or empty", () => {
  assert.equal(yearAgo(monthly("2025-01-01", [1, 2, 3, 4, 5, 6])), null);
  assert.equal(yearAgo([]), null);
  assert.equal(yearAgo(undefined), null);
  assert.equal(yearAgo([{ date: "2025-01-01", value: 1 }]), null);
});

test("yearAgo: daily-dated Feb 29 compares with Feb 28 of the prior year", () => {
  const obs = [
    { date: "2023-02-27", value: 1 },
    { date: "2023-02-28", value: 2 },
    { date: "2023-03-01", value: 3 },
    { date: "2024-02-29", value: 4 },
  ];
  assert.deepEqual(yearAgo(obs), { date: "2023-02-28", value: 2 });
});
