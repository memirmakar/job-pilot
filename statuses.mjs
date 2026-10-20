// What happened after Applied: rec.statusHistory[{ status, at, source, note, date }], kept apart from rec.status
// (which stays "applied"), so old records read as before. The app shows the latest entry; "no reply" is computed
// in the app from settings.noReplyDays, never stored.
//   status: viewed | interview | offer | rejected | applied (back to applied) | listing_closed (information only)
//   source: linkedin (the run's job tracker read) | you (marked in the job detail)
//   date:   interview date and time (local, "2026-10-22T14:00"), when you entered one
import { loadRecord, saveRecord, writeLog } from "./store.mjs";

export const MANUAL = ["interview", "offer", "rejected", "applied"];

export function addHistory(rec, entry) {
  (rec.statusHistory ||= []).push({ at: new Date().toISOString(), ...entry });
  return rec;
}
export const hasHistory = (rec, test) => (rec.statusHistory || []).some(test);

// Marked by hand in the job detail
export function markStatus(site, id, { status, date = null, note = "" } = {}) {
  const r = loadRecord(String(site).replace(/[^\w-]/g, ""), String(id).replace(/[^\w-]/g, ""));
  if (!r) throw new Error("Job not found");
  if (r.status !== "applied") throw new Error("Only jobs you applied to can be marked");
  if (!MANUAL.includes(status)) throw new Error("Unknown status");
  if (status === "interview" && date && !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(date)) throw new Error("Pick a date and time");
  addHistory(r, { status, source: "you", ...(status === "interview" && date ? { date: date.slice(0, 16) } : {}), ...(note ? { note: String(note).slice(0, 300) } : {}) });
  saveRecord(r);
  writeLog({ ...r, status: `marked_${status}`, reason: status === "interview" && date ? `interview ${date.slice(0, 16)}` : "marked by you" });
  return r;
}
