// Resumes actions for the rules view, the photo, GitHub projects, the row menu and Undo (merged into RES_ACTIONS), plus the
// form, change and keyboard handlers they need (bound once from index.js).
import { S, app, loadData, loadState } from "../../state.js";
import * as api from "../../api.js";
import { $, toast } from "../../util.js";
import { openSheet, closeSheet } from "../../components/sheet.js";
import { readFiles } from "../../components/drop.js";
import { openMenu } from "./menu.js";
import { openCrop, openFromOriginal } from "./photo.js";
import { openInstruct } from "./reupload.js";
import * as M from "./model.js";

const reload = async (msg) => { await loadData(); app.render(); if (msg) toast(msg); };
const prefs = () => S.RES?.prefs || { rules: [], settings: {} };
const saveRules = (rules) => api.saveResumeRules({ rules }).then(() => reload());

export const PREF_ACTIONS = {
  "res-menu": (el) => { const x = M.byId(el.dataset.id); if (x) openMenu(x, el, null, (y) => RES_SELECT(y.id)); },
  "res-undo": async () => { const r = await api.undoDelete(); await reload(r.message); },
  "res-rule-remove": (el) => saveRules(prefs().rules.filter((r) => r.id !== el.dataset.id)),
  "res-photo-tr": () => api.saveResumeRules({ settings: { photoTr: prefs().settings.photoTr === false } }).then(() => reload()),
  "res-photo-en": (el) => api.saveResumeRules({ settings: { photoEn: el.dataset.v === "ask" ? null : el.dataset.v === "1" } })
    .then(() => reload(el.dataset.v === "ask" ? "" : `English resumes ${el.dataset.v === "1" ? "include" : "leave out"} your photo from now on.`)),
  "res-photo-from": () => openFromOriginal(),
  "res-photo-remove": async () => { if (!confirm("Remove your photo? Resumes made from now on won't have one.")) return; await api.removePhoto(); await reload("Photo removed."); },
  "res-rename-all": async () => {
    const n = prefs().renameCount;
    if (!confirm(`Rename ${n} unsent ${n === 1 ? "file" : "files"} to ${prefs().preview.en} / ${prefs().preview.tr}? Sent files keep their names.`)) return;
    const r = await api.renameAllResumes(); await reload(`Renamed ${r.renamed} ${r.renamed === 1 ? "file" : "files"}.`);
  },
  "res-retailor": (el) => {
    const r = prefs().retailor;
    const sheet = openSheet({ center: true, title: `Re-tailor ${r.count} unsent ${r.count === 1 ? "resume" : "resumes"}?`, subtitle: "With your rules, approved GitHub projects, neutral names and the photo",
      body: `<p class="t-callout">Claude tailors each again for its job: about ${r.calls} Claude calls from your plan${r.estimateUsd != null ? ` (about $${r.estimateUsd.toFixed(2)} at API prices, an estimate, not a bill)` : ""}. It runs in the background and nothing is sent.</p>
        <p class="foot">Each result is a new version. Earlier versions, and anything already sent, stay exactly as they are.</p>`,
      actions: `<button class="jp-btn" type="button" data-sheet-close>Cancel</button><button class="jp-btn jp-btn--primary" type="button" data-go>Re-tailor ${r.count}</button>` });
    sheet.querySelector(".sheet").classList.add("sheet--narrow");
    sheet.querySelector("[data-go]").addEventListener("click", async () => {
      try { await api.startTask("retailor"); closeSheet(); await loadState(); app.render(); toast("Re-tailoring started. New versions appear as each one finishes."); }
      catch (e) { toast(e.message, 7000); }
    });
  },
  "res-proj-state": async (el) => { await api.setProject(el.dataset.repo, { state: el.dataset.v }); await reload(); },
  "res-proj-suggest": async () => {
    S.res.suggesting = true; app.render();
    try { await api.suggestProjects(); toast("Claude's suggestions are in. Nothing changes until you pick."); }
    finally { S.res.suggesting = false; await reload(); }
  },
};
let RES_SELECT = () => {};

export function bindPrefs(select) {
  RES_SELECT = select;
  document.addEventListener("submit", async (e) => {
    if (e.target.matches("[data-res-rule]")) {
      e.preventDefault();
      const t = $("#rule-new").value.trim(); if (!t) return;
      try { await api.addResumeRule(t); await reload("Rule saved. Claude follows it from the next resume on."); $("#rule-new")?.focus(); } catch (err) { toast(err.message, 7000); }
    }
    if (e.target.matches("[data-res-instruct]")) {
      e.preventDefault();
      const x = M.byId(S.res.sel), t = $("#res-instr").value.trim();
      if (!x || !t) return toast("Write what Claude should change first.");
      openInstruct(x, t);
    }
  });
  document.addEventListener("change", async (e) => {
    const t = e.target;
    try {
      if (t.dataset?.rule) await saveRules(prefs().rules.map((r) => r.id === t.dataset.rule ? { ...r, text: t.value } : r).filter((r) => r.text.trim()));
      if (t.id === "name-pattern") { await api.saveResumeRules({ settings: { namePattern: t.value } }); await reload("File name pattern saved."); }
      if (t.dataset?.proj) await api.setProject(t.dataset.proj, { [t.dataset.k]: t.value }).then(() => reload());
      if (t.id === "photo-file" && t.files?.[0]) { const [f] = await readFiles(t.files); t.value = ""; openCrop(`data:image/*;base64,${f.data}`); }
    } catch (err) { toast(err.message, 7000); await reload(); }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "res-instr") S.res.instrDraft = e.target.value; });
  // Right-click on a row, or Shift+F10 / the menu key on a focused row
  document.addEventListener("contextmenu", (e) => {
    const w = S.view === "resumes" && e.target.closest?.(".rs-rowwrap"); if (!w) return;
    e.preventDefault();
    const x = M.byId(w.querySelector(".rs-row").dataset.id); if (x) openMenu(x, w.querySelector(".rs-row"), { x: e.clientX, y: e.clientY }, (y) => select(y.id));
  });
  document.addEventListener("keydown", (e) => {
    const row = S.view === "resumes" && e.target.closest?.(".rs-row");
    if (!row || !((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu")) return;
    e.preventDefault();
    const x = M.byId(row.dataset.id); if (x) openMenu(x, row, null, (y) => select(y.id));
  });
}
