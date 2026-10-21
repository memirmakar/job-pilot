// Settings > Claude usage: what was recorded, read only. costUsd is Claude Code's own estimate of what the calls would cost
// on the API; on a subscription it's a way to compare runs, not a bill. Runs from Stage 6 on record usage per kind (run.usage);
// older runs are summed from the job records created while they ran.
import fs from "node:fs";
import path from "node:path";
import { DATA } from "./config.mjs";

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const files = (dir, re = /\.json$/) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f)) : []);
const cost = (u) => Number(u?.costUsd) || 0;

export function usageReport({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const recs = files(path.join(DATA, "applications")).map(readJson).filter(Boolean);
  const runs = files(path.join(DATA, "runs"), /^\d{4}-.*\.json$/).map(readJson).filter((r) => r?.startedAt >= since && r.endedAt)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((r) => {
      const inRun = recs.filter((x) => x.createdAt >= r.startedAt && x.createdAt <= r.endedAt);
      const kinds = r.usage ? Object.fromEntries(Object.entries(r.usage).map(([k, v]) => [k, cost(v)])) : null;
      return {
        id: r.id, at: r.startedAt, dryRun: !!r.opts?.dryRun, stopKind: r.outcome?.stopKind || "",
        jobs: r.outcome?.analyzed ?? r.counts?.analyzed ?? inRun.length,
        costUsd: kinds ? Object.values(kinds).reduce((a, b) => a + b, 0) : inRun.reduce((a, x) => a + cost(x.usage), 0), kinds,
      };
    });
  // Jobs outside any run file (e.g. re-scores, or runs from before run files) still count in the totals
  const jobsCost = recs.filter((x) => (x.createdAt || "") >= since).reduce((a, x) => a + cost(x.usage), 0);
  const split = runs.filter((r) => r.kinds).reduce((o, r) => { for (const [k, v] of Object.entries(r.kinds)) o[k] = (o[k] || 0) + v; return o; }, {});
  const convs = files(path.join(DATA, "conversations")).map(readJson).filter((c) => c && (c.updatedAt || "") >= since);
  const lib = path.join(DATA, "library");
  const reviews = (fs.existsSync(lib) ? fs.readdirSync(lib) : []).map((d) => readJson(path.join(lib, d, "meta.json"))).filter((m) => m && (m.generatedAt || "") >= since);
  const market = readJson(path.join(DATA, "market", "review.json"));
  const doctor = files(path.join(DATA, "doctor")).map(readJson).filter((d) => d && (d.startedAt || "") >= since);
  const kinds = [
    { id: "jobs", n: recs.filter((x) => (x.createdAt || "") >= since).length, costUsd: jobsCost + (split.select || 0), split },
    { id: "coaching", n: convs.length, costUsd: convs.reduce((a, c) => a + cost(c), 0) },
    { id: "reviews", n: reviews.length + doctor.length + ((market?.generatedAt || "") >= since ? 1 : 0),
      costUsd: reviews.reduce((a, m) => a + cost(m.usage), 0) + ((market?.generatedAt || "") >= since ? cost(market.usage) : 0) + doctor.reduce((a, d) => a + cost(d.usage), 0) },
  ];
  return { days, since, runs, kinds, totalUsd: kinds.reduce((a, k) => a + k.costUsd, 0) };
}
