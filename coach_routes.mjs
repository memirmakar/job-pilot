// /api/coach/*: Guidance's routes (coach.mjs, coach_interview.mjs, coach_store.mjs), merged into server.mjs's route table.
// One Claude call per conversation at a time; Cancel (or closing the request) kills it. The weekly check-in is generated
// once a week after a run by a timer here (set JP_NO_AUTO_CHECKIN=1 to turn it off, e.g. for a test copy), or on demand.
import fs from "node:fs";
import path from "node:path";
import { DATA } from "./config.mjs";
import * as Store from "./coach_store.mjs";

const fresh = (m) => import(`./${m}?t=${Date.now()}`);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const recordOf = (key) => readJson(path.join(DATA, "applications", `${Store.validCid(key)}.json`));
const pending = new Map(); // cid -> { ctrl, what, at }

// Runs one Claude call for a conversation; a second one while it runs is refused
async function busy(cid, what, res, fn) {
  if (pending.has(cid)) throw Object.assign(new Error("Claude is still answering in this conversation"), { code: 409 });
  const ctrl = new AbortController();
  pending.set(cid, { ctrl, what, at: new Date().toISOString() });
  res?.on("close", () => { if (!res.writableEnded) ctrl.abort(); }); // the page cancelled or went away
  try { return await fn(ctrl.signal); } finally { pending.delete(cid); }
}

// A job conversation is created from its record the first time; a general one must exist
function convOf(cid) {
  const c = Store.load(cid);
  if (c) return c;
  if (Store.kindOf(cid) === "job") { const r = recordOf(cid); if (r) return Store.forJob(r); }
  if (cid === "weekly") return Store.weekly();
  throw Object.assign(new Error("Conversation not found"), { code: 404 });
}

export function coachRoutes({ body, json, running }) {
  const run = (fn) => async (req, res, url) => {
    try { json(res, await fn(req.method === "POST" ? await body(req) : {}, res, url)); }
    catch (e) { json(res, { error: e.message, ...(e.cancelled ? { cancelled: true } : {}) }, e.cancelled ? 499 : e.code || 500); }
  };

  if (!process.env.JP_NO_AUTO_CHECKIN) setInterval(async () => {
    try {
      const C = await fresh("coach.mjs");
      if (!running() && !pending.has("weekly") && C.checkinDue()) await busy("weekly", "checkin", null, (signal) => C.checkin({ signal }));
    } catch {}
  }, 15 * 60e3).unref();

  return {
    "GET /api/coach": run(async () => ({ list: Store.list(), pending: Object.fromEntries([...pending].map(([k, v]) => [k, { what: v.what, at: v.at }])) })),
    // The conversation plus what its context would include now (for the right column's job switches)
    "GET /api/coach/conv": run(async (b, res, url) => {
      const c = convOf(Store.validCid(url.searchParams.get("cid")));
      const { buildContext } = await fresh("coach_context.mjs");
      const ctx = buildContext({ ...c, context: { ...c.context, off: [] } }, "");
      return { ...c, shownJobs: ctx.jobs, pending: pending.get(c.cid)?.what || null };
    }),
    "POST /api/coach/new": run((b) => Store.createGeneral(b.title || "New conversation")),
    "POST /api/coach/send": run(async (b, res) => {
      const text = String(b.text || "").trim().slice(0, 4000);
      if (!text) throw Object.assign(new Error("Type a message first"), { code: 400 });
      const cid = Store.validCid(b.cid), C = await fresh("coach.mjs");
      return busy(cid, "reply", res, (signal) => C.chat(convOf(cid), text, { weekly: !!b.weekly, signal }));
    }),
    "POST /api/coach/cancel": run((b) => { pending.get(String(b.cid))?.ctrl.abort(); return { ok: true }; }),
    "POST /api/coach/rename": run((b) => Store.rename(Store.validCid(b.cid), b.title)),
    "POST /api/coach/delete": run((b) => Store.remove(Store.validCid(b.cid))),
    "POST /api/coach/context": run((b) => {
      const cid = Store.validCid(b.cid);
      return Store.setContext(cid, b.patch || {}, Store.kindOf(cid) === "job" ? recordOf(cid) : null);
    }),
    "POST /api/coach/checkin": run(async (b, res) => { const C = await fresh("coach.mjs"); return busy("weekly", "checkin", res, (signal) => C.checkin({ signal })); }),
    // Suggest a resume edit: stage the edited resume and run Resumes' check on it; the Resumes screen shows the result
    "POST /api/coach/resume-edit": run(async (b) => (await fresh("coach.mjs")).prepareResumeEdit({ id: b.id, find: b.find, replace: b.replace })),
    // Mock interview: { cid, op: start|answer|skip|lang|end, lang, text }
    "POST /api/coach/interview": run(async (b, res) => {
      const cid = Store.validCid(b.cid), rec = recordOf(cid);
      if (!rec) throw Object.assign(new Error("Mock interviews are for a job; that job isn't in your list"), { code: 404 });
      const I = await fresh("coach_interview.mjs");
      if (b.op === "skip") return I.skip(convOf(cid));
      if (b.op === "lang") return I.setLang(convOf(cid), b.lang);
      return busy(cid, `interview-${b.op}`, res, (signal) =>
        b.op === "start" ? I.start(rec, b.lang, { signal })
        : b.op === "answer" ? I.answer(convOf(cid), rec, String(b.text || "").trim(), { signal })
        : b.op === "end" ? I.end(convOf(cid), rec, { signal })
        : Promise.reject(Object.assign(new Error("Unknown step"), { code: 400 })));
    }),
  };
}
