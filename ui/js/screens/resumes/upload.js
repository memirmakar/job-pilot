// Upload sheet (canvas board Resumes-Upload): a new original, or a new version of one.
// The file is staged, Claude reads it (roles, skills, languages), the user names it and picks its fields, then Add original.
import { S, app, loadData } from "../../state.js";
import * as api from "../../api.js";
import { esc, icon, toast } from "../../util.js";
import { tag } from "../../components/tag.js";
import { openSheet, updateSheet, closeSheet } from "../../components/sheet.js";
import { bindDrop } from "../../components/drop.js";
import * as M from "./model.js";

let U = null; // { replaces, file, token, read, name, language, fields[], def, busy, error }

const kb = (n) => `${Math.max(1, Math.round(n / 1024))} KB`;
function fileStep() {
  const f = U.file;
  return `<section class="rs-step" aria-labelledby="up-s1"><h3 id="up-s1" class="cap"><span class="jp-num">1</span> · File</h3>
    <div class="rs-drop" id="up-drop" role="button" tabindex="0" aria-label="Choose a resume file">
      <span class="rs-tile" aria-hidden="true">${icon("doc", "ico ico--20")}</span>
      <span class="rs-ver__text">${f ? `<span class="rs-job__title">${esc(f.name)}</span><span class="foot">${kb(f.size)} · ${U.busy ? "Claude is reading it…" : U.read ? "read by Claude just now" : U.error ? "Claude couldn't read it" : ""}</span>`
        : `<span class="rs-job__title">Drop a PDF here</span><span class="foot">PDF works best. TXT and MD work too.</span>`}</span>
      <span class="jp-btn jp-btn--sm" aria-hidden="true">Choose file…</span>
      <input type="file" id="up-file" accept=".pdf,.txt,.md" hidden></div></section>`;
}
function foundStep() {
  if (U.busy) return `<p class="meta rs-wait"><span class="rs-spin" aria-hidden="true"></span>Claude is reading your resume. This takes about a minute.</p>`;
  if (U.error) return `<div class="jp-callout jp-callout--danger" role="alert"><span class="jp-callout__icon" aria-hidden="true">!</span><span>${esc(U.error)}</span></div>`;
  const r = U.read; if (!r) return "";
  const isNew = new Set(r.new_skills.map((s) => s.toLowerCase()));
  return `<section class="rs-step" aria-labelledby="up-s2"><h3 id="up-s2" class="cap"><span class="jp-num">2</span> · What Claude found</h3>
    <div class="rs-found">
      <div class="rs-found__box"><span class="meta" style="color:var(--text)">Roles</span>${r.roles.slice(0, 4).map((x) => `<span class="foot" lang="${esc(U.language)}">${esc([x.title, x.org, x.dates].filter(Boolean).join(" · "))}</span>`).join("") || `<span class="foot">None listed</span>`}</div>
      <div class="rs-found__box"><span class="meta" style="color:var(--text)">Skills</span><span class="rs-chips">${r.skills.slice(0, 12).map((s) => isNew.has(s.toLowerCase()) ? tag(`${s} · new`, "met") : tag(s)).join("")}</span></div>
      <div class="rs-found__box"><span class="meta" style="color:var(--text)">Languages</span>${r.languages.map((l) => `<span class="foot">${esc(l)}</span>`).join("")}</div>
    </div>
    <p class="foot">${r.new_skills.length ? `New compared with your other originals: ${esc(r.new_skills.join(", "))}. Claude uses them from now on.` : "Everything matches your other originals."}</p></section>`;
}
function useStep() {
  if (!U.read) return "";
  const fields = M.res().fields;
  return `<section class="rs-step" aria-labelledby="up-s3"><h3 id="up-s3" class="cap"><span class="jp-num">3</span> · How Claude should use it</h3>
    <div class="rs-namerow"><label class="jp-field"><span class="jp-field__label">Name</span><input class="jp-input" id="up-name" type="text" value="${esc(U.name)}" maxlength="80"></label>
      <div class="jp-field"><span class="jp-field__label" id="up-lang">Language</span><div class="jp-seg" role="radiogroup" aria-labelledby="up-lang">${[["tr", "Turkish"], ["en", "English"]].map(([v, l]) =>
        `<button class="jp-seg__item" type="button" role="radio" aria-checked="${U.language === v}" aria-selected="${U.language === v}" data-up="lang" data-v="${v}">${l}</button>`).join("")}</div></div></div>
    <div class="jp-field"><span class="jp-field__label" id="up-fields">Fields it's for</span><div class="rs-chips" role="group" aria-labelledby="up-fields">${fields.map((f) =>
      `<button class="chip" type="button" aria-pressed="${U.fields.includes(f)}" data-up="field" data-v="${esc(f)}">${esc(f)}</button>`).join("")}</div></div>
    ${U.fields.length ? `<div class="rs-switchrow rs-switchrow--box"><span class="rs-ver__text"><span class="rs-job__title">Make it the default for ${esc(U.fields.join(", "))}</span>
      <span class="foot">Claude starts those ready resumes from it, and they're rebuilt with it</span></span>
      <button class="switch" type="button" role="switch" aria-checked="${U.def}" aria-label="Make it the default for its fields" data-up="def"></button></div>` : ""}
  </section>`;
}
const body = () => fileStep() + foundStep() + useStep();
const actions = () => `<button class="jp-btn" type="button" data-sheet-close>Cancel</button>
  <button class="jp-btn jp-btn--primary" type="button" data-up="add" ${U.read && !U.busy ? "" : "disabled"}>${U.replaces ? "Add as new version" : "Add original"}</button>`;

function paint() {
  const name = document.getElementById("up-name")?.value; if (name !== undefined) U.name = name;
  if (!updateSheet({ body: body(), actions: actions() })) return;
  bindDrop(document.getElementById("up-drop"), document.getElementById("up-file"), take);
}

async function take([f]) {
  if (!f || U.busy) return;
  if (U.token) api.discardUpload(U.token).catch(() => {});
  Object.assign(U, { file: f, token: null, read: null, error: "", busy: true }); paint();
  try {
    const [st] = await api.stageResumes([f]);
    U.token = st.token;
    const r = await api.readOriginal(st.token);
    if (!U || U.token !== st.token) return;
    Object.assign(U, { read: r.read, language: r.language || U.language, name: U.name || r.read.suggested_name || f.name.replace(/\.\w+$/, "") });
  } catch (e) { if (U) U.error = e.message; }
  if (U) { U.busy = false; paint(); }
}

async function add() {
  const r = await api.addOriginal({ token: U.token, name: U.name.trim() || U.file.name, language: U.language, fields: U.fields,
    defaultFor: U.def ? U.fields : [], replaces: U.replaces });
  U.token = null; closeSheet();
  await loadData(); S.res.sel = `o:${r.file}`; S.res.filter = "all"; app.render();
  toast("Added. Ready resumes for its fields are rebuilt on the next run.");
}

function onClick(e) {
  const b = e.target.closest("[data-up]"); if (!b || !U) return;
  const k = b.dataset.up, v = b.dataset.v;
  if (k === "lang") U.language = v;
  if (k === "field") U.fields = U.fields.includes(v) ? U.fields.filter((x) => x !== v) : [...U.fields, v];
  if (k === "def") U.def = !U.def;
  if (k === "add") return add().catch((err) => toast(err.message, 7000));
  paint();
}

// orig: the original this becomes a new version of (Upload new version), else a new original
export function openUpload(orig = null) {
  U = { replaces: orig?.file || null, file: null, token: null, read: null, busy: false, error: "",
    name: orig?.name || "", language: orig?.language || "en", fields: orig ? [...orig.fields] : [], def: orig ? !!orig.defaultFor.length : true };
  const el = openSheet({ center: true, title: orig ? `New version of ${orig.name}` : "Add an original",
    subtitle: orig ? "The current file moves to the version history; nothing is overwritten" : "Claude starts from your originals when it tailors a resume for a new job",
    body: body(), actions: actions(),
    onClose: () => { if (U?.token) api.discardUpload(U.token).catch(() => {}); U = null; } });
  el.addEventListener("click", onClick);
  bindDrop(document.getElementById("up-drop"), document.getElementById("up-file"), take);
}
