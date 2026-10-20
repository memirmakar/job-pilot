// Waiting for your OK: which jobs the run holds, what you approved, and the queue the next run sends.
// Held jobs (status waiting_ok) have their form filled but not submitted. Approving stores your edited answers in
// rec.approval and sets status "approved"; the next run, or a single-job "Send now" run, submits with exactly those.
import { loadAllRecords, loadRecord, saveRecord, writeLog } from "./store.mjs";

const key = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

// null = submit as usual; otherwise the reason the job waits (shown in the app)
export function holdReason(mode, score, target) {
  if (mode === "ask_all") return "You approve every application before it's sent.";
  if (mode === "ask_below_target" && score < target) return `It scored ${score}, under your target of ${target}, so Claude asks before it applies.`;
  return null;
}

// The approved answer for a form question, or null when it wasn't in the review sheet
export function approvedValue(rec, label) {
  const hit = (rec.approval?.answers || []).find((a) => key(a.label) === key(label));
  return hit ? String(hit.value ?? "") : null;
}

export const queued = () => loadAllRecords().filter((r) => r.status === "approved" && !r.archived);

function load(site, id) {
  const r = loadRecord(String(site).replace(/[^\w-]/g, ""), String(id).replace(/[^\w-]/g, ""));
  if (!r) throw new Error("Job not found");
  return r;
}

// answers: [{ label, value }] from the review sheet
export function approve(site, id, answers) {
  const r = load(site, id);
  if (r.status !== "waiting_ok") throw new Error("This job isn't waiting for your OK any more");
  const clean = (Array.isArray(answers) ? answers : []).filter((a) => a && a.label).map((a) => ({ label: String(a.label), value: String(a.value ?? "").slice(0, 4000) }));
  r.approval = { at: new Date().toISOString(), answers: clean };
  r.status = "approved";
  r.statusReason = "Approved by you; it's sent on the next run";
  saveRecord(r);
  writeLog({ ...r, reason: "approved by you" });
  return r;
}

export function skip(site, id) {
  const r = load(site, id);
  if (!["waiting_ok", "approved"].includes(r.status)) throw new Error("Only jobs waiting for your OK can be skipped");
  r.approval = { ...(r.approval || {}), skipped: new Date().toISOString() };
  r.status = "skipped_by_user";
  r.statusReason = "Skipped by you; nothing was sent";
  saveRecord(r);
  writeLog({ ...r, reason: "skipped by you" });
  return r;
}

export function requireApproved(site, id) {
  const r = load(site, id);
  if (r.status !== "approved") throw new Error("Approve this job first");
  return r;
}
