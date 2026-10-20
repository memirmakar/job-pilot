// Data for the Insights screen (GET /api/insights) that only the server can work out: each job's field (market.mjs segmentOf),
// the jobs Claude read but didn't pick (applications.csv), the to-do items (todo.mjs) and the job market numbers
// from records, the activity log and the per-run snapshots (market_snapshot.mjs). The screen does the counting by period.
import { loadConfig } from "./config.mjs";
import { loadAllRecords, readLog } from "./store.mjs";
import { segmentOf } from "./market.mjs";
import { items, loadGroups, jobSteps, hash } from "./todo.mjs";
import { pendingCount } from "./todo_group.mjs";
import { loadSnapshots, cityOf } from "./market_snapshot.mjs";

const DAY = 864e5;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
// "33 başvuru", "100’den fazla başvuru", "Over 100 applicants", "12 kişi Başvur’u tıkladı" -> 33, 100 (+), 100 (+), 12
export function applicantsOf(text) {
  const n = Number(String(text || "").match(/\d[\d.,]*/)?.[0]?.replace(/[.,]/g, ""));
  return Number.isFinite(n) && n > 0 ? { n, plus: /fazla|over|\+/i.test(text), clicks: /tıkladı|clicked/i.test(text) } : null;
}
const REMOTE = /remote|uzaktan/i;
// Card text that isn't a company name (anonymous postings, a workplace line read as the company)
const NOT_A_COMPANY = /^(remote|hybrid|on-?site|uzaktan|hibrit|gizli( şirket)?|confidential)$/i;

export function buildInsights() {
  const cfg = loadConfig(), records = loadAllRecords(), log = readLog();
  const fields = (cfg.targets || []).map((t) => t.field);
  const jobFields = Object.fromEntries(records.map((r) => [`${r.site}-${r.id}`, segmentOf(r)]));
  const recIds = new Set(records.map((r) => r.id));
  // Read by Claude, not picked (only poor fits are logged; jobs that just missed the day's quota aren't)
  const notPicked = [...new Map(log.filter((l) => l.status === "not_selected" && !recIds.has(l.id))
    .map((l) => [l.id, { id: l.id, at: l.date, field: segmentOf(l.title) }])).values()];
  const list = items({ records });
  // Each job's steps (in the order its card shows them) -> the to-do item they belong to
  const itemOf = new Map(list.flatMap((i) => i.keys.map((k) => [k, i.id])));
  const jobItems = Object.fromEntries(records.map((r) => [`${r.site}-${r.id}`,
    jobSteps(r).filter((x) => x.action).map((x) => itemOf.get(`r:${r.site}-${r.id}:${hash(x.action)}`) || null)]));
  return {
    fields, jobFields, notPicked, jobItems,
    todo: { items: list.map(({ keys, ...i }) => i), pending: pendingCount(), groupedAt: loadGroups().at },
    market: market(records, log, fields),
  };
}

function market(records, log, fields) {
  const snaps = loadSnapshots();
  // Every listing the app has seen: records plus activity log rows (filtered, not picked, closed…), one per id
  const seen = new Map();
  for (const l of log) if (l.id && l.title && l.status !== "status") seen.set(l.id, { at: l.date, title: l.title, company: l.company, field: null });
  for (const r of records) seen.set(r.id, { at: r.createdAt, title: r.title, company: r.company, field: r.field || null, rec: r });
  const all = [...seen.values()].map((s) => ({ ...s, field: s.field || segmentOf(s.title) }));
  const dates = all.map((s) => s.at).filter(Boolean).sort();
  const byField = {};
  for (const s of all) byField[s.field] = (byField[s.field] || 0) + 1;

  // Cities and remote share: the latest run's search when there's a snapshot, else the records that saved a location
  const last = snaps.at(-1);
  const located = records.filter((r) => r.location);
  const cities = last ? last.cities : located.reduce((m, r) => { const c = cityOf(r.location); m[c] = (m[c] || 0) + 1; return m; }, {});
  const remote = last ? { n: last.workplace.remote, of: last.listings, from: "search" }
    : { n: located.filter((r) => REMOTE.test(r.location)).length, of: located.length, from: "records" };

  const appl = records.map((r) => ({ r, a: applicantsOf(r.applicants) })).filter((x) => x.a && !x.a.clicks);
  const clicks = records.map((r) => applicantsOf(r.applicants)).filter((a) => a?.clicks);
  // How fast postings fill: posted -> archived as closed, in days
  const filled = records.filter((r) => r.archived && r.postedAt && !/by you/i.test(r.archived.reason || "")).map((r) => (Date.parse(r.archived.at) - Date.parse(r.postedAt)) / DAY).filter((d) => d >= 0);

  // Companies that keep hiring: 2+ listings in your fields
  const co = new Map();
  for (const s of all) {
    if (!s.company || s.field === "Other" || NOT_A_COMPANY.test(s.company.trim().normalize("NFKD").replace(/\p{M}/gu, ""))) continue;
    const e = co.get(s.company) || { name: s.company, n: 0, fields: {}, latest: null };
    e.n++; e.fields[s.field] = (e.fields[s.field] || 0) + 1;
    if (s.rec && (!e.latest || s.rec.createdAt > e.latest.createdAt)) e.latest = s.rec;
    co.set(s.company, e);
  }
  const companies = [...co.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n).slice(0, 8).map((c) => ({
    name: c.name, n: c.n, field: Object.entries(c.fields).sort((a, b) => b[1] - a[1])[0][0],
    city: c.latest?.location ? cityOf(c.latest.location) : null, job: c.latest ? `${c.latest.site}-${c.latest.id}` : null,
  }));
  return {
    seen: all.length, from: dates[0] || null, to: dates.at(-1) || null, byField, fields,
    cities, citiesFrom: last ? "search" : "records", citiesOf: last ? last.listings : located.length, remote,
    applicants: { median: median(appl.filter((x) => x.r.easyApply !== false).map((x) => x.a.n)), plus: appl.some((x) => x.a.plus),
      n: appl.length, externalClicks: median(clicks.map((a) => a.n)), externalN: clicks.length },
    fill: { median: median(filled.map(Math.round)), n: filled.length },
    companies,
    snapshots: snaps.map((s) => ({ at: s.at, listings: s.listings, fields: s.fields, workplace: s.workplace })),
  };
}
