// Windows toasts at the end of a run (store.mjs notify, through PowerShell; no packages). One per kind, each switchable in
// Settings > Notifications (settings.notify): errors when the run stopped early, else run finished; needs you (jobs held for
// your OK or needing manual work this run); replies (LinkedIn job tracker news this run).
import { loadAllRecords, notify } from "./store.mjs";

const REPLY = { viewed: "viewed", interview: "an interview", offer: "an offer", rejected: "a decline" };
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function runNotices(run, summary, stop) {
  if (stop) notify("Job Pilot stopped early", `${summary} ${stop}`, "errors");
  else notify("Job Pilot finished", summary, "run");
  const since = run.startedAt, recs = loadAllRecords();
  const held = recs.filter((r) => !r.archived && (r.updatedAt || "") >= since);
  const waiting = held.filter((r) => r.status === "waiting_ok").length, manual = held.filter((r) => r.status === "needs_manual").length;
  if (waiting || manual) notify("Job Pilot needs you", [waiting && `${plural(waiting, "job")} waiting for your OK`, manual && `${plural(manual, "job")} need manual work`].filter(Boolean).join(", ") + ".", "needsYou");
  const news = recs.flatMap((r) => (r.statusHistory || []).filter((h) => h.source === "linkedin" && h.at >= since && REPLY[h.status]).map((h) => ({ r, h })));
  if (news.length) {
    const first = news.find((n) => n.h.status === "interview" || n.h.status === "offer") || news[0];
    notify(news.length === 1 ? `News from ${first.r.company}` : `${news.length} replies from employers`,
      `${first.r.title} at ${first.r.company}: ${REPLY[first.h.status]}${news.length > 1 ? `, and ${plural(news.length - 1, "more")}` : ""}.`, "replies");
  }
}
