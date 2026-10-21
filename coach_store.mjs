// Guidance conversations, all in data/conversations/ in one format (Stage 5). Per-job chats keep their old file name
// <site>-<id>.json (the Jobs Ask panel writes the same file through conversations.mjs); general ones are g-<id>.json and the
// pinned weekly check-in is weekly.json. A conversation's id (cid) is its file name without .json.
//   { v: 2, cid, kind: job|general|weekly, title, site, id, company, createdAt, updatedAt,
//     messages[{ role: user|claude, text, at, kind?, actions?[], refs?, stats?, n?, weekly? }],
//     summary{ text upto } (messages before `upto` are folded into it), context{ goals resumes github jobs market off[] },
//     interview{ job lang plan[{ q about }] i startedAt } | null, interviews[] (ended), costUsd, usage{ calls input output promptChars } }
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA } from "./config.mjs";

export const CONV_DIR = path.join(DATA, "conversations");
const TRASH = path.join(CONV_DIR, "deleted");
const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
export const DEFAULT_CONTEXT = { goals: true, resumes: true, github: true, jobs: true, market: true, off: [] };

export function validCid(cid) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(cid || ""))) throw new Error("Unknown conversation");
  return String(cid);
}
const file = (cid) => path.join(CONV_DIR, `${validCid(cid)}.json`);
export const jobCid = (site, id) => `${String(site).replace(/[^\w-]/g, "")}-${String(id).replace(/[^\w-]/g, "")}`;
export const kindOf = (cid) => cid === "weekly" ? "weekly" : cid.startsWith("g-") ? "general" : "job";

// Old per-job files ({ site id title company messages costUsd updatedAt }) read as v2
function normalize(c, cid) {
  const kind = kindOf(cid);
  return {
    ...c, // keeps lastCall, lastContext and anything a later version adds
    v: 2, cid, kind, title: c.title || (kind === "weekly" ? "Weekly check-ins" : "New conversation"), site: c.site || null, id: c.id || null,
    company: c.company || null, createdAt: c.createdAt || c.messages?.[0]?.at || c.updatedAt || new Date().toISOString(), updatedAt: c.updatedAt || null,
    messages: c.messages || [], summary: c.summary || null, context: { ...DEFAULT_CONTEXT, ...(c.context || {}) },
    interview: c.interview || null, interviews: c.interviews || [], costUsd: c.costUsd || 0,
    usage: { calls: 0, input: 0, output: 0, promptChars: 0, ...(c.usage || {}) }, ...(c.titleByYou ? { titleByYou: true } : {}),
  };
}

export function load(cid) {
  const c = readJson(file(cid));
  return c ? normalize(c, cid) : null;
}
export function save(c) {
  fs.mkdirSync(CONV_DIR, { recursive: true });
  c.updatedAt = new Date().toISOString();
  fs.writeFileSync(file(c.cid), JSON.stringify(c, null, 2));
  return c;
}

// A job's conversation, created on first use (the same file the Jobs Ask panel uses)
export function forJob(rec) {
  const cid = jobCid(rec.site, rec.id);
  const c = load(cid) || normalize({ site: rec.site, id: rec.id }, cid);
  Object.assign(c, { site: rec.site, id: rec.id, company: rec.company });
  if (!c.titleByYou) c.title = rec.title;
  return c;
}
export function createGeneral(title = "New conversation") {
  const cid = `g-${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
  return save(normalize({ title: String(title).slice(0, 80) }, cid));
}
export const weekly = () => load("weekly") || normalize({ title: "Weekly check-ins" }, "weekly");

export function rename(cid, title) {
  const c = load(cid);
  if (!c) throw new Error("Conversation not found");
  c.title = String(title || "").trim().slice(0, 80) || c.title;
  c.titleByYou = true;
  return save(c);
}
// Delete moves the file to data/conversations/deleted/ (kept, like removed resumes)
export function remove(cid) {
  if (cid === "weekly") throw new Error("The weekly check-in can't be deleted");
  const f = file(cid);
  if (!fs.existsSync(f)) return { ok: true };
  fs.mkdirSync(TRASH, { recursive: true });
  fs.renameSync(f, path.join(TRASH, `${cid}-${Date.now()}.json`));
  return { ok: true };
}
export function setContext(cid, patch, rec = null) {
  const c = load(cid) || (rec ? forJob(rec) : null);
  if (!c) throw new Error("Conversation not found");
  for (const k of ["goals", "resumes", "github", "jobs", "market"]) if (typeof patch[k] === "boolean") c.context[k] = patch[k];
  if (Array.isArray(patch.off)) c.context.off = [...new Set(patch.off.map(String))].slice(0, 200);
  return save(c);
}

// Usage of one call, added to the conversation (costUsd as conversations.mjs does)
export function addUsage(c, usage = {}, promptChars = 0) {
  c.costUsd = (c.costUsd || 0) + (usage.costUsd || 0);
  const u = c.usage;
  u.calls++; u.input += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  u.output += usage.output_tokens || 0; u.promptChars += promptChars;
  c.lastCall = { at: new Date().toISOString(), costUsd: usage.costUsd || 0, promptChars, input: usage.input_tokens || 0,
    cached: usage.cache_read_input_tokens || 0, output: usage.output_tokens || 0 };
}

// The left column: weekly first, then the rest by last activity
export function list() {
  if (!fs.existsSync(CONV_DIR)) return [weeklyRow(weekly())];
  const all = fs.readdirSync(CONV_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
    .filter((cid) => /^[A-Za-z0-9_-]{1,80}$/.test(cid)).map(load).filter(Boolean);
  const rows = all.filter((c) => c.kind !== "weekly" && c.messages.length).map((c) => ({
    cid: c.cid, kind: c.kind, title: c.title, site: c.site, id: c.id, company: c.company, updatedAt: c.updatedAt || c.createdAt,
    count: c.messages.length, last: lastLine(c), interview: !!c.interview, costUsd: c.costUsd,
  })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return [weeklyRow(all.find((c) => c.kind === "weekly") || weekly()), ...rows];
}
const lastLine = (c) => {
  const m = [...c.messages].reverse().find((x) => x.role === "user" && !x.kind) || [...c.messages].reverse().find((x) => x.role === "user" && !x.skipped) || c.messages.at(-1);
  return String(m?.text || "").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\s+/g, " ").slice(0, 120);
};
const weeklyRow = (c) => {
  const last = [...c.messages].reverse().find((m) => m.kind === "checkin");
  return { cid: "weekly", kind: "weekly", title: "Weekly check-ins", updatedAt: c.updatedAt, count: c.messages.length,
    last: last ? `Check-in ${new Date(last.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "None yet", lastCheckin: last?.at || null };
};
