// Activity data → words: each run's date, result, counts and summary, and what Claude did with each job (and why). No HTML here.
import { S } from "../../state.js";
import { STATUS } from "../../components/status-pill.js";

const DAY = 864e5;
const dayKey = (iso) => new Date(iso).toDateString();
export const time = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
export const short = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
// "Today · Tue, Oct 20" / "Yesterday · Mon, Oct 19" / "Fri, Oct 16"
export function runDay(iso) {
  const d = new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (dayKey(iso) === dayKey(Date.now())) return `Today · ${d}`;
  if (dayKey(iso) === dayKey(Date.now() - DAY)) return `Yesterday · ${d}`;
  return d;
}
// "today 10:04" / "Oct 16 10:04"
export const when = (iso) => `${dayKey(iso) === dayKey(Date.now()) ? "today" : short(iso)} ${time(iso)}`;
export function duration(a, b) {
  const s = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
const cutoff = () => S.META.minAtsScore ?? 55;
const target = () => S.META.tailorTarget ?? 80;

// status -> [what Claude did, tone, tab]; tab: applied | prepared | skipped | problem
const OUT = {
  applied: ["Applied", "success", "applied"], dry_run: ["Test run · not sent", "neutral", "prepared"],
  waiting_ok: ["Waiting for your OK", "warning", "prepared"], approved: ["Approved", "accent", "prepared"],
  external: ["Apply externally", "info", "prepared"], ready_to_apply: ["Ready to apply", "accent", "prepared"],
  needs_manual: ["Needs manual", "warning", "prepared"],
  resume_insufficient: ["Skipped", "neutral", "skipped"], filtered: ["Skipped", "neutral", "skipped"], not_selected: ["Not picked", "neutral", "skipped"],
  already_applied: ["Skipped", "neutral", "skipped"], closed: ["Skipped", "neutral", "skipped"], skipped_by_user: ["Skipped by you", "neutral", "skipped"],
  error: ["Error", "danger", "problem"], parse_error: ["Couldn't read page", "warning", "problem"],
};
export const outcome = (status) => OUT[status] || [STATUS[status]?.[0] || "Other", STATUS[status]?.[1] || "neutral", "prepared"];

// Why, in the user's words
function why(j) {
  const r = j.reason || "";
  const base = {
    applied: () => r || (j.score != null && j.score >= target() ? `Easy Apply · above your target of ${target()}` : "Easy Apply"),
    dry_run: () => "Test run: filled the form and stopped before Submit",
    waiting_ok: () => r || "Held for your OK before sending",
    external: () => "Application is on the company's site · your tailored resume is ready",
    ready_to_apply: () => /limit/i.test(r) ? "Daily limit reached · ready for you to send" : r || "Ready for you to send",
    resume_insufficient: () => {
      const m = r.match(/(\d+)\s*<\s*(\d+)/), s = m ? m[1] : j.score, c = m ? m[2] : cutoff();
      return s != null ? `Below cutoff · ${s}, your cutoff is ${c}` : "Below cutoff";
    },
    filtered: () => /excluded/i.test(r) || !r ? "On your never-apply list" : r,
    not_selected: () => "Claude didn't pick it: not a fit for your goals",
    already_applied: () => j.appliedBefore ? `Already applied on ${short(j.appliedBefore)}` : "Already applied",
    closed: () => "Listing closed · no longer accepting applications",
    error: () => /plan limit/i.test(r) ? "Claude plan limit reached · tried again next run" : r ? r.slice(0, 160) : "Something went wrong on this job",
    parse_error: () => "LinkedIn's job page couldn't be read",
  }[j.status];
  const text = base ? base() : r;
  return j.repostOf ? `Re-post of a job you saw on ${short(j.repostOf)}${text ? " · " + text : ""}` : text;
}

export const jobRow = (j) => { const [out, tone, tab] = outcome(j.status); return { ...j, out, tone, tab, why: why(j), low: j.score != null && j.score < cutoff() }; };

// The run's result: [label, tone, kind] ; kind: ok | stopped | paused | live | earlier
export function result(r) {
  if (r.live) return ["Running", "info", "live"];
  if (r.earlier) return ["From the log", "neutral", "earlier"];
  if (r.unfinished) return ["Stopped", "danger", "stopped"];
  const k = r.outcome?.stopKind;
  if (k === "claude_limit" || k === "linkedin_limit") return ["Paused", "warning", "paused"];
  if (r.outcome?.stop) return ["Stopped", "danger", "stopped"];
  return ["Finished", "success", "ok"];
}
export const hasProblem = (r) => ["stopped", "paused"].includes(result(r)[2]);

const PAST_PICK = new Set(["filtered", "not_selected", "closed", "already_applied"]);
export function counts(r, rows) {
  const n = (tab) => rows.filter((x) => x.tab === tab).length;
  const analyzed = r.outcome?.analyzed ?? r.counts?.analyzed ?? rows.filter((x) => !PAST_PICK.has(x.status)).length;
  return { analyzed, picked: r.selection?.picked ?? (r.onlyJob ? 1 : rows.filter((x) => !PAST_PICK.has(x.status)).length),
    applied: r.outcome?.applied ?? n("applied"), skipped: n("skipped"), problems: n("problem") };
}

// Why a stopped run stopped, and the anomalies worth showing beside it
export function stopReason(r) {
  if (r.unfinished) return "It ended before finishing: it was stopped, or the PC went to sleep or shut down.";
  return r.outcome?.stop || "";
}
export function stopNotes(r) {
  const stop = stopReason(r);
  return [...new Set((r.anomalies || []).filter((a) => a.kind !== "crash" && a.kind !== "linkedin_limit").map((a) => a.detail))].filter((d) => d && !stop.includes(d)).slice(0, 3);
}

// One line for the collapsed row
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export function summary(r, rows) {
  const k = result(r)[2];
  if (k === "live") return "Running now";
  if (k === "stopped" || k === "paused") { const s = stopReason(r); return s.length > 140 ? s.slice(0, 139) + "…" : s; }
  const by = (s) => rows.filter((x) => x.status === s).length;
  const parts = [
    by("applied") && plural(by("applied"), "applied", "applied"), by("waiting_ok") && `${by("waiting_ok")} waiting for your OK`,
    by("external") && `${by("external")} to apply externally`, by("ready_to_apply") && `${by("ready_to_apply")} ready to send`,
    by("needs_manual") && `${by("needs_manual")} need you`, by("dry_run") && plural(by("dry_run"), "test application", "test applications"),
    by("error") && plural(by("error"), "error", "errors"),
  ].filter(Boolean);
  return parts.join(", ") || (rows.length ? `${plural(rows.length, "job", "jobs")} looked at, none to apply` : r.lastLine || r.outcome?.summary || "Nothing new to look at");
}
// A line under the alert: how Claude picked, or why an earlier run has no details
export function note(r) {
  if (r.earlier) return "From the activity log, before run details were saved. Duration and counts come from the log only.";
  const s = r.selection;
  if (s?.candidates != null) return `Claude picked ${s.picked} of ${s.candidates} new listings${s.skipped_summary ? `. ${s.skipped_summary}` : "."}`;
  if (r.counts?.listings_seen) return `Found ${r.counts.listings_seen} listings on LinkedIn before the run ended.`;
  if (r.onlyJob) return r.dryRun ? "A test run on one job." : "A run on one job.";
  return "";
}
