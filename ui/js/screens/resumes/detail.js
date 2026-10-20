// Resume detail (canvas boards Resumes, Resumes-Original): header with exports, the page preview, and the cards in history.js.
import { esc, icon, pdfUrl } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { callout } from "../../components/card.js";
import { companyLogo } from "../../components/company-logo.js";
import { docxUrl } from "../../api.js";
import { changesCard, versionsCard, jobsCard, defaultsCard, sentNote } from "./history.js";
import * as M from "./model.js";

const isPdf = (p) => /\.pdf$/i.test(p || "");

function exports(x) {
  const cur = M.current(x), path = x.kind === "original" ? x.path : cur.path || x.path;
  // An original has no structured copy until Claude reads it once
  const docx = x.kind === "original" && !x.read?.resume
    ? `<button class="jp-btn jp-btn--sm" type="button" data-action="res-docx-read" data-file="${esc(x.file)}" aria-label="Export to edit as DOCX">DOCX</button>`
    : `<a class="jp-btn jp-btn--sm" href="${docxUrl(x.id)}" download aria-label="Export to edit as DOCX">DOCX</a>`;
  return `<div class="rs-head__actions"><span class="foot" aria-hidden="true">Export</span>
    ${isPdf(path) ? `<a class="jp-btn jp-btn--sm" href="${pdfUrl(path)}&dl=1" aria-label="Export as PDF">PDF</a>` : ""}
    ${docx}<span class="vsep" aria-hidden="true"></span>
    <button class="jp-btn ${x.kind === "original" ? "" : "jp-btn--tinted"} jp-btn--sm" type="button" data-action="res-reupload" aria-haspopup="dialog">${icon("upload")}Upload new version</button>
    ${x.kind === "original" ? `<button class="jp-btn jp-btn--tinted jp-btn--sm" type="button" data-action="res-defaults">Set as default…</button>` : ""}
  </div>`;
}

function head(x) {
  const back = `<button class="jp-btn jp-btn--plain jp-btn--sm rs-back" type="button" data-action="res-back">${icon("back")}Resumes</button>`;
  if (x.kind === "tailored") {
    const [label, tone] = M.RSTATUS[x.status];
    return `<header class="rs-head">${back}${companyLogo(x.job.company, x.job.logoUrl)}
      <div class="rs-head__text"><h2 class="rs-head__title ellip">${esc(x.file)}</h2>
        <div class="rs-head__meta"><span class="meta ellip">Tailored · ${M.lang(x.language)} · from ${esc(x.parentName)}</span>${pill(label, tone)}</div>
        <span class="foot ellip">For ${esc(x.job.title)} at ${esc(x.job.company)} · score <span class="jp-num">${x.baseScore}</span> → <span class="jp-num" style="color:var(--accent-text)">${x.score}</span> · tailored ${esc(M.when(x.at))}</span></div>
      ${exports(x)}</header>`;
  }
  const tile = `<span class="rs-tile rs-tile--lg${x.kind === "ready" ? " rs-tile--ready" : ""}" aria-hidden="true">${icon(x.kind === "ready" ? "doc-check" : "doc", "ico ico--20")}</span>`;
  const meta = x.kind === "ready" ? `Ready resume · ${M.lang(x.language)} · ${esc(x.file)}` : `Original · ${M.lang(x.language)} · ${esc(x.file)}`;
  const tag = x.kind === "ready" ? (x.stale.length ? pill("Needs rebuild", "warning") : "")
    : x.defaultFor.length ? pill(`Default for ${x.defaultFor.join(", ")}`, "accent") : "";
  const foot = x.kind === "ready"
    ? `Written by Claude ${M.when(x.generatedAt)}${x.basedOnJobs ? ` · shaped by ${x.basedOnJobs} analyzed ${x.basedOnJobs === 1 ? "job" : "jobs"}` : ""} · rewritten every week`
    : `Uploaded by you · ${M.when(M.current(x).at)} · Claude reads it for every application`;
  return `<header class="rs-head">${back}${tile}
    <div class="rs-head__text"><h2 class="t-title2 ellip">${esc(x.name)}</h2>
      <div class="rs-head__meta"><span class="meta ellip">${meta}</span>${tag}</div><span class="foot ellip">${esc(foot)}</span></div>
    ${exports(x)}</header>`;
}

function preview(x) {
  const path = x.kind === "original" ? x.path : M.current(x).path || x.path;
  const v = M.current(x).v;
  return `<section class="jp-card rs-preview" aria-label="Page preview">
    <div class="rs-preview__bar"><span class="foot">${esc(M.lang(x.language))} · v${v}${x.kind === "tailored" && x.sent?.v === v ? " · as sent" : ""}</span>
      <a class="jp-btn jp-btn--plain jp-btn--sm" href="${pdfUrl(path)}" target="_blank" rel="noopener">Open${icon("external", "ico ico--14")}</a></div>
    ${isPdf(path) && navigator.pdfViewerEnabled !== false ? `<iframe class="rs-page" id="res-page" src="${pdfUrl(path)}#toolbar=0&navpanes=0&view=FitH" title="Resume page: ${esc(x.name)}"></iframe>`
      : `<p class="meta rs-card__empty">${isPdf(path) ? "This browser can't show PDFs inside the page." : "The preview shows PDFs."} Open the file to read it.</p>`}
  </section>`;
}

function notes(x) {
  const out = [];
  if (x.kind === "tailored" && x.sent) out.push(`<div class="jp-callout rs-sent">${icon("lock", "ico ico--20")}<span><b>${esc(sentNote(x))}.</b> ${
    x.sent.v === M.current(x).v ? "This version stays exactly as sent. Upload a new version to use an edited one from now on." : `v${x.sent.v} stays exactly as sent; v${M.current(x).v} is the one used from now on.`}</span></div>`);
  if (x.kind === "tailored" && x.status === "unused") out.push(callout(`<b>Not used.</b> It scored ${x.score}, not higher than ${esc(x.parentName)} (${x.baseScore}), so Claude sends your original for this job.`));
  if (x.kind === "ready" && x.stale.length) out.push(callout(`<b>Needs rebuild.</b> ${esc(x.stale.join(", "))} changed after Claude wrote it. The next run rebuilds it.
    <button class="jp-btn jp-btn--sm" type="button" data-action="task" data-task="library" style="margin-left:8px">Rebuild now</button>`, "warning"));
  return out.join("");
}

export function detailHtml(x) {
  if (!x) return `<div class="rs-empty-detail"><p class="meta" style="color:var(--text)">No resume selected</p><p class="foot">Pick a resume on the left, or upload one.</p></div>`;
  const cards = x.kind === "original" ? [jobsCard(x), defaultsCard(x), versionsCard(x)] : [changesCard(x), versionsCard(x), jobsCard(x)];
  return `${head(x)}
    <div class="rs-body" id="res-detail-scroll">${preview(x)}<div class="rs-cards">${notes(x)}${cards.join("")}</div></div>`;
}
