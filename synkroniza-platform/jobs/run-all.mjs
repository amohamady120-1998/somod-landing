// Runs every daily job in order; one failing job never stops the others.
import { jobStatus } from "./lib.mjs";
import * as etimad from "./etimad.mjs";
import * as news from "./news.mjs";
import * as inbox from "./inbox.mjs";
import * as digest from "./digest.mjs";

let failed = 0;
for (const [name, job] of [["etimad", etimad], ["news", news], ["inbox", inbox], ["digest", digest]]) {
  try { await job.run(); } catch (e) { failed++; await jobStatus(name, false, String(e.message || e)).catch(() => {}); }
}
process.exit(failed === 4 ? 1 : 0);
