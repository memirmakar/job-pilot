// Re-upload sheet (canvas board Resumes-Reupload): an edited tailored or ready resume comes back. Claude reads it into the
// structured resume, lists what changed, flags lines your originals and profile don't support, and re-scores it for the job.
// Use this version adds a new version; nothing is overwritten and a sent version never changes.
// The same sheet shows "Ask Claude to change this resume" (openInstruct): Claude's change goes through the same check.
import { S, app, loadData } from "../../state.js";
import * as api from "../../api.js";
import { esc, icon, toast, pdfUrl } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { scoreRing } from "../../components/score-ring.js";
import { openSheet, updateSheet, closeSheet } from "../../components/sheet.js";
import { bindDrop } from "../../components/drop.js";
import * as M from "./model.js";

let R = null; // { x, file, instruction, busy, error, p (Claude's check), choice: { line: "remove" | "keep" }, ruleSaved }

const lead = `<span class="rs-tile" aria-hidden="true">${icon("doc-check", "ico ico--20")}</span>`;

function pickStep() {
  return `<div class="rs-drop" id="ru-drop" role="button" tabindex="0" aria-label="Choose the edited file">
    <span class="rs-tile" aria-hidden="true">${icon("upload", "ico ico--20")}</span>
    <span class="rs-ver__text"><span class="rs-job__title">${R.file ? esc(R.file.name) : "Drop the edited file here"}</span>
      <span class="foot">${R.busy ? "Claude is checking it…" : "The .docx from Export to edit, or a PDF or TXT"}</span></span>
    <span class="jp-btn jp-btn--sm" aria-hidden="true">Choose file…</span><input type="file" id="ru-file" accept=".docx,.pdf,.txt" hidden></div>`;
}

function scoreBand(p, x) {
  if (p.score == null) return `<p class="foot">${x.kind === "original" ? "Originals aren't scored against one job; jobs score them when they use them." : "Ready resumes aren't for one job, so there's no score to compare. Jobs re-score it when they use it."}</p>`;
  const d = p.score - (p.from ?? p.score), opts = { target: S.META.tailorTarget, cutoff: S.META.minAtsScore };
  return `<div class="rs-band">
    <div class="rs-band__ring">${scoreRing(p.from ?? 0, { ...opts, size: "md", muted: true })}<span class="foot jp-num">v${p.v - 1}</span></div>
    ${icon("arrow", "ico ico--20 rs-band__arrow")}
    <div class="rs-band__ring">${scoreRing(p.score, { ...opts, size: "md" })}<span class="foot jp-num">v${p.v}</span></div>
    <div class="rs-band__gain"><span class="metric" style="color:${d >= 0 ? "var(--accent-text)" : "var(--serious-text)"}">${d >= 0 ? "+" : ""}${d}</span>
      <span class="foot">for ${esc(x.job.title)} at ${esc(x.job.company)}</span></div>
    <span class="foot rs-band__note">Scored against the posting. Lines Claude can't verify don't count.</span></div>`;
}

function resultStep() {
  const p = R.p, x = R.x;
  const un = p.unsupported.map((u) => `<div class="jp-callout jp-callout--warning" role="status"><span class="jp-callout__icon" aria-hidden="true">!</span>
    <span class="rs-warn"><span><b>Claude can't find this line in your originals, profile or GitHub:</b> “${esc(u.text)}” (${esc(u.where)}). Keep it only if it's true.</span>
      <span class="rs-warn__btns" role="group" aria-label="This line">
        <button class="jp-btn jp-btn--sm" type="button" aria-pressed="${R.choice[u.text] === "remove"}" data-ru="remove" data-v="${esc(u.text)}">${R.choice[u.text] === "remove" ? `${icon("check", "ico ico--14")}Removed` : "Remove this line"}</button>
        <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" aria-pressed="${R.choice[u.text] === "keep"}" data-ru="keep" data-v="${esc(u.text)}">${R.choice[u.text] === "keep" ? `${icon("check", "ico ico--14")}Kept and added to your facts` : "It's true, keep it"}</button></span></span></div>`).join("");
  const sent = x.sent ? `<span>v${x.sent.v} stays as it was sent to ${esc(x.sent.company || x.job.company)}. From now on <span class="jp-num">v${p.v}</span> is the one used.</span>`
    : x.kind === "original" ? `<span>The current file moves to your resume history; <span class="jp-num">v${p.v}</span> becomes the original Claude reads.</span>` : "";
  const rule = p.soundsLikeRule && p.ruleText ? `<div class="jp-callout rs-rulebox"><span class="jp-callout__icon" aria-hidden="true">i</span><span class="rs-warn">
    <span>This sounds like something for every resume: “${esc(p.ruleText)}”.</span>
    <span class="rs-warn__btns"><button class="jp-btn jp-btn--sm" type="button" data-ru="rule" ${R.ruleSaved ? "disabled" : ""}>${R.ruleSaved ? `${icon("check", "ico ico--14")}Saved as a rule` : "Also save as a rule"}</button></span></span></div>` : "";
  return `${p.done ? `<p class="t-callout">${esc(p.done)}</p>` : ""}${scoreBand(p, x)}
    <div><p class="cap" style="margin-bottom:4px">What changed</p>${p.changes.map((c) => `<div class="rs-rechange">
      <span>${pill(c.kind, M.KIND_TONE[c.kind])}</span><span class="rs-ver__text"><span class="t-callout${c.kind === "Removed" ? " rs-strike" : ""}">${esc(c.text)}</span>
      <span class="foot">${esc([c.where, c.note, c.rule && `your rule: ${c.rule}`].filter(Boolean).join(" · "))}</span></span></div>`).join("") || `<p class="meta">Claude found no differences from v${p.v - 1}.</p>`}</div>
    ${un}${rule}
    <p class="foot rs-clock">${icon("clock", "ico ico--14")}<span>${sent || `<span class="jp-num">v${p.v - 1}</span> stays in the history. <span class="jp-num">v${p.v}</span> becomes the version you send.`}
      <a href="${pdfUrl(p.preview)}" target="_blank" rel="noopener">See v${p.v} as a PDF</a></span></p>`;
}

const open = () => R.p ? R.p.unsupported.filter((u) => !R.choice[u.text]).length : 1;
const body = () => R.busy && R.instruction ? `<p class="meta rs-wait"><span class="rs-spin" aria-hidden="true"></span>Claude is changing your resume, checking every line against your originals${R.x.kind === "tailored" ? " and re-scoring it" : ""}. This takes a minute or two.</p>`
  : R.error && R.instruction ? `<div class="jp-callout jp-callout--danger" role="alert"><span class="jp-callout__icon" aria-hidden="true">!</span><span>${esc(R.error)}</span></div>`
  : R.busy ? `${pickStep()}<p class="meta rs-wait"><span class="rs-spin" aria-hidden="true"></span>Claude is reading your file, checking every line against your originals${R.x.kind === "tailored" ? " and re-scoring it" : ""}. This takes a minute or two.</p>`
  : R.error ? `${pickStep()}<div class="jp-callout jp-callout--danger" role="alert"><span class="jp-callout__icon" aria-hidden="true">!</span><span>${esc(R.error)}</span></div>`
  : R.p ? resultStep() : pickStep();
const actions = () => `<button class="jp-btn" type="button" data-sheet-close>Cancel</button>
  <button class="jp-btn jp-btn--primary" type="button" data-ru="use" ${R.p && !open() ? "" : "disabled"}>Use this version</button>`;
const subtitle = () => R.instruction ? `“${esc(R.instruction)}”${R.p ? ` · becomes <span class="jp-num">v${R.p.v}</span>` : ""}` : R.p ? `${esc(R.file.name)} · ${R.guidance ? "suggested in Guidance" : "edited outside Job Pilot"} · becomes <span class="jp-num">v${R.p.v}</span>` : `${esc(R.x.file)} · now <span class="jp-num">v${M.current(R.x).v}</span>`;

const title = () => R.instruction ? (R.p ? "Claude changed your resume" : "Asking Claude to change your resume") : R.p ? "Claude checked your new version" : "Upload a new version";
function paint() {
  if (!updateSheet({ title: title(), subtitle: subtitle(), body: body(), actions: actions() })) return;
  bindDrop(document.getElementById("ru-drop"), document.getElementById("ru-file"), take);
}

async function take([f]) {
  if (!f || R.busy) return;
  Object.assign(R, { file: f, busy: true, error: "", p: null, choice: {} }); paint();
  const mine = R;
  try { mine.p = await api.checkReupload({ id: R.x.id, name: f.name, data: f.data }); } catch (e) { mine.error = e.message; }
  mine.busy = false;
  if (R === mine) paint(); else if (mine.p) api.discardUpload(mine.p.token).catch(() => {}); // closed while Claude was checking
}

async function use() {
  const remove = Object.keys(R.choice).filter((k) => R.choice[k] === "remove"), confirm = Object.keys(R.choice).filter((k) => R.choice[k] === "keep");
  const v = await api.useReupload({ token: R.p.token, remove, confirm });
  const wasOriginal = R.x.kind === "original";
  R.p = null; closeSheet();
  if (wasOriginal && v.file) S.res.sel = `o:${v.file}`;
  await loadData(); app.render();
  toast(`Saved as v${v.v}. It's the version used from now on.`);
}

function onClick(e) {
  const b = e.target.closest("[data-ru]"); if (!b || !R) return;
  const k = b.dataset.ru;
  if (k === "use") return use().catch((err) => toast(err.message, 7000));
  if (k === "rule") return api.addResumeRule(R.p.ruleText).then(() => { if (R) { R.ruleSaved = true; paint(); } toast("Saved to your resume rules."); }).catch((err) => toast(err.message, 7000));
  R.choice[b.dataset.v] = R.choice[b.dataset.v] === k ? undefined : k;
  if (!R.choice[b.dataset.v]) delete R.choice[b.dataset.v];
  paint();
}

// Guidance's "Suggest a resume edit": Claude's check already ran on the edited resume; open straight at the result
export function openChecked(x, p) { openReupload(x, { file: { name: "Claude's suggested edit" }, p, guidance: true }); }

export function openReupload(x, pre = {}) {
  R = { x, file: null, busy: false, error: "", p: null, choice: {}, ...pre };
  const el = openSheet({ center: true, lead, title: title(), subtitle: subtitle(), body: body(), actions: actions(),
    onClose: () => { if (R?.p?.token) api.discardUpload(R.p.token).catch(() => {}); R = null; } });
  el.querySelector(".sheet").classList.add("sheet--narrow");
  el.addEventListener("click", onClick);
  bindDrop(document.getElementById("ru-drop"), document.getElementById("ru-file"), take);
}

// "Ask Claude to change this resume" (detail box): Claude applies the instruction, then the same check, score and Use this version
export async function openInstruct(x, instruction) {
  openReupload(x, { instruction, busy: true });
  const mine = R;
  try { mine.p = await api.instructResume(x.id, instruction); } catch (e) { mine.error = e.message; }
  mine.busy = false;
  if (R === mine) paint(); else if (mine.p) api.discardUpload(mine.p.token).catch(() => {});
}
