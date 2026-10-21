// What the coach sees on each call (Stage 5). `claude -p` has no memory, so every call gets a compact, bounded context:
// a profile summary, the conversation's job in full, a short ranked list of other jobs (never all records), resumes, GitHub,
// the market review and the top to-do steps. Each part except the profile can be switched off per conversation.
// Links: Claude writes [[job:<site>-<id>|label]], [[resume:<id>|label]], [[repo:<name>|label]], [[todo:<id>|label]]; the UI opens them.
import fs from "node:fs";
import path from "node:path";
import { DATA, loadConfig, loadSettings } from "./config.mjs";
import { loadAllRecords } from "./store.mjs";
import { resumesView, currentStructured } from "./resumes.mjs";
import { items as todoItems, loadState as todoState, jobSteps, hash } from "./todo.mjs";

const DAY = 864e5;
const MAX_CHARS = 20000; // the whole context; the job posting is cut first
const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
export const cut = (s, n) => { s = String(s ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const day = (iso) => iso ? String(iso).slice(0, 10) : "?";
export const keyOf = (r) => `${r.site}-${r.id}`;

// ----- a job in words (server copy of the rules in ui/js/screens/jobs/track.js and model.js) -----
const WORD = { applied: "Applied", waiting_ok: "Waiting for your OK", approved: "Approved, sends next run", resume_insufficient: "Resume too weak (below cutoff)",
  needs_manual: "Needs manual", external: "Apply externally", ready_to_apply: "Ready to apply", dry_run: "Test run", in_progress: "In progress",
  skipped_by_user: "Skipped", error: "Error", viewed: "Viewed", offer: "Offer", rejected: "Rejected" };
const AFTER = new Set(["viewed", "interview", "offer", "rejected", "applied"]);
export function statusOf(r, noReplyDays = loadSettings().noReplyDays) {
  if (r.status !== "applied") return WORD[r.status] || r.status;
  const h = (r.statusHistory || []).filter((x) => AFTER.has(x.status)), last = h.at(-1);
  if (last && last.status !== "applied" && last.status !== "viewed") return last.status === "interview" ? `Interview${last.date ? ` on ${last.date.replace("T", " ")}` : ""}` : WORD[last.status];
  const news = Math.max(Date.parse(r.submittedAt || r.createdAt || 0), ...h.map((x) => Date.parse(x.at) || 0));
  const days = Math.floor((Date.now() - news) / DAY);
  if (days >= noReplyDays) return `No reply (no news for ${days} days; the app says No reply after ${noReplyDays})`;
  return `${last?.status === "viewed" ? "Viewed" : "Applied"}, no reply yet (${days} days since the last news)`;
}
export const scoreOf = (r) => Math.round(r.tailored?.used ? r.tailored.score : r.ats?.best_score ?? r.tailored?.baseScore ?? 0);
const finalAts = (r) => r.tailored?.used ? r.tailored.ats : r.ats?.resumes?.find((x) => x.file === r.ats.best_file);
const missingOf = (r, n = 6) => (finalAts(r)?.missing_keywords || []).slice(0, n).map((k) => cut(k, 40));
const label = (r) => `${cut(r.title, 70)} · ${cut(r.company, 40)}`;

function jobLine(r) {
  const t = r.tailored, from = t?.used ? Math.round(t.baseScore) : null, miss = missingOf(r, 4);
  return `- [[job:${keyOf(r)}|${label(r)}]] | ${cut(r.location, 30) || "?"} | ${statusOf(r)} | score ${scoreOf(r)}${from != null ? ` (original ${from})` : ""}` +
    `${r.submittedAt ? ` | applied ${day(r.submittedAt)}` : ""}${miss.length ? ` | missing: ${miss.join(", ")}` : ""}`;
}

// The conversation's own job, in full (the posting is the part cut when the context is too long)
function jobBlock(r, todoIdOf, { resumes, postingChars }) {
  const a = finalAts(r) || {}, t = r.tailored;
  const steps = jobSteps(r).filter((x) => x.action).map((x) => `- (+${Math.round(x.estimated_gain || 0)}, ${x.effort || "?"}) ${cut(x.action, 200)}` +
    `${todoIdOf.get(`r:${keyOf(r)}:${hash(x.action)}`) ? ` [to-do id ${todoIdOf.get(`r:${keyOf(r)}:${hash(x.action)}`)}]` : ""}`);
  const hist = (r.statusHistory || []).map((h) => `${day(h.at)} ${h.status}${h.date ? ` (on ${h.date})` : ""}${h.source ? ` by ${h.source}` : ""}`);
  const out = [
    `THE JOB THIS CONVERSATION IS ABOUT: [[job:${keyOf(r)}|${label(r)}]]`,
    `Location: ${r.location || "?"} · Posted: ${r.postedText || day(r.postedAt)} · Applicants: ${r.applicants || "?"} · Analyzed ${day(r.createdAt)}`,
    `Status: ${statusOf(r)}${r.statusReason ? ` (${cut(r.statusReason, 160)})` : ""}${r.submittedAt ? `. Applied ${day(r.submittedAt)}.` : ""}${hist.length ? ` History: ${hist.join("; ")}` : ""}`,
    `Score ${scoreOf(r)}${t?.used ? ` with the tailored resume, ${Math.round(t.baseScore)} before tailoring` : ""}.`,
    `Matched: ${(a.matched_keywords || []).slice(0, 12).map((k) => cut(k, 40)).join(", ") || "?"}`,
    `Missing: ${missingOf(r, 10).join(", ") || "none"}`,
    r.ats?.summary ? `Claude's analysis: ${cut(r.ats.summary, 500)}` : "",
    steps.length ? `How to raise this score:\n${steps.join("\n")}` : "",
    `Posting:\n${cut(r.description, postingChars)}`,
  ];
  if (resumes && t?.path) {
    const cur = currentStructured(`t:${keyOf(r)}`)?.resume;
    out.push(`Tailored resume [[resume:t:${keyOf(r)}|Tailored resume for ${cut(r.company, 40)}]] (current version, quote lines exactly for a resume edit):\n` + resumeText(cur, 1800));
  }
  return out.filter(Boolean).join("\n");
}
export function resumeText(res, n = 1800) {
  if (!res) return "(not available)";
  const lines = [res.headline, res.summary, ...(res.sections || []).flatMap((s) => (s.items || []).flatMap((it) => [`[${s.title}] ${it.heading || ""}`, ...(it.bullets || []).map((b) => `• ${b}`)])),
    ...(res.skills || []).map((g) => `Skills (${g.label || g.name || "skills"}): ${(g.items || []).join(", ")}`)];
  return cut(lines.filter(Boolean).join("\n"), n).replace(/ • /g, "\n• ");
}

// A short ranked list of other jobs: named in the question first, then ones you applied to or can act on, then recent
function rankJobs(records, question, skip, n = 8) {
  const q = String(question || "").toLocaleLowerCase("tr");
  const words = q.split(/[^\p{L}\p{N}+#]+/u).filter((w) => w.length >= 4);
  const rank = (r) => {
    const hay = `${r.title} ${r.company}`.toLocaleLowerCase("tr");
    let s = words.filter((w) => hay.includes(w)).length * 5 + (q.includes(String(r.company || "").toLocaleLowerCase("tr")) && r.company?.length > 2 ? 25 : 0);
    if (r.status === "applied") s += 4; else if (["ready_to_apply", "external", "waiting_ok", "approved", "needs_manual"].includes(r.status)) s += 3;
    if (r.status !== "resume_insufficient") s += 2;
    return s + Math.max(0, 3 - (Date.now() - Date.parse(r.createdAt || 0)) / (10 * DAY)) + scoreOf(r) / 50;
  };
  return records.filter((r) => !skip.has(keyOf(r)) && (!r.archived || rank(r) >= 20)).map((r) => [rank(r), r]).sort((a, b) => b[0] - a[0]).slice(0, n).map((x) => x[1]);
}

function githubLines(n = 10) {
  const repos = readJson(path.join(DATA, "github", "repos.json"))?.repos || [], rev = readJson(path.join(DATA, "github", "review.json"), {});
  return repos.map((r) => ({ r, v: rev[r.name] || {} })).sort((a, b) => (b.v.relevance ?? 0) - (a.v.relevance ?? 0)).slice(0, n)
    .map(({ r, v }) => `- [[repo:${r.name}|${r.name}]] | ${Object.keys(r.languages || {}).slice(0, 3).join(", ") || "no code"} | relevance ${v.relevance ?? "?"}${v.field ? ` (${v.field})` : ""}` +
      `${v.pin ? ` | pin: ${v.pin}` : ""} | ${cut(v.summary || r.description, 160)}${v.fixes?.[0] ? ` | fix: ${cut(v.fixes[0], 120)}` : ""}`);
}

function marketLines() {
  const m = readJson(path.join(DATA, "market", "review.json"))?.review;
  if (!m) return "";
  return [`Market review (Claude's last review of all analyzed jobs): ${cut(m.headline, 400)}`,
    ...(m.verdict_points || []).slice(0, 3).map((p) => `- ${cut(p, 220)}`),
    `Gaps: ${(m.gaps || []).slice(0, 5).map((g) => `${cut(g.gap, 80)} (${cut(g.frequency, 80)})`).join("; ")}`,
    m.stop_doing?.length ? `Stop doing: ${m.stop_doing.slice(0, 2).map((s) => cut(s.what || s, 120)).join("; ")}` : ""].filter(Boolean).join("\n");
}

function profileBlock(cfg, withGoals) {
  const p = cfg.profileData, s = cfg.settings;
  return [`Today: ${new Date().toISOString().slice(0, 10)}. Candidate: ${p.name || "?"}.`,
    withGoals ? `Goals (their words): ${cut(p.goalsText || p.preferences, 900) || "(not written yet)"}` : "Goals: (switched off for this conversation)",
    `Target fields: ${(p.targets || []).map((t) => t.field).join(", ") || "?"} · Seniority: ${p.seniority || "?"} · Locations: ${(p.locations || []).join("; ") || "?"} · Workplace: ${(p.workplace || []).join(", ") || "?"}`,
    `App rules: score cutoff ${s.minAtsScore} (no application below), target ${s.tailorTarget}, "No reply" after ${s.noReplyDays} days, daily limit ${s.dailyApplyLimit}.`,
    `Facts the candidate supplied: ${cut(cfg.profile, 1400)}`].join("\n");
}

// -> { text, parts{ name: chars }, jobs[] (the keys included, for the switches) }
export function buildContext(conv, question = "") {
  const cfg = loadConfig(), ctx = conv.context, off = new Set(ctx.off || []), records = loadAllRecords();
  const linked = conv.site ? records.find((r) => r.site === conv.site && String(r.id) === String(conv.id)) : null;
  const todo = todoItems({ records, save: false }), todoIdOf = new Map(todo.flatMap((i) => i.keys.map((k) => [k, i.id])));
  const parts = [["profile", profileBlock(cfg, ctx.goals)]];
  let posting = 2600;
  const jobPart = () => linked && !off.has(keyOf(linked)) ? jobBlock(linked, todoIdOf, { resumes: ctx.resumes, postingChars: posting }) : "";
  parts.push(["job", jobPart()]);
  const others = ctx.jobs ? rankJobs(records, question, new Set([...(linked ? [keyOf(linked)] : []), ...off])) : [];
  if (ctx.jobs) {
    const applied = records.filter((r) => r.status === "applied");
    parts.push(["jobs", `Jobs Claude analyzed: ${records.length} (${applied.length} applied, ${records.filter((r) => r.status === "resume_insufficient").length} below the cutoff). ` +
      `The most relevant to this message (others exist; say so if the answer may depend on them):\n${others.map(jobLine).join("\n")}`]);
  }
  if (ctx.resumes) {
    const v = resumesView();
    parts.push(["resumes", `Resumes. Originals: ${v.originals.map((o) => `[[resume:${o.id}|${cut(o.name, 40)}]] (${o.language || "?"})`).join(", ")}.\n` +
      `Ready resumes (editable): ${v.ready.map((r) => `[[resume:${r.id}|Ready resume: ${r.field}]]`).join(", ") || "none"}. Tailored resumes: ${v.tailored.length} (one per job, id t:<site>-<id>, editable).`]);
  }
  if (ctx.github) parts.push(["github", `GitHub repos (ranked by relevance to the target fields):\n${githubLines().join("\n") || "(none fetched)"}`]);
  if (ctx.market) parts.push(["market", marketLines()]);
  const open = todo.filter((i) => !i.done).slice(0, 8);
  parts.push(["todo", `To-do (top open steps, ranked by points per hour; ${todo.filter((i) => i.done).length} of ${todo.length} done):\n` +
    open.map((i) => `- [[todo:${i.id}|${cut(i.title || i.do, 90)}]] ~${i.hours}h, +${i.points} on ${i.jobs.length} jobs${i.added ? " (on their list)" : ""}`).join("\n")]);
  // Bounded: cut the posting until it fits
  const size = () => parts.reduce((n, [, t]) => n + t.length, 0);
  while (size() > MAX_CHARS && posting > 600) { posting -= 600; parts[1][1] = jobPart(); }
  return { text: parts.filter(([, t]) => t).map(([k, t]) => `### ${k.toUpperCase()}\n${t}`).join("\n\n"), parts: Object.fromEntries(parts.map(([k, t]) => [k, t.length])),
    jobs: [...(linked ? [keyOf(linked)] : []), ...others.map(keyOf)], linked };
}

// ----- the weekly check-in's facts: last 7 days, from statusHistory and the to-do marks -----
export function weekFacts(now = Date.now()) {
  const since = now - 7 * DAY, inWeek = (iso) => iso && Date.parse(iso) >= since, records = loadAllRecords();
  const applied = records.filter((r) => r.status === "applied" && inWeek(r.submittedAt));
  const entries = records.flatMap((r) => (r.statusHistory || []).filter((h) => inWeek(h.at)).map((h) => ({ ...h, r })));
  const replies = entries.filter((h) => ["interview", "offer", "rejected"].includes(h.status));
  const upcoming = records.flatMap((r) => (r.statusHistory || []).filter((h) => h.status === "interview" && h.date && Date.parse(h.date) >= now).map((h) => ({ r, date: h.date })));
  const noReply = records.filter((r) => r.status === "applied" && statusOf(r).startsWith("No reply"));
  const st = todoState(), list = todoItems({ records, save: false });
  const doneWeek = Object.values(st.done || {}).filter(inWeek).length, addedWeek = Object.values(st.added || {}).filter(inWeek).length;
  const stats = { analyzed: records.filter((r) => inWeek(r.createdAt)).length, applied: applied.length, replies: replies.length,
    interviews: replies.filter((h) => h.status === "interview").length, viewed: entries.filter((h) => h.status === "viewed").length,
    noReply: noReply.length, todoDone: doneWeek, todoAdded: addedWeek, todoOpen: list.filter((i) => !i.done).length, todoTotal: list.length,
    from: new Date(since).toISOString().slice(0, 10), to: new Date(now).toISOString().slice(0, 10) };
  const text = [`Week ${stats.from} to ${stats.to}: ${stats.analyzed} jobs analyzed, ${stats.applied} applications sent, ${stats.viewed} viewed, ${stats.replies} replies (${stats.interviews} interviews).`,
    applied.length ? `Applied: ${applied.slice(0, 10).map(jobLine).join("\n")}` : "",
    replies.length ? `Replies: ${replies.map((h) => `${day(h.at)} ${h.status}: [[job:${keyOf(h.r)}|${label(h.r)}]]`).join("; ")}` : "No replies this week.",
    upcoming.length ? `Upcoming interviews: ${upcoming.map((u) => `${u.date.replace("T", " ")} [[job:${keyOf(u.r)}|${label(u.r)}]]`).join("; ")}` : "",
    `Applications with no reply after the app's limit: ${noReply.length}.`,
    `To-do: ${doneWeek} steps done this week, ${addedWeek} added; ${stats.todoOpen} of ${stats.todoTotal} open.`].filter(Boolean).join("\n");
  return { stats, text };
}
