// Doctor: "Ask the doctor" and the fix history (data/doctor/<id>.json): what broke, what Claude changed, what was backed up, Undo.
import { S } from "../../state.js";
import { esc, md, rich } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { callout } from "../../components/card.js";
import { when } from "../activity/model.js";

export function askHtml(draft) {
  const t = S.STATE?.tasks?.doctor;
  return `<section class="jp-card doc-ask" aria-labelledby="doc-ask-title">
    <h2 class="t-headline" id="doc-ask-title">Ask the doctor</h2>
    <p class="meta">Claude looks at the app, its logs and LinkedIn, then fixes settings or the app's code. Every file is backed up first, and you can undo any fix.</p>
    ${t?.running ? `<div class="doc-working" role="status"><span class="jp-dot jp-dot--live" aria-hidden="true"></span>
        <span class="meta">The doctor is working · started ${esc(when(t.startedAt))}. This can take several minutes.</span></div>
        ${t.tail ? `<pre class="doc-tail">${esc(t.tail.trim().split("\n").slice(-8).join("\n"))}</pre>` : ""}`
      : `<label class="jp-field"><span class="jp-field__label">What went wrong? (optional)</span>
        <textarea class="jp-input doc-problem" id="doc-problem" rows="3" placeholder="It found no jobs today, or applications get stuck on a question">${esc(draft)}</textarea>
        <span class="jp-field__hint">The doctor also runs by itself when a run finds no listings, can't read job pages, or crashes.</span></label>
      <div><button class="jp-btn jp-btn--tinted" type="button" data-action="doc-ask">Ask the doctor</button></div>`}
  </section>`;
}

// [label, tone] for a report
function state(d) {
  if (d.undoneAt) return ["Undone", "neutral"];
  if (d.rolledBack) return ["Rolled back", "danger"];
  if (d.error) return ["Didn't run", "danger"];
  if (d.fixed && !d.changedFiles?.length) return ["Nothing to fix", "success"];
  return d.fixed ? ["Fixed", "success"] : ["Not fixed", "warning"];
}

export function historyHtml() {
  const docs = S.DOCS || [];
  return `<section class="doc-history" aria-labelledby="doc-hist-title">
    <div class="doc-sechead"><h2 class="t-title2" id="doc-hist-title">Fix history</h2>
      <p class="meta">Every time the doctor ran, newest first: what broke, what it changed, and what it backed up.</p></div>
    ${docs.length ? `<div class="jp-list">${docs.map(reportHtml).join("")}</div>` : `<p class="meta">The doctor hasn't run yet.</p>`}
  </section>`;
}

function reportHtml(d) {
  const [label, tone] = state(d), files = d.changedFiles || [];
  const canUndo = files.length && !d.rolledBack && !d.undoneAt;
  return `<article class="doc-report">
    <div class="doc-report__head">${pill(label, tone)}<h3 class="doc-report__title">${esc(d.reason)}</h3>
      <span class="foot jp-num doc-report__when">${esc(when(d.startedAt))}${d.usage?.costUsd ? ` · $${d.usage.costUsd.toFixed(2)}` : ""}</span></div>
    <div class="doc-report__body">
      ${d.diagnosis ? `<div class="doc-rich">${rich(d.diagnosis)}</div>` : ""}
      ${d.actions?.length ? `<div><p class="cap">What it changed</p><ul class="doc-changes">${d.actions.map((a) => `<li><code>${esc(a.file)}</code> ${md(a.change)}</li>`).join("")}</ul></div>` : ""}
      ${d.needs_user ? callout(`<b>Your turn:</b> ${md(d.needs_user)}`, "warning") : ""}
      ${d.rolledBack ? callout(esc(d.rollbackReason || "The fix broke the app, so every change was undone."), "danger") : ""}
      ${d.undoErrors?.length ? callout(`After the undo these files have errors: ${esc(d.undoErrors.join(" | "))}`, "danger") : ""}
      <p class="foot">${backupLine(d, files)}</p>
      ${canUndo ? `<div><button class="jp-btn jp-btn--sm" type="button" data-action="doc-undo" data-id="${esc(d.id)}">Undo this fix</button></div>` : ""}
    </div></article>`;
}

function backupLine(d, files) {
  const backed = d.backedUp ? `${d.backedUp} app ${d.backedUp === 1 ? "file was" : "files were"} backed up first` : "The app's files were backed up first";
  if (d.undoneAt) return `Undone ${esc(when(d.undoneAt))}: ${(d.undoneFiles || []).map((f) => `<code>${esc(f)}</code>`).join(", ")} ${d.undoneFiles?.length === 1 ? "is" : "are"} back to how ${d.undoneFiles?.length === 1 ? "it was" : "they were"} before the fix.`;
  if (!files.length || d.rolledBack) return `${backed}${d.rolledBack ? " and put back" : "; nothing was changed"}.`;
  return `${backed}. Changed: ${files.map((f) => `<code>${esc(f)}</code>`).join(", ")}. Undo puts back only these files.`;
}
