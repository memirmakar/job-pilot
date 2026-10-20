// Job posting sheet (canvas board A-Posting): the description saved when Claude analyzed the job, over the detail.
import { esc, icon } from "../../util.js";
import { tags } from "../../components/tag.js";
import { companyLogo } from "../../components/company-logo.js";
import * as M from "./model.js";

const BULLET = /^\s*([-•*·▪●◦–]|\d{1,2}[.)])\s+/;
// Short lines ending in ":" or without end punctuation ("What you'll do"); "Type: Hourly contract" stays a line
const isHeading = (l, next) => l.length < 70 && (/:$/.test(l) || (!/[.!?;,]$/.test(l) && !/:\s/.test(l) && next && !BULLET.test(l)));

// LinkedIn's saved text is plain lines: turn it into headings, lists and paragraphs
export function postingBody(text) {
  const ls = String(text || "").split(/\n+/).map((l) => l.trim()).filter((l) => l && !/^(about the job|[iİ]ş ilanı hakkında)$/i.test(l));
  const out = []; let list = [];
  const flush = () => { if (list.length > 1) out.push(`<ul>${list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`); else if (list.length) out.push(`<p>${esc(list[0])}</p>`); list = []; };
  ls.forEach((l, i) => {
    if (BULLET.test(l)) return list.push(l.replace(BULLET, ""));
    if (isHeading(l, ls[i + 1])) { flush(); return out.push(`<h4>${esc(l.replace(/:$/, ""))}</h4>`); }
    if (l.length < 160 && (list.length || (ls[i + 1] && ls[i + 1].length < 160 && !isHeading(ls[i + 1], ls[i + 2])))) return list.push(l);
    flush(); out.push(`<p>${esc(l)}</p>`);
  });
  flush();
  return out.join("") || `<p>The description wasn't saved for this job.</p>`;
}

const lang = (t) => (String(t).match(/[ğışçöüİ]/gi) || []).length > 8 ? "tr" : "en";

export function postingHtml(r) {
  const facts = [M.applyType(r), r.location, M.applicants(r)].filter(Boolean);
  return `<div class="jd-scrim" data-action="panel-close" aria-hidden="true"></div>
  <div class="jd-posting" role="dialog" aria-modal="true" aria-label="Job posting: ${esc(r.title)}">
    <div class="jd-posting__head">
      ${companyLogo(r.company, r.logoUrl, "sm")}
      <div class="jd-posting__title"><span class="ellip" style="font:600 15px/20px var(--font-sans)">Job posting</span>
        <span class="foot ellip">Saved from LinkedIn when Claude analyzed it · kept after the listing closes</span></div>
      <a class="jp-btn jp-btn--plain jp-btn--sm" href="${esc(r.url)}" target="_blank" rel="noopener">Open on LinkedIn${icon("external")}</a>
      <button class="jp-btn jp-btn--sm" type="button" data-action="panel-close" data-focus>Done</button>
    </div>
    <article class="posting" lang="${lang(r.description)}">
      <h3 class="t-title2">${esc(r.title)}</h3>
      <p class="meta">${esc([r.company, r.location, M.posted(r)].filter(Boolean).join(" · "))}</p>
      ${facts.length ? `<div class="posting__facts">${tags(facts)}</div>` : ""}
      ${postingBody(r.description)}
    </article>
  </div>`;
}
