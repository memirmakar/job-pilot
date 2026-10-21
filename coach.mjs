// Guidance: Claude as a career coach (Stage 5). One `claude -p` call per message through llm.mjs ask(), with a bounded context
// (coach_context.mjs), the last 10 messages and a running summary of older ones (updated in the same call, never a separate one).
// Answers can end in actions, returned in the JSON schema and checked here: ids that don't exist are dropped.
// Nothing an action changes is applied here: the UI asks first (goals, to-do, resume edits go through their own routes).
import fs from "node:fs";
import path from "node:path";
import { DATA } from "./config.mjs";
import { ask } from "./llm.mjs";
import * as Store from "./coach_store.mjs";
import { buildContext, weekFacts, cut, resumeText } from "./coach_context.mjs";
import { currentStructured } from "./resumes.mjs";
import { items as todoItems } from "./todo.mjs";
import { loadAllRecords } from "./store.mjs";

const RECENT = 10;      // messages sent as they are
const FOLD_MAX = 6;     // older messages folded into the summary per call
export const ACTION_TYPES = ["add_todo", "update_goals", "resume_edit", "draft_message", "mock_interview"];

export const SYSTEM = `You are Claude, the candidate's career coach inside Job Pilot, an app that finds jobs on LinkedIn, scores and tailors their resumes and applies for them.
Use only the data below and the conversation. Be direct, warm and specific. Keep answers short: 2-6 sentences or a few "- " bullets, plain text, no headings,
**bold** only for a key number or name. Answer in the language the candidate writes in.

Honesty (most important):
- Never invent an employer's reasons, an interviewer's opinion, a salary, or anything about a company that the data doesn't show.
- For "Why was I rejected?", "Why no reply?" or any question the data can't answer: start from the facts you have (dates, how many days without a reply and the app's No reply rule,
  missing skills, the score against their target), then say plainly what can't be known (the employer's reason; whether the role was filled, paused or never read). Say "I don't know" when you don't.
- Never claim experience the candidate doesn't have. You see a ranked selection of jobs, not all of them; don't state totals you weren't given.

Links: name jobs, resumes, repos and to-do steps with the exact tokens from the data, e.g. [[job:linkedin-123|Automation Engineer · Ege]], [[resume:t:linkedin-123|tailored resume]],
[[repo:stm32-fw|stm32-fw]], [[todo:t-abc|Profinet course]]. Never make up an id; without a token, write the name as plain text.

Actions: add 0-3 only when a next step is clearly useful (never repeat one from your earlier messages):
- add_todo: todo_id of an existing step from the data, or a new step with title (imperative, under 80 chars), why and hours.
- update_goals: only when their goals text should change; goals_text = the whole new text in their voice. They confirm before it's saved.
- resume_edit: resume_id (t:... or r:... from the data), find = ONE line copied exactly from that resume's text, replace = the new line.
  Only reword or bring forward facts their resumes, profile or GitHub show. They review it in Resumes, where Claude checks it again.
- draft_message: draft = a short message to a recruiter or hiring manager in the posting's language, recipient, job. They send it themselves; never offer to send.
- mock_interview: job = a job id; offers a mock interview for it.
label: the button text, 2-5 words, sentence case.`;

const Action = { type: "object", additionalProperties: false, required: ["type", "label"], properties: {
  type: { type: "string", enum: ACTION_TYPES }, label: { type: "string" },
  todo_id: { type: "string" }, title: { type: "string" }, why: { type: "string" }, hours: { type: "number" },
  goals_text: { type: "string" }, resume_id: { type: "string" }, find: { type: "string" }, replace: { type: "string" },
  job: { type: "string" }, draft: { type: "string" }, recipient: { type: "string" } } };
const ReplySchema = { type: "object", additionalProperties: false, required: ["reply", "actions"], properties: {
  reply: { type: "string" }, actions: { type: "array", maxItems: 3, items: Action },
  summary: { type: "string", description: "Only when asked: the running summary of the conversation, updated with the older messages listed (under 120 words)" } } };

// ----- resume lines (a resume_edit's `find` must be a real line) -----
const norm = (s) => String(s || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const close = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (y.length > 24 && x.includes(y))); };
// Replaces one line (headline, a summary sentence, a heading, a bullet or a skill) in a structured resume; throws if it isn't there
export function replaceLine(resume, find, replace) {
  const r = structuredClone(resume);
  let hit = false;
  const sw = (s) => { if (!hit && close(s, find)) { hit = true; return norm(s) === norm(find) ? replace : String(s).replace(find, replace); } return s; };
  r.headline = sw(r.headline);
  if (!hit && norm(r.summary).includes(norm(find))) { hit = true; r.summary = r.summary.includes(find) ? r.summary.replace(find, replace) : r.summary.split(/(?<=[.!?])\s+/).map(sw).join(" "); }
  r.sections = (r.sections || []).map((s) => ({ ...s, items: (s.items || []).map((it) => ({ ...it, heading: sw(it.heading), bullets: (it.bullets || []).map(sw) })) }));
  r.skills = (r.skills || []).map((g) => ({ ...g, items: (g.items || []).map(sw) }));
  if (!hit) throw new Error("That line isn't in the resume any more. Ask Claude again.");
  return r;
}

// Drops actions that point at things that don't exist
function checkActions(list = [], { records }) {
  const keys = new Set(records.map((r) => `${r.site}-${r.id}`)), todo = new Set(todoItems({ records, save: false }).map((i) => i.id));
  return list.filter((a) => ACTION_TYPES.includes(a.type)).map((a) => ({ ...a, label: cut(a.label, 40) || a.type })).filter((a) => {
    if (a.type === "add_todo") { if (a.todo_id && !todo.has(a.todo_id)) delete a.todo_id; return !!(a.todo_id || a.title); }
    if (a.type === "update_goals") return !!String(a.goals_text || "").trim();
    if (a.type === "resume_edit") {
      if (!/^[tr]:/.test(a.resume_id || "") || !a.find || !a.replace || norm(a.find) === norm(a.replace)) return false;
      const cur = currentStructured(a.resume_id); if (!cur) return false;
      try { replaceLine(cur.resume, a.find, a.replace); return true; } catch { return false; }
    }
    if (a.type === "draft_message") return !!String(a.draft || "").trim();
    if (a.type === "mock_interview") return keys.has(a.job);
    return false;
  }).slice(0, 3);
}

const who = (m) => m.role === "user" ? "Candidate" : "Claude";
const line = (m) => `${who(m)}${m.kind?.startsWith("iv-") ? ` (mock interview)` : m.kind === "checkin" ? " (weekly check-in)" : ""}: ${cut(m.text, 1200)}`;

// One message in a conversation -> the conversation with Claude's reply
export async function chat(conv, text, { weekly = false, signal } = {}) {
  const msgs = conv.messages, upto = conv.summary?.upto || 0, start = Math.max(upto, msgs.length - RECENT);
  const fold = msgs.slice(upto, start).slice(-FOLD_MAX);
  const ctx = buildContext(conv, text);
  const prompt = [ctx.text, "### CONVERSATION",
    conv.summary?.text ? `Summary of earlier messages: ${conv.summary.text}` : "",
    msgs.slice(start).map(line).join("\n\n"), `Candidate: ${text}`,
    fold.length ? `(Also return "summary": the running summary${conv.summary?.text ? " above" : ""} updated with these older messages:\n${fold.map(line).join("\n")})` : "",
  ].filter(Boolean).join("\n\n");
  const { data, usage } = await ask({ system: SYSTEM, prompt, schema: ReplySchema, weekly, tools: [], timeoutMs: 3 * 60e3, signal });
  const at = new Date().toISOString();
  conv.messages.push({ role: "user", text, at }, { role: "claude", text: data.reply, at: new Date().toISOString(),
    actions: checkActions(data.actions, { records: loadAllRecords() }), ...(weekly ? { weekly: true } : {}) });
  if (fold.length && data.summary) conv.summary = { text: cut(data.summary, 1200), upto: start };
  if (conv.kind === "general" && !conv.titleByYou && /^New conversation$/.test(conv.title)) conv.title = cut(text, 60);
  Store.addUsage(conv, usage, SYSTEM.length + prompt.length);
  conv.lastContext = ctx.parts;
  return Store.save(conv);
}

// ----- the weekly check-in: once a week after a run, or on demand; cached in the pinned conversation -----
const CheckinSchema = { type: "object", additionalProperties: false, required: ["reply", "actions"], properties: {
  reply: { type: "string" }, actions: { type: "array", minItems: 2, maxItems: 3, items: Action } } };
export async function checkin({ signal } = {}) {
  const conv = Store.weekly(), facts = weekFacts();
  const ctx = buildContext({ ...conv, context: { ...conv.context, jobs: true } }, "weekly check-in: applications replies interviews to-do");
  const prompt = `${ctx.text}\n\n### THIS WEEK (facts from the app)\n${facts.text}\n\n### TASK\nWrite this week's check-in for the candidate: 3-6 sentences.
Start from the facts above (applications, replies, interviews, to-do progress), name what went well and what needs attention, then give 2-3 next steps
as actions (add_todo, mock_interview for an upcoming interview, update_goals when the facts show their goals and results don't match, draft_message for a follow-up).
No invented reasons for a missing reply. If nothing happened this week, say so plainly.`;
  const { data, usage } = await ask({ system: SYSTEM, prompt, schema: CheckinSchema, tools: [], timeoutMs: 3 * 60e3, signal });
  conv.messages.push({ role: "claude", kind: "checkin", text: data.reply, stats: facts.stats, at: new Date().toISOString(),
    actions: checkActions(data.actions, { records: loadAllRecords() }) });
  Store.addUsage(conv, usage, SYSTEM.length + prompt.length);
  return Store.save(conv);
}
// Due: no check-in for 7 days and a run finished since the last one
export function checkinDue() {
  const last = [...Store.weekly().messages].reverse().find((m) => m.kind === "checkin")?.at;
  if (last && Date.now() - Date.parse(last) < 7 * 864e5) return false;
  const runs = path.join(DATA, "runs");
  const latest = fs.existsSync(runs) ? fs.readdirSync(runs).filter((f) => /^\d{4}-.*\.json$/.test(f)).sort().at(-1) : null;
  return !!latest && (!last || fs.statSync(path.join(runs, latest)).mtimeMs > Date.parse(last));
}

// ----- Suggest a resume edit: the change goes through Resumes' re-upload check (stage 3) -----
export async function prepareResumeEdit({ id, find, replace }) {
  if (!/^[tr]:/.test(String(id))) throw new Error("Only tailored and ready resumes get new versions");
  const cur = currentStructured(String(id));
  if (!cur) throw new Error("That resume isn't available any more");
  const edited = replaceLine(cur.resume, String(find), String(replace).slice(0, 600));
  const { writeDocx } = await import("./docx.mjs");
  const { stage, checkStaged } = await import("./reupload.mjs");
  const p = stage(`${cur.base}.docx`, Buffer.from(writeDocx(edited)).toString("base64"), { from: "guidance", find, replace });
  return { ...(await checkStaged(p.token, String(id))), proposed: { find, replace } };
}
export const resumeLines = (id, n = 2400) => resumeText(currentStructured(id)?.resume, n);
