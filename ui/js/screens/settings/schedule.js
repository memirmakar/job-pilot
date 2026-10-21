// Settings > Schedule (board Settings-Schedule): the Windows scheduled task (on/off, time, days; server installs it with
// Task Scheduler), posted-within, "No reply after N days", the per-profile limits, and quitting the app.
import { S } from "../../state.js";
import { esc, fmtDate } from "../../util.js";
import { callout } from "../../components/card.js";
import { shown, lastActivity } from "../jobs/track.js";
import { settings, profile, saveSettings } from "./index.js";

const DAYS = [["Mon", "Monday"], ["Tue", "Tuesday"], ["Wed", "Wednesday"], ["Thu", "Thursday"], ["Fri", "Friday"], ["Sat", "Saturday"], ["Sun", "Sunday"]];
const POSTED = [["r86400", "the last 24 hours"], ["r604800", "the last week"], ["r2592000", "the last month"]];
const row = (label, sub, body) => `<div class="st-srow"><span class="st-srow__head"><span class="st-row__label">${label}</span><span class="foot">${sub}</span></span><span class="st-srow__body">${body}</span></div>`;

// The same words as the top bar
const nextRun = () => S.STATE.schedule?.exists ? `Next run <span class="jp-num">${esc(fmtDate(S.STATE.schedule.next))}</span>` : "Not scheduled";

// "At 14, Embedded Software Engineer at X becomes No reply on Oct 26": the next applied job to cross the line
function noReplyExample(n) {
  const soon = S.DATA.filter((r) => r.status === "applied" && !r.archived && ["applied", "viewed"].includes(shown(r).key))
    .map((r) => ({ r, at: lastActivity(r) + n * 864e5 })).filter((x) => x.at > Date.now()).sort((a, b) => a.at - b.at)[0];
  if (!soon) return "Applications with no news for this many days show as No reply on Jobs and in Insights.";
  const day = new Date(soon.at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `At <span class="jp-num">${n}</span>, ${esc(soon.r.title)} at ${esc(soon.r.company)} becomes No reply on ${day}.`;
}

function limits() {
  const s = settings(), on = (profile().targets || []).filter((t) => t.on !== false);
  const per = on.map((t) => ({ f: t.field, n: Math.min(t.dailyApplyLimit ?? s.dailyApplyLimit, s.dailyApplyLimit) }));
  const own = per.filter((x, i) => on[i].dailyApplyLimit != null);
  return `<span class="meta">At most <span class="data">${s.dailyApplyLimit}</span> a day${own.length ? `: ${own.map((x) => `${esc(x.f)} <span class="jp-num">${x.n}</span>`).join(", ")}` : ", shared by every profile"}</span>
    <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="set-sec" data-v="profiles">Change</button>`;
}

export function scheduleHtml() {
  const s = settings(), on = !!s.scheduleEnabled, days = s.scheduleDays?.length ? s.scheduleDays : DAYS.map(([d]) => d);
  return `<div class="st-head"><div class="st-head__text"><h2 class="t-title2">Schedule</h2>
      <p class="meta">When Claude runs, which listings it looks at, and how long it waits before calling an application No reply.</p></div></div>
    <div class="jp-list st-narrow">
      ${row("Daily run", "Searches, scores and applies", `<span class="st-inline">
          <button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="Run on a schedule" data-action="set-toggle" data-key="scheduleEnabled" data-msg="${on ? "Scheduled runs are off." : "Scheduled runs are on."}"></button>
          <label class="jp-field st-time"><span class="sr-only">Run time</span><input class="jp-input jp-num" type="time" data-set="scheduleTime" value="${esc(s.scheduleTime)}"${on ? "" : " disabled"}></label>
          <span class="st-chips" role="group" aria-label="Days">${DAYS.map(([d, full]) => `<button class="chip st-day" type="button" aria-pressed="${days.includes(d)}" aria-label="${full}" data-action="sched-day" data-v="${d}"${on ? "" : " disabled"}>${d}</button>`).join("")}</span></span>
        <span class="foot">${nextRun()}. If this computer is asleep then, the run starts when it wakes. You need to be signed in to Windows.</span>
        ${on && !S.STATE.schedule?.exists ? callout(`Daily runs are on here, but Windows has no "Job Pilot daily run" task, so they won't start. <button class="jp-btn jp-btn--sm st-fix" type="button" data-action="sched-fix">Set it up again</button>`, "warning") : ""}`)}
      ${row("Listings posted within", "Older listings aren't searched", `<label class="jp-field st-sel"><span class="sr-only">Posted within</span>
        <select class="jp-input" data-set="postedWithin">${POSTED.map(([v, l]) => `<option value="${v}"${v === s.postedWithin ? " selected" : ""}>${l}</option>`).join("")}</select></label>`)}
      ${row("No reply after", "Used on Jobs and in Insights", `<span class="st-inline"><label class="jp-field st-numw"><span class="sr-only">Days before No reply</span>
          <input class="jp-input jp-num" type="number" min="3" max="60" data-set="noReplyDays" data-type="num" value="${s.noReplyDays}"></label><span class="meta">days without a reply</span></span>
        <span class="foot">${noReplyExample(s.noReplyDays)}</span>`)}
      ${row("Daily limit", "Set on each search profile", `<span class="st-inline">${limits()}</span>`)}
      ${row("Job Pilot's page", "This window and its server", `<span class="st-inline"><button class="jp-btn jp-btn--sm" type="button" data-action="quit">Quit Job Pilot</button></span>
        <span class="foot">Scheduled runs still happen after you quit. Open Job Pilot again from its desktop shortcut.</span>`)}
    </div>`;
}

export const SCHEDULE_ACTIONS = {
  "sched-fix": () => saveSettings({ reapplySchedule: true }, "Asked Windows to set up the daily run."),
  "sched-day": (el) => {
    const cur = settings().scheduleDays?.length ? settings().scheduleDays : DAYS.map(([d]) => d), d = el.dataset.v;
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
    if (!next.length) return saveSettings({ scheduleEnabled: false }, "No days left, so scheduled runs are off.");
    return saveSettings({ scheduleDays: DAYS.map(([x]) => x).filter((x) => next.includes(x)) }, "Saved. Windows runs Job Pilot on those days.");
  },
};
