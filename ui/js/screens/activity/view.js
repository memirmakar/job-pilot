// Activity markup (canvas boards Activity, Activity-Stopped): the run list, and one open run's jobs.
import { esc, icon } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { callout } from "../../components/card.js";
import * as M from "./model.js";

const SHOW = 40; // rows before "Show all"
const TABS = [["all", "All"], ["applied", "Applied"], ["prepared", "Prepared for you"], ["skipped", "Skipped"], ["problem", "Problems"]];

export function activityHtml(runs, V) {
  const shown = runs.filter((r) => V.view === "all" || M.hasProblem(r));
  const views = [["all", "All runs", runs.length], ["problems", "With problems", runs.filter(M.hasProblem).length]];
  return `<div class="act">
    <div class="act-head">
      <div class="act-titles"><h1 class="t-title1">Activity</h1>
        <p class="meta">Every run, newest first. Open one to see what Claude did with each job.</p></div>
      <div role="group" aria-label="Show" class="act-views">${views.map(([id, label, n]) =>
        `<button class="chip" type="button" aria-pressed="${V.view === id}" data-action="act-view" data-v="${id}">${label} <span class="jp-num">${n}</span></button>`).join("")}</div>
    </div>
    <div class="jp-list act-list">
      <div class="act-cols" aria-hidden="true"><span></span><span class="cap">Run</span><span class="cap">Result</span><span class="cap">Took</span>
        <span class="cap num">Analyzed</span><span class="cap num">Picked</span><span class="cap num">Applied</span><span class="cap num">Skipped</span><span></span></div>
      ${shown.map((r) => runHtml(r, V)).join("") || `<p class="act-empty meta">${runs.length ? "No runs with problems." : "No runs yet. Your first run shows up here."}</p>`}
    </div></div>`;
}

function runHtml(r, V) {
  const rows = r.jobs.map(M.jobRow), c = M.counts(r, rows), [label, tone, kind] = M.result(r), open = V.open === r.id;
  const end = r.endedAt || r.lastEvent || r.startedAt;
  return `<div class="act-run">
    <button class="act-runbtn" type="button" aria-expanded="${open}" aria-controls="run-${esc(r.id)}" data-action="act-toggle" data-id="${esc(r.id)}">
      ${icon("next", "ico act-chev")}
      <span class="act-when"><span class="act-date">${esc(M.runDay(r.startedAt))}</span>
        <span class="foot jp-num">${M.time(r.startedAt)}${kind === "live" ? " – now" : r.earlier && r.startedAt === r.endedAt ? "" : ` – ${M.time(end)}`}</span></span>
      <span class="act-result">${pill(label, tone)}${r.dryRun ? `<span class="jp-tag">Test run</span>` : ""}</span>
      <span class="meta jp-num act-took">${kind === "live" ? "" : M.duration(r.startedAt, end)}</span>
      <span class="data num">${c.analyzed}</span><span class="data num">${c.picked}</span><span class="data num">${c.applied}</span><span class="data num quiet">${c.skipped}</span>
      <span class="foot ellip act-sum">${esc(M.summary(r, rows))}</span>
      <span class="foot act-mini">${c.analyzed} analyzed · ${c.picked} picked · ${c.applied} applied · ${c.skipped} skipped</span>
    </button>
    ${open ? bodyHtml(r, rows, kind, V) : ""}</div>`;
}

function bodyHtml(r, rows, kind, V) {
  const tabs = TABS.map(([id, label]) => [id, label, id === "all" ? rows.length : rows.filter((x) => x.tab === id).length]).filter(([id, , n]) => id === "all" || n);
  const sub = tabs.some(([id]) => id === V.sub) ? V.sub : "all";
  const list = rows.filter((x) => sub === "all" || x.tab === sub); // in run order
  const full = V.full.has(r.id), cut = full ? list : list.slice(0, SHOW);
  const note = M.note(r);
  return `<div class="act-body" id="run-${esc(r.id)}">
    ${kind === "stopped" || kind === "paused" ? alertHtml(r, kind) : ""}
    ${note ? `<p class="foot act-note">${esc(note)}</p>` : ""}
    ${rows.length ? `<div class="jp-seg act-tabs" role="tablist" aria-label="Filter jobs in this run">${tabs.map(([id, label, n]) =>
      `<button class="jp-seg__item" type="button" role="tab" aria-selected="${id === sub}" data-action="act-sub" data-v="${id}">${label} <span class="jp-num">${n}</span></button>`).join("")}</div>
    <div class="jp-list act-jobs" role="table" aria-label="What Claude did on this run">
      <div role="row" class="act-jobcols"><span role="columnheader" class="cap">Time</span><span role="columnheader" class="cap">Job</span>
        <span role="columnheader" class="cap num">Score</span><span role="columnheader" class="cap">What Claude did</span><span role="columnheader" class="cap">Why</span></div>
      ${cut.map(jobHtml).join("")}
      ${list.length > cut.length ? `<div class="act-more"><span class="foot">${list.length - cut.length} more in this run</span>
        <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="act-all" data-id="${esc(r.id)}">Show all <span class="jp-num">${list.length}</span></button></div>` : ""}
    </div>` : `<p class="foot">No jobs were logged on this run.</p>`}
  </div>`;
}

function alertHtml(r, kind) {
  const login = r.outcome?.stopKind === "linkedin_login";
  const notes = M.stopNotes(r);
  const text = `<b>${esc(M.stopReason(r))}</b>${notes.length ? `<span class="act-notes">${notes.map((n) => `<span>${esc(n)}</span>`).join("")}</span>` : ""}`;
  return `<div class="act-alert">${callout(text, kind === "paused" ? "warning" : "danger")}
    <div class="act-alert__btns">${login ? `<button class="jp-btn jp-btn--primary jp-btn--sm" type="button" data-action="linkedin-login">Log in to LinkedIn</button>` : ""}
      <button class="jp-btn ${login ? "" : "jp-btn--primary"} jp-btn--sm" type="button" data-action="act-run-again" data-dry="${r.dryRun ? "1" : ""}">${r.dryRun ? "Test again" : "Run again"}</button></div></div>`;
}

function jobHtml(j) {
  const name = esc(j.title || "Title not captured"), where = [j.company, j.location].filter(Boolean).map(esc).join(" · ");
  const link = j.inJobs
    ? `<button class="act-job" type="button" data-action="act-open-job" data-k="${esc(`${j.site}-${j.id}`)}" title="Open in Jobs">${name}</button>`
    : j.url ? `<a class="act-job" href="${esc(j.url)}" target="_blank" rel="noopener" title="Open on LinkedIn">${name}${icon("external", "ico ico--13")}</a>` : `<span class="act-job">${name}</span>`;
  return `<div role="row" class="act-jobrow">
    <span role="cell" class="foot jp-num">${M.time(j.at)}</span>
    <span role="cell" class="act-jobname">${link}<span class="foot ellip">${where}</span></span>
    <span role="cell" class="act-score jp-num${j.score == null ? " none" : j.low ? " low" : ""}">${j.score ?? "—"}</span>
    <span role="cell">${pill(j.out, j.tone)}</span>
    <span role="cell" class="act-why">${esc(j.why)}</span></div>`;
}
