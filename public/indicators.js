// Indicator metadata and plain-English copy (owned by the econ-content-writer agent).
export const INDICATORS = [
  {
    id: "CPIAUCSL",
    name: "Inflation (CPI)",
    unit: "%",
    unitNote: "Consumer Price Index, % change from a year ago",
    color: "--c1",
    what:
      "How much more a typical basket of goods and services (rent, groceries, gas, haircuts) costs than it did a year ago. If this reads 3%, what cost $100 last year costs about $103 today.",
    whyFed:
      "Stable prices are half of the Fed's mandate from Congress. When inflation runs hot, the Fed usually raises interest rates to cool spending; when it's low and the economy is weak, it cuts them.",
    goodToKnow:
      "The Fed's official 2% target is measured with a different index (PCE inflation), which tends to run a bit below CPI. CPI is the one you'll see in headlines and in Social Security raises.",
  },
  {
    id: "UNRATE",
    name: "Unemployment rate",
    unit: "%",
    unitNote: "% of the labor force, seasonally adjusted",
    color: "--c2",
    what:
      "The share of people who want a job, are available, and have looked for work in the past four weeks but don't have one. Someone who has given up looking isn't counted.",
    whyFed:
      "Maximum employment is the other half of the Fed's mandate. Rising unemployment often signals a slowing economy, which pushes the Fed toward lower rates.",
    goodToKnow:
      "It never goes to zero: people are always between jobs or just entering the workforce. Economists think of roughly 4% as \"full employment\" for the U.S. today.",
  },
  {
    id: "FEDFUNDS",
    name: "Federal funds rate",
    unit: "%",
    unitNote: "Effective rate, monthly average",
    color: "--c3",
    what:
      "The interest rate banks charge each other for overnight loans. The Fed's policy committee (the FOMC) sets a target range for it about eight times a year; this is the rate that actually happens.",
    whyFed:
      "It's the Fed's main lever. Raising it makes borrowing more expensive across the economy, slowing spending and inflation. Cutting it does the reverse to support jobs and growth.",
    goodToKnow:
      "You never pay this rate directly, but it ripples into what you do pay: credit cards, car loans, student loans and mortgages, and what your savings account earns.",
  },
  {
    id: "GDPC1",
    name: "Real GDP growth",
    unit: "%",
    unitNote: "Quarterly, % change at an annual rate",
    color: "--c4",
    what:
      "How fast the total output of the U.S. economy is growing, adjusted for inflation (that's what \"real\" means). Each point is one quarter's growth, scaled up to a yearly pace.",
    whyFed:
      "Growth tells the Fed whether demand is running too hot (fueling inflation) or too cold (threatening jobs). It's a key input when deciding whether to raise or cut rates.",
    goodToKnow:
      "Two negative quarters in a row is a popular rule of thumb for a recession, but the official call is made by economists at the NBER, who look at jobs, income and spending too.",
  },
];

// Range buttons: label -> years back (null = all available history).
export const RANGES = [
  { label: "1Y", years: 1 },
  { label: "5Y", years: 5 },
  { label: "10Y", years: 10 },
  { label: "20Y", years: 20 },
  { label: "Max", years: null },
];
export const DEFAULT_RANGE = "10Y";
