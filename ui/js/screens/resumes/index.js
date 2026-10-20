// Resumes screen (canvas boards Resumes, Resumes-*): a Mail-style split view. Originals, ready resumes and tailored ones
// on the left; the selected resume, or Standard answers, on the right. Phones show the list, then the resume.
import { S, app, loadData } from "../../state.js";
import * as api from "../../api.js";
import { $, toast } from "../../util.js";
import { go } from "../../router.js";
import { listHtml } from "./list.js";
import { detailHtml } from "./detail.js";
import { answersHtml, collectAnswers } from "./answers.js";
import { openUpload } from "./upload.js";
import { openReupload } from "./reupload.js";
import * as M from "./model.js";

const phone = () => matchMedia("(max-width: 900px)").matches;
let last = "";

export function renderResumes() {
  const R = S.res, ids = M.all();
  if (R.sel !== "answers" && !ids.some((x) => x.id === R.sel)) R.sel = M.order()[0]?.id || ids[0]?.id || null;
  const sel = R.sel === "answers" ? null : M.byId(R.sel);
  const html = `<div class="rs" data-show="${R.open ? "detail" : "list"}">${listHtml()}
    <section class="rs-detail" aria-label="${R.sel === "answers" ? "Standard answers" : "Resume"}">${R.sel === "answers" ? answersHtml() : detailHtml(sel)}</section></div>`;
  // The 30-second refresh re-renders only when something changed, so the PDF preview doesn't reload under the user
  if (html === last && $("#view .rs")) return;
  const a = document.activeElement, focus = a?.id ? `#${a.id}` : a?.dataset?.id ? `[data-action="${a.dataset.action}"][data-id="${a.dataset.id}"]` : null;
  const scroll = { list: $("#res-scroll")?.scrollTop, detail: $("#res-detail-scroll")?.scrollTop };
  $("#view").innerHTML = last = html;
  if (scroll.list != null) $("#res-scroll").scrollTop = scroll.list;
  if (scroll.detail != null && $("#res-detail-scroll")) $("#res-detail-scroll").scrollTop = scroll.detail;
  if (focus) try { document.querySelector(focus)?.focus({ preventScroll: true }); } catch {}
}

function select(id) {
  if (S.res.sel !== id) { S.res.sel = id; S.res.kind = "all"; resetDetailScroll(); }
  S.res.open = true; app.render();
  if (phone()) window.scrollTo(0, 0);
}
const resetDetailScroll = () => { const d = $("#res-detail-scroll"); if (d) d.scrollTop = 0; };
const selected = () => M.byId(S.res.sel);
async function saveMeta(patch) {
  const o = selected(); if (o?.kind !== "original") return;
  await api.setResumeMeta({ file: o.file, ...patch });
  await loadData(); app.render();
}

// data-action handlers, merged into actions.js
export const RES_ACTIONS = {
  "res-select": (el) => select(el.dataset.id),
  "res-filter": (el) => { S.res.filter = el.dataset.v; app.render(); },
  "res-kind": (el) => { S.res.kind = el.dataset.v; app.render(); },
  "res-back": () => { const id = S.res.sel; S.res.open = false; app.render(); document.querySelector(`[data-action="res-select"][data-id="${CSS.escape(id || "")}"]`)?.focus(); },
  "res-upload": () => openUpload(),
  "res-reupload": () => { const x = selected(); if (!x) return; x.kind === "original" ? openUpload(x) : openReupload(x); },
  "res-defaults": () => { const d = $("#res-defaults"); d?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); d?.focus({ preventScroll: true }); },
  "res-docx-read": async (el) => {
    toast("Claude is reading this resume once so it can be exported. This takes about a minute.", 60e3);
    el.disabled = true;
    try { await api.readExisting(el.dataset.file); await loadData(); app.render(); toast("Ready. Downloading the .docx."); location.href = api.docxUrl(`o:${el.dataset.file}`); }
    finally { el.disabled = false; }
  },
  "res-meta-lang": (el) => saveMeta({ language: el.dataset.v }),
  "res-meta-field": (el) => {
    const o = selected(), f = el.dataset.v, on = o.fields.includes(f);
    return saveMeta({ fields: on ? o.fields.filter((x) => x !== f) : [...o.fields, f], ...(on ? { defaultFor: o.defaultFor.filter((x) => x !== f) } : {}) });
  },
  "res-meta-default": async (el) => {
    const o = selected(), f = el.dataset.v, on = o.defaultFor.includes(f);
    await saveMeta({ defaultFor: on ? o.defaultFor.filter((x) => x !== f) : [...o.defaultFor, f] });
    toast(on ? `No default for ${f} now.` : `${o.name} is the default for ${f}. Its ready resume is rebuilt with it on the next run.`);
  },
  "res-open-job": (el) => {
    const r = S.DATA.find((x) => `${x.site}-${x.id}` === el.dataset.k);
    if (!r) return toast("That job isn't in your list any more.");
    S.showArchived = !!r.archived; S.selected = el.dataset.k; S.jobOpen = true; S.panel = "none";
    go("jobs");
  },
  "res-ans-edit": (el) => { if (!S.res.editing.includes(el.dataset.v)) S.res.editing.push(el.dataset.v); app.render(); document.querySelector(`[data-ans="${el.dataset.v}"]`)?.focus(); },
  "res-ans-save": async () => {
    const changed = collectAnswers();
    if (!Object.keys(changed).length) return toast("Nothing changed.");
    await api.saveAnswers(changed);
    S.res.drafts = {}; S.res.editing = [];
    await loadData(); app.render();
    toast("Saved. Claude uses these from the next application on.");
  },
};

// Search, answer drafts and arrow keys in the list. Bound once from actions.js.
export function bindResumes() {
  document.addEventListener("input", (e) => {
    if (e.target.id === "res-q") {
      S.res.query = e.target.value; const pos = e.target.selectionStart;
      app.render(); const q = $("#res-q"); q?.focus(); q?.setSelectionRange(pos, pos);
    }
    const a = e.target.dataset?.ans;
    if (a) { const d = S.res.drafts[a] ||= {}; d[e.target.dataset.lang] = e.target.value; }
  });
  document.addEventListener("keydown", (e) => {
    if (S.view !== "resumes") return;
    const row = e.target.closest?.(".rs-row");
    if (!row || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    const rows = M.order(), i = rows.findIndex((x) => x.id === row.dataset.id), next = rows[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) { select(next.id); S.res.open = false; app.render(); document.querySelector(`.rs-row[data-id="${CSS.escape(next.id)}"]`)?.focus(); }
  });
}
