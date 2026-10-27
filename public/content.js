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
  ],
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
