// Resumes list (canvas board Resumes, left column): Upload, search, filter, the grouped rows, Standard answers at the foot.
// Each row has a "⋯" menu button (also right-click, Shift+F10 or the menu key: menu.js) and the last delete can be undone.
import { S } from "../../state.js";
import { esc, icon } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { companyLogo } from "../../components/company-logo.js";
import * as M from "./model.js";

const num = (n) => `<span class="data" style="color:var(--text)">${n}</span>`;
const end = (date, v, pillHtml) => `<span class="rs-row__end"><span class="foot jp-num">${esc(date)}</span>
  <span class="rs-row__pills"><span class="foot jp-num">${esc(v)}</span>${pillHtml}</span></span>`;
const rowAttrs = (x) => `data-action="res-select" data-id="${esc(x.id)}" ${S.res.sel === x.id ? 'aria-current="true"' : ""}`;
// A row is a button, so its menu button sits beside it in a list item
const wrap = (x, row) => `<div class="rs-rowwrap" role="listitem">${row}<button class="jp-btn jp-btn--plain jp-btn--sm rs-more" type="button" aria-haspopup="menu"
  aria-label="Actions for ${esc(x.name)}" data-action="res-menu" data-id="${esc(x.id)}">${icon("more")}</button></div>`;

function parentRow(p) {
  const tile = `<span class="rs-tile${p.kind === "ready" ? " rs-tile--ready" : ""}" aria-hidden="true">${icon(p.kind === "ready" ? "doc-check" : "doc")}</span>`;
  const meta = p.kind === "ready" ? `${M.lang(p.language)} · written ${M.day(p.generatedAt)}${p.defaultOriginal ? ` · from ${p.defaultOriginal}` : ""}` : `${M.lang(p.language)} · ${M.defaultLine(p)}`;
  const tag = p.kind === "ready" ? (p.stale.length ? pill("Needs rebuild", "warning") : pill("Ready resume", "neutral")) : pill("Original", "neutral");
  return wrap(p, `<button class="jp-row rowbtn rs-row" type="button" ${rowAttrs(p)}>
    ${tile}<span class="rs-row__text"><span class="jp-row__title">${esc(p.name)}</span><span class="meta ellip">${esc(meta)}</span></span>
    ${end(M.day(p.kind === "ready" ? p.generatedAt : M.current(p).at), M.vLabel(p), tag)}</button>`);
}

function kidRow(t, indent) {
  const [label, tone] = M.RSTATUS[t.status];
  return wrap(t, `<button class="jp-row rowbtn rs-row rs-row--kid${indent ? " rs-row--indent" : ""}" type="button" ${rowAttrs(t)}>
    ${companyLogo(t.job.company, t.job.logoUrl, "sm")}
    <span class="rs-row__text"><span class="jp-row__title rs-row__kidtitle">${esc(t.name)}</span>
      <span class="meta ellip">${esc(t.job.company)} · <span class="jp-num">${t.baseScore}</span> → <span class="jp-num" style="color:var(--text)">${t.score}</span></span></span>
    ${end(M.day(M.current(t).at), M.vLabel(t), pill(label, tone))}</button>`);
}

const navBtn = (id, ico, label, extra) => `<button class="navbtn rs-answers-btn" type="button" data-action="res-select" data-id="${id}" ${S.res.sel === id ? 'aria-current="page"' : ""}>
  ${icon(ico)}${label}${extra}</button>`;
// Shown for 15 minutes after a delete
function undoBar() {
  const u = S.RES?.undo;
  if (!u || Date.now() - Date.parse(u.at) > 15 * 60e3) return "";
  return `<div class="rs-undo" role="status"><span class="meta ellip">Deleted ${esc(u.label)}</span>
    <button class="jp-btn jp-btn--sm" type="button" data-action="res-undo">Undo</button></div>`;
}

export function listHtml() {
  const c = M.counts(), missing = M.missingAnswers().length, gs = M.groups();
  const rules = S.RES?.prefs?.rules?.length || 0, unreviewed = (S.RES?.projects || []).filter((p) => p.state === "unreviewed").length;
  const body = gs.map((g) => `<p class="cap rs-group">${esc(g.label)}</p>${g.items.map(({ p, kids }) =>
    (g.showParent && p ? parentRow(p) : kids.length ? `<p class="cap rs-from">From ${esc(p?.name || "an earlier resume")}</p>` : "") +
    kids.map((k) => kidRow(k, g.showParent)).join("")).join("")}`).join("");
  return `<section class="rs-list" aria-label="Resumes">
    <div class="rs-list__head">
      <div class="rs-list__title"><h1 class="t-large">Resumes</h1>
        <button class="jp-btn jp-btn--primary jp-btn--sm" type="button" data-action="res-upload" aria-haspopup="dialog">${icon("upload")}Upload resume</button></div>
      <p class="meta">${num(c.originals)} originals · ${num(c.ready)} ready · ${num(c.tailored)} tailored · ${num(c.sent)} sent</p>
    </div>${undoBar()}
    <label class="search"><span class="sr-only">Search resumes</span>${icon("search")}
      <input class="jp-input" id="res-q" type="search" placeholder="Search resumes, jobs, companies" value="${esc(S.res.query)}" autocomplete="off"></label>
    <div class="jp-seg rs-filter" role="tablist" aria-label="Show">${M.FILTERS.map(([id, label]) =>
      `<button class="jp-seg__item" type="button" role="tab" aria-selected="${S.res.filter === id}" data-action="res-filter" data-v="${id}">${label}</button>`).join("")}</div>
    <div class="jp-list rs-list__box">
      <div class="rs-list__scroll" id="res-scroll" role="list" aria-label="Resumes grouped by original">
        ${body || `<p class="meta rs-empty">${S.RES ? "No resumes match this filter." : "Loading your resumes…"}</p>`}</div>
      <div class="rs-list__foot">
        <button class="navbtn rs-answers-btn" type="button" data-action="res-select" data-id="answers" ${S.res.sel === "answers" ? 'aria-current="page"' : ""}>
          ${icon("list")}Standard answers${missing ? `<span style="margin-left:auto">${pill(`${missing} missing`, "warning")}</span>` : ""}</button>
        ${navBtn("rules", "check", "Your resume rules", rules ? `<span class="count">${rules}</span>` : "")}
        ${navBtn("projects", "doc-check", "GitHub projects", unreviewed ? `<span style="margin-left:auto">${pill(`${unreviewed} to review`, "warning")}</span>` : "")}
      </div>
    </div>
  </section>`;
}
