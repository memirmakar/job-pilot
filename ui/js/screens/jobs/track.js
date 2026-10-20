// What happened to a job and to the runs, in words: the status to show (statusHistory + the no-reply rule),
// the detail's timeline, the waiting count, and the problem state of the last run. No HTML here.
import { S } from "../../state.js";
import { STATUS } from "../../components/status-pill.js";
import { shortDay, time } from "./model.js";

const AFTER = new Set(["viewed", "interview", "offer", "rejected", "applied"]);
const REPLY = new Set(["interview", "offer", "rejected"]);
const DAY = 864e5;
export const noReplyDays = () => S.META.noReplyDays ?? 14;
const history = (r) => (r.statusHistory || []).filter((h) => AFTER.has(h.status));
const lastActivity = (r) => Math.max(Date.parse(r.submittedAt || r.createdAt || 0), ...(r.statusHistory || []).map((h) => Date.parse(h.at) || 0));

// "Thu, Oct 22" (+ time when set)
export const interviewDay = (d) => d ? new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

// -> { key, label } : the status the list and detail show. Old records without history show their status.
export function shown(r) {
  if (r.status !== "applied") return { key: r.status, label: null };
  const last = history(r).at(-1);
  if (last && last.status !== "applied" && last.status !== "viewed") {
    return { key: last.status, label: last.status === "interview" && last.date ? `Interview ${interviewDay(last.date)}` : null };
  }
  // No reply: N days since the last news (applied, viewed, or you moving it back to Applied)
  if (Date.now() - lastActivity(r) >= noReplyDays() * DAY) return { key: "no_reply", label: null, since: lastActivity(r) + noReplyDays() * DAY };
  return { key: last?.status === "viewed" ? "viewed" : "applied", label: null };
}
export const shownBucket = (r) => STATUS[shown(r).key]?.[2] || "";
export const waitingCount = () => S.DATA.filter((r) => r.status === "waiting_ok" && !r.archived).length;

// Timeline: Analyzed, Tailored, Applied, Viewed, Replied. Each { label, when, done }.
const stamp = (iso) => iso ? `${shortDay(iso)} ${time(iso)}` : "";
export function timeline(r) {
  const h = r.statusHistory || [], first = (s) => h.find((x) => x.status === s);
  const t = r.tailored, applied = r.status === "applied";
  const viewed = first("viewed"), reply = [...h].reverse().find((x) => REPLY.has(x.status));
  const s = shown(r);
  const notYet = {
    waiting_ok: "Waiting for your OK", approved: "Approved · sends next run", ready_to_apply: /limit/i.test(r.statusReason || "") ? "Held · daily limit reached" : "Not yet",
    external: "Not yet · on company site", needs_manual: "Needs you", resume_insufficient: "Not applied · below cutoff", skipped_by_user: "Skipped by you",
  }[r.status] || "Not yet";
  const replyWord = reply ? { interview: "Interview", offer: "Offer", rejected: "Rejected" }[reply.status] : "Replied";
  return [
    { label: "Analyzed", when: stamp(r.createdAt), done: true },
    { label: "Tailored", when: t?.used ? `from ${Math.round(t.baseScore)} to ${Math.round(t.versions?.[0]?.score ?? t.score)}` : t ? "Original kept" : "Not tailored", done: !!t?.used },
    { label: "Applied", when: applied ? stamp(r.submittedAt) || "Yes" : notYet, done: applied },
    { label: "Viewed", when: viewed ? `${shortDay(viewed.at)}${viewed.note === "Resume downloaded" ? " · resume downloaded" : ""}` : applied ? "Not viewed" : "", done: !!viewed },
    { label: replyWord, when: reply ? (reply.status === "interview" && reply.date ? `${interviewDay(reply.date)} ${time(reply.date)}` : shortDay(reply.at))
      : s.key === "no_reply" ? `None after ${noReplyDays()} days` : applied ? `No reply yet · ${Math.floor((Date.now() - Date.parse(r.submittedAt || r.createdAt)) / DAY)} days` : "", done: !!reply },
  ];
}
// The posting closed after you applied (from LinkedIn's job tracker)
export const closedAfterApply = (r) => (r.statusHistory || []).find((h) => h.status === "listing_closed");

// ----- the last run's problem state (Jobs-* boards); null when all is well or a run is going -----
// kind: loggedOut | runFailed | limited | firstDay. The run records the reason in outcome.stopKind; older runs only had text.
export function runProblem() {
  const run = S.STATE?.run;
  if (run?.running) return null;
  const last = S.RUNS?.[0], cur = run?.current;
  // A run that ended without writing its outcome (stopped from the app, or the PC slept)
  if (cur && cur.phase !== "done" && (!last || cur.startedAt > last.startedAt))
    return { kind: "runFailed", run: cur, at: cur.events?.at(-1)?.at || cur.startedAt, reason: "It ended before finishing: it was stopped, or the PC went to sleep or shut down." };
  if (!last) return S.DATA.length ? null : { kind: "firstDay" };
  const o = last.outcome || {};
  if (!o.stop) return null;
  const kind = o.stopKind || (/logged out of LinkedIn/i.test(o.stop) ? "linkedin_login" : "stopped");
  const at = o.stoppedAt || last.endedAt;
  if (kind === "linkedin_login") return { kind: "loggedOut", run: last, at };
  if (kind === "linkedin_limit") return { kind: "limited", run: last, at, resumeAt: o.resumeAt };
  const notes = (last.anomalies || []).filter((a) => a.kind !== "crash" && a.kind !== "linkedin_limit").map((a) => String(a.detail).split("\n")[0].slice(0, 140));
  return { kind: "runFailed", run: last, at, reason: o.stop, notes: [...new Set(notes)].filter((n) => !o.stop.includes(n)).slice(0, 2) };
}
