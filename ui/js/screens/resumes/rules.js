// Your resume rules (Resumes > Your resume rules): standing rules Claude follows on every tailored, ready and re-uploaded resume,
// the photo and when it's included, the neutral file name employers see, and the two bulk actions those settings call for.
import { S } from "../../state.js";
import { esc, icon } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { photoUrl } from "../../api.js";

const seg = (name, value, opts) => `<div class="jp-seg" role="radiogroup" aria-label="${esc(name)}">${opts.map(([v, l]) =>
  `<button class="jp-seg__item" type="button" role="radio" aria-checked="${value === v}" aria-selected="${value === v}" data-action="res-photo-en" data-v="${v === null ? "ask" : v ? "1" : "0"}">${l}</button>`).join("")}</div>`;

function rulesCard(p) {
  return `<section class="jp-card rs-card" aria-labelledby="rules-title">
    <div class="rs-card__head"><h3 id="rules-title" class="t-headline">Rules for every resume</h3><span class="foot">"What Claude changed" says which rule a change follows</span></div>
    ${p.rules.map((r) => `<div class="rs-rulerow"><input class="jp-input" type="text" data-rule="${esc(r.id)}" value="${esc(r.text)}" maxlength="300" aria-label="Rule">
      <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="res-rule-remove" data-id="${esc(r.id)}" aria-label="Remove rule: ${esc(r.text)}">Remove</button></div>`).join("")
      || `<p class="meta">No rules yet. For example: “Always keep my photo on Turkish resumes”, “Call me Elektronik Mühendisi”.</p>`}
    <form class="rs-rulerow" data-res-rule><input class="jp-input" id="rule-new" type="text" maxlength="300" placeholder="Add a rule, e.g. Never list my high school" aria-label="New rule">
      <button class="jp-btn jp-btn--tinted jp-btn--sm" type="submit">Add rule</button></form>
  </section>`;
}

function photoCard(p) {
  const s = p.settings;
  return `<section class="jp-card rs-card" aria-labelledby="photo-title">
    <div class="rs-card__head"><h3 id="photo-title" class="t-headline">Photo</h3><span class="foot">Placed at the top right of the header, as Turkish CVs usually have it</span></div>
    <div class="rs-photo">
      ${p.hasPhoto ? `<img class="rs-photo__img" src="${photoUrl()}" alt="Your resume photo">` : `<span class="rs-photo__img rs-photo__none" aria-hidden="true">${icon("user", "ico ico--20")}</span>`}
      <div class="rs-photo__text">
        <span class="meta">${p.hasPhoto ? `Added ${p.photoSource === "original" ? "from one of your originals" : "by you"}` : "No photo yet"}</span>
        <div class="rs-inline-btns">
          <label class="jp-btn jp-btn--sm">Upload a photo<input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp" hidden></label>
          <button class="jp-btn jp-btn--sm" type="button" data-action="res-photo-from">Take it from an original</button>
          ${p.hasPhoto ? `<button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="res-photo-remove">Remove</button>` : ""}</div>
      </div>
    </div>
    ${p.hasPhoto ? `<div class="rs-switchrow"><span class="rs-ver__text"><span class="rs-job__title">Turkish resumes</span><span class="foot">Tailoring and re-uploads never drop it while this is on</span></span>
      <button class="switch" type="button" role="switch" aria-checked="${s.photoTr !== false}" aria-label="Photo on Turkish resumes" data-action="res-photo-tr"></button></div>
    <div class="rs-switchrow"><span class="rs-ver__text"><span class="rs-job__title">English resumes</span><span class="foot">${s.photoEn === null ? "Not decided: English resumes ask you" : "Many English-speaking employers prefer no photo"}</span></span>
      ${seg("Photo on English resumes", s.photoEn, [[null, "Ask me"], [true, "Include"], [false, "Leave out"]])}</div>` : ""}
  </section>`;
}

function namesCard(p) {
  return `<section class="jp-card rs-card" aria-labelledby="names-title">
    <div class="rs-card__head"><h3 id="names-title" class="t-headline">File names employers see</h3><span class="foot">Folders inside the app stay separate, so names can repeat</span></div>
    <label class="jp-field"><span class="jp-field__label">Pattern</span>
      <input class="jp-input" id="name-pattern" type="text" value="${esc(p.settings.namePattern)}" maxlength="80" spellcheck="false">
      <span class="jp-field__hint">{First} {Last} {Name} {LANG} {lang}. Never the job, company, field, “tailored”, a pass or a version.</span></label>
    <p class="meta rs-names">Turkish: <span class="data">${esc(p.preview.tr)}</span> · English: <span class="data">${esc(p.preview.en)}</span></p>
    ${p.patternProblems.length ? `<p class="foot" style="color:var(--warning-text)">${esc(p.patternProblems.join("; "))}</p>` : ""}
    <div class="rs-switchrow"><span class="rs-ver__text"><span class="rs-job__title">${p.renameCount ? `${p.renameCount} unsent ${p.renameCount === 1 ? "file has" : "files have"} older names` : "Every unsent file uses the pattern"}</span>
      <span class="foot">Sent files keep the name they were sent under; the app remembers it</span></span>
      <button class="jp-btn jp-btn--sm" type="button" data-action="res-rename-all" ${p.renameCount ? "" : "disabled"}>Rename files to the new pattern</button></div>
  </section>`;
}

function retailorCard(p) {
  const r = p.retailor, busy = S.STATE?.tasks?.retailor?.running;
  const cost = r.estimateUsd != null ? ` · about $${r.estimateUsd.toFixed(2)} at API prices (an estimate, not a bill)` : "";
  return `<section class="jp-card rs-card" aria-labelledby="redo-title">
    <div class="rs-card__head"><h3 id="redo-title" class="t-headline">Re-tailor unsent resumes with your rules</h3>${busy ? pill("Running", "info") : ""}</div>
    <p class="meta">${r.count ? `${r.count} unsent tailored ${r.count === 1 ? "resume" : "resumes"} · about ${r.calls} Claude calls${cost}.` : "No unsent tailored resumes."}
      Each gets a new version; earlier and sent versions stay as they are.</p>
    <div><button class="jp-btn jp-btn--sm" type="button" data-action="res-retailor" ${r.count && !busy ? "" : "disabled"}>Re-tailor ${r.count || ""}…</button></div>
  </section>`;
}

export function rulesHtml() {
  const p = S.RES?.prefs;
  return `<header class="rs-head"><button class="jp-btn jp-btn--plain jp-btn--sm rs-back" type="button" data-action="res-back">${icon("back")}Resumes</button>
      <span class="rs-tile rs-tile--lg rs-tile--plain" aria-hidden="true">${icon("check", "ico ico--20")}</span>
      <div class="rs-head__text"><h2 class="t-title2">Your resume rules</h2>
        <span class="meta">Claude follows these on every tailored, ready and re-uploaded resume.</span></div></header>
    <div class="rs-body rs-body--one" id="res-detail-scroll"><div class="rs-cards">
      ${p ? rulesCard(p) + photoCard(p) + namesCard(p) + retailorCard(p) : `<p class="meta">Loading…</p>`}</div></div>`;
}
