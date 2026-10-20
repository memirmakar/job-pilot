// Standard answers (canvas board Resumes-Answers): what's missing and the jobs it holds up, then the filled-in answers.
// Typed text lives in S.res.drafts until Save answers, so the 30-second refresh never loses it.
import { S } from "../../state.js";
import { esc, icon } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import * as M from "./model.js";

const val = (a, l) => S.res.drafts[a.key]?.[l] ?? a[l];
const input = (a, l) => `<label class="jp-field"><span class="jp-field__label">${l === "tr" ? "Türkçe" : "English"}</span>
  <input class="jp-input" type="text" ${l === "tr" ? 'lang="tr"' : ""} data-ans="${a.key}" data-lang="${l}" value="${esc(val(a, l))}" placeholder="${esc(l === "tr" ? a.phTr : a.phEn)}" maxlength="400"></label>`;

function blocks(a) {
  if (!a.blocks.length) return `<p class="foot">No job is waiting on it yet${a.lastUsed ? `. Last asked by ${esc(a.lastUsed.company)}` : ""}.</p>`;
  const j = a.blocks[0];
  return `<p class="foot"><button class="rs-link" type="button" data-action="res-open-job" data-k="${esc(j.k)}">${esc(j.company)}</button> asked “${esc(j.q)}” · Easy Apply is waiting: Needs manual${a.blocks.length > 1 ? ` · and ${a.blocks.length - 1} more` : ""}</p>`;
}

const missingRow = (a) => `<div class="rs-miss">
  <div class="rs-miss__top"><span class="rs-miss__label">${esc(a.label)}</span>
    ${a.blocks.length ? `<span class="meta" style="color:var(--warning-text)">· blocks <span class="jp-num">${a.blocks.length}</span> ${a.blocks.length === 1 ? "application" : "applications"}</span>` : ""}</div>
  ${blocks(a)}<div class="rs-pair">${input(a, "tr")}${input(a, "en")}</div></div>`;

function filledRow(a) {
  const editing = S.res.editing.includes(a.key);
  const used = a.lastUsed ? `${esc(a.lastUsed.company)} · ${esc(M.day(a.lastUsed.at))}` : "Not asked yet";
  if (editing) return `<div class="jp-row rs-ans rs-ans--edit"><span class="rs-ans__q">${esc(a.label)}</span><div class="rs-pair rs-ans__pair">${input(a, "tr")}${input(a, "en")}</div>
    <span class="foot">${used}</span><span></span></div>`;
  const text = (l) => a[l] ? `<span class="t-callout"${l === "tr" ? ' lang="tr"' : ""}>${esc(a[l])}</span>` : `<span class="foot">Claude translates the ${l === "tr" ? "English" : "Turkish"}</span>`;
  return `<div class="jp-row rs-ans"><span class="rs-ans__q">${esc(a.label)}</span>${text("tr")}${text("en")}
    <span class="foot">${used}</span>
    <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="res-ans-edit" data-v="${a.key}" aria-label="Edit ${esc(a.label)}">Edit</button></div>`;
}

export function answersHtml() {
  const list = M.res().answers, missing = list.filter((a) => !a.tr && !a.en), filled = list.filter((a) => a.tr || a.en);
  const holding = missing.filter((a) => a.blocks.length).length;
  return `<header class="rs-head"><button class="jp-btn jp-btn--plain jp-btn--sm rs-back" type="button" data-action="res-back">${icon("back")}Resumes</button>
      <span class="rs-tile rs-tile--lg rs-tile--plain" aria-hidden="true">${icon("list", "ico ico--20")}</span>
      <div class="rs-head__text"><h2 class="t-title2">Standard answers</h2>
        <span class="meta">Filled in once. Claude answers application questions with these first, in the posting's language.</span></div>
      <div class="rs-head__actions"><button class="jp-btn jp-btn--primary jp-btn--sm" type="button" data-action="res-ans-save">Save answers</button></div></header>
    <div class="rs-body rs-body--one" id="res-detail-scroll"><div class="rs-cards">
      ${missing.length ? `<section class="jp-card rs-card" aria-labelledby="miss-title">
        <div class="rs-card__head rs-card__head--row"><h3 id="miss-title" class="t-headline">Missing</h3>${pill(`${missing.length} missing`, "warning")}
          <span class="foot" style="margin-left:auto">${holding ? `${holding} of them ${holding === 1 ? "is" : "are"} holding up an application` : "Claude guesses these today"}</span></div>
        ${missing.map(missingRow).join("")}</section>` : ""}
      <section class="jp-list rs-card--list" aria-labelledby="filled-title">
        <div class="rs-card__head"><h3 id="filled-title" class="t-headline">Filled in</h3>
          <span class="foot"><span class="jp-num">${filled.length}</span> ${filled.length === 1 ? "answer" : "answers"} · Claude picks the language of each posting</span></div>
        <div class="rs-ans rs-ans--head" aria-hidden="true"><span class="cap">Question</span><span class="cap">Türkçe</span><span class="cap">English</span><span class="cap">Last used</span><span></span></div>
        ${filled.map(filledRow).join("") || `<p class="meta rs-card__empty">Nothing filled in yet.</p>`}
      </section>
      <p class="foot">Anything else about you stays in Settings, under profile facts. Claude still reads those too.</p>
    </div></div>`;
}

// Saves every answer with a draft; untouched ones keep their text
export function collectAnswers() {
  const out = {};
  for (const a of M.res().answers) if (S.res.drafts[a.key]) out[a.key] = { tr: val(a, "tr").trim(), en: val(a, "en").trim() };
  return out;
}
