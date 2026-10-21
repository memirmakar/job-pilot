// Waiting for your OK: the review sheet (board Settings-Review) with Claude's answers, each editable, then Approve and
// send / Skip. Also the hand marks after Applied (Interview with a date, Offer, Rejected, Back to applied).
import { S, app } from "../../state.js";
import * as api from "../../api.js";
import { esc, icon, pdfUrl, toast } from "../../util.js";
import { openSheet, closeSheet, sheetEl } from "../../components/sheet.js";
import { scoreRing } from "../../components/score-ring.js";
import { pill } from "../../components/status-pill.js";
import { companyLogo } from "../../components/company-logo.js";
import * as M from "./model.js";

const find = (k) => S.DATA.find((r) => M.keyOf(r) === k);
// The held form's questions Claude answered, last answer per question (a retried step replaces an earlier one)
export function heldAnswers(r) {
  const map = new Map();
  for (const f of (r.steps || []).flatMap((s) => s.fields || [])) if (f.label && (f.source === "claude" || f.source === "approved")) map.set(f.label, f);
  return [...map.values()];
}
// Claude left it blank or wrote a placeholder like "[BEKLENEN MAAŞINIZ]"
const needsYou = (v) => !String(v ?? "").trim() || /^\[.*\]$/.test(String(v).trim());

function field(f, i) {
  const id = `rv-${i}`, need = needsYou(f.value), v = need ? "" : f.value;
  const head = `<span class="rv-q"><span class="meta" style="color:var(--text)">${esc(f.label.replace(/\*$/, ""))}</span>${need ? pill("Needs your answer", "warning") : ""}</span>`;
  const control = (f.kind === "select" || f.kind === "radio" || f.kind === "checkbox") && f.options?.length
    ? `<select class="jp-input" id="${id}" data-rv="${i}">${need ? `<option value="">Choose…</option>` : ""}${f.options.map((o) => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`
    : `<textarea class="jp-input rv-text" id="${id}" data-rv="${i}" rows="${String(v).length > 70 ? 3 : 1}"${need ? ` placeholder="Claude doesn't know this. Type your answer."` : ""}>${esc(v)}</textarea>`;
  return `<label class="jp-field rv-field" for="${id}">${head}${control}
    ${f.reasoning && f.confidence !== "high" && !need ? `<span class="foot">${esc(f.reasoning)}</span>` : ""}</label>`;
}

// preview: read-only example (Settings > Applying "See an example" on a job that isn't waiting): no Approve or Skip
export function openReview(k, { preview = false } = {}) {
  const r = find(k); if (!r) return;
  const qa = heldAnswers(r), s = M.scores(r), [tText, tTone] = M.targetPill(s.score), t = r.tailored;
  const file = t?.used ? t.file : t?.baseFile || r.ats?.best_file || "";
  const path = t?.used ? t.path : t?.basePath;
  const why = s.score < M.target() ? `Claude asked because <span class="jp-num">${s.score}</span> is under your target of <span class="jp-num">${M.target()}</span>` : esc(r.statusReason || "Claude asks before it applies");
  openSheet({
    center: true, title: "Review before Claude applies", lead: companyLogo(r.company, r.logoUrl),
    subtitle: esc([r.title, r.company, r.location, "Easy Apply"].filter(Boolean).join(" · ")),
    body: `<div class="rv" data-k="${esc(k)}">
      <div class="rv-score">${scoreRing(s.score, { target: M.target(), cutoff: M.cutoff(), size: "sm" })}
        <span class="rv-score__why">${pill(tText, tTone)}<span class="foot">${why}</span></span>
        ${file ? `<span class="rv-file">${icon("doc", "ico ico--20")}<span class="rv-file__text"><span class="ellip rv-file__name">${esc(file)}</span>
          <span class="foot">${t?.used ? `Tailored ${esc(M.at(r.createdAt))} · from <span class="jp-num">${Math.round(t.baseScore)}</span>` : "Your original resume"}</span></span>
          ${path ? `<a class="jp-btn jp-btn--plain jp-btn--sm" href="${pdfUrl(path)}" target="_blank" rel="noopener">Open</a>` : ""}</span>` : ""}
      </div>
      <div class="rv-list"><p class="cap">Claude's answers · edit any of them</p>
        ${qa.length ? qa.map(field).join("") : `<p class="foot">The form only asked what LinkedIn fills from your profile.</p>`}</div>
    </div>`,
    actions: preview ? `<span class="foot rv-foot">An example from ${esc(r.company)}. This is what a job waiting for your OK looks like; nothing here is sent.</span>
      <button class="jp-btn" type="button" data-sheet-close>Close</button>` : `<span class="foot rv-foot">Claude sends exactly what's here, then marks the job Applied.</span>
      <button class="jp-btn" type="button" data-action="review-skip">Skip this job</button>
      <button class="jp-btn jp-btn--primary" type="button" data-action="review-approve">Approve and send</button>`,
  });
}

function readAnswers() {
  const el = sheetEl(), r = find(el?.querySelector(".rv")?.dataset.k);
  if (!r) return null;
  const qa = heldAnswers(r);
  return { r, answers: qa.map((f, i) => ({ label: f.label, value: el.querySelector(`[data-rv="${i}"]`)?.value ?? "" })) };
}

function markSheet(r) {
  openSheet({
    center: true, title: "When is the interview?", subtitle: esc(`${r.title} · ${r.company}`),
    body: `<label class="jp-field" for="iv-date"><span class="meta" style="color:var(--text)">Date and time</span>
      <input class="jp-input" id="iv-date" type="datetime-local" data-k="${esc(M.keyOf(r))}"></label>
      <p class="foot" style="margin-top:8px">Leave it empty if you don't know yet.</p>`,
    actions: `<button class="jp-btn jp-btn--plain" type="button" data-sheet-close>Cancel</button>
      <button class="jp-btn jp-btn--primary" type="button" data-action="mark-interview-save">Save interview</button>`,
  });
  setTimeout(() => sheetEl()?.querySelector("#iv-date")?.focus(), 0);
}

const setStatus = async (r, status, date = null) => { await api.setJobStatus(r.site, r.id, status, date); await app.load(); };

export const REVIEW_ACTIONS = {
  "review-open": () => openReview(S.selected),
  "review-approve": async () => {
    const got = readAnswers(); if (!got) return;
    const missing = got.answers.findIndex((a) => needsYou(a.value));
    if (missing >= 0) { toast("Answer every question marked Needs your answer first."); sheetEl().querySelector(`[data-rv="${missing}"]`)?.focus(); return; }
    await api.approveJob(got.r.site, got.r.id, got.answers);
    closeSheet(); toast("Approved. Claude sends it on the next run, or press Send now."); await app.load();
  },
  "review-skip": async () => { const got = readAnswers(); if (!got) return; await api.skipJob(got.r.site, got.r.id); closeSheet(); toast("Skipped. Nothing was sent."); await app.load(); },
  "job-skip": async () => {
    const r = find(S.selected); if (!r) return;
    await api.skipJob(r.site, r.id); toast(r.status === "approved" ? "Approval withdrawn. Nothing will be sent." : "Skipped. Nothing was sent."); await app.load();
  },
  "send-now": async () => {
    const r = find(S.selected); if (!r) return;
    if (!confirm(`Send your application to ${r.company} now? Claude opens LinkedIn and submits it with the answers you approved.`)) return;
    await api.sendNow(r.site, r.id); toast("Sending now. You'll see an Edge window working; leave it open."); await app.load();
  },
  "mark-status": async (el) => {
    const r = find(S.selected); if (!r) return;
    if (el.dataset.v === "interview") return markSheet(r);
    await setStatus(r, el.dataset.v); toast(el.dataset.v === "applied" ? "Moved back to Applied." : "Saved.");
  },
  "mark-interview-save": async () => {
    const input = sheetEl()?.querySelector("#iv-date"), r = find(input?.dataset.k); if (!r) return;
    await setStatus(r, "interview", input.value || null); closeSheet(); toast("Interview saved.");
  },
};
