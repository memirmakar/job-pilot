// The to-do list (Insights → To-do, and each job's "How to raise this score" card): one list from the market review's todo
// and every job's raise steps. Near-identical steps are merged by Claude (todo_group.mjs → data/market/todo_groups.json);
// steps not merged yet merge only when their text is identical. Done and added marks live in data/market/todo_state.json,
// keyed by item id. Ticking an item done flags the jobs it lifts "Re-score on next run" (rec.rescore, read by rescore.mjs).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA } from "./config.mjs";
import { loadAllRecords, loadRecord, saveRecord } from "./store.mjs";

const DIR = path.join(DATA, "market");
const STATE_FILE = path.join(DIR, "todo_state.json");
export const GROUPS_FILE = path.join(DIR, "todo_groups.json");
const REVIEW_FILE = path.join(DIR, "review.json");
const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
const write = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
export const hash = (s) => crypto.createHash("sha1").update(norm(s)).digest("hex").slice(0, 10);
// An item's id before Claude merges it: the same for identical text, so a done mark survives until it's merged
export const looseId = (text) => "t-" + hash(text);

// Claude stores a job step's effort as a bucket; rough hours, the same as the Jobs card (ui/js/screens/jobs/model.js)
export const HOURS = { hours: 3, days: 16, weeks: 60, months: 200 };
// Market review steps have no per-job points: their impact counts as this many
export const IMPACT_POINTS = { high: 30, medium: 15, low: 5 };

// The steps a job's card shows: the tailored resume's when it's used (same rule as model.js raise())
export const jobSteps = (r) => (r.tailored?.used && r.tailored.recommendations?.length ? r.tailored.recommendations : r.ats?.recommendations) || [];

// Every source step, keyed: "m:<title hash>" (market review) or "r:<site>-<id>:<action hash>" (a job's step)
export function sources(records = loadAllRecords(), review = readJson(REVIEW_FILE)) {
  const out = new Map();
  for (const t of review?.review?.todo || []) out.set("m:" + hash(t.title), {
    key: "m:" + hash(t.title), from: "market", text: t.title, kind: t.category, hours: t.effort_hours || 1, impact: t.impact,
    why: t.why, steps: t.steps, doneWhen: t.done_when, unlocks: t.unlocks });
  for (const r of records) for (const x of r.ats ? jobSteps(r) : []) {
    if (!x.action) continue;
    const key = `r:${r.site}-${r.id}:${hash(x.action)}`;
    out.set(key, { key, from: "job", job: `${r.site}-${r.id}`, text: x.action, kind: x.type, effort: x.effort, hours: HOURS[x.effort] ?? 60,
      gain: Math.max(0, Math.round(x.estimated_gain || 0)), why: x.why });
  }
  return out;
}
export const loadGroups = () => readJson(GROUPS_FILE, { at: null, groups: [] });

// ----- state: { v: 2, done: { id: at }, added: { id: at }, legacy: { title: at } } -----
// v1 was { "<market todo title>": doneAt }; those move to item ids in items() (titles no item has stay in legacy)
export function loadState() {
  const raw = readJson(STATE_FILE, {});
  if (raw.v === 2) return { done: {}, added: {}, legacy: {}, ...raw };
  return { v: 2, done: {}, added: {}, legacy: { ...raw } };
}
export const saveState = (st) => write(STATE_FILE, st);

// All items, ranked by points per hour. Each: { id, title, do, why, kind, hours, effort, impact, points, value, jobs[{k gain}],
// market{steps doneWhen unlocks}|null, merged, done, added }
export function items({ records = loadAllRecords(), save = true } = {}) {
  const src = sources(records), G = loadGroups(), st = loadState(), used = new Set(), groups = [];
  for (const g of G.groups) {
    const keys = g.keys.filter((k) => src.has(k) && !used.has(k));
    keys.forEach((k) => used.add(k));
    if (keys.length) groups.push({ id: g.id, title: g.title, keys, merged: true });
  }
  const loose = new Map();
  for (const s of src.values()) if (!used.has(s.key)) {
    const id = looseId(s.text);
    if (!loose.has(id)) loose.set(id, { id, title: null, keys: [], merged: false });
    loose.get(id).keys.push(s.key);
  }
  const list = [...groups, ...loose.values()].map((g) => build(g, src, st));
  // v1 done marks (by market title) -> item ids
  let moved = false;
  for (const [title, at] of Object.entries(st.legacy)) {
    const it = list.find((i) => i.keys.includes("m:" + hash(title)));
    if (it) { st.done[it.id] ||= at; it.done = st.done[it.id]; delete st.legacy[title]; moved = true; }
  }
  if (moved && save) saveState(st);
  return list.sort((a, b) => b.value / b.hours - a.value / a.hours || b.points - a.points);
}

function build(g, src, st) {
  const members = g.keys.map((k) => src.get(k));
  const market = members.find((m) => m.from === "market") || null;
  const jobs = new Map();
  for (const m of members) if (m.job && (!jobs.has(m.job) || m.gain > jobs.get(m.job).gain)) jobs.set(m.job, { k: m.job, gain: m.gain });
  const lead = market || [...members].sort((a, b) => b.gain - a.gain)[0];
  const points = [...jobs.values()].reduce((s, j) => s + j.gain, 0);
  return {
    id: g.id, keys: g.keys, merged: g.merged, title: g.title || (market ? market.text : null), do: lead.text, why: lead.why, kind: lead.kind,
    hours: lead.hours, effort: lead.effort || null, impact: market?.impact || null, points,
    value: points + (market ? IMPACT_POINTS[market.impact] || 0 : 0),
    jobs: [...jobs.values()].sort((a, b) => b.gain - a.gain),
    market: market ? { steps: market.steps, doneWhen: market.doneWhen, unlocks: market.unlocks } : null,
    done: st.done[g.id] || null, added: st.added[g.id] || null,
  };
}

// Ticks an item done (or not). Done flags the jobs it lifts that you haven't applied to: rec.rescore{ at, items[] }.
export function setDone(id, done) {
  const st = loadState(), it = items({ save: false }).find((i) => i.id === id);
  if (!it) throw new Error("That step isn't in your to-do list any more");
  if (done) st.done[id] = new Date().toISOString(); else delete st.done[id];
  saveState(st);
  let flagged = 0;
  for (const { k } of it.jobs) {
    const [site, ...rest] = k.split("-"), r = loadRecord(site, rest.join("-"));
    if (!r || r.archived || r.status === "applied") continue;
    const ids = new Set(r.rescore?.items || []);
    if (done) ids.add(id); else ids.delete(id);
    if (ids.size) r.rescore = { at: r.rescore?.at || new Date().toISOString(), items: [...ids] }; else delete r.rescore;
    if (done) flagged++;
    saveRecord(r);
  }
  return { state: st, flagged };
}

// "Add to my to-do list" on a job's card: marks that job's items as yours
export function setAdded(ids, added = true) {
  const st = loadState();
  for (const id of ids) if (added) st.added[id] ||= new Date().toISOString(); else delete st.added[id];
  saveState(st);
  return st;
}

// After Claude merges steps: a done or added mark on a loose id moves to the group it joined
export function moveMarks(map) {
  const st = loadState();
  let moved = false;
  for (const [from, to] of Object.entries(map)) for (const m of ["done", "added"]) {
    if (from !== to && st[m][from]) { st[m][to] ||= st[m][from]; delete st[m][from]; moved = true; }
  }
  if (moved) saveState(st);
  // re-score flags on records name item ids too
  if (moved) for (const r of loadAllRecords()) if (r.rescore?.items?.some((i) => map[i])) {
    r.rescore.items = [...new Set(r.rescore.items.map((i) => map[i] || i))]; saveRecord(r);
  }
}
