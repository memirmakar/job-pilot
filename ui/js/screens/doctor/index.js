// Doctor screen (canvas board Doctor): health checks with one fix each, Ask the doctor, and the fix history with Undo.
import { S, app, loadState, loadData } from "../../state.js";
import * as api from "../../api.js";
import { $, esc, toast } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { allChecks } from "./checks.js";
import { askHtml, historyHtml } from "./history.js";
import { loadingHtml, loadFailedHtml } from "../../components/loading.js";
import { time } from "../activity/model.js";

// C: /api/doctor/checks; draft: the Ask text, kept across re-renders
const V = { C: null, error: null, at: 0, loading: false, checking: false, draft: "" };
let last = "";

function ensure() {
  if (V.loading || Date.now() - V.at < 15e3) return;
  V.loading = true;
  api.getChecks().then((c) => { if (c.error) throw new Error(c.error); V.C = c; V.error = null; }).catch((e) => { if (!V.C) V.error = e; })
    .finally(() => { V.loading = false; V.at = Date.now(); if (S.view === "doctor") app.render(); });
}

export function renderDoctor() {
  if (!V.C) { ensure(); const h = V.error ? loadFailedHtml(V.error, "the health checks", "doc-retry") : loadingHtml("page", "the health checks"); if (h !== last) $("#view").innerHTML = last = h; return; }
  ensure();
  if ($("#doc-problem")) V.draft = $("#doc-problem").value;
  const checks = allChecks(V.C), n = checks.filter((c) => c.tone === "danger").length;
  const summary = n ? `${n} of ${checks.length} checks ${n === 1 ? "needs" : "need"} you` : `all ${checks.length} checks passed`;
  const html = `<div class="doc">
    <div class="doc-head"><div class="doc-titles"><h1 class="t-title1">Doctor</h1>
      <p class="meta">${V.C ? `Checked today at <span class="data">${time(V.C.at)}</span> · ${summary}` : "Checking…"}</p></div>
      <button class="jp-btn jp-btn--sm" type="button" data-action="doc-check"${V.checking ? " disabled" : ""}>
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"></path></svg>${V.checking ? "Checking…" : "Check again"}</button></div>
    <div class="jp-list doc-checks" role="list" aria-label="Health checks">${checks.map(checkHtml).join("")}</div>
    <p class="foot">Check again also opens LinkedIn once in a hidden window to confirm you're logged in. The doctor runs by itself when a run fails.</p>
    ${askHtml(V.draft)}
    ${historyHtml()}</div>`;
  if (html === last && $("#view .doc")) return;
  const a = document.activeElement, focus = a?.id ? `#${a.id}` : a?.dataset?.action ? `[data-action="${a.dataset.action}"]${a.dataset.id ? `[data-id="${CSS.escape(a.dataset.id)}"]` : ""}` : null;
  $("#view").innerHTML = last = html;
  if (focus) try { document.querySelector(focus)?.focus({ preventScroll: true }); } catch {}
}

function checkHtml(c) {
  const a = c.action, cls = `jp-btn jp-btn--sm${c.primary ? " jp-btn--primary" : ""}`;
  const btn = !a ? "" : a.nav ? `<a class="${cls}" href="#${a.nav}" data-nav="${a.nav}">${esc(a.label)}</a>`
    : `<button class="${cls}" type="button" data-action="${a.act}"${a.task ? ` data-task="${a.task}"` : ""}>${esc(a.label)}</button>`;
  return `<div role="listitem" class="doc-check${c.tone === "danger" ? " is-bad" : ""}">
    <span class="doc-check__icon" aria-hidden="true"><svg class="ico ico--20" viewBox="0 0 24 24">${c.icon}</svg></span>
    <span class="doc-check__text"><span class="doc-check__title">${esc(c.title)}</span><span class="meta">${esc(c.detail)}</span>
      ${c.problem ? `<span class="jp-callout jp-callout--${c.tone === "danger" ? "danger" : "warning"}" role="alert"><span class="jp-callout__icon" aria-hidden="true">!</span>
        <span><b>${esc(c.problem)}</b> ${esc(c.fix || "")}</span></span>` : ""}</span>
    <span class="doc-check__status">${pill(c.status, c.tone)}</span>
    <span class="doc-check__act">${btn}</span></div>`;
}

const refresh = async () => { V.at = 0; await loadData(); app.render(); };
export const DOC_ACTIONS = {
  "doc-retry": () => { V.error = null; V.at = 0; last = ""; app.render(); },
  // Claude CLI answers once (a tiny Haiku call) and LinkedIn opens once in a hidden window
  "doc-check": async () => {
    V.checking = true; app.render();
    try {
      const [li] = await Promise.allSettled([api.checkLinkedin(), loadState(true)]);
      if (li.status === "rejected") toast(li.reason.message, 7000);
    } finally { V.checking = false; await refresh(); }
  },
  "doc-linkedin": async () => {
    toast("Opening LinkedIn in a hidden window…");
    try { await api.checkLinkedin(); } finally { await refresh(); }
  },
  "doc-ask": async () => {
    V.draft = $("#doc-problem")?.value || "";
    await api.askDoctor(V.draft);
    V.draft = "";
    toast("The doctor is checking the app. This can take several minutes.");
    await loadState(); app.render();
  },
  "doc-undo": async (el) => {
    const d = S.DOCS.find((x) => x.id === el.dataset.id);
    if (!confirm(`Undo this fix? ${d?.changedFiles?.join(", ") || "Its files"} go back to how they were before it.`)) return;
    el.disabled = true; el.textContent = "Undoing…";
    const r = await api.undoDoctor(el.dataset.id);
    toast(r.undoErrors?.length ? "Undone, but some files now have errors. See the report." : "Fix undone. Restart Job Pilot if it changed the app's code.", 7000);
    await refresh();
  },
  "doc-run-again": async () => {
    if (!confirm("Start a real run now? Claude applies to the jobs that pass your rules.")) return;
    await api.startRun({});
    toast("Run started. You'll see an Edge window working; leave it open.");
    await loadState(); app.render();
  },
};
