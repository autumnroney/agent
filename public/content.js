// Site copy that isn't tied to one indicator (owned by the econ-content-writer agent).
// Plain data only: no DOM access, so Node tests can import it.
// Fields marked "HTML" are trusted, static markup rendered with innerHTML; everything else is plain text.

export const SITE = {
  name: "FRED Macro Dashboard",
  // Dashboard header (index.html).
  title: "FRED Macro Dashboard",
  tagline:
    "Four numbers the Federal Reserve watches most, updated live from the St. Louis Fed, and what each one actually means.",
};

// About section on the dashboard. Each entry is one paragraph (HTML).
export const ABOUT = {
  heading: "About",
  paragraphs: [
    "Built by <strong>Autumn Roney, M.S. Economics, Florida Atlantic University</strong>, for students in Principles of Macroeconomics who want to connect what's in the textbook to what's happening in the economy right now.",
    'All data come from <a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener">FRED</a>, the free economic database run by the Federal Reserve Bank of St. Louis. Figures are seasonally adjusted and update automatically when new data are released. Tip: switch to the 20Y view to see the 2008–09 Great Recession and the 2020 pandemic shock.',
    'Gray bands on the charts mark recessions as dated by the <a href="https://www.nber.org/research/business-cycle-dating" target="_blank" rel="noopener">National Bureau of Economic Research (NBER)</a>, the group of economists that officially calls U.S. recessions. They look at jobs, income, spending and output, not just “two negative quarters” of GDP.',
  ],
};

// One-paragraph auto summary at the top of the dashboard (F24). The sentences themselves are generated
// from the data by lib/narrate.js; this is the label around them.
export const SUMMARY = {
  heading: "The latest numbers",
  note: "Each change compares the latest month (or quarter) with the same month a year earlier.",
};

// Recession shading legend (F20), shown under every time-series chart.
export const RECESSION_SHADING = {
  note: "Shaded = recession (NBER)",
  unavailable: "Recession shading is unavailable right now; the data are unaffected.",
};

// Recession Watch panel (F23). Plain text. Signals, never forecasts.
export const RECESSION_WATCH = {
  heading: "Recession Watch",
  intro:
    "Two warning signs economists watch, computed from the latest FRED data. Both have flagged past recessions, and both have also given false alarms. Neither is a forecast.",
  sahm: {
    title: "Sahm rule",
    formula: "3-month average unemployment rate minus its lowest 3-month average in the previous 12 months",
    what:
      "Named for economist Claudia Sahm. When the 3-month average unemployment rate climbs 0.50 percentage points or more above its low of the past year, the U.S. has usually been in the early months of a recession.",
    signalLabel: "signal at 0.50",
    triggered: "Signal reached",
    notTriggered: "Below the signal",
    caveat:
      "A historical pattern, not a forecast. It reached 0.50 in mid-2024 without a recession being declared. We compute it from today's revised unemployment data, so it can differ slightly from FRED's real-time version (SAHMREALTIME), which uses the numbers as first reported.",
    chartLabel: "Sahm rule reading over time, with the 0.50 signal line",
    thresholdLine: "0.50 signal",
  },
  yieldCurve: {
    title: "Yield curve (10-year minus 3-month)",
    what:
      "The 10-year Treasury yield minus the 3-month yield, averaged over each month. Usually long-term rates are higher. When the spread drops below zero the curve is “inverted”: markets expect short-term rates to be lower in the future, often because they expect the economy to weaken.",
    inverted: "Inverted",
    notInverted: "Not inverted",
    caveat:
      "An inverted curve came before every U.S. recession since the late 1960s, but the lead time was long and varied, often a year or more. The curve stayed inverted from late 2022 into 2024 without a recession in that period. A signal to watch, not a prediction.",
    chartLabel: "10-year minus 3-month Treasury spread over time, with a zero line",
    zeroLine: "0 (below = inverted)",
    legendBelowZero: "Below zero = inverted",
  },
};

// Labels for the per-chart tools (F21, F22). Plain text; "{n}" is replaced with a number.
export const CHART_UI = {
  downloadCSV: "Download CSV",
  showTable: "Show data table",
  hideTable: "Hide data table",
  showAll: "Show all {n} rows",
  showFewer: "Show latest {n} rows",
  tableCaption: "{name}, {range} view, newest first",
  dateHeader: "Date",
  valueHeader: "Value",
  measureLabel: "Inflation measure",
  targetLegend: "2% target (PCE)",
};

// Original source agency per series, as FRED lists them (used in CSV headers now, citations in M11).
export const SOURCES = {
  CPIAUCSL: "U.S. Bureau of Labor Statistics",
  UNRATE: "U.S. Bureau of Labor Statistics",
  FEDFUNDS: "Board of Governors of the Federal Reserve System",
  GDPC1: "U.S. Bureau of Economic Analysis",
  PCEPI: "U.S. Bureau of Economic Analysis",
  PCEPILFE: "U.S. Bureau of Economic Analysis",
  USREC: "Federal Reserve Bank of St. Louis", // based on NBER recession dates
  T10Y3M: "Federal Reserve Bank of St. Louis",
  NROU: "U.S. Congressional Budget Office",
};

// Shared footer on every page (plain text).
export const FOOTER =
  "Data: Federal Reserve Bank of St. Louis (FRED), U.S. Bureau of Labor Statistics, U.S. Bureau of Economic Analysis, Board of Governors of the Federal Reserve System. This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";

// "Coming soon" stubs for pages that later milestones build. Keyed by page id (see lib/nav.js).
// `lead` is plain text; `bullets` preview what the page will do.
export const COMING_SOON = {
  policy: {
    title: "Policy Lab",
    lead: "Try the economics models from your textbook on real data.",
    bullets: [
      "Taylor rule: set the neutral rate, the inflation target and the weights, then compare the rate the rule suggests with the rate the Fed actually set.",
      "Phillips curve: unemployment against inflation, month by month since 1948, colored by era, so you can see where the textbook tradeoff holds and where it breaks.",
      "Policy stance: the real interest rate (the fed funds rate minus inflation) compared with a neutral rate, a rough guide to whether policy is tight or loose.",
    ],
  },
  quiz: {
    title: "Quiz",
    lead: "Short practice rounds built from the latest FRED data, so the questions are never out of date.",
    bullets: [
      "Live-data questions, such as whether unemployment is higher or lower than a year ago.",
      "Concept questions with a short explanation of why the right answer is right and why the tempting wrong one is wrong.",
      "An “estimate first” mode: guess today's number before you see it.",
    ],
  },
  present: {
    title: "Class Mode",
    lead: "Lecture-ready slides that build themselves from the latest data.",
    bullets: [
      "One slide per indicator with the latest number and the change from a year earlier.",
      "A “then vs. now” comparison for any month since 1960.",
      "Copy-ready citations and a printable one-page handout.",
    ],
  },
};

// Shared text on every "Coming soon" page.
export const COMING_SOON_COMMON = {
  eyebrow: "Coming soon",
  back: "In the meantime, the Dashboard has live charts of all four indicators.",
  backLink: "Go to the Dashboard",
};
