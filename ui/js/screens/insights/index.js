// Insights screen (canvas boards Insights, Insights-*): the title with today's numbers, five tabs, and their actions.
// Pipeline, To-do, Skill gaps, Job market and GitHub each render from their own file.
import { S, app, loadData, loadState } from "../../state.js";
import * as api from "../../api.js";
import { $, esc, toast } from "../../util.js";
import { go } from "../../router.js";
import { runNumbers, target, cutoff } from "../jobs/model.js";
import { pipelineHtml } from "./pipeline.js";
import { todoHtml } from "./todo.js";
import { gapsHtml } from "./gaps.js";
import { marketHtml } from "./market.js";
import { githubHtml } from "./github.js";

export const INSIGHT_TABS = [["pipeline", "Pipeline"], ["todo", "To-do"], ["gaps", "Skill gaps"], ["market", "Job market"], ["github", "GitHub"]];
const TAB = { pipeline: pipelineHtml, todo: todoHtml, gaps: gapsHtml, market: marketHtml, github: githubHtml };
const num = (n) => `<span class="data" style="color: var(--text)">${n}</span>`;

function metaLine() {
  const n = runNumbers();
  const run = n ? `${esc(n.when)} ${num(n.analyzed)} analyzed · ${num(n.applied)} applied${n.external ? ` · ${num(n.external)} ready to apply externally` : ""} · ` : "";
  return `${run}target ${num(target())}, cutoff ${num(cutoff())}, daily limit ${num(S.META.dailyLimit ?? 20)}`;
}

let last = "";
export function renderInsights() {
  if (!TAB[S.sub]) S.sub = "pipeline";
  const html = `<div class="ins">
    <div class="ins-head">
      <div class="ins-head__text"><h1 class="t-title1">Insights</h1><p class="meta">${metaLine()}</p></div>
      <div class="jp-seg ins-tabs" role="tablist" aria-label="Insights views">${INSIGHT_TABS.map(([id, label]) =>
        `<button class="jp-seg__item" type="button" role="tab" id="ins-tab-${id}" aria-selected="${id === S.sub}" aria-controls="ins-panel" data-action="insights-tab" data-tab="${id}">${esc(label)}</button>`).join("")}</div>
    </div>
    <div class="ins-panel" id="ins-panel" role="tabpanel" aria-labelledby="ins-tab-${S.sub}">${S.INS ? TAB[S.sub]() : `<p class="t-callout ins-muted">Couldn't load Insights. Reload the page.</p>`}</div>
  </div>`;
  // the 30-second refresh re-renders only when something changed, so scroll and focus stay put
  if (html === last && $("#view .ins")) return;
  const a = document.activeElement, ds = a?.dataset || {};
  const focus = a?.id ? `#${a.id}` : ds.action ? `[data-action="${ds.action}"]${ds.id ? `[data-id="${ds.id}"]` : ""}${ds.v ? `[data-v="${CSS.escape(ds.v)}"]` : ""}` : null;
  const scroll = $("#todo-scroll")?.scrollTop;
  $("#view").innerHTML = last = html;
  if (scroll != null && $("#todo-scroll")) $("#todo-scroll").scrollTop = scroll;
  if (focus) try { document.querySelector(focus)?.focus({ preventScroll: true }); } catch {}
}

// Done on a step: here, on the To-do tab, or on a job's raise card (same item)
async function toggleTodo(id, done) {
  const { flagged } = await api.setTodo(id, done);
  await loadData(); app.render();
  toast(done ? (flagged ? `Done. ${flagged === 1 ? "1 job is" : `${flagged} jobs are`} marked "Re-score on next run".` : "Done.") : "Marked as not done.");
}

// data-action handlers, merged into actions.js
export const INS_ACTIONS = {
  "ins-period": (el) => { S.ins.period = el.dataset.v; app.render(); },
  "ins-field": (el) => { S.ins.field = el.dataset.v; app.render(); },
  // on narrow screens the step's detail is below the list
  "ins-step": (el) => { S.ins.step = el.dataset.id; app.render(); if (matchMedia("(max-width: 1100px)").matches) $(".td-detail")?.scrollIntoView({ block: "start" }); },
  "ins-list": (el) => { S.ins.list = el.dataset.v; app.render(); },
  "ins-hidden": () => { S.ins.showHidden = !S.ins.showHidden; app.render(); },
  "ins-open-todo": (el) => { S.ins.step = el.dataset.id; S.ins.showHidden ||= el.dataset.hidden === "1"; S.ins.list = "all"; go("insights/todo"); },
  "ins-todo-done": (el) => toggleTodo(el.dataset.id, el.dataset.v === "1"),
  "ins-merge": async () => { await api.startTask("todo"); toast("Claude is merging the new steps. The list updates when it's done."); await loadState(); app.render(); },
  "ins-target": async (el) => {
    await api.saveSettings({ tailorTarget: Number(el.dataset.v) });
    await loadData(); app.render(); toast(`Target set to ${el.dataset.v}. It applies from the next run.`);
  },
  "ins-open-job": (el) => {
    const r = S.DATA.find((x) => `${x.site}-${x.id}` === el.dataset.k);
    if (!r) return toast("That job isn't in your list any more.");
    S.showArchived = !!r.archived; S.selected = el.dataset.k; S.jobOpen = true; S.panel = "none"; S.filter = "all";
    go("jobs");
  },
  // a job's raise card: put its steps on your list, or open the list
  "todo-add": async (el) => {
    const ids = el.dataset.ids.split(",").filter(Boolean);
    await api.addTodo(ids); await loadData(); app.render();
    toast(`Added ${ids.length === 1 ? "1 step" : `${ids.length} steps`} to your to-do list.`);
  },
  "todo-open": (el) => { S.ins.step = el.dataset.id || null; S.ins.list = el.dataset.id ? "all" : "mine"; go("insights/todo"); },
};

// Done checkboxes (data-todo-id), bound once from actions.js
export function bindInsights() {
  document.addEventListener("change", async (e) => {
    const cb = e.target.closest?.("[data-todo-id]");
    if (!cb) return;
    cb.disabled = true;
    try { await toggleTodo(cb.dataset.todoId, cb.checked); } catch (err) { cb.checked = !cb.checked; cb.disabled = false; toast(err.message, 7000); }
  });
}
