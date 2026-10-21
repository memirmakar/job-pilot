// Search profile sheets: edit or create one (name, searches, locations, extra title words), delete with confirm, and
// "Ask Claude to suggest searches" (the onboarding plan step, POST /api/onboarding/plan) with the suggestions to add.
import { S } from "../../state.js";
import * as api from "../../api.js";
import { esc, icon, rows, toast } from "../../util.js";
import { openSheet, updateSheet, closeSheet, sheetEl } from "../../components/sheet.js";
import { callout } from "../../components/card.js";
import { profile } from "./index.js";
import { targets, saveTargets } from "./profiles.js";

let SG = null; // suggestions: { busy, error, plan, pick: Set of fields, ctrl }

const area = (id, label, value, hint, rows = 4) => `<label class="jp-field" for="${id}"><span class="jp-field__label">${label}</span>
  <textarea class="jp-input" id="${id}" rows="${rows}">${esc(value)}</textarea>${hint ? `<span class="jp-field__hint">${hint}</span>` : ""}</label>`;

export function editSheet(i, focus = "pe-name") {
  const t = i >= 0 ? targets()[i] : { field: "", searchTerms: [] }, p = profile();
  openSheet({
    title: i >= 0 ? `Edit ${t.field}` : "New search profile", subtitle: "Claude searches LinkedIn for each title, in each location",
    body: `<div class="st-sheet" data-i="${i}">
      <label class="jp-field" for="pe-name"><span class="jp-field__label">Profile name</span><input class="jp-input" id="pe-name" type="text" maxlength="80" value="${esc(t.field)}" placeholder="e.g. Industrial automation"></label>
      ${area("pe-terms", "Job titles to search", (t.searchTerms || []).join("\n"), "One per line. Add the local-language titles too, e.g. Otomasyon Mühendisi.", 5)}
      ${area("pe-locs", "Locations", (t.locations || []).join("\n"), `One per line. Leave it empty to use your default: ${esc((p.locations || []).join(", ") || "anywhere")}.`, 3)}
      ${area("pe-skip", "Also skip titles with", (t.titleExclude || []).join("\n"), "Words that rule a job out for this profile only, e.g. Senior. Your never-apply list always applies.", 3)}
    </div>`,
    actions: `<button class="jp-btn" type="button" data-sheet-close>Cancel</button>
      <button class="jp-btn jp-btn--primary" type="button" data-action="prof-save">${i >= 0 ? "Save" : "Add profile"}</button>`,
  });
  setTimeout(() => sheetEl()?.querySelector(`#${focus}`)?.focus(), 0);
}

async function saveEdit() {
  const el = sheetEl(), i = Number(el.querySelector(".st-sheet").dataset.i), q = (id) => el.querySelector(id).value;
  const field = q("#pe-name").trim(), searchTerms = rows(q("#pe-terms"));
  if (!field) return toast("Give the profile a name.");
  if (!searchTerms.length) return toast("Add at least one job title to search.");
  const list = targets();
  if (list.some((t, j) => j !== i && t.field.trim().toLowerCase() === field.toLowerCase())) return toast(`There's already a profile called ${field}.`);
  const t = i >= 0 ? list[i] : {};
  Object.assign(t, { field, searchTerms });
  for (const [k, v] of [["locations", rows(q("#pe-locs"))], ["titleExclude", rows(q("#pe-skip"))]]) { if (v.length) t[k] = v; else delete t[k]; }
  if (i < 0) list.push(t);
  closeSheet();
  await saveTargets(list, i >= 0 ? "Saved. It applies from the next run." : `Added ${field}. It runs from the next run.`);
}

export function deleteSheet(i) {
  const t = targets()[i];
  openSheet({
    center: true, title: `Delete the ${t.field} profile?`, subtitle: "This can't be undone",
    body: `<p class="t-callout">Its ${t.searchTerms?.length === 1 ? "search stops" : "searches stop"} from the next run. Jobs it already found stay on Jobs, and its ready resume stays in Resumes.</p>
      <p class="foot">To pause it instead, turn it off with its switch.</p>`,
    actions: `<button class="jp-btn" type="button" data-sheet-close>Cancel</button>
      <button class="jp-btn jp-btn--danger" type="button" data-action="prof-delete-yes" data-i="${i}">Delete profile</button>`,
  });
}

// ----- Ask Claude to suggest searches -----
function sgBody() {
  const goals = S.STATE.profile?.goalsText || S.STATE.profile?.preferences || "";
  if (SG.busy) return `<p class="meta st-wait"><span class="st-spin" aria-hidden="true"></span>Claude is reading your goals and resumes. This takes about a minute.</p>`;
  const have = new Set(targets().map((t) => t.field.toLowerCase()));
  const res = SG.plan ? `<div class="st-sugs"><p class="cap">Claude suggests</p>${SG.plan.notes ? callout(esc(SG.plan.notes)) : ""}
    ${SG.plan.targets.map((t) => { const dup = have.has(t.field.toLowerCase());
      return `<button class="st-sug" type="button" role="checkbox" aria-checked="${SG.pick.has(t.field)}" data-action="prof-sug-pick" data-v="${esc(t.field)}"${dup ? " disabled" : ""}>
        <span class="st-sug__box" aria-hidden="true">${icon("check", "ico ico--14")}</span>
        <span class="st-sug__text"><span class="st-sug__title">${esc(t.field)}${dup ? ` <span class="foot">· you have this one</span>` : ""}</span>
          <span class="foot">${esc(t.searchTerms.join(" · "))}</span>${t.why ? `<span class="foot">${esc(t.why)}</span>` : ""}</span></button>`; }).join("")}</div>` : "";
  return `<div class="st-sheet">${area("sg-goals", "Your goals", goals, "Claude turns them into profiles: a field and the job titles to search, from your resumes.", 4)}
    ${SG.error ? callout(`Claude couldn't suggest searches: ${esc(SG.error)}. Check Claude usage in Settings, then try again.`, "danger") : ""}${res}</div>`;
}
const sgActions = () => SG.busy ? `<button class="jp-btn" type="button" data-action="prof-sug-cancel">Cancel</button>`
  : `<button class="jp-btn${SG.plan ? "" : " jp-btn--primary"}" type="button" data-action="prof-sug-run">${SG.plan ? "Suggest again" : "Suggest searches"}</button>
    ${SG.plan ? `<button class="jp-btn jp-btn--primary" type="button" data-action="prof-sug-add"${SG.pick.size ? "" : " disabled"}>Add ${SG.pick.size === 1 ? "1 profile" : `${SG.pick.size} profiles`}</button>` : ""}`;
const sgPaint = () => updateSheet({ body: sgBody(), actions: sgActions() });

export function suggestSheet() {
  SG = { busy: false, error: "", plan: null, pick: new Set(), ctrl: null };
  openSheet({ title: "Ask Claude to suggest searches", subtitle: "Nothing changes until you add the ones you want", body: sgBody(), actions: sgActions(),
    onClose: () => { SG?.ctrl?.abort(); SG = null; } });
}
async function suggest() {
  const goals = sheetEl()?.querySelector("#sg-goals")?.value.trim();
  if (!goals) return toast("Write your goals first.");
  const p = profile();
  Object.assign(SG, { busy: true, error: "", plan: null, pick: new Set(), ctrl: new AbortController() }); sgPaint();
  const mine = SG;
  try {
    const plan = await api.planSearch({ goals, locations: p.locations || [], workplace: p.workplace || [], seniority: p.seniority || "" });
    if (SG !== mine) return;
    const have = new Set(targets().map((t) => t.field.toLowerCase()));
    Object.assign(SG, { plan, pick: new Set(plan.targets.filter((t) => !have.has(t.field.toLowerCase())).map((t) => t.field)) });
  } catch (e) { if (SG === mine) SG.error = e.message; }
  if (SG === mine) { SG.busy = false; sgPaint(); }
}

export const SHEET_ACTIONS = {
  "prof-save": () => saveEdit(),
  "prof-delete-yes": async (el) => {
    const list = targets(), [t] = list.splice(Number(el.dataset.i), 1);
    closeSheet(); await saveTargets(list, `Deleted the ${t.field} profile.`);
  },
  "prof-sug-run": () => suggest(),
  "prof-sug-cancel": () => { SG?.ctrl?.abort(); SG = { ...SG, busy: false, ctrl: null }; sgPaint(); },
  "prof-sug-pick": (el) => { const f = el.dataset.v; if (SG.pick.has(f)) SG.pick.delete(f); else SG.pick.add(f); sgPaint(); },
  "prof-sug-add": async () => {
    const add = SG.plan.targets.filter((t) => SG.pick.has(t.field)).map(({ field, searchTerms, why }) => ({ field, searchTerms, why }));
    closeSheet(); await saveTargets([...targets(), ...add], `Added ${add.length === 1 ? add[0].field : `${add.length} profiles`}. They run from the next run.`);
  },
};
