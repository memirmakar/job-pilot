// Guidance data -> what the screen shows: conversation groups, which messages a view shows, the interview plan, words. No HTML here.
import { S } from "../../state.js";
import { keyOf, scores } from "../jobs/model.js";
import { plainText } from "../../components/coach-text.js";

export const LANGS = [["en", "English"], ["tr", "Türkçe"]];
export const jobOf = (key) => S.DATA.find((r) => keyOf(r) === key) || null;
export const current = () => S.g.convs[S.g.sel] || null;
export const scoreOf = (r) => r ? scores(r).score : null;
export const isRunning = (cid) => !!(S.g.pending[cid] || S.g.serverPending[cid]);

export const day = (iso) => {
  if (!iso) return "";
  const d = new Date(iso), t = new Date();
  if (d.toDateString() === t.toDateString()) return "Today";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};
// "2026-10-13" -> "Oct 13" (dates without a time are read as local days)
export const monthDay = (d) => new Date(`${String(d).slice(0, 10)}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const time = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
export const money = (n) => `$${(n || 0).toFixed(n >= 1 ? 2 : 3)}`;

// The left column: pinned weekly check-in, then job conversations (from "Ask Claude about this job"), then general ones
export function groups() {
  const list = S.g.list || [{ cid: "weekly", kind: "weekly", title: "Weekly check-ins", last: "" }];
  const row = (c) => {
    const r = c.kind === "job" ? jobOf(c.cid) : null;
    return { ...c, isJob: c.kind === "job", score: scoreOf(r), title: c.kind === "job" && r && c.title === r.title ? r.title : c.title,
      sub: c.kind === "job" ? [c.company || r?.company, c.last].filter(Boolean).join(" · ") : c.kind === "weekly" ? c.last : `${day(c.updatedAt)}${c.last ? ` · ${c.last}` : ""}`,
      badge: c.interview ? "Mock interview · live" : isRunning(c.cid) ? "Claude is thinking" : "", current: c.cid === S.g.sel };
  };
  const neu = S.g.sel === "new" ? [{ cid: "new", kind: "general", title: "New conversation", sub: "Not started", current: true, isJob: false }] : [];
  // A job's conversation opened from Jobs shows before its first message
  const sel = jobOf(S.g.sel), opened = sel && !list.some((c) => c.cid === S.g.sel) ? [row({ cid: S.g.sel, kind: "job", title: sel.title, company: sel.company, last: "Not started" })] : [];
  return [
    { label: "Pinned", items: list.filter((c) => c.kind === "weekly").map(row) },
    { label: "From “Ask Claude about this job”", items: [...opened, ...list.filter((c) => c.kind === "job").map(row)] },
    { label: "General", items: [...neu, ...list.filter((c) => c.kind === "general").map(row)] },
  ].filter((g) => g.items.length);
}

const IV = new Set(["iv-intro", "iv-question", "iv-answer", "iv-feedback"]);
// Chat view: everything (the weekly one from its latest check-in, unless earlier ones are shown); interview view: this interview's turns
export function chatMessages(c) {
  let ms = c.messages.map((m, i) => ({ ...m, i }));
  if (c.interview) ms = ms.filter((m) => !(IV.has(m.kind) && m.at >= c.interview.startedAt));
  if (c.kind === "weekly" && !S.g.history) {
    const last = ms.map((m) => m.kind).lastIndexOf("checkin");
    if (last > 0) ms = ms.slice(last);
  }
  return ms;
}
export const earlierCount = (c) => c.kind === "weekly" ? Math.max(0, c.messages.filter((m) => m.kind === "checkin").length - 1) : 0;
export const interviewMessages = (c) => c.messages.map((m, i) => ({ ...m, i })).filter((m) => IV.has(m.kind) && m.at >= c.interview.startedAt);

// The plan in the right column: Done, Skipped, Now, Next
export function plan(iv) {
  return iv.plan.map((p, i) => {
    const a = iv.answers[i], st = i < iv.i ? (a?.skipped ? "skipped" : "done") : i === iv.i ? "now" : "next";
    return { n: i + 1, about: p.about, q: p.q, status: { done: ["Done", "success"], skipped: ["Skipped", "neutral"], now: ["Now", "accent"], next: ["Next", "neutral"] }[st], st };
  });
}
// A Turkish posting gets a Turkish interview by default
export const langGuess = (r) => (String(r?.description || "").match(/[ğışİĞŞ]/g) || []).length > 15 ? "tr" : "en";
export const elapsed = (iso) => { const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

// What the right column lists under "Jobs it uses": this conversation's job and the few most relevant others (the server picks)
export function contextJobs(c) {
  const off = new Set(c.context.off || []);
  return (c.shownJobs || []).map(jobOf).filter(Boolean).map((r) => ({ r, k: keyOf(r), on: !off.has(keyOf(r)), score: scoreOf(r) }));
}
export const counts = () => ({
  originals: S.RES?.originals?.length || 0, ready: S.RES?.ready?.length || 0, tailored: S.RES?.tailored?.length || 0,
  repos: S.GH?.repos?.length || 0, jobs: S.DATA.length,
  market: S.MARKET?.review ? S.MARKET : null,
});
export const preview = (t, n = 90) => { const s = plainText(t).replace(/\s+/g, " "); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
// Phone: the list, then the conversation
export const phone = () => matchMedia("(max-width: 900px)").matches;
