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
  "Data: Federal Reserve Bank of St. Louis (FRED), U.S. Bureau of Labor Statistics, U.S. Bureau of Economic Analysis, Board of Governors of the Federal Reserve System, U.S. Congressional Budget Office. This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";

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

// Policy Lab page (policy.html), M8: Taylor rule. M9 adds `phillips` and `stance` sections alongside `taylor`.
// Everything here is PLAIN TEXT (render with textContent). Placeholders in {braces} are filled by policy.js.
// Symbols use Unicode: π, π*, r*, a_π, a_y, u*, ×, −, ≈.
export const POLICY_LAB = {
  title: "Policy Lab",
  intro:
    "Play Fed chair. The Taylor rule is a simple formula that sets the federal funds rate from two things: how far inflation is from target and how much slack the economy has. Set the dials, then compare the rate your rule suggests with the rate the Fed actually set since 1990. Where the lines split, ask why.",

  taylor: {
    heading: "Taylor rule",
    lead: "Your rule versus the real Fed, month by month.",

    // F39: what the model says, what it leaves out, one "try this" prompt.
    explainer: {
      heading: "How the Taylor rule works",
      whatItSays:
        "A recipe for the federal funds rate, proposed by economist John Taylor in 1993. Start at the neutral rate plus inflation. Then raise the rate when inflation is above target or the economy is running hot, and lower it when inflation is below target or there is slack (unused workers and capacity).",
      formulaWords:
        "Rule rate = neutral real rate + inflation + inflation weight × (inflation − target) + output-gap weight × output gap",
      formula: "i = r* + π + a_π × (π − π*) + a_y × gap",
      whyPiTwice:
        "Why inflation appears twice: the first π keeps the real rate (the rate minus inflation) at r* when everything is on target. The a_π term pushes the real rate above r* when inflation runs hot. So each 1-point rise in inflation raises the rule rate by 1 + a_π points, the “Taylor principle.”",
      onTarget:
        "Check: with r* = 2, inflation exactly at a 2% target and no output gap, the rule says 2 + 2 = 4%.",
      terms: [
        { symbol: "i", name: "Rule rate", definition: "the federal funds rate the formula suggests, in percent." },
        {
          symbol: "r*",
          name: "Neutral real rate (“r-star”)",
          definition:
            "the inflation-adjusted interest rate that neither speeds up nor slows down the economy; it can't be observed, only estimated.",
        },
        { symbol: "π", name: "Inflation", definition: "the price change over the past 12 months, using the measure you pick." },
        {
          symbol: "π*",
          name: "Inflation target",
          definition: "the inflation rate policy aims for; the Fed's is 2%, measured with PCE inflation.",
        },
        {
          symbol: "a_π",
          name: "Inflation weight",
          definition: "how many extra points the rule adds for each point inflation is above target.",
        },
        {
          symbol: "a_y",
          name: "Output-gap weight",
          definition: "how many points the rule adds for each percent the economy is above potential, or cuts for each percent below.",
        },
        {
          symbol: "gap",
          name: "Output gap",
          definition:
            "the percent difference between real GDP and potential GDP, the output the economy can sustain at maximum employment; negative means slack.",
        },
        {
          symbol: "u*",
          name: "Natural rate of unemployment",
          definition: "the unemployment rate when the economy is neither booming nor slumping; here, CBO's estimate.",
        },
      ],
      okun: {
        heading: "From unemployment to the output gap",
        text:
          "Potential GDP can't be measured directly, so the lab estimates the gap from unemployment with Okun's law, a rule of thumb from economist Arthur Okun: each point of unemployment above its natural rate goes with output about 2% below potential. The coefficient (about 2) is an average from past data, not a law of nature, so you can change it.",
        formula: "gap ≈ −Okun coefficient × (u − u*)",
        example:
          "Example: u = 5%, u* = 4%, coefficient 2 → gap ≈ −2 × 1 = −2%. With a_y = 0.5, the rule rate is 1 point lower than with no gap.",
      },
      uStar:
        "u* is the Congressional Budget Office's “noncyclical rate of unemployment” (FRED series NROU): its estimate of unemployment not caused by booms and busts. CBO also publishes projections years ahead; the lab uses only quarters up to the latest unemployment data and holds each quarter's value for its three months.",
      whatItLeavesOut:
        "What it leaves out: the Fed's other tools (buying bonds, called quantitative easing or QE, and forward guidance, meaning statements about future rates), financial conditions such as credit and stock prices, risks that aren't in today's numbers, and whether inflation comes from supply or demand. It also uses today's revised data, not the numbers the Fed saw at the time.",
      tryThis:
        "Drag r* from 2 down to 0.5, closer to recent estimates. How far does the whole rule line move, and why exactly that much?",
      caveatsHeading: "Read this before you judge the Fed",
      caveats: [
        "A benchmark, not a requirement. The Fed is not required to follow any rule. The FOMC (the Fed committee that sets rates) looks at several rules and much more data, then uses judgment.",
        "r* is uncertain. Taylor assumed 2 in 1993. Recent estimates, such as the Laubach-Williams model and the FOMC's longer-run projections, are lower, roughly 0.5 to 1.5, and they disagree with each other. Nobody observes the true value.",
        "The answer depends on the inputs. A different inflation measure, u*, Okun coefficient or set of weights can move the rule rate by a point or more. Treat the line as a range of reasonable answers, not one right number.",
      ],
    },

    // Inflation select. Keys are FRED series ids; PCEPILFE is the default.
    inflation: {
      label: "Inflation measure",
      defaultWhy:
        "Core PCE is the default because the Fed's 2% target is defined for PCE inflation (the price index for personal consumption expenditures). “Core” leaves out food and energy, whose prices swing with weather and oil markets, so it is a steadier read on underlying inflation. The target itself is headline (all-items) PCE.",
      options: {
        PCEPILFE: { label: "Core PCE (default)", note: "PCE excluding food and energy; steadier, and the Fed watches it closely." },
        PCEPI: { label: "PCE", note: "All-items PCE, the measure the Fed's 2% target is defined on." },
        CPIAUCSL: {
          label: "CPI",
          note: "Consumer price index from the BLS. It usually runs a few tenths above PCE, so against a 2% target the rule tends to come out a bit higher.",
        },
      },
    },

    // F32. Presets are matched on rStar, piStar, aPi, aY only (not Okun, u* or the inflation measure).
    // Any other combination shows as `custom`.
    presets: {
      label: "Presets",
      taylor1993: {
        label: "Taylor (1993)",
        description: "John Taylor's original rule: r* = 2, target 2%, weight 0.5 on inflation and 0.5 on the output gap.",
        note: "Taylor measured inflation with the GDP deflator; here you pick the measure.",
        values: { rStar: 2, piStar: 2, aPi: 0.5, aY: 0.5 },
      },
      balanced: {
        label: "Balanced approach",
        description:
          "Same as Taylor (1993) but with twice the weight on the output gap (a_y = 1.0), a version shown in the Fed's Monetary Policy Report. It reacts more to unemployment.",
        note: "The Fed's report plugs in a current r* estimate; here r* stays at 2 so only the weight changes.",
        values: { rStar: 2, piStar: 2, aPi: 0.5, aY: 1.0 },
      },
      custom: {
        label: "Your rule",
        description: "Your own settings. Move any slider to build a rule, then compare it with what the Fed did.",
      },
    },

    // F31 sliders/inputs. Ranges and defaults live in policy.js (PRD F31); this is copy only.
    controls: {
      heading: "Set the dials",
      rStar: {
        label: "Neutral real rate, r*",
        help: "The real rate that neither speeds up nor slows the economy. Taylor used 2; recent estimates are roughly 0.5 to 1.5. Changing it shifts the whole rule line by the same amount.",
      },
      piStar: {
        label: "Inflation target, π*",
        help: "The inflation rate policy aims for. The Fed's target is 2%, measured with PCE inflation.",
      },
      aPi: {
        label: "Inflation weight, a_π",
        help: "Extra points of interest rate for each point inflation is above target. Above 0, the rule raises the rate by more than inflation rose, so the real rate goes up.",
      },
      aY: {
        label: "Output-gap weight, a_y",
        help: "Points of interest rate for each percent of output gap. Higher means the rule reacts more to slack and unemployment: 0.5 in Taylor (1993), 1.0 in the balanced approach.",
      },
      okun: {
        label: "Okun coefficient",
        help: "Percent of output lost for each point unemployment is above u*. About 2 in past U.S. data; estimates vary.",
      },
      uStar: {
        label: "Natural rate of unemployment, u*",
        help: "Use CBO's estimate, which changes over time, or fix one value for every year to see how much this choice matters.",
        cboOption: "CBO estimate (changes over time)",
        fixedOption: "Fixed value",
        fixedLabel: "u* (fixed), %",
      },
    },

    // F34.
    zlb: {
      label: "Respect the zero lower bound",
      help: "The Fed has never set its policy rate below zero. When the rule called for negative rates, the Fed held its target range at 0 to 0.25% (December 2008 to December 2015 and March 2020 to March 2022) and used other tools, such as QE and forward guidance. Turn this on to floor the rule at 0.",
      legendNote: "Rule floored at 0",
    },

    // F33. {x} = absolute difference, rounded as displayed (1 decimal). Pick `same` when it rounds to 0.0.
    rightNow: {
      heading: "Right now",
      asOf: "Latest month with all inputs: {date}",
      ruleRate: "Rule rate",
      actualRate: "Actual fed funds rate",
      actualHelp: "The effective federal funds rate: the average rate banks charge each other for overnight loans, the rate the Fed targets.",
      difference: "Rule minus actual (percentage points)",
      inflation: "Inflation ({measure})",
      unemployment: "Unemployment rate",
      uStar: "Natural rate, u*",
      outputGap: "Estimated output gap",
      higher: "The rule says rates should be {x} points higher than they are.",
      lower: "The rule says rates should be {x} points lower than they are.",
      same: "The rule rate and the actual rate are about the same.",
      floored: "The rule is shown at 0 because the zero-lower-bound toggle is on; without it, the rule would be {x}%.",
      formulaHeading: "The formula with today's numbers",
      formulaTemplate: "{i} = {rStar} + {pi} + {aPi} × ({pi} − {piStar}) + {aY} × ({gap})",
      gapTemplate: "gap ≈ −{okun} × ({u} − {uStar}) = {gap}",
      note: "This is what the formula says with your settings, not a prediction of what the Fed will do.",
    },

    // F30 chart.
    chart: {
      heading: "Rule rate vs. actual fed funds rate",
      ruleLine: "Rule rate ({preset})",
      actualLine: "Effective fed funds rate",
      yAxis: "Percent",
      zeroLine: "0%",
      ariaLabel:
        "Line chart comparing the rule-implied interest rate with the effective federal funds rate over time, with recessions shaded",
    },

    // F35.
    share: {
      copyLink: "Copy link to this scenario",
      copied: "Link copied. Anyone who opens it sees these settings.",
      copyFailed: "Couldn't copy automatically. Copy the address from your browser's address bar instead.",
    },

    errors: {
      missingSeries: "Couldn't load {name} right now, so the rule line can't be drawn. Try again in a minute.",
      uStarFallback: "CBO's u* estimate didn't load, so the lab is using a fixed u* of {x}% instead.",
    },

    tryThis: {
      heading: "Try this",
      prompts: [
        "Drag r* from 2 down to 0.5, closer to recent estimates. How far does the whole rule line move, and why exactly that much?",
        "Switch from Taylor (1993) to Balanced approach. In which years does the line move most? Hint: look for years when unemployment was far from u*.",
        "Turn the zero lower bound off and find 2009. How far below zero does the rule go? What did the Fed do instead of cutting below zero?",
        "Change the inflation measure from core PCE to CPI. Why does the rule rate usually come out a bit higher?",
        "Zoom in on 2020 to 2024. When was the rule rate furthest above the actual rate, and when did the two lines meet again?",
      ],
    },

    // Data source/citation note. Source agencies per series come from SOURCES above.
    sources: {
      heading: "Data and sources",
      note: "All data from FRED (Federal Reserve Bank of St. Louis), as currently revised. Inflation is the change from 12 months earlier. CBO's quarterly u* is held for each of its three months. Shaded bands mark recessions as dated by the NBER.",
      series: [
        { id: "FEDFUNDS", name: "Effective federal funds rate" },
        { id: "PCEPILFE", name: "PCE price index excluding food and energy (core PCE)" },
        { id: "PCEPI", name: "PCE price index" },
        { id: "CPIAUCSL", name: "Consumer price index for all urban consumers (CPI)" },
        { id: "UNRATE", name: "Unemployment rate" },
        { id: "NROU", name: "Noncyclical rate of unemployment" },
        { id: "USREC", name: "NBER-based recession indicator" },
      ],
      references: [
        {
          text: "Taylor, J. B. (1993). Discretion versus policy rules in practice. Carnegie-Rochester Conference Series on Public Policy, 39, 195–214.",
          url: "https://doi.org/10.1016/0167-2231(93)90009-L",
        },
        {
          text: "Board of Governors of the Federal Reserve System. Policy rules and how policymakers use them.",
          url: "https://www.federalreserve.gov/monetarypolicy/policy-rules-and-how-policymakers-use-them.htm",
        },
      ],
    },
  },
};
