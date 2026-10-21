// Settings > Search profiles (board Settings): one card per profile.targets entry with its own overrides, and the defaults
// every profile falls back to. Overrides left empty show the default as a placeholder (profiles.mjs resolves them for the run).
import { S } from "../../state.js";
import { esc, icon, toast } from "../../util.js";
import { tag } from "../../components/tag.js";
import { settings, profile, saveProfile } from "./index.js";
import { editSheet, deleteSheet, suggestSheet, SHEET_ACTIONS } from "./profile-sheets.js";

export const WORK = [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]];
export const targets = () => (profile().targets || []).map((t) => ({ ...t }));
const defWork = () => profile().workplace?.length ? profile().workplace : WORK.map(([k]) => k);
// Overrides: [key, label, settings default, min, max]
const NUMS = [["tailorTarget", "Target", "tailorTarget", 0, 100], ["minAtsScore", "Cutoff", "minAtsScore", 0, 100], ["dailyApplyLimit", "Per day", "dailyApplyLimit", 0, 60]];
const own = (v) => v != null && v !== "" && !(Array.isArray(v) && !v.length);

// Originals and ready resumes, as Resumes ids (o:file, r:field)
export function resumeOptions(sel) {
  const r = S.RES || { originals: [], ready: [] };
  const opt = (id, label) => `<option value="${esc(id)}"${id === (sel || "") ? " selected" : ""}>${esc(label)}</option>`;
  const missing = sel && ![...r.originals, ...r.ready].some((x) => x.id === sel);
  return opt("", "Best match of all your resumes") + (missing ? opt(sel, `${sel.slice(2)} (not found)`) : "") +
    (r.originals.length ? `<optgroup label="Your originals">${r.originals.map((o) => opt(o.id, `${o.name} · ${o.file}`)).join("")}</optgroup>` : "") +
    (r.ready.length ? `<optgroup label="Ready resumes">${r.ready.map((x) => opt(x.id, `${x.field} · ${x.file}`)).join("")}</optgroup>` : "");
}

const chips = (list, i, scope) => `<div class="st-chips" role="group" aria-label="Workplace">${WORK.map(([k, label]) =>
  `<button class="chip" type="button" aria-pressed="${list.includes(k)}" data-action="${scope}" data-i="${i}" data-v="${k}">${label}</button>`).join("")}</div>`;
const tags = (list, quiet = false) => list.map((x) => quiet ? `<span class="jp-tag st-tag--quiet">${esc(x)}</span>` : tag(x)).join("");

function card(t, i) {
  const on = t.on !== false, s = settings(), p = profile(), name = esc(t.field);
  const locs = own(t.locations) ? tags(t.locations) : tags(p.locations?.length ? p.locations : ["Anywhere"], true);
  const work = own(t.workplace) ? t.workplace : defWork();
  return `<section class="jp-card st-prof${on ? "" : " st-prof--off"}" aria-label="${name} profile">
    <div class="st-prof__head"><h3 class="t-headline ellip">${name}</h3>
      <button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="Run the ${name} profile" data-action="prof-on" data-i="${i}"></button></div>
    ${on ? "" : `<p class="foot st-prof__off">Off: its searches don't run. Jobs it found stay on Jobs.</p>`}
    <div class="jp-field st-f"><span class="jp-field__label">Job titles it searches</span>
      <div class="st-tags">${tags(t.searchTerms || [])}<button class="jp-btn jp-btn--plain jp-btn--sm st-add" type="button" data-action="prof-edit" data-i="${i}" data-focus="pe-terms">Edit</button></div></div>
    <div class="jp-field st-f"><span class="jp-field__label">Locations${own(t.locations) ? "" : ` <span class="foot">· your default</span>`}</span>
      <div class="st-tags">${locs}<button class="jp-btn jp-btn--plain jp-btn--sm st-add" type="button" data-action="prof-edit" data-i="${i}" data-focus="pe-locs">Edit</button></div></div>
    <div class="jp-field st-f"><span class="jp-field__label">Workplace${own(t.workplace) ? "" : ` <span class="foot">· your default</span>`}</span>${chips(work, i, "prof-wp")}</div>
    <label class="jp-field st-f"><span class="jp-field__label">Resume to use</span>
      <select class="jp-input" data-prof="resume" data-i="${i}">${resumeOptions(t.resume)}</select>
      <span class="jp-field__hint">${t.resume ? "Claude scores and tailors from this one only" : "Claude scores all of them and starts from the best"}</span></label>
    <div class="st-nums">${NUMS.map(([k, label, d, min, max]) => `<label class="jp-field st-f"><span class="jp-field__label">${label}</span>
      <input class="jp-input jp-num" type="number" min="${min}" max="${max}" data-prof="${k}" data-i="${i}" value="${own(t[k]) ? esc(t[k]) : ""}" placeholder="${esc(s[d])}" aria-describedby="st-num-hint"></label>`).join("")}</div>
    <div class="jp-field st-f"><span class="jp-field__label">Also skip titles with</span>
      <div class="st-tags">${(t.titleExclude || []).length ? tags(t.titleExclude) : `<span class="foot">Only your never-apply words</span>`}
        <button class="jp-btn jp-btn--plain jp-btn--sm st-add" type="button" data-action="prof-edit" data-i="${i}" data-focus="pe-skip">Edit</button></div></div>
    <div class="st-prof__foot"><button class="jp-btn jp-btn--sm" type="button" data-action="prof-edit" data-i="${i}">${icon("edit")}Edit</button>
      <button class="jp-btn jp-btn--plain jp-btn--sm st-danger" type="button" data-action="prof-delete" data-i="${i}">Delete</button></div>
  </section>`;
}

function defaults() {
  const s = settings(), p = profile();
  return `<section class="jp-card st-defaults" aria-labelledby="st-def-title">
    <div class="st-defaults__head"><h3 id="st-def-title" class="t-headline">Defaults for every profile</h3>
      <span class="foot">A profile uses these unless it sets its own</span></div>
    <div class="st-defaults__grid">
      <label class="jp-field"><span class="jp-field__label">Locations</span><textarea class="jp-input st-short" data-pset="locations" data-type="lines" rows="3">${esc((p.locations || []).join("\n"))}</textarea>
        <span class="jp-field__hint">One per line, as you'd type them on LinkedIn</span></label>
      <div class="jp-field"><span class="jp-field__label">Workplace</span>${chips(defWork(), "", "def-wp")}
        <label class="jp-field st-f st-mt"><span class="jp-field__label">Seniority</span><input class="jp-input" type="text" data-pset="seniority" value="${esc(p.seniority || "")}" placeholder="Let Claude decide from my resume"></label></div>
      <div class="st-nums st-nums--2"><label class="jp-field"><span class="jp-field__label">Target</span><input class="jp-input jp-num" type="number" min="0" max="100" data-set="tailorTarget" data-type="num" value="${s.tailorTarget}">
          <span class="jp-field__hint">Claude tailors until a resume scores this</span></label>
        <label class="jp-field"><span class="jp-field__label">Cutoff</span><input class="jp-input jp-num" type="number" min="0" max="100" data-set="minAtsScore" data-type="num" value="${s.minAtsScore}">
          <span class="jp-field__hint">Below this Claude doesn't apply</span></label></div>
    </div>
    <label class="jp-field"><span class="jp-field__label">Facts Claude may use in applications</span>
      <textarea class="jp-input" data-pset="facts" rows="5">${esc(p.facts || "")}</textarea>
      <span class="jp-field__hint">Contact details, work authorization and anything else employers ask. Standard answers (salary, notice, travel) are in Resumes.</span></label>
  </section>`;
}

export function profilesHtml() {
  const list = targets(), s = settings(), on = list.filter((t) => t.on !== false);
  const capped = on.filter((t) => own(t.dailyApplyLimit)), sum = capped.reduce((a, t) => a + Math.min(Number(t.dailyApplyLimit), s.dailyApplyLimit), 0);
  return `<div class="st-head"><div class="st-head__text"><h2 class="t-title2">Search profiles</h2>
      <p class="meta">${on.length ? `Claude runs every profile that's on, each run. ${capped.length < on.length ? `They share your limit of <span class="data">${s.dailyApplyLimit}</span> applications a day${capped.length ? `; ${capped.length === 1 ? "one has" : `${capped.length} have`} a lower one` : ""}.`
          : `Their daily limits add up to <span class="data">${sum}</span>; your overall limit is <span class="data">${s.dailyApplyLimit}</span> a day.`}`
        : "No profile is on, so runs don't search. Turn one on or add one."}</p></div>
    <div class="st-head__btns"><button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="prof-suggest">${icon("sparkle")}Ask Claude to suggest searches</button>
      <button class="jp-btn jp-btn--tinted jp-btn--sm" type="button" data-action="prof-new">${icon("plus")}New profile</button></div></div>
    ${list.length ? `<div class="st-grid">${list.map(card).join("")}</div>` : `<div class="jp-card"><p class="t-callout">No search profiles yet. Add one, or let Claude suggest them from your goals and resumes.</p></div>`}
    <p class="foot" id="st-num-hint">Empty numbers use the defaults below. Jobs that fit none of your profiles are grouped as Other on Jobs.</p>
    ${defaults()}`;
}

// Write one target (or the list) back to the profile
export async function saveTargets(list, msg) { await saveProfile({ targets: list }, msg); }
const setTarget = (i, patch) => { const list = targets(); Object.assign(list[i], patch); for (const k of Object.keys(patch)) if (!own(patch[k])) delete list[i][k]; return saveTargets(list); };

function toggleWork(cur, v) {
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  if (!next.length) { toast("Keep at least one kind of workplace."); return null; }
  return WORK.map(([k]) => k).filter((k) => next.includes(k));
}

export const PROFILE_ACTIONS = {
  "prof-on": (el) => { const i = Number(el.dataset.i), t = targets()[i]; return setTarget(i, { on: t.on === false ? null : false }); },
  "prof-wp": (el) => {
    const i = Number(el.dataset.i), t = targets()[i], next = toggleWork(own(t.workplace) ? t.workplace : defWork(), el.dataset.v);
    if (next) return setTarget(i, { workplace: next.join() === defWork().join() ? null : next });
  },
  "def-wp": (el) => { const next = toggleWork(defWork(), el.dataset.v); if (next) return saveProfile({ workplace: next }); },
  "prof-edit": (el) => editSheet(Number(el.dataset.i), el.dataset.focus),
  "prof-new": () => editSheet(-1),
  "prof-delete": (el) => deleteSheet(Number(el.dataset.i)),
  "prof-suggest": () => suggestSheet(),
  ...SHEET_ACTIONS,
};

// The overrides on a card (resume, numbers) save on change; empty = back to the default
export function bindProfiles() {
  document.addEventListener("change", async (e) => {
    const el = e.target.closest?.("[data-prof]");
    if (!el || S.view !== "settings") return;
    const k = el.dataset.prof, v = el.value.trim();
    if (k !== "resume" && v !== "" && !Number.isFinite(Number(v))) return toast("Type a number, or leave it empty to use the default.");
    try { await setTarget(Number(el.dataset.i), { [k]: v === "" ? null : k === "resume" ? v : Math.max(0, Math.min(Number(el.max) || 100, Number(v))) }); }
    catch (err) { toast(err.message, 7000); }
  });
}
