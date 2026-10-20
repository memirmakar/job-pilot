// Doctor: ask Claude to diagnose and fix the app, quick LinkedIn check, past reports with undo.
import { S } from "../state.js";
import { $, esc, md, rich, fmtDate } from "../util.js";

export function renderDoctor() {
  const t = S.STATE.tasks?.doctor;
  $("#view").innerHTML = `
    <div class="section-title" style="margin-top:0">Doctor <small>Claude diagnoses problems and fixes settings or the app's code · every change is backed up and can be undone</small></div>
    <div class="card"><div class="form">
      <div class="field"><label>Describe a problem (optional)</label><textarea id="doc-problem" placeholder="e.g. It found no jobs today / the dashboard shows errors / applications get stuck on a question"></textarea>
        <div class="hint">The doctor also runs by itself when a run finds no listings, can't read job pages, or keeps failing.</div></div>
      <div class="btns"><button class="btn primary" data-action="doctor" ${t?.running ? "disabled" : ""}>${t?.running ? `<span class="spinner"></span> Claude is working…` : "Ask Claude to check the app"}</button>
        <button class="btn" data-action="task" data-task="selftest">Quick LinkedIn check</button></div>
      ${t?.running || S.STATE.tasks?.selftest ? `<pre class="events">${esc((t?.running ? t.tail : S.STATE.tasks?.selftest?.tail) || "")}</pre>` : ""}
    </div></div>
    <div class="stack" style="margin-top:16px">${S.DOCS.map((d) => `
      <div class="card">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <span class="pill ${d.rolledBack ? "p-bad" : d.fixed ? "p-good" : "p-warn"}">${d.rolledBack ? "Rolled back" : d.fixed ? "Fixed" : "Not fixed"}</span>
          <b>${esc(d.reason)}</b><span class="sub" style="margin-left:auto">${fmtDate(d.startedAt)}</span></div>
        ${rich(d.diagnosis)}
        ${d.actions?.length ? `<div class="muted" style="font-size:12px;margin:10px 0 4px">CHANGES</div><div class="rich"><ul>${d.actions.map((a) => `<li><code>${esc(a.file)}</code>: ${md(a.change)}</li>`).join("")}</ul></div>` : ""}
        ${d.needs_user ? `<div class="callout warn" style="margin-top:10px"><div class="ico">!</div><div><b>Your turn:</b> ${md(d.needs_user)}</div></div>` : ""}
        ${d.rolledBack ? `<div class="callout bad" style="margin-top:10px"><div class="ico">↺</div><div>${esc(d.rollbackReason)}</div></div>` : ""}
        ${d.changedFiles?.length && !d.rolledBack ? `<div class="btns" style="margin-top:10px"><span class="sub">Changed: ${d.changedFiles.map(esc).join(", ")}</span>
          <button class="btn sm" data-action="restore" data-id="${esc(d.id)}">Undo these changes</button></div>` : ""}
      </div>`).join("") || `<div class="card empty">No doctor reports yet.</div>`}</div>`;
}
