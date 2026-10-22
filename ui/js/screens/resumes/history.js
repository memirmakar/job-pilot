// Resume detail cards (canvas board Resumes, right column): what changed against the base, version history,
// the jobs that used it, and an original's default settings.
import { S } from "../../state.js";
import { esc, md, icon, pdfUrl } from "../../util.js";
import { pill, statusPill } from "../../components/status-pill.js";
import { tags } from "../../components/tag.js";
import { companyLogo } from "../../components/company-logo.js";
import * as M from "./model.js";

export const sentNote = (t) => t.sent ? `Sent to ${t.sent.company || t.job.company} on ${M.day(t.sent.at)}` : "";

export function changesCard(x) {
  const all = M.changes(x), mine = M.current(x).by === "you" && !M.current(x).instruction;
  const kinds = ["Added", "Moved", "Reworded", "Removed"].map((k) => [k, all.filter((c) => c.kind === k).length]).filter(([, n]) => n);
  const kind = kinds.some(([k]) => k === S.res.kind) ? S.res.kind : "all";
  const shown = all.map((c, i) => ({ ...c, n: i + 1 })).filter((c) => kind === "all" || c.kind === kind);
  const base = x.kind === "tailored" ? x.parentName : "your originals";
  const notAdded = M.notAdded(x);
  return `<section class="jp-card rs-card" aria-labelledby="chg-title">
    <div class="rs-card__head"><h3 id="chg-title" class="t-headline">${mine ? "What you changed" : "What Claude changed"}</h3>
      <span class="foot">Compared with ${esc(mine ? "the version before" : base)}</span></div>
    ${kinds.length > 1 ? `<div class="rs-chips" role="group" aria-label="Show changes">${[["all", all.length], ...kinds].map(([k, n]) =>
      `<button class="chip" type="button" aria-pressed="${k === kind}" data-action="res-kind" data-v="${k}">${k === "all" ? "All" : k} <span class="jp-num">${n}</span></button>`).join("")}</div>` : ""}
    ${shown.length ? `<ol class="rs-changes">${shown.map((c) => `<li>
      <span class="rs-numb" aria-hidden="true">${c.n}</span>
      <div class="rs-change"><div class="rs-change__top">${pill(c.kind, M.KIND_TONE[c.kind])}${c.where ? `<span class="foot ellip">${esc(c.where)}</span>` : ""}</div>
        <p class="t-callout${c.kind === "Removed" ? " rs-strike" : ""}" lang="${esc(x.language)}">${md(c.text)}</p>
        ${c.why || c.source ? `<p class="foot">${c.why ? `<b>Why:</b> ${md(c.why)}` : ""}${c.source ? ` · <span style="color:var(--success-text)">${esc(c.source)}</span>` : ""}</p>` : ""}
        ${c.rule ? `<p class="foot rs-rule">${icon("check", "ico ico--13")}Your rule: ${esc(c.rule)}</p>` : ""}</div></li>`).join("")}</ol>`
      : `<p class="meta">${x.kind === "original" ? "" : "Claude didn't note any changes for this version."}</p>`}
    ${notAdded.length ? `<div class="rs-notadded"><p class="cap">Not added: your resumes don't show it</p>${tags(notAdded, "", 14)}</div>` : ""}
    <div class="meta rs-card__foot">${icon("check")}${mine ? (M.current(x).confirmed?.length ? `${M.current(x).confirmed.length === 1 ? "The line" : "Lines"} you confirmed as true went into your profile facts; Claude checked every other line against your originals.` : "Claude checked every line against your originals, profile and GitHub.") : `Nothing invented. Claude only used ${esc(base)}, your other originals, your profile and your GitHub.`}</div>
  </section>`;
}

export function versionsCard(x) {
  const sentV = x.sent?.v, last = M.current(x).v;
  const rows = [...x.versions].reverse().map((v) => {
    const sent = sentV === v.v;
    const what = sent ? sentNote(x) : v.note || (v.by === "you" ? "Version you uploaded" : "Written by Claude");
    const tag = sent ? pill("Sent", "success") : v.v === last ? pill("Current", "accent") : "";
    return `<div class="jp-row rs-ver${x.kind === "tailored" ? " rs-ver--score" : ""}">
      <span class="rs-ver__v jp-num">v${v.v}</span>
      <span class="rs-ver__text"><span class="ellip rs-ver__what">${esc(what)}</span>
        <span class="foot rs-ver__who">${v.by === "you" ? icon("user", "ico ico--13") : `<span class="jp-bar__mark rs-mark" aria-hidden="true"></span>`}${v.by === "you" ? "You" : "Claude"} · ${esc(M.when(v.at))}${sent ? ` · ${icon("lock", "ico ico--13")}read-only` : ""}</span></span>
      ${x.kind === "tailored" ? `<span class="jp-num rs-ver__score" aria-label="Score ${v.score ?? ""}">${v.score != null ? Math.round(v.score) : "–"}</span>` : ""}
      <span class="rs-ver__end">${tag}${v.path ? `<a class="jp-btn jp-btn--plain jp-btn--sm" href="${pdfUrl(v.path)}" target="_blank" rel="noopener" aria-label="Open v${v.v}">Open</a>` : ""}</span>
    </div>`;
  });
  if (x.kind === "tailored") rows.push(`<div class="jp-row rs-ver rs-ver--score">
    <span class="rs-ver__v"></span><span class="rs-ver__text"><span class="ellip rs-ver__what">${esc(x.parentName)}, the resume it came from</span>
      <span class="foot rs-ver__who">${icon("user", "ico ico--13")}You</span></span>
    <span class="jp-num rs-ver__score" aria-label="Score ${x.baseScore}">${x.baseScore}</span><span class="rs-ver__end">${pill("Base", "neutral")}</span></div>`);
  return `<section class="jp-card rs-card rs-card--flush" aria-labelledby="ver-title">
    <div class="rs-card__head"><h3 id="ver-title" class="t-headline">Version history</h3><span class="foot">Re-uploads add a version, never overwrite</span></div>
    ${rows.join("")}</section>`;
}

const jobRow = (j) => `<div class="jp-row rs-job">
  ${companyLogo(j.company, j.logoUrl, "sm")}
  <span class="rs-ver__text"><span class="ellip rs-job__title">${esc(j.title)} · ${esc(j.company)}</span>
    ${j.tailored ? `<button class="rs-link foot ellip" type="button" data-action="res-select" data-id="${esc(j.tailored)}">Tailored resume</button>` : `<span class="foot">Scored, not tailored</span>`}</span>
  <span class="rs-job__end"><span class="meta"><span class="jp-num">${j.from}</span>${j.score != null ? ` → <span class="jp-num" style="color:var(--text)">${j.score}</span>` : ""}</span>${statusPill(j.status)}</span>
  <button class="jp-btn jp-btn--plain jp-btn--sm btn-icon" type="button" data-action="res-open-job" data-k="${esc(j.k)}" aria-label="Open job: ${esc(j.title)}">${icon("next")}</button>
</div>`;

export function jobsCard(x) {
  if (x.kind === "tailored") return `<section class="jp-card rs-used" aria-labelledby="used-title">
    <h3 id="used-title" class="cap rs-used__cap">Used for</h3>${companyLogo(x.job.company, x.job.logoUrl, "sm")}
    <span class="rs-ver__text"><span class="ellip rs-job__title">${esc(x.job.title)}</span><span class="foot">${esc([x.job.company, x.job.location].filter(Boolean).join(" · "))}</span></span>
    ${statusPill(x.job.status)}
    <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="res-open-job" data-k="${esc(x.job.k)}">Open job${icon("next", "ico ico--14")}</button></section>`;
  const title = x.kind === "original" ? "Jobs that used this original" : "Jobs tailored from it";
  return `<section class="jp-card rs-card rs-card--flush" aria-labelledby="used-o-title">
    <div class="rs-card__head"><h3 id="used-o-title" class="t-headline">${title}</h3><span class="foot">${x.jobs.length ? `${x.jobs.length} ${x.jobs.length === 1 ? "job" : "jobs"} Claude scored with it` : ""}</span></div>
    ${x.jobs.length ? x.jobs.map(jobRow).join("") : `<p class="meta rs-card__empty">No job has used it yet.</p>`}</section>`;
}

export function defaultsCard(o) {
  const fields = M.res().fields, others = M.res().originals.filter((x) => x.id !== o.id);
  return `<section id="res-defaults" class="jp-card rs-card" aria-labelledby="def-title" tabindex="-1">
    <h3 id="def-title" class="t-headline">Default settings</h3>
    <div class="rs-defgrid">
      <span class="meta" id="def-lang">Language</span>
      <div class="jp-seg" role="radiogroup" aria-labelledby="def-lang">${[["en", "English"], ["tr", "Turkish"]].map(([v, l]) =>
        `<button class="jp-seg__item" type="button" role="radio" aria-checked="${o.language === v}" aria-selected="${o.language === v}" data-action="res-meta-lang" data-v="${v}">${l}</button>`).join("")}</div>
      <span class="meta" id="def-fields">Fields</span>
      <div class="rs-chips" role="group" aria-labelledby="def-fields">${fields.map((f) =>
        `<button class="chip" type="button" aria-pressed="${o.fields.includes(f)}" data-action="res-meta-field" data-v="${esc(f)}">${esc(f)}</button>`).join("") || `<span class="foot">Add target fields in Settings.</span>`}</div>
    </div>
    ${o.fields.map((f) => {
      const on = o.defaultFor.includes(f), other = others.find((x) => x.defaultFor.includes(f));
      return `<div class="rs-switchrow"><span class="rs-ver__text"><span class="rs-job__title">Default for ${esc(f)}</span>
        <span class="foot">${on ? `Claude starts the ${esc(f)} ready resume from it` : other ? `Now: ${esc(other.name)}` : "No default yet: Claude picks from all your originals"}</span></span>
        <button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="Default for ${esc(f)}" data-action="res-meta-default" data-v="${esc(f)}"></button></div>`;
    }).join("") || `<p class="foot">Pick the fields it's for to make it a default.</p>`}
  </section>`;
}
