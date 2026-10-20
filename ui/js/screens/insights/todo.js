// Insights → To-do: the market review's steps and every job's "How to raise this score" steps in one list, merged by Claude,
// ranked by points per hour. The selected step on the right shows the jobs it lifts; ticking it done flags them for re-scoring.
import { S, isBusy } from "../../state.js";
import { esc, md, rich, icon } from "../../util.js";
import { tag } from "../../components/tag.js";
import * as M from "./model.js";

const n = (v) => `<span class="jp-num">${v}</span>`;

// The line above the list: what the last runs re-scored, what's waiting, or how it works
function rescoreLine() {
  const recent = S.DATA.filter((r) => r.rescored && Date.now() - Date.parse(r.rescored.at) < 14 * M.DAY);
  const waiting = S.DATA.filter((r) => r.rescore?.items?.length && !r.archived && r.status !== "applied");
  const parts = [];
  if (recent.length) parts.push(`Re-scored ${M.plural(recent.length, "job")}: ${recent.slice(0, 4).map((r) => `${r.company} ${r.rescored.from} → ${r.rescored.to}`).join(" · ")}`);
  if (waiting.length) parts.push(`${M.plural(waiting.length, "job")} ${waiting.length === 1 ? "is" : "are"} marked "Re-score on next run" (up to ${S.STATE?.settings?.rescorePerRun ?? 3} per run)`);
  return parts.join(". ") || "Tick a step when it's done. The next run re-scores the jobs it lifts, here and on each job's card.";
}

function row(it, sel) {
  return `<li class="td-row${it.id === sel ? " is-current" : ""}">
    <span class="td-rank jp-num" aria-hidden="true">${it.rank}</span>
    <input class="todo-check" type="checkbox" data-todo-id="${esc(it.id)}" aria-label="Done: ${esc(it.label)}" ${it.done ? "checked" : ""}>
    <button class="rowbtn td-row__btn" type="button" aria-current="${it.id === sel}" data-action="ins-step" data-id="${esc(it.id)}">
      <span class="ellip td-row__title${it.done ? " is-done" : ""}">${esc(it.label)}</span>
      <span class="foot ellip">${esc(it.time)} · ${esc(it.kind)} · ${esc(M.companiesText(it))}</span>
    </button>
    <span class="td-row__pts"><span class="jp-num td-pts">${esc(M.ptsText(it))}</span>${it.jobs.length > 1 ? `<span class="foot jp-num">+${it.total} total</span>` : ""}</span>
  </li>`;
}

function detail(it, count) {
  if (!it) return `<section class="jp-card td-detail" aria-label="Selected step"><p class="t-callout ins-muted">Pick a step to see the jobs it lifts.</p></section>`;
  const waiting = it.jobs.some((j) => j.r.rescore?.items?.includes(it.id));
  return `<section class="jp-card td-detail" aria-label="Selected step">
    <p class="cap">Step ${n(it.rank)} of ${n(count)}${it.added ? " · on your list" : ""}</p>
    <h2 class="t-title2${it.done ? " is-done" : ""}">${esc(it.label)}</h2>
    ${it.label !== M.shortLabel(it.do) || it.do.length > it.label.length + 3 ? `<p class="t-callout ins-muted">${md(it.do)}</p>` : ""}
    <div class="td-tags"><span class="jp-tag td-time">${icon("clock", "ico ico--13")}${esc(it.time)}</span>${tag(it.kind)}<span class="jp-num td-pts">${esc(M.ptsText(it))}</span></div>
    <div class="td-detail__body">
      ${it.why ? `<div class="td-why"><p class="jp-card__label">Why</p>${rich(it.why)}</div>` : ""}
      ${it.market ? `<div><p class="jp-card__label">Steps</p><ol class="td-substeps">${(it.market.steps || []).map((s) => `<li>${md(s)}</li>`).join("")}</ol>
        ${it.market.doneWhen ? `<p class="foot">Done when: ${md(it.market.doneWhen)}</p>` : ""}${it.market.unlocks ? `<p class="foot">Helps with: ${md(it.market.unlocks)}</p>` : ""}</div>` : ""}
      ${it.jobs.length ? `<div><p class="jp-card__label">Lifts ${M.plural(it.jobs.length, "job")}</p>
        ${it.jobs.map((j) => { const l = M.jobLift(it, j); return `<button class="rowbtn td-job" type="button" data-action="ins-open-job" data-k="${esc(j.k)}">
          <span class="td-job__text"><span class="ellip td-job__title">${esc(j.r.title)}</span><span class="foot ellip">${esc(j.r.company)}</span></span>
          <span class="jp-num td-job__before">${l.before}</span>
          ${l.after == null ? "" : `${icon("arrow", "ico ico--14 td-job__arrow")}<span class="jp-num td-job__after">${l.after}</span>`}
          <span class="foot td-job__note">${esc(l.note)}</span></button>`; }).join("")}</div>`
        : it.market ? "" : `<p class="foot">The jobs this step came from are archived.</p>`}
    </div>
    <div class="td-detail__foot">
      <button class="jp-btn${it.done ? "" : " jp-btn--primary"}" type="button" data-action="ins-todo-done" data-id="${esc(it.id)}" data-v="${it.done ? "0" : "1"}">${it.done ? "Mark as not done" : "Mark as done"}</button>
      <span class="foot">${it.done && waiting ? `${icon("clock", "ico ico--13")} Re-score on next run` : it.jobs.length ? "Same step as on each job's “How to raise this score” card" : "From the market review"}</span>
    </div>
  </section>`;
}

export function todoHtml() {
  const all = M.todoItems(), T = S.INS.todo;
  if (!all.length) return `<div class="ins-empty-page"><p class="t-headline">No steps yet</p>
    <p class="t-callout ins-muted">Steps come from each job Claude analyzes ("How to raise this score") and from the market review, which needs 5 analyzed jobs.</p></div>`;
  const mine = all.filter((i) => i.added), hidden = all.filter((i) => i.hidden && !i.added);
  const pool = S.ins.list === "mine" && mine.length ? mine : all;
  const shownList = pool.filter((i) => S.ins.showHidden || !i.hidden || i.added);
  if (!shownList.some((i) => i.id === S.ins.step)) S.ins.step = shownList[0]?.id || null;
  const sel = shownList.find((i) => i.id === S.ins.step);
  const merging = S.STATE?.tasks?.todo?.running;
  return `<div class="ins-bar">
      <p class="foot">The market review's steps and every job's “How to raise this score” steps in one list, duplicates merged, ranked by points per hour. Tick a step here or on a job; it's the same step.</p>
      <span class="meta ins-nowrap">${n(all.filter((i) => i.done).length)} of ${n(all.length)} done</span>
    </div>
    <div class="ins-grid ins-grid--todo">
      <div class="jp-list td-list">
        <div class="td-list__head">${icon("clock", "ico")}<span class="meta ellip" aria-live="polite">${esc(rescoreLine())}</span></div>
        <div class="td-list__filters" role="group" aria-label="Which steps">
          <button class="chip" type="button" aria-pressed="${pool === all}" data-action="ins-list" data-v="all">All steps <span class="jp-num">${all.length}</span></button>
          <button class="chip" type="button" aria-pressed="${pool === mine}" data-action="ins-list" data-v="mine" ${mine.length ? "" : "disabled"}>On your list <span class="jp-num">${mine.length}</span></button>
          ${T.pending ? `<span class="foot td-pending">${M.plural(T.pending, "new step")} not merged yet</span>
            <button class="jp-btn jp-btn--sm jp-btn--plain" type="button" data-action="ins-merge" ${merging || isBusy() ? "disabled" : ""}>${merging ? "Merging…" : "Merge now"}</button>` : ""}
        </div>
        <ol class="td-items" id="todo-scroll">${shownList.map((it) => row(it, S.ins.step)).join("") || `<li class="td-none foot">Nothing here.</li>`}</ol>
        ${hidden.length ? `<p class="foot td-list__foot">${M.plural(hidden.length, "step")} that only lift jobs outside your fields and below your cutoff ${S.ins.showHidden ? "are shown" : "are hidden"}.
          <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="ins-hidden">${S.ins.showHidden ? "Hide them" : "Show them"}</button></p>` : ""}
      </div>
      ${detail(sel, all.length)}
    </div>`;
}
