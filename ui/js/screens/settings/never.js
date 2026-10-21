// Settings > Never apply to (board Settings-Never): companies (profile.companyExclude) and title words (profile.titleExclude),
// each with how many listings it skipped (GET /api/settings/never, from Activity's skip reasons).
import { S } from "../../state.js";
import { esc, icon, toast } from "../../util.js";
import { companyLogo } from "../../components/company-logo.js";
import { profile, saveProfile } from "./index.js";

const LISTS = {
  companyExclude: { title: "Companies", count: "companies", ph: "Company name, as it appears on LinkedIn", what: "company",
    empty: "No companies yet. Add your current employer so it never sees an application." },
  titleExclude: { title: "Title words", count: "titles", ph: "A word in a job title, e.g. Senior or Satış", what: "word",
    empty: "No words yet. Jobs whose title contains one are skipped on every profile." },
};

function block(key) {
  const L = LISTS[key], list = profile()[key] || [], n = S.set.never && !S.set.never.error && S.set.never !== "loading" ? S.set.never[L.count] || {} : null;
  const skipped = (w) => n ? `<span class="meta"><span class="data">${n[w] ?? 0}</span> ${(n[w] ?? 0) === 1 ? "job" : "jobs"} skipped</span>` : "";
  return `<section class="st-never" aria-labelledby="st-nv-${key}"><h3 id="st-nv-${key}" class="cap">${L.title}</h3>
    <form class="st-addrow" data-never="${key}"><label class="jp-field"><span class="sr-only">${L.ph}</span>
      <input class="jp-input" type="text" name="v" maxlength="80" placeholder="${esc(L.ph)}" autocomplete="off"></label>
      <button class="jp-btn jp-btn--primary" type="submit">Add</button></form>
    <div class="jp-list">${list.length ? list.map((w) => `<div class="st-row st-row--never">
        ${key === "companyExclude" ? companyLogo(w) : `<span class="st-wordico" aria-hidden="true">${icon("ban")}</span>`}
        <span class="st-row__text"><span class="st-row__label">${esc(w)}</span></span>${skipped(w)}
        <button class="jp-btn jp-btn--sm btn-icon st-x" type="button" aria-label="Remove ${esc(w)} from the list" data-action="never-remove" data-k="${key}" data-v="${esc(w)}">${icon("close")}</button></div>`).join("")
      : `<p class="foot st-empty">${L.empty}</p>`}</div></section>`;
}

export function neverHtml() {
  return `<div class="st-head"><div class="st-head__text"><h2 class="t-title2">Never apply to</h2>
      <p class="meta">Claude skips these on every profile, before it reads the job, and Activity shows why.</p></div></div>
    <div class="st-col st-narrow">${block("companyExclude")}${block("titleExclude")}
      <p class="foot">Claude also skips jobs you already applied to and re-posts of jobs it has already seen, without a list.</p></div>`;
}

const same = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
async function add(key, v) {
  const list = profile()[key] || [];
  if (!v) return;
  if (list.some((x) => same(x, v))) return toast(`${v} is already on the list.`);
  S.set.never = null; // recount
  await saveProfile({ [key]: [...list, v] }, `Added ${v}. Claude skips it from the next run.`);
}

export const NEVER_ACTIONS = {
  "never-remove": async (el) => {
    const key = el.dataset.k, v = el.dataset.v;
    await saveProfile({ [key]: (profile()[key] || []).filter((x) => x !== v) }, `Removed ${v}.`);
  },
};

// The add forms submit with Enter or the Add button
document.addEventListener("submit", (e) => {
  const f = e.target.closest?.("[data-never]");
  if (!f) return;
  e.preventDefault();
  add(f.dataset.never, f.elements.v.value.trim()).then(() => document.querySelector(`[data-never="${f.dataset.never}"] input`)?.focus()).catch((err) => toast(err.message, 7000));
});
