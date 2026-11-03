// Client for /api/bls (BLS Public Data API behind a Netlify Function). Same behavior as the FRED client
// (errors, in-flight dedupe, sessionStorage cache) with its own endpoint and cache prefix.
import { createFredClient } from "./fred-client.js";

const client = createFredClient({ endpoint: "/api/bls", cachePrefix: "bls:v1:", sourceName: "BLS" });

/** `const { observations } = await getBlsSeries("LNS14000000", { start })` */
export const getBlsSeries = client.getSeries;
export const clearBlsCache = client.clearCache;
