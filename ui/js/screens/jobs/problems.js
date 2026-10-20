// Problem states on Jobs (boards Jobs-LoggedOut, Jobs-RunFailed, Jobs-Limited, Jobs-FirstDay): one callout above the
// list with one primary action, the line under the title, and the first-day card in place of the detail.
import { S } from "../../state.js";
import { esc } from "../../util.js";
import { runProblem } from "./track.js";
import * as M from "./model.js";

const num = (x) => `<span class="data" style="color:var(--text)">${esc(x)}</span>`;
const when = (iso) => !iso ? "" : M.shortDay(iso) === "Today" ? `today at ${M.time(iso)}` : M.at(iso);
const nextRun = () => S.STATE?.schedule?.exists && S.STATE.schedule.next ? new Date(S.STATE.schedule.next) : null;
const nextText = () => { const n = nextRun(); return n ? when(n.toISOString()) : "when you press Run now"; };
const counts = (run) => ({ analyzed: run?.outcome?.analyzed ?? run?.counts?.analyzed ?? 0, applied: run?.outcome?.applied ?? run?.counts?.applied ?? 0 });

// The meta line under "Jobs" when a problem replaces the run numbers; null = use the normal numbers
export function problemLine(p = runProblem()) {
  if (!p) return null;
  if (p.kind === "firstDay") return `No jobs yet · first run ${esc(nextText())}`;
  const c = counts(p.run), day = M.shortDay(p.run.startedAt) === "Today" ? "Today" : `Last run ${esc(M.shortDay(p.run.startedAt))}:`;
  if (p.kind === "loggedOut" && !c.analyzed) return `The last run didn't start · ${esc(when(p.run.startedAt))}`;
  const tail = { loggedOut: "stopped at", runFailed: "run stopped at", limited: "paused at" }[p.kind];
  return `${day} ${num(c.analyzed)} analyzed · ${num(c.applied)} applied · ${tail} ${num(M.time(p.at))}`;
}

const box = (tone, text, buttons) => `<div class="jp-callout jp-callout--${tone} jobs-problem" role="${tone === "danger" ? "alert" : "status"}">
  <span class="jp-callout__icon" aria-hidden="true">!</span>
  <span class="jobs-problem__body"><span>${text}</span><span class="jobs-problem__btns">${buttons}</span></span></div>`;

export function problemCallout(p = runProblem()) {
  if (!p || p.kind === "firstDay") return "";
  const c = counts(p.run);
  if (p.kind === "loggedOut") return box("danger",
    `<b>You're logged out of LinkedIn.</b> ${c.analyzed ? `The run ${esc(when(p.at))} stopped after ${c.analyzed} ${c.analyzed === 1 ? "job" : "jobs"}.` : `The run ${esc(when(p.run.startedAt))} couldn't start.`} Log in to LinkedIn, then run again.`,
    `<button class="jp-btn jp-btn--primary jp-btn--sm" type="button" data-action="linkedin-login">Log in to LinkedIn</button>
     <a class="jp-btn jp-btn--plain jp-btn--sm" href="#doctor" data-nav="doctor">Open Doctor</a>`);
  if (p.kind === "limited") return box("warning",
    `<b>LinkedIn is limiting your searches.</b> Claude paused after ${c.analyzed} ${c.analyzed === 1 ? "job" : "jobs"} to keep your account safe${p.resumeAt ? ` and will try again ${esc(when(p.resumeAt))}` : ". Turn the schedule on, or press Run now later"}. Fewer searches a day helps.`,
    `<a class="jp-btn jp-btn--sm" href="#settings" data-nav="settings">Change schedule</a>`);
  const kept = c.analyzed ? ` The ${c.analyzed} ${c.analyzed === 1 ? "job it reached is" : "jobs it reached are"} kept below, and nothing was sent twice.` : "";
  const notes = (p.notes || []).map((n) => `<span class="foot">${esc(n)}</span>`).join("");
  return box("danger",
    `<b>${esc(M.shortDay(p.at) === "Today" ? "Today's" : "The last")} run stopped at ${esc(M.time(p.at))}.</b> ${esc(p.reason || "")}${kept}${notes ? `<span class="jobs-problem__notes">${notes}</span>` : ""}`,
    `<button class="jp-btn jp-btn--primary jp-btn--sm" type="button" data-action="run">Run again</button>
     <a class="jp-btn jp-btn--plain jp-btn--sm" href="#activity" data-nav="activity">See in Activity</a>`);
}

// In place of the detail before the first run
export function firstDayHtml() {
  const p = S.STATE?.profile || {}, st = S.STATE?.settings || {};
  const fields = (p.targets || []).map((t) => t.field).filter(Boolean);
  const mode = { auto: "applies with Easy Apply at your cutoff and up", ask_below_target: "applies at your target and up; jobs between your cutoff and target wait for your OK",
    ask_all: "fills each Easy Apply form, then waits for your OK", analyze_only: "tailors your resume and drafts the answers; you send each application" }[st.applyMode] || "";
  return `<div class="first-day"><section class="jp-card first-day__card" aria-labelledby="first-title">
    <p class="cap">First run · ${esc(nextText())}</p>
    <h2 id="first-title" class="t-title1">Claude hasn't searched yet</h2>
    <p class="t-callout jd-muted">On each run Claude searches LinkedIn with your search profile, scores every job against your resumes, tailors the best one, and ${esc(mode)}. Each job shows up on the left as Claude reads it.</p>
    <div><p class="cap" style="margin-bottom:4px">Your search profile</p>
      <div class="first-day__profile">
        <span class="first-day__what"><span class="t-headline">${esc(fields.join(", ") || "No target fields yet")}</span>
          <span class="foot">${esc((p.locations || []).join(", ") || "Any location")}</span></span>
        <span class="meta">Target ${num(S.META.tailorTarget ?? 80)} · up to ${num(st.dailyJobs ?? 20)} a day</span>
      </div></div>
    <div class="jd-actions jd-actions--row">
      <button class="jp-btn jp-btn--primary" type="button" data-action="run">Run now</button>
      <a class="jp-btn jp-btn--plain" href="#settings" data-nav="settings">Change your search profile</a>
    </div>
  </section></div>`;
}
