// GitHub projects for your resume (Resumes > GitHub projects): every repo from your GitHub with your choice: Use on resumes,
// Never use, or Not reviewed (never put on a resume). Approved repos get the name and one-line description resumes use.
// Claude can suggest choices and wording from its GitHub review; you decide.
import { S } from "../../state.js";
import { esc, icon } from "../../util.js";
import { pill } from "../../components/status-pill.js";

const STATES = [["use", "Use on resumes"], ["never", "Never use"], ["unreviewed", "Not reviewed"]];
const VERDICT = { real_value: ["Real value", "success"], moderate: ["Moderate", "warning"], ats_padding: ["ATS padding", "serious"] };

function row(p) {
  const v = VERDICT[p.review?.verdict], sug = p.suggested;
  const differs = sug && sug.state !== p.state;
  return `<section class="jp-card rs-card rs-proj" aria-labelledby="pr-${esc(p.repo)}">
    <div class="rs-proj__top">
      <div class="rs-ver__text"><h3 class="rs-job__title" id="pr-${esc(p.repo)}">${esc(p.repo)}</h3>
        <span class="foot ellip">${esc([p.languages.join(", "), p.description].filter(Boolean).join(" · ") || "No description")}</span></div>
      ${v ? pill(`Review: ${v[0]}`, v[1]) : pill("Not reviewed by Claude", "neutral")}
    </div>
    <div class="jp-seg rs-proj__seg" role="radiogroup" aria-label="${esc(p.repo)} on resumes">${STATES.map(([s, l]) =>
      `<button class="jp-seg__item" type="button" role="radio" aria-checked="${p.state === s}" aria-selected="${p.state === s}" data-action="res-proj-state" data-repo="${esc(p.repo)}" data-v="${s}">${l}</button>`).join("")}</div>
    ${sug ? `<p class="foot">Claude suggests <b>${sug.state === "use" ? "Use on resumes" : "Never use"}</b>: ${esc(sug.why)}
      ${differs ? `<button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="res-proj-state" data-repo="${esc(p.repo)}" data-v="${sug.state}">Accept</button>` : ""}</p>` : ""}
    ${p.state === "use" ? `<div class="rs-pair">
      <label class="jp-field"><span class="jp-field__label">Name on resumes</span>
        <input class="jp-input" type="text" data-proj="${esc(p.repo)}" data-k="resumeName" value="${esc(p.resumeName)}" maxlength="90" placeholder="${esc(sug?.name || "e.g. Closed-loop FOC motor driver (STM32G4, 36–48 V)")}"></label>
      <label class="jp-field"><span class="jp-field__label">One line</span>
        <input class="jp-input" type="text" data-proj="${esc(p.repo)}" data-k="resumeLine" value="${esc(p.resumeLine)}" maxlength="220" placeholder="${esc(sug?.description || "What it is, in a sentence")}"></label></div>
      <p class="foot">Tailoring uses exactly this name, never “${esc(p.repo)}”, and nothing beyond this line and the review.</p>` : ""}
  </section>`;
}

export function projectsHtml() {
  const list = S.RES?.projects || [], busy = S.res.suggesting;
  const n = (s) => list.filter((p) => p.state === s).length;
  return `<header class="rs-head"><button class="jp-btn jp-btn--plain jp-btn--sm rs-back" type="button" data-action="res-back">${icon("back")}Resumes</button>
      <span class="rs-tile rs-tile--lg rs-tile--plain" aria-hidden="true">${icon("doc-check", "ico ico--20")}</span>
      <div class="rs-head__text"><h2 class="t-title2">GitHub projects for your resume</h2>
        <span class="meta"><span class="jp-num">${n("use")}</span> on resumes · <span class="jp-num">${n("never")}</span> never · <span class="jp-num">${n("unreviewed")}</span> not reviewed. Only approved projects reach tailoring, scoring, ready resumes and the coach.</span></div>
      <div class="rs-head__actions"><button class="jp-btn jp-btn--tinted jp-btn--sm" type="button" data-action="res-proj-suggest" ${busy || !list.length ? "disabled" : ""}>${busy ? `<span class="rs-spin" aria-hidden="true"></span>Claude is looking…` : "Ask Claude to suggest"}</button></div></header>
    <div class="rs-body rs-body--one" id="res-detail-scroll"><div class="rs-cards">
      ${list.length ? list.map(row).join("") : `<p class="meta">No repos yet. Add your GitHub user in Settings; the next run fetches them.</p>`}</div></div>`;
}
