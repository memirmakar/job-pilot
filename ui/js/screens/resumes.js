// Resumes: ready resumes per field (library) and the user's uploaded resumes.
import { S, app } from "../state.js";
import * as api from "../api.js";
import { $, esc, ago, toast, pdfUrl } from "../util.js";
import { chips } from "../legacy.js";

export function renderResumes() {
  const busy = S.STATE.tasks?.library?.running;
  $("#view").innerHTML = `
    <div class="section-title" style="margin-top:0">Ready resumes <small>one per target field, rewritten by Claude from your resumes, GitHub and what employers ask for · refreshed every ${S.STATE.settings.libraryEveryDays} days</small></div>
    <div class="btns" style="margin-bottom:14px">
      <button class="btn ${S.LIB.due ? "primary" : ""}" data-action="task" data-task="library" ${busy ? "disabled" : ""}>${busy ? `<span class="spinner"></span> Updating…` : "Update now"}</button>
      <span class="sub">${S.LIB.due ? `Update due: ${esc(S.LIB.due)}` : S.LIB.entries.length ? "Up to date" : ""}</span></div>
    <div class="grid g3">${S.LIB.entries.map((e) => `
      <div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b style="font-size:15px">${esc(e.field)}</b><span class="sub">${ago(e.generatedAt)}</span></div>
        <div class="sub" style="margin:4px 0 10px">${esc(e.resume?.headline || "")}</div>
        <div class="btns"><a class="btn sm primary" href="${pdfUrl(e.path)}&dl=1">Download</a><a class="btn sm" href="${pdfUrl(e.path)}" target="_blank" rel="noopener">View</a></div>
        ${e.basedOnJobs ? `<div class="sub" style="margin-top:8px">Shaped by ${e.basedOnJobs} analyzed jobs in this field</div>` : ""}
        ${e.resume?.not_added?.length ? `<details style="margin-top:8px"><summary class="sub" style="cursor:pointer">Not claimed (not in your resumes)</summary>${chips(e.resume.not_added.map((s) => s.split(":")[0]), "n", 20)}</details>` : ""}
      </div>`).join("") || `<div class="card empty">${busy ? "Building your first ready resumes… this takes a few minutes per field." : "No ready resumes yet. Press <b>Update now</b>."}</div>`}</div>

    <div class="section-title">Your resumes <small>the source of every fact Claude uses · PDF, TXT or MD</small></div>
    <div class="card">
      <div class="drop" id="drop">Drop resume files here, or <b>click to choose</b><input type="file" id="file" accept=".pdf,.txt,.md" multiple hidden></div>
      <div class="stack" style="margin-top:14px">${S.STATE.resumes.map((r) => `
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(r.file)}</b>
          <span class="sub">${Math.round(r.size / 1024)} KB</span>
          ${r.file.toLowerCase().endsWith(".pdf") ? `<a class="btn sm" href="${pdfUrl(r.path)}" target="_blank" rel="noopener">View</a>` : ""}
          <button class="btn sm danger" data-action="remove-resume" data-file="${esc(r.file)}">Remove</button></div>`).join("") || `<div class="muted">No resumes yet.</div>`}</div>
    </div>`;
  bindDrop();
}
export function bindDrop() {
  const drop = $("#drop"), input = $("#file");
  if (!drop) return;
  drop.onclick = () => input.click();
  input.onchange = () => uploadFiles(input.files);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); uploadFiles(e.dataTransfer.files); };
}
export async function uploadFiles(list) {
  const files = await Promise.all([...list].map((f) => new Promise((res) => { const r = new FileReader(); r.onload = () => res({ name: f.name, data: String(r.result).split(",")[1] }); r.readAsDataURL(f); })));
  S.STATE.resumes = await api.uploadResumes(files);
  toast(`Added ${files.length} file${files.length > 1 ? "s" : ""}`);
  app.render();
}
