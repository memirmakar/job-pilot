// Jobs screen (canvas boards Main, JobDetail, A-*): list on the left, the selected job on the right,
// with the posting sheet or the Ask Claude panel over the detail. Phones show the list, then the job.
import { S, app } from "../../state.js";
import { $ } from "../../util.js";
import { listHtml, visibleGroups } from "./list.js";
import { detailHtml } from "./detail.js";
import { postingHtml } from "./posting.js";
import { askHtml, openAsk, sendAsk } from "./ask.js";
import { keyOf } from "./model.js";
import { REVIEW_ACTIONS } from "./review.js";
import { runProblem } from "./track.js";
import { firstDayHtml } from "./problems.js";

const selectedJob = () => S.DATA.find((r) => keyOf(r) === S.selected);
const visible = () => visibleGroups().flatMap((g) => g.jobs);
const phone = () => matchMedia("(max-width: 900px)").matches;

// Scroll positions and focus survive the 30-second refresh
function snapshot() {
  const a = document.activeElement, ds = a?.dataset || {};
  const focus = a?.id ? `#${a.id}` : ds.k ? `[data-k="${ds.k}"]` : ds.action ? `[data-action="${ds.action}"]${ds.v ? `[data-v="${ds.v}"]` : ""}` : null;
  return { focus, sel: S.selected, list: $("#job-scroll")?.scrollTop, detail: $("#detail-scroll")?.scrollTop, log: $("#ask-log")?.scrollTop };
}
function restore(s) {
  if ($("#job-scroll") && s.list != null) $("#job-scroll").scrollTop = s.list;
  if ($("#detail-scroll") && s.detail != null && s.sel === S.selected) $("#detail-scroll").scrollTop = s.detail;
  const log = $("#ask-log"); if (log) log.scrollTop = log.scrollHeight;
  if (s.focus) try { document.querySelector(s.focus)?.focus({ preventScroll: true }); } catch {}
}

export function renderJobs() {
  const snap = snapshot();
  const rows = visible();
  if (!rows.some((r) => keyOf(r) === S.selected)) { S.selected = rows[0] ? keyOf(rows[0]) : null; S.panel = "none"; }
  const r = selectedJob();
  if (!r) S.panel = "none";
  const first = !r && runProblem()?.kind === "firstDay";
  const panel = r && S.panel === "posting" ? postingHtml(r) : r && S.panel === "ask" ? askHtml(r) : "";
  $("#view").innerHTML = `<div class="jobs" data-show="${S.jobOpen && r ? "detail" : "list"}"${first ? ' data-first="1"' : ""}>
    ${listHtml()}
    <section class="jobs-detail${panel ? " has-panel" : ""}" aria-label="${first ? "First run" : "Job detail"}">${first ? firstDayHtml() : detailHtml(r)}${panel}</section>
  </div>`;
  restore(snap);
}

function select(k, { focus = false } = {}) {
  S.selected = k; S.panel = "none"; S.jobOpen = true; S.askDraft = "";
  app.render();
  if (focus) document.querySelector(`[data-k="${k}"]`)?.focus();
  if (phone()) window.scrollTo(0, 0);
}

function closePanel() {
  const was = S.panel;
  S.panel = "none"; app.render();
  document.querySelector(`[data-action="${was === "ask" ? "job-ask" : "job-posting"}"]`)?.focus();
}

// data-action handlers, merged into actions.js
export const JOB_ACTIONS = {
  "job-select": (el) => select(el.dataset.k),
  "job-filter": (el) => { S.filter = el.dataset.v; app.render(); },
  "group-menu": () => { S.groupMenu = !S.groupMenu; app.render(); if (S.groupMenu) document.querySelector('#group-menu [aria-checked="true"]')?.focus(); },
  "group-by": (el) => { S.groupBy = el.dataset.v; S.groupMenu = false; try { localStorage.setItem("jp-group", S.groupBy); } catch {} app.render(); $('[data-action="group-menu"]')?.focus(); },
  "show-archived": () => { S.showArchived = !S.showArchived; S.filter = "all"; S.selected = null; S.jobOpen = false; app.render(); },
  "job-back": () => { const k = S.selected; S.jobOpen = false; S.panel = "none"; app.render(); document.querySelector(`[data-k="${k}"]`)?.focus(); },
  "job-posting": () => { S.panel = "posting"; app.render(); $(".jd-posting [data-focus]")?.focus(); },
  "job-ask": async () => {
    if (S.panel === "ask") return closePanel();
    const r = selectedJob(); if (!r) return;
    S.panel = "ask"; app.render();
    await openAsk(r); app.render(); $("#ask-input")?.focus();
  },
  "panel-close": () => closePanel(),
  "ask-suggest": (el) => { const r = selectedJob(); if (r) sendAsk(r, el.dataset.v); },
  ...REVIEW_ACTIONS,
  "to-raise": () => { const el = $("#raise"); el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); el?.focus({ preventScroll: true }); },
};

// Escape, arrow keys in the list, outside clicks for the group menu, the Ask form. Bound once from actions.js.
export function bindJobs() {
  document.addEventListener("click", (e) => {
    if (S.view === "jobs" && S.groupMenu && !e.target.closest(".group-wrap")) { S.groupMenu = false; app.render(); }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (S.view !== "jobs") return;
    if (e.key === "Escape" && S.groupMenu) { S.groupMenu = false; app.render(); $('[data-action="group-menu"]')?.focus(); return; }
    if (e.key === "Escape" && S.panel !== "none") return closePanel();
    const row = e.target.closest?.(".job-row");
    if (row && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const rows = visible(), i = rows.findIndex((r) => keyOf(r) === row.dataset.k), next = rows[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) { S.selected = keyOf(next); S.panel = "none"; app.render(); document.querySelector(`[data-k="${S.selected}"]`)?.focus(); }
    }
    const item = e.target.closest?.("#group-menu [role=menuitemradio]");
    if (item && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const items = [...document.querySelectorAll("#group-menu [role=menuitemradio]")], i = items.indexOf(item);
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    }
  });
  document.addEventListener("submit", (e) => {
    if (!e.target.matches("[data-ask-form]")) return;
    e.preventDefault();
    const r = selectedJob(); if (r) sendAsk(r, $("#ask-input").value);
  });
  document.addEventListener("input", (e) => { if (e.target.id === "ask-input") S.askDraft = e.target.value; });
}
