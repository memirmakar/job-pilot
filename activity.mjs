// Activity screen data: every run (data/runs/*.json + current.json), newest first, with what happened to each job in it
// (applications.csv rows written during the run, joined with the job records). Log rows from before runs were recorded
// are grouped into "earlier" runs by time. Read only; the words are made in ui/js/screens/activity/model.js.
import fs from "node:fs";
import path from "node:path";
import { DIR, DATA } from "./config.mjs";

const RUNS_DIR = path.join(DATA, "runs");
const RECORDS_DIR = path.join(DATA, "applications");
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const GAP = 45 * 60e3; // log rows further apart than this start a new earlier run
const HAND = /^marked_/; // statuses you set by hand, not run results

function logRows() {
  const f = path.join(DIR, "applications.csv");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").trim().split("\n").slice(1).map((l) => {
    const [date, site, status, id, title, company, url, reason] = l.split("\t");
    return { date, site, status, id, title, company, url, reason: reason || "" };
  }).filter((r) => !isNaN(Date.parse(r.date)) && r.status && !HAND.test(r.status));
}
function recordsById() {
  const m = new Map();
  if (!fs.existsSync(RECORDS_DIR)) return m;
  for (const f of fs.readdirSync(RECORDS_DIR).filter((x) => x.endsWith(".json"))) { const r = readJson(path.join(RECORDS_DIR, f)); if (r) m.set(`${r.site}-${r.id}`, r); }
  return m;
}
const scoreOf = (r) => { const s = r?.tailored?.used ? r.tailored.score : r?.ats?.best_score; return s == null ? null : Math.round(s); };
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function runFiles() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const runs = fs.readdirSync(RUNS_DIR).filter((f) => /^\d{4}-.*\.json$/.test(f)).map((f) => readJson(path.join(RUNS_DIR, f))).filter(Boolean);
  const cur = readJson(path.join(RUNS_DIR, "current.json"));
  // current.json is the live run, or the last one (already saved under its id), or one that never finished
  if (cur && !runs.some((r) => r.id === cur.id)) runs.push({ ...cur, live: cur.phase !== "done" && alive(cur.pid), unfinished: cur.phase !== "done" && !alive(cur.pid) });
  return runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

const firstLine = (s) => String(s || "").split("\n")[0].trim().slice(0, 240);

export function activity() {
  const rows = logRows().sort((a, b) => a.date.localeCompare(b.date));
  const recs = recordsById();
  const runs = runFiles().map((r, i, all) => ({ r, from: Date.parse(r.startedAt), to: r.endedAt ? Date.parse(r.endedAt) + 2000 : Date.parse(all[i + 1]?.startedAt || "") || Date.now(), jobs: [] }));
  const loose = [];
  // Where each title + company was first seen, for "Re-post of a job you saw on …"
  const seen = new Map();
  for (const row of rows) {
    const t = Date.parse(row.date), run = runs.find((x) => t >= x.from && t <= x.to);
    const key = norm(row.title) && norm(row.company) ? norm(row.title) + "|" + norm(row.company) : null, first = key && seen.get(key);
    const rec = recs.get(`${row.site}-${row.id}`);
    const job = { at: row.date, site: row.site, id: row.id, status: row.status, title: row.title || rec?.title || "", company: row.company || rec?.company || "",
      location: rec?.location || "", url: row.url, reason: row.reason, score: scoreOf(rec), inJobs: !!rec,
      repostOf: first && first.id !== row.id ? first.date : null,
      appliedBefore: row.status === "already_applied" ? rows.find((x) => x.id === row.id && x.status === "applied" && x.date < row.date)?.date || rec?.submittedAt || null : null };
    if (key && !first) seen.set(key, { id: row.id, date: row.date });
    (run ? run.jobs : loose).push(job);
  }
  const out = runs.map(({ r, jobs }) => ({
    id: r.id, kind: r.kind, dryRun: !!r.opts?.dryRun, onlyJob: r.opts?.onlyJob || null, mode: r.opts?.mode || null,
    startedAt: r.startedAt, endedAt: r.endedAt || null, live: !!r.live, unfinished: !!r.unfinished || (!r.endedAt && !r.live),
    phase: r.phase, counts: r.counts || {}, selection: r.selection || null, outcome: r.outcome || null,
    anomalies: (r.anomalies || []).map((a) => ({ kind: a.kind, at: a.at, detail: firstLine(a.detail) })),
    lastEvent: r.events?.at(-1)?.at || null, lastLine: firstLine(r.events?.filter((e) => !/^(Done.|Resumes:)/.test(e.line)).at(-1)?.line), jobs,
  }));
  // Log rows outside any recorded run: group them by time into earlier runs
  for (const j of loose) {
    const g = out.find((x) => x.earlier && Math.abs(Date.parse(j.at) - Date.parse(x.endedAt)) < GAP);
    if (g) { g.jobs.push(j); g.endedAt = j.at; }
    else out.push({ id: "log-" + j.at.replace(/[:.]/g, "-"), earlier: true, startedAt: j.at, endedAt: j.at, counts: {}, anomalies: [], jobs: [j] });
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
