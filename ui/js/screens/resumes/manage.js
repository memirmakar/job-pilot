// Rename and Delete sheets for the Resumes list's menu. Rename changes the name shown here and, for originals and unsent files,
// the file itself (employers see that one, so tailored and ready files only take neutral names). Delete says what happens first.
import { S, app, loadData } from "../../state.js";
import * as api from "../../api.js";
import { esc, toast } from "../../util.js";
import { openSheet, updateSheet, closeSheet, sheetEl } from "../../components/sheet.js";
import * as M from "./model.js";

const base = (p) => String(p || "").split("/").pop();
const canFile = (x) => x.kind !== "tailored" || x.sent?.v !== M.current(x).v;

export function openRename(x) {
  const file = base(x.kind === "original" ? x.path : M.current(x).path || x.path), prev = S.RES?.prefs?.preview || {};
  const suggest = prev[x.language] || prev.en || "";
  const fileRow = canFile(x) ? `<label class="jp-field"><span class="jp-field__label">File name</span>
      <input class="jp-input" id="rn-file" type="text" value="${esc(file)}" maxlength="90" spellcheck="false">
      <span class="jp-field__hint">${x.kind === "original" ? "Your own file. Jobs and search profiles that use it follow the new name."
        : `Employers see this name. Only your name and the language, e.g. ${esc(suggest)}; never the job, company, field or a version.`}</span></label>
      ${suggest && suggest !== file ? `<button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-rn="suggest" data-v="${esc(suggest)}" style="align-self:flex-start">Use ${esc(suggest)}</button>` : ""}`
    : `<p class="foot">This version was sent, so its file keeps the name it was sent under (${esc(x.sent?.fileName || file)}).</p>`;
  const el = openSheet({ center: true, title: `Rename ${x.name}`, subtitle: "The name you see in this list, and the file",
    body: `<label class="jp-field"><span class="jp-field__label">Name in this list</span><input class="jp-input" id="rn-name" type="text" value="${esc(x.name)}" maxlength="80"></label>
      ${fileRow}<div id="rn-err"></div>`,
    actions: `<button class="jp-btn" type="button" data-sheet-close>Cancel</button><button class="jp-btn jp-btn--primary" type="button" data-rn="save">Rename</button>` });
  el.querySelector(".sheet").classList.add("sheet--narrow");
  el.querySelector("#rn-name").select();
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rn]"); if (!b) return;
    if (b.dataset.rn === "suggest") { el.querySelector("#rn-file").value = b.dataset.v; return; }
    const name = el.querySelector("#rn-name").value.trim(), f = el.querySelector("#rn-file")?.value.trim();
    try {
      const r = await api.renameResume(x.id, { name, ...(f && f !== file ? { file: f } : {}) });
      closeSheet();
      if (r.id && r.id !== x.id) S.res.sel = r.id;
      await loadData(); app.render();
      toast(r.warning ? `Renamed. ${r.warning}` : "Renamed.", r.warning ? 8000 : 4000);
    } catch (err) { el.querySelector("#rn-err").innerHTML = `<div class="jp-callout jp-callout--danger" role="alert"><span class="jp-callout__icon" aria-hidden="true">!</span><span>${esc(err.message)}</span></div>`; }
  });
}

function deleteText(x) {
  if (x.kind === "original") return `<p class="t-callout">${esc(x.name)} moves to your resume history, where you can restore it. Claude stops reading it, and ready resumes based on it are rebuilt on the next library update.</p>`;
  if (x.kind === "ready") return `<p class="t-callout">The ${esc(x.field)} ready resume is removed.</p>
    <label class="rs-switchrow rs-switchrow--box"><span class="rs-ver__text"><span class="rs-job__title">Write it again on the next library update</span>
      <span class="foot">Off: no ready resume for ${esc(x.field)} until you turn this back on</span></span><input type="checkbox" id="del-rebuild" checked></label>`;
  const cur = M.current(x), prev = x.versions.at(-2);
  return `<p class="t-callout">v${cur.v} of the resume for ${esc(x.job.title)} at ${esc(x.job.company)} is removed. ${prev ? `The job uses v${prev.v} again.` : `The job uses your original (${esc(x.parentName)}) again.`}</p>`;
}

export function openDelete(x) {
  if (x.kind === "tailored" && x.sent?.v === M.current(x).v) return toast("Sent versions can't be deleted.");
  const el = openSheet({ center: true, title: `Delete ${x.name}?`, subtitle: "You can undo the last delete from the list",
    body: deleteText(x), actions: `<button class="jp-btn" type="button" data-sheet-close>Cancel</button><button class="jp-btn jp-btn--danger" type="button" data-del>Delete</button>` });
  el.querySelector(".sheet").classList.add("sheet--narrow");
  el.querySelector("[data-del]").addEventListener("click", async () => {
    try {
      const r = await api.deleteResume(x.id, sheetEl()?.querySelector("#del-rebuild")?.checked ?? true);
      closeSheet();
      if (S.res.sel === x.id && x.kind !== "tailored") S.res.sel = null;
      await loadData(); app.render();
      toast(r.message, 6000);
    } catch (err) { updateSheet({ body: `${deleteText(x)}<div class="jp-callout jp-callout--danger" role="alert"><span class="jp-callout__icon" aria-hidden="true">!</span><span>${esc(err.message)}</span></div>` }); }
  });
}
