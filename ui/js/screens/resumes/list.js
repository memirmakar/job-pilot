// Resumes list (canvas board Resumes, left column): Upload, search, filter, the grouped rows, Standard answers at the foot.
import { S } from "../../state.js";
import { esc, icon } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { companyLogo } from "../../components/company-logo.js";
import * as M from "./model.js";

const num = (n) => `<span class="data" style="color:var(--text)">${n}</span>`;
const end = (date, v, pillHtml) => `<span class="rs-row__end"><span class="foot jp-num">${esc(date)}</span>
  <span class="rs-row__pills"><span class="foot jp-num">${esc(v)}</span>${pillHtml}</span></span>`;
const rowAttrs = (x) => `data-action="res-select" data-id="${esc(x.id)}"${S.res.sel === x.id ? 'aria-current="true"' : ""}`;

function parentRow(p) {
  const tile = `<span class="rs-tile${p.kind === "ready" ? " rs-tile--ready" : ""}" aria-hidden="true">${icon(p.kind === "ready" ? "doc-check" : "doc")}</span>`;
  const meta = p.kind === "ready" ? `${M.lang(p.language)} · written ${M.day(p.generatedAt)}${p.defaultOriginal ? ` · from ${p.defaultOriginal}` : ""}` : `${M.lang(p.language)} · ${M.defaultLine(p)}`;
  const tag = p.kind === "ready" ? (p.stale.length ? pill("Needs rebuild", "warning") : pill("Ready resume", "neutral")) : pill("Original", "neutral");
  return `<button class="jp-row rowbtn rs-row" type="button" role="listitem" ${rowAttrs(p)}>
    ${tile}<span class="rs-row__text"><span class="jp-row__title">${esc(p.name)}</span><span class="meta ellip">${esc(meta)}</span></span>
    ${end(M.day(p.kind === "ready" ? p.generatedAt : M.current(p).at), M.vLabel(p), tag)}</button>`;
}

function kidRow(t, indent) {
  const [label, tone] = M.RSTATUS[t.status];
  return `<button class="jp-row rowbtn rs-row rs-row--kid${indent ? " rs-row--indent" : ""}" type="button" role="listitem" ${rowAttrs(t)}>
    ${companyLogo(t.job.company, t.job.logoUrl, "sm")}
    <span class="rs-row__text"><span class="jp-row__title rs-row__kidtitle">${esc(t.name)}</span>
      <span class="meta ellip">${esc(t.job.company)} · <span class="jp-num">${t.baseScore}</span> → <span class="jp-num" style="color:var(--text)">${t.score}</span></span></span>
    ${end(M.day(M.current(t).at), M.vLabel(t), pill(label, tone))}</button>`;
}

export function listHtml() {
  const c = M.counts(), missing = M.missingAnswers().length, gs = M.groups();
  const body = gs.map((g) => `<p class="cap rs-group">${esc(g.label)}</p>${g.items.map(({ p, kids }) =>
    (g.showParent && p ? parentRow(p) : kids.length ? `<p class="cap rs-from">From ${esc(p?.name || "an earlier resume")}</p>` : "") +
    kids.map((k) => kidRow(k, g.showParent)).join("")).join("")}`).join("");
  return `<section class="rs-list" aria-label="Resumes">
    <div class="rs-list__head">
      <div class="rs-list__title"><h1 class="t-large">Resumes</h1>
        <button class="jp-btn jp-btn--primary jp-btn--sm" type="button" data-action="res-upload" aria-haspopup="dialog">${icon("upload")}Upload resume</button></div>
      <p class="meta">${num(c.originals)} originals · ${num(c.ready)} ready · ${num(c.tailored)} tailored · ${num(c.sent)} sent</p>
    </div>
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
      </div>
    </div>
  </section>`;
}
