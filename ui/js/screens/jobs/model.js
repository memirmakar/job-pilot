// Jobs data: turns stored job records into what the list and detail show. No HTML here.
import { S } from "../../state.js";
import { statusBucket } from "../../components/status-pill.js";

export const keyOf = (r) => `${r.site}-${r.id}`;
export const target = () => S.META.tailorTarget ?? 80;
export const cutoff = () => S.META.minAtsScore ?? 55;

// ----- scores -----
// score: what counts now; from: the original resume's score when the tailored one is used
export function scores(r) {
  const t = r.tailored;
  if (t?.used) return { score: Math.round(t.score), from: Math.round(t.baseScore), state: "tailored" };
  return { score: Math.round(r.ats?.best_score ?? t?.baseScore ?? 0), from: null, state: t ? "kept" : "none" };
}
export const fromLabel = (r) => { const s = scores(r); return s.from != null ? `from ${s.from}` : s.state === "kept" ? "original kept" : "not tailored"; };

export function targetPill(score) {
  if (score >= target()) return ["Above your target", "success"];
  if (score >= cutoff()) return ["Below your target", "warning"];
  return ["Below your cutoff", "serious"];
}

// ----- how the application is sent -----
export function applyType(r) {
  if (r.easyApply === true) return "Easy Apply";
  if (r.easyApply === false || r.status === "external") return "External";
  return ["applied", "needs_manual", "dry_run", "ready_to_apply"].includes(r.status) ? "Easy Apply" : "";
}

// ----- skills -----
// The resume Claude would send: the tailored one when used, else the best original
export const sentResume = (r) => r.tailored?.used ? r.tailored.ats : r.ats?.resumes?.find((x) => x.file === r.ats.best_file);
const SKILL_KINDS = new Set(["skill", "tool", "domain_knowledge", "certification"]);
// Missing keywords minus the ones the keyword audit says aren't skills or are already covered by the profile
export function skills(r) {
  const e = sentResume(r) || {};
  const missing = new Map();
  for (const k of e.missing_keywords || []) {
    const a = S.AUDIT?.[String(k).replace(/[İIı]/g, "i").toLowerCase().trim()];
    if (!a) missing.set(k, k);
    else if (SKILL_KINDS.has(a.kind) && !a.satisfied_by_profile) missing.set(a.canonical, a.canonical);
  }
  return { matched: (e.matched_keywords || []).map((k) => String(k).replace(/\*\*/g, "")), missing: [...missing.values()] };
}

// ----- dates -----
const dayKey = (iso) => new Date(iso).toDateString();
const isToday = (iso) => iso && dayKey(iso) === new Date().toDateString();
export const time = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
export const shortDay = (iso) => !iso ? "" : isToday(iso) ? "Today" : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export function dayLabel(iso) {
  if (isToday(iso)) return "Today";
  if (dayKey(iso) === new Date(Date.now() - 864e5).toDateString()) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
// "today at 10:04" / "Fri, Oct 16 at 10:06"
export const at = (iso) => !iso ? "" : `${isToday(iso) ? "today" : new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${time(iso)}`;

export function posted(r) {
  if (!r.postedAt) return "";
  const d = Math.floor((Date.now() - Date.parse(r.postedAt)) / 864e5);
  return d < 1 ? "Posted today" : d < 2 ? "Posted 1 day ago" : d < 7 ? `Posted ${d} days ago` : d < 14 ? "Posted 1 week ago"
    : d < 60 ? `Posted ${Math.round(d / 7)} weeks ago` : `Posted ${Math.round(d / 30)} months ago`;
}
// LinkedIn shows applicants in the page's language ("33 başvuru", "12 kişi Başvur'u tıkladı"): keep the number
export const applicants = (r) => { const m = String(r.applicants || "").match(/\d[\d.,]*\+?/); return m ? `${m[0]} applicants` : ""; };
export const postedLine = (r) => [posted(r), applicants(r)].filter(Boolean).join(" · ");

// ----- list: archive, search, filter, grouping -----
export const FILTERS = [["all", "All"], ["todo", "To apply"], ["applied", "Applied"], ["external", "External"], ["attention", "Attention"]];
const MATCH = { all: () => true, external: (r) => applyType(r) === "External" };
export const matchesFilter = (r, f) => (MATCH[f] || ((x) => statusBucket(x.status) === f))(r);

export function matchesQuery(r, q) {
  if (!q) return true;
  const s = skills(r);
  return [r.title, r.company, r.field, ...s.matched, ...s.missing].join(" ").toLocaleLowerCase().includes(q.toLocaleLowerCase().trim());
}

export const GROUPS = [["day", "Day analyzed", "Newest run first"], ["score", "Score", "75 and up, 60 to 74, under 60"], ["field", "Field", "The field Claude searched for"]];
const BANDS = ["Strong match · 75 and up", "Good match · 60 to 74", "Weak match · under 60"];
const band = (s) => s >= 75 ? 0 : s >= 60 ? 1 : 2;

// -> [{ label, jobs }] in display order; jobs sorted by score within each group
export function group(rows, by) {
  const map = new Map();
  const add = (k, label, sort, r) => { if (!map.has(k)) map.set(k, { label, sort, jobs: [] }); map.get(k).jobs.push(r); };
  for (const r of rows) {
    if (by === "score") { const b = band(scores(r).score); add(b, BANDS[b], b, r); }
    else if (by === "field") add(r.field || "Other", r.field || "Other", r.field ? 0 : 1, r);
    else add(dayKey(r.createdAt), dayLabel(r.createdAt), -Date.parse(r.createdAt || 0), r);
  }
  const groups = [...map.values()];
  for (const g of groups) g.jobs.sort((a, b) => scores(b).score - scores(a).score);
  return groups.sort((a, b) => by === "field" ? a.sort - b.sort || b.jobs.length - a.jobs.length : a.sort - b.sort);
}

// ----- the numbers under the title: the live run, else the latest finished one -----
export function runNumbers() {
  const run = S.STATE?.run, last = S.RUNS?.[0];
  const live = run?.running ? run.current : null;
  const src = live || last;
  if (!src) return null;
  const from = Date.parse(src.startedAt), to = live ? Infinity : Date.parse(src.endedAt || src.startedAt) + 6e4;
  const made = S.DATA.filter((r) => { const t = Date.parse(r.createdAt); return t >= from && t <= to; });
  return {
    when: live ? "This run:" : isToday(src.startedAt) ? "Today" : `Last run ${shortDay(src.startedAt)}:`,
    analyzed: live ? live.counts?.analyzed || 0 : src.outcome?.analyzed ?? made.length,
    applied: live ? live.counts?.applied || 0 : src.outcome?.applied ?? made.filter((r) => r.status === "applied").length,
    external: made.filter((r) => r.status === "external").length,
  };
}

// ----- detail: answers and raise steps -----
export const answers = (r) => (r.steps || []).flatMap((s) => s.fields || []).filter((f) => f.source === "claude" && f.label);

export const RECTYPE = { project: "Portfolio project", github: "GitHub", portfolio: "Portfolio", certification: "Certification", course: "Course",
  skill: "Skill", resume: "Resume edit", linkedin_profile: "LinkedIn profile", other: "Other" };
// Claude stores effort as a bucket, not a duration: rank by points per (rough) hour
const HOURS = { hours: 3, days: 16, weeks: 60, months: 200 };
export const EFFORT = { hours: "A few hours", days: "A few days", weeks: "A few weeks", months: "Months" };

// Steps for the score that counts now: the tailored resume's when it's used
export function raise(r) {
  const recs = (r.tailored?.used && r.tailored.recommendations?.length ? r.tailored.recommendations : r.ats?.recommendations) || [];
  const items = recs.filter((x) => x.action).map((x) => ({ ...x, gain: Math.max(0, Math.round(x.estimated_gain || 0)) }))
    .sort((a, b) => b.gain / (HOURS[b.effort] || 60) - a.gain / (HOURS[a.effort] || 60));
  const now = scores(r).score;
  const potential = Math.min(100, now + items.reduce((s, x) => s + x.gain, 0));
  return { items, now, potential };
}
