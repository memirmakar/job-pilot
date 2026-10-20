// Insights data -> what the tabs show: fields, the pipeline counts, the score bands and the to-do items.
// The to-do items come from /api/insights (todo.mjs on the server); the Jobs raise card reads the same items through todoFor().
// No HTML here.
import { S } from "../../state.js";
import { shown, noReplyDays } from "../jobs/track.js";
import { scores, keyOf, target, cutoff, RECTYPE, EFFORT } from "../jobs/model.js";

export const DAY = 864e5;
export const byKey = () => new Map(S.DATA.map((r) => [keyOf(r), r]));
export const fieldOf = (r) => S.INS?.jobFields?.[keyOf(r)] || r.field || "Other";
export const goalFields = () => S.INS?.fields || [];
export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const monthDay = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
// Below this many applications a rate isn't shown
export const MIN_SAMPLE = 15;

// ----- Pipeline -----
const REPLY = new Set(["interview", "offer", "rejected"]);
export const replied = (r) => (r.statusHistory || []).some((h) => REPLY.has(h.status));
const interviewed = (r) => (r.statusHistory || []).some((h) => h.status === "interview" || h.status === "offer");
export const STAGES = ["Analyzed", "Picked", "Applied", "Replied", "Interview"];

// Jobs analyzed in the period (by the day Claude read them), then how far each got
export function pipeline(period, field) {
  const days = period === "week" ? 7 : 30, from = Date.now() - days * DAY;
  const inField = (f) => field === "all" || f === field;
  const recs = S.DATA.filter((r) => Date.parse(r.createdAt) >= from && inField(fieldOf(r)));
  const notPicked = (S.INS?.notPicked || []).filter((x) => Date.parse(x.at) >= from && inField(x.field));
  const applied = recs.filter((r) => r.status === "applied");
  const nums = [recs.length + notPicked.length, recs.length, applied.length, applied.filter(replied).length, applied.filter(interviewed).length];
  return { range: `${monthDay(from)} – ${monthDay(Date.now())}`, nums, days };
}

// "After you applied": applications sent in the period, all fields, by the status they show now
export const AFTER = [["interview", "Interview", "success"], ["offer", "Offer", "success"], ["rejected", "Rejected", "serious"],
  ["viewed", "Viewed, no reply yet", "info"], ["applied", "Waiting, under {n} days", "neutral"], ["no_reply", "No reply after {n} days", "warning"]];
export function afterApplied(period) {
  const from = Date.now() - (period === "week" ? 7 : 30) * DAY;
  const sent = S.DATA.filter((r) => r.status === "applied" && Date.parse(r.submittedAt || r.createdAt) >= from);
  const counts = {};
  for (const r of sent) { const k = shown(r).key; counts[k] = (counts[k] || 0) + 1; }
  return { n: sent.length, rows: AFTER.map(([k, label, tone]) => ({ label: label.replace("{n}", noReplyDays()), tone, n: counts[k] || 0 })) };
}

// "Does your score predict replies?": applications that have had time for an answer, by the score of the resume sent
export function bands() {
  const T = target();
  const decided = S.DATA.filter((r) => r.status === "applied" && (replied(r) || shown(r).key === "no_reply"));
  const cut = [[0, T - 10, `Under ${T - 10}`], [T - 10, T, `${T - 10}–${T - 1}`], [T, T + 10, `${T}–${Math.min(99, T + 9)}`], [T + 10, 101, `${T + 10}+`]];
  const rows = cut.filter(([lo]) => lo <= 100).map(([lo, hi, label]) => {
    const rs = decided.filter((r) => { const s = scores(r).score; return s >= lo && s < hi; });
    const r = rs.filter(replied).length;
    return { label, n: rs.length, r, rate: rs.length >= MIN_SAMPLE ? Math.round((r / rs.length) * 100) : null, target: lo === T };
  });
  const side = (above) => { const rs = decided.filter((r) => (scores(r).score >= T) === above); return { n: rs.length, r: rs.filter(replied).length }; };
  return { T, rows, n: decided.length, above: side(true), below: side(false), all: S.DATA.filter((r) => r.status === "applied").length };
}
// The target suggestion only when both sides have enough answers
export function suggestion(b) {
  const { T, above: A, below: B } = b;
  if (A.n < MIN_SAMPLE || B.n < MIN_SAMPLE) return { kind: "wait" };
  const ra = Math.round((A.r / A.n) * 100), rb = Math.round((B.r / B.n) * 100);
  if (ra >= rb + 10) return { kind: "keep", ra, rb };
  if (ra <= rb + 3) return { kind: "lower", ra, rb, to: Math.max(cutoff() + 5, T - 5) };
  return { kind: "small", ra, rb };
}

// ----- To-do -----
const KIND = { ...RECTYPE, resume: "Resume edit", applications: "Applications", linkedin: "LinkedIn profile", practice: "Practice" };
const IMPACT = { high: "High impact", medium: "Medium impact", low: "Low impact" };
const hoursText = (h) => h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} ${h === 1 ? "hour" : "hours"}`;
// A short label for a step Claude hasn't titled yet: its first clause
export const shortLabel = (t) => { const s = String(t || "").replace(/\*\*/g, "").split(/(?<=[.:;])\s|\s[–—]\s/)[0].replace(/[.:;]$/, ""); return s.length > 90 ? s.slice(0, 88).replace(/\s+\S*$/, "") + "…" : s; };

// -> items in rank order: { id, rank, label, do, why, kind, time, hours, jobs[{k r gain}], lo hi total, value, done, added, hidden, market }
export function todoItems() {
  const map = byKey(), cut = cutoff();
  const list = (S.INS?.todo?.items || []).map((it) => {
    const jobs = it.jobs.map((j) => ({ ...j, r: map.get(j.k) })).filter((j) => j.r && !j.r.archived);
    const gains = jobs.map((j) => j.gain), total = gains.reduce((s, g) => s + g, 0);
    return {
      ...it, jobs, total, lo: gains.length ? Math.min(...gains) : 0, hi: gains.length ? Math.max(...gains) : 0,
      value: total + (it.value - it.points), label: it.title || shortLabel(it.do), kind: KIND[it.kind] || "Other",
      time: it.effort ? EFFORT[it.effort] || it.effort : hoursText(it.hours || 1),
      // only lifts jobs outside your fields that are below your cutoff
      hidden: !it.market && (!jobs.length || jobs.every((j) => fieldOf(j.r) === "Other" && scores(j.r).score < cut)),
    };
  });
  return list.sort((a, b) => b.value / b.hours - a.value / a.hours || b.total - a.total).map((x, i) => ({ ...x, rank: i + 1 }));
}
export const ptsText = (it) => it.jobs.length ? `+${it.lo === it.hi ? it.lo : `${it.lo}–${it.hi}`} on ${plural(it.jobs.length, "job")}` : it.impact ? IMPACT[it.impact] : "";
export const companiesText = (it) => {
  if (!it.jobs.length) return it.market ? "From the market review" : it.custom ? "Added from Guidance" : "No open jobs";
  const names = [...new Set(it.jobs.map((j) => j.r.company))];
  return names.slice(0, 3).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : "");
};
// One job's line in a step: score now -> after, and whether the re-score is waiting or done
export function jobLift(it, j) {
  const s = scores(j.r).score, rs = j.r.rescored;
  if (j.r.status === "applied") return { before: s, after: null, note: "already applied" };
  if (rs?.items?.includes(it.id)) return { before: rs.from, after: rs.to, note: "re-scored" };
  if (j.r.rescore?.items?.includes(it.id)) return { before: s, after: Math.min(100, s + j.gain), note: "re-score next run" };
  return { before: s, after: Math.min(100, s + j.gain), note: it.done ? "" : "when done" };
}

// The Jobs raise card: the to-do item behind each of a job's steps, in the job's own step order
export function todoFor(r) {
  const ids = S.INS?.jobItems?.[keyOf(r)] || [], all = new Map(todoItems().map((i) => [i.id, i]));
  return ids.map((id) => all.get(id) || null);
}
