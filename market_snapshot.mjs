// One small snapshot of what the LinkedIn searches returned, saved per run (from Stage 4 on) so the Job market tab can show trends:
// data/market/snapshots.json = [{ at run listings fields{} cities{} workplace{remote hybrid onsite unknown} easyApply companies{name: {n field}} }]
import fs from "node:fs";
import path from "node:path";
import { DATA } from "./config.mjs";

const FILE = path.join(DATA, "market", "snapshots.json");
const KEEP = 200;

export const loadSnapshots = () => { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; } };
// "Istanbul, Türkiye" -> "Istanbul"; "Türkiye" stays a country
export const cityOf = (loc) => String(loc || "").split(",")[0].replace(/\s*\(.*\)$/, "").trim() || "Unknown";

// listings: the run's collected cards { id title company location workplace easyApply targetField }
export function saveSnapshot(runId, listings) {
  if (!listings.length) return null;
  const tally = (f) => listings.reduce((m, c) => { const k = f(c); m[k] = (m[k] || 0) + 1; return m; }, {});
  const companies = {};
  for (const c of listings) if (c.company) { const e = (companies[c.company] ||= { n: 0, field: c.targetField || "Other" }); e.n++; }
  const top = Object.fromEntries(Object.entries(companies).sort((a, b) => b[1].n - a[1].n).slice(0, 40));
  const snap = {
    at: new Date().toISOString(), run: runId, listings: listings.length,
    fields: tally((c) => c.targetField || "Other"), cities: tally((c) => cityOf(c.location)),
    workplace: { remote: 0, hybrid: 0, onsite: 0, unknown: 0, ...tally((c) => c.workplace || "unknown") },
    easyApply: listings.filter((c) => c.easyApply).length, companies: top,
  };
  const all = [...loadSnapshots(), snap].slice(-KEEP);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 1));
  return snap;
}
