// Job detail (canvas board JobDetail): header, ATS score band, tailored resume with the next action. The cards below are in detail-cards.js.
import { S } from "../../state.js";
import { esc, md, icon, pdfUrl, fmtDate } from "../../util.js";
import { scoreRing } from "../../components/score-ring.js";
import { statusPill, pill } from "../../components/status-pill.js";
import { tag, tags } from "../../components/tag.js";
import { callout } from "../../components/card.js";
import { companyLogo } from "../../components/company-logo.js";
import { whyCard, skillsCard, raiseCard, answersCard } from "./detail-cards.js";
import * as M from "./model.js";
import { shown, timeline, closedAfterApply, noReplyDays, interviewDay } from "./track.js";
import { heldAnswers } from "./review.js";

function head(r) {
  const type = M.applyType(r);
  return `<header class="jd-head">
    <button class="jp-btn jp-btn--plain jp-btn--sm jd-back" type="button" data-action="job-back">${icon("back")}Jobs</button>
    ${companyLogo(r.company, r.logoUrl)}
    <div class="jd-head__text">
      <h2 class="t-title1 jd-title">${esc(r.title)}</h2>
      <div class="jd-head__meta"><span class="meta ellip">${esc([r.company, r.location].filter(Boolean).join(" · "))}</span>
        ${statusPill(shown(r).key, shown(r).label)}${type ? tag(type) : ""}${r.archived ? tag("Archived") : ""}</div>
      <span class="foot">${esc([M.postedLine(r), `Analyzed ${M.at(r.createdAt)}`].filter(Boolean).join(" · "))}</span>
    </div>
    <div class="jd-head__actions">
      <button class="jp-btn jp-btn--sm" type="button" data-action="job-posting" aria-haspopup="dialog">${icon("doc")}Job posting</button>
      <button class="jp-btn jp-btn--tinted jp-btn--sm" type="button" data-action="job-ask" aria-expanded="${S.panel === "ask"}">${icon("chat")}Ask Claude about this job</button>
    </div>
  </header>`;
}

// Analyzed, Tailored, Applied, Viewed, Replied (board JobDetail)
function timelineHtml(r) {
  return `<ol class="jd-timeline" aria-label="Timeline">${timeline(r).map((t, i) => `<li class="${t.done ? "is-done" : ""}">
    ${i ? `<span class="jd-timeline__line" aria-hidden="true"></span>` : ""}<span class="jd-timeline__dot" aria-hidden="true"></span>
    <span class="jd-timeline__text"><span class="jd-timeline__label">${esc(t.label)}</span><span class="foot">${esc(t.when || "—")}</span></span>
    <span class="sr-only">${t.done ? "done" : "not yet"}</span></li>`).join("")}</ol>`;
}

function scoreBand(r) {
  const s = M.scores(r), t = r.tailored, rs = M.raise(r);
  const [tText, tTone] = M.targetPill(s.score);
  const opts = { target: M.target(), cutoff: M.cutoff() };
  const rings = s.from != null ? `<div class="jd-rings">
      <div class="jd-ring">${scoreRing(s.from, { ...opts, size: "md", muted: true })}<span class="foot">Your resume</span></div>
      ${icon("arrow", "ico ico--20 jd-arrow")}
      <div class="jd-ring">${scoreRing(s.score, opts)}<span class="foot">Tailored</span></div>
      <div class="jd-gain"><span class="metric">${s.score - s.from >= 0 ? "+" : ""}${s.score - s.from}</span><span class="foot">points from tailoring</span></div></div>`
    : `<div class="jd-rings">${scoreRing(s.score, { ...opts, size: "md" })}<span class="foot jd-note">${
      s.state === "kept" ? `Claude's tailored version scored ${Math.round(t.score)}, not higher, so your original is used.`
        : s.score < M.cutoff() ? "Not tailored: Claude stops below your cutoff." : "Not tailored for this job."}</span></div>`;
  return `<section class="jp-card jd-score" aria-label="ATS score">
    ${rings}
    <span class="vline" aria-hidden="true"></span>
    <div class="jd-target">${pill(tText, tTone)}<span class="foot">Target <span class="jp-num">${M.target()}</span> · cutoff <span class="jp-num">${M.cutoff()}</span></span>
      ${s.newer != null ? `<span class="foot">Score of the version you sent. A newer version scores <span class="jp-num">${s.newer}</span></span>` : ""}</div>
    ${rs.items.length ? `<div class="jd-up">
      <span class="meta">Up to <span class="data" style="color:var(--accent-text)">${rs.potential}</span> with Claude's <span class="jp-num">${rs.items.length}</span> ${rs.items.length === 1 ? "step" : "steps"}</span>
      <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="to-raise">See how${icon("arrow-down", "ico ico--14")}</button></div>` : ""}
  </section>`;
}

// The resume file to send: the tailored one when it's used, else the best original
export const resumePath = (r) => r.tailored?.used ? r.tailored.path : r.tailored?.basePath || (r.ats?.best_file ? `resumes/${r.ats.best_file}` : null);

function notes(r) {
  const s = M.scores(r), out = [];
  if (r.archived) out.push(callout(`<b>Archived ${esc(fmtDate(r.archived.at))}.</b> ${esc(r.archived.reason || "")}. Everything Claude saved is kept.`));
  if (r.status === "needs_manual") out.push(callout(`<b>Needs you.</b> ${esc(r.statusReason || "Easy Apply asked something Claude couldn't answer.")} Finish the application on LinkedIn.`, "warning"));
  if (r.status === "ready_to_apply") {
    const why = /limit/i.test(r.statusReason || "") ? "Your daily application limit was reached. " : /analy[sz]e.only/i.test(r.statusReason || "") ? "Claude is set to analyze only, so you send it. " : "";
    out.push(callout(`<b>Ready to send.</b> ${why}The resume and Claude's answers are below.`));
  }
  if (r.status === "waiting_ok") {
    const n = heldAnswers(r).length;
    out.push(callout(`<b>Waiting for your OK.</b> ${esc(r.statusReason || "")} The resume and ${n} ${n === 1 ? "answer are" : "answers are"} ready; nothing is sent until you approve.`, "warning"));
  }
  if (r.status === "approved") out.push(callout(`<b>Approved ${esc(M.at(r.approval?.at))}.</b> Claude sends it with your answers on the next run, or now with Send now.${r.approval?.lastDryRun ? ` A test run reached Submit ${esc(M.at(r.approval.lastDryRun))} and stopped there.` : ""}`));
  if (r.status === "skipped_by_user") out.push(callout(`<b>Skipped.</b> You chose not to send this one; nothing was sent.`));
  if (r.status === "external") out.push(callout(`<b>On the company's site.</b> Send the resume below; Claude's answers further down help with their questions.`));
  if (r.status === "dry_run") out.push(callout(`<b>Test run.</b> Claude filled the form and stopped before submitting.`));
  if (r.status === "error") out.push(callout(`<b>Something went wrong.</b> ${esc(r.statusReason || "")}`, "danger"));
  if (r.status === "applied") {
    const up = r.tailored?.uploaded === true ? " with the tailored resume" : r.tailored?.uploaded === false ? " with your original resume (upload failed)" : "";
    out.push(`<p class="meta jd-applied"><span class="jp-dot" aria-hidden="true"></span><span>Applied with Easy Apply${r.submittedAt ? ` ${M.at(r.submittedAt).startsWith("today") ? "" : "on "}${esc(M.at(r.submittedAt))}` : ""}${up}${esc(afterNote(r))}</span></p>`);
  }
  if (r.status === "resume_insufficient") out.push(callout(`<b>Resume too weak.</b> It scored ${s.score}, under your cutoff of ${M.cutoff()}, so Claude didn't apply.`, "warning"));
  for (const w of r.warnings || []) out.push(callout(esc(w), "warning"));
  return out.join("");
}

// " · viewed Oct 14 · no reply yet": what happened after Applied, for the applied line
function afterNote(r) {
  const h = r.statusHistory || [], s = shown(r), viewed = h.find((x) => x.status === "viewed"), last = h.at(-1), closed = closedAfterApply(r);
  const bits = [viewed ? `${viewed.note === "Resume downloaded" ? "resume downloaded" : "viewed"} ${M.shortDay(viewed.at)}` : "not viewed"];
  if (s.key === "interview") bits.push(last?.date ? `interview on ${interviewDay(last.date)} at ${M.time(last.date)}` : "interview, date not set");
  else if (s.key === "offer") bits.push(`offer ${M.shortDay(h.findLast((x) => x.status === "offer").at)}`);
  else if (s.key === "rejected") bits.push(`${r.company} declined ${M.shortDay(h.findLast((x) => x.status === "rejected").at)}`);
  else if (s.key === "no_reply") bits.push(`no reply after ${noReplyDays()} days`);
  else bits.push("no reply yet");
  if (closed) bits.push(`listing closed ${M.shortDay(closed.at)}`);
  return " · " + bits.join(" · ");
}

// One primary action per status (the shown one, so Interview gets its own): a link [href, label] or a button { action, label }
const PRIMARY = {
  external: (r) => [r.externalUrl || r.url, "Apply on company site"],
  ready_to_apply: (r) => [r.url, "Apply with Easy Apply"],
  needs_manual: (r) => [r.url, "Finish on LinkedIn"],
  waiting_ok: () => ({ action: "review-open", label: "Review and send" }),
  approved: () => ({ action: "send-now", label: "Send now" }),
  interview: () => ["#guidance", "Practice for this interview"],
};
const AFTER = new Set(["applied", "viewed", "interview", "offer", "rejected", "no_reply"]);
// Marks by hand after Applied; the current one is left out
function marks(r) {
  const k = shown(r).key;
  if (!AFTER.has(k)) return "";
  const opts = [["interview", "Interview…"], ["offer", "Offer"], ["rejected", "Rejected"], ["applied", "Back to applied"]].filter(([v]) => v !== k && !(v === "applied" && ["applied", "viewed", "no_reply"].includes(k)));
  return `<div class="jd-marks" role="group" aria-label="Mark what happened"><span class="foot">Heard back?</span>
    ${opts.map(([v, l]) => `<button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="mark-status" data-v="${v}"${v === "interview" ? ' aria-haspopup="dialog"' : ""}>${l}</button>`).join("")}</div>`;
}

function primary(p) {
  if (!p) return "";
  if (!Array.isArray(p)) return `<button class="jp-btn jp-btn--primary" type="button" data-action="${p.action}"${p.action === "review-open" ? ' aria-haspopup="dialog"' : ""}>${esc(p.label)}</button>`;
  const inApp = p[0].startsWith("#");
  return `<a class="jp-btn jp-btn--primary" href="${esc(p[0])}"${inApp ? ` data-nav="${esc(p[0].slice(1))}"` : ' target="_blank" rel="noopener"'}>${esc(p[1])}${inApp ? "" : icon("external")}</a>`;
}

function actions(r) {
  const p = PRIMARY[shown(r).key]?.(r), file = resumePath(r);
  const skip = r.status === "waiting_ok" ? "Skip this job" : r.status === "approved" ? "Don't send it" : "";
  return `${marks(r)}<div class="jd-actions">
    ${primary(p)}
    ${file ? `<a class="jp-btn" href="${pdfUrl(file)}&dl=1">${icon("download")}Download the resume to send</a>` : ""}
    ${skip ? `<button class="jp-btn jp-btn--plain" type="button" data-action="job-skip">${skip}</button>` : ""}
    ${p && !Array.isArray(p) || !p || p[0].startsWith("#") ? `<a class="jp-btn jp-btn--plain" href="${esc(r.url)}" target="_blank" rel="noopener">Open on LinkedIn${icon("external")}</a>` : ""}
    <button class="jp-btn jp-btn--plain" type="button" data-action="archive" data-site="${esc(r.site)}" data-id="${esc(r.id)}" data-v="${r.archived ? "" : "1"}">${r.archived ? "Unarchive" : "Archive this job"}</button>
  </div>`;
}

function resumeCard(r) {
  const t = r.tailored, used = t?.used;
  const file = used ? t.file : t?.baseFile || r.ats?.best_file || "No resume picked";
  const meta = used ? `Tailored ${M.at(r.createdAt)} · ${t.pass} ${t.pass === 1 ? "pass" : "passes"} · nothing invented`
    : t ? `Your original · the tailored version scored ${Math.round(t.score)}` : "Your original resume · Claude didn't tailor one";
  const changes = used ? t.resume?.changes || [] : [];
  const notAdded = used ? (t.resume?.not_added || []).map((x) => String(x).split(":")[0]) : [];
  return `<section class="jp-card jd-wide jd-resume">
    <p class="jp-card__label">Tailored resume</p>
    <div class="jd-resume__grid">
      <div class="jd-resume__main">
        <div class="jd-file">${icon("doc", "ico ico--20")}<div><span class="ellip jd-file__name">${esc(file)}</span><span class="foot">${esc(meta)}</span></div>
          ${resumePath(r) ? `<a class="jp-btn jp-btn--plain jp-btn--sm" href="${pdfUrl(resumePath(r))}" target="_blank" rel="noopener">Open</a>` : ""}</div>
        ${changes.length ? `<ul class="jd-changes">${changes.map((c) => `<li>${md(c.what)}${c.why ? `<span class="foot">${md(c.why)}</span>` : ""}</li>`).join("")}</ul>` : ""}
        ${notAdded.length ? `<div><p class="cap" style="margin-bottom:6px">Not added: your resumes don't show it</p>${tags(notAdded, "", 12)}</div>` : ""}
      </div>
      <div class="jd-resume__side">${notes(r)}${actions(r)}</div>
    </div>
  </section>`;
}

export function detailHtml(r) {
  if (!r) return `<div class="jobs-detail__empty"><p class="meta" style="color:var(--text)">No job selected</p><p class="foot">Pick a job on the left to see Claude's work on it.</p></div>`;
  return `${head(r)}${timelineHtml(r)}
    <div class="jd-body" id="detail-scroll"><div class="jd-grid">
      ${scoreBand(r)}${resumeCard(r)}${whyCard(r)}${skillsCard(r)}${raiseCard(r)}${answersCard(r)}
    </div></div>`;
}
