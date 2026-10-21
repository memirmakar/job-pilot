// Guidance in mock-interview mode (canvas board Guidance-Interview): Claude asks the planned questions one at a time in English
// or Turkish, gives short feedback after each answer; the right column shows the plan and progress. End interview saves a summary.
import { S } from "../../state.js";
import { esc, icon } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { callout } from "../../components/card.js";
import { feedbackCard, thinkingHtml } from "./chat.js";
import * as M from "./model.js";

const n = (v) => `<span class="jp-num">${v}</span>`;

function turn(m) {
  if (m.kind === "iv-intro") return `<div class="bubble bubble--claude">${esc(m.text)}</div>`;
  if (m.kind === "iv-question") return `<p class="cap gd-q">Question ${n(m.n)} · Claude as the interviewer</p><div class="bubble bubble--claude">${esc(m.text)}</div>`;
  if (m.kind === "iv-feedback") return feedbackCard(m);
  return m.skipped ? `<p class="foot gd-skip">Skipped question ${n(m.n)}</p>` : `<div class="bubble bubble--me">${esc(m.text).replace(/\n/g, "<br>")}</div>`;
}

export function interviewHtml(c) {
  const iv = c.interview, r = M.jobOf(c.cid), busy = M.isRunning(c.cid), err = S.g.errors[c.cid];
  const total = iv.plan.length, at = Math.min(iv.i + 1, total), finished = iv.i >= total;
  const bars = M.plan(iv).map((p) => `<span class="gd-prog__bar${p.st === "next" ? "" : " is-on"}"></span>`).join("");
  return `<section class="jp-card gd-chat" aria-label="Mock interview">
    <div class="gd-head">
      <button class="jp-btn jp-btn--plain jp-btn--sm gd-back" type="button" data-action="g-back">${icon("back")}Conversations</button>
      <div class="gd-head__text"><h2 class="t-headline gd-live"><span class="jp-dot jp-dot--live" aria-hidden="true"></span>Mock interview</h2>
        <span class="foot ellip">${r ? `<a href="#" class="coach-link" data-action="coach-link" data-type="job" data-id="${esc(c.cid)}">${esc(r.title)} · ${esc(r.company)}</a>` : esc(c.title)}</span></div>
      <div class="gd-head__tools">
        <div class="jp-seg" role="group" aria-label="Interview language">${M.LANGS.map(([k, l]) =>
          `<button class="jp-seg__item" type="button" aria-pressed="${iv.lang === k}" aria-selected="${iv.lang === k}" data-action="g-iv-lang" data-v="${k}" ${busy ? "disabled" : ""}>${l}</button>`).join("")}</div>
        <span class="meta gd-timer">${icon("clock")}<span class="jp-num gd-elapsed" data-since="${esc(iv.startedAt)}">${M.elapsed(iv.startedAt)}</span></span>
        <button class="jp-btn jp-btn--sm" type="button" data-action="g-iv-end" ${busy ? "disabled" : ""}>End interview</button>
      </div>
    </div>
    <div class="gd-prog"><span class="foot">${finished ? "All questions asked" : `Question ${n(at)} of ${n(total)}`}</span>
      <div class="gd-prog__bars" role="img" aria-label="${finished ? "All questions asked" : `Question ${at} of ${total}`}" style="--n:${total}">${bars}</div></div>
    <div class="gd-log" id="g-log" role="log" aria-live="polite" aria-busy="${busy}">
      ${M.interviewMessages(c).map(turn).join("")}
      ${thinkingHtml(c.cid)}
      ${err ? (err.cancelled ? `<p class="foot gd-note">Cancelled. Your answer is back in the box.</p>` : callout(esc(err.message), "danger")) : ""}
      ${finished && !busy ? `<p class="t-callout gd-muted">That was the last question. End the interview to get a summary: strengths, weak answers and what to practise.</p>` : ""}
    </div>
    <form class="gd-form gd-form--iv" data-g-form>
      <label class="jp-field gd-form__field"><span class="sr-only">Your answer to question ${at}</span>
        <textarea class="jp-input gd-answer-box" id="g-input" rows="2" placeholder="${finished ? "No more questions" : "Type your answer"}" ${busy || finished ? 'readonly aria-disabled="true"' : ""}>${esc(S.g.drafts[c.cid] || "")}</textarea></label>
      <div class="gd-form__row">
        <span class="foot">Ctrl+Enter sends</span>
        <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="g-iv-skip" ${busy || finished ? "disabled" : ""}>Skip question</button>
        ${finished ? `<button class="jp-btn jp-btn--primary gd-form__send" type="button" data-action="g-iv-end" ${busy ? "disabled" : ""}>End and get summary</button>`
          : `<button class="jp-btn jp-btn--primary gd-form__send" type="submit" ${busy ? "disabled" : ""}>Send answer</button>`}
      </div>
    </form>
  </section>`;
}

export function planHtml(c) {
  const iv = c.interview, r = M.jobOf(c.cid), miss = r ? (r.tailored?.used ? r.tailored.ats : r.ats?.resumes?.find((x) => x.file === r.ats.best_file))?.missing_keywords || [] : [];
  return `<aside class="jp-card gd-ctx" aria-label="Interview plan">
    <div class="gd-ctx__head"><h2 class="t-headline">Interview plan</h2><span class="foot">${iv.plan.length} questions · ${iv.lang === "tr" ? "in Turkish" : "in English"}</span></div>
    <div class="gd-ctx__body">
      <ol class="gd-plan">${M.plan(iv).map((p) => `<li class="gd-plan__item${p.st === "now" ? " is-now" : ""}">
        <span class="jp-num foot">${p.n}</span><span class="gd-plan__q">${esc(p.about)}</span>${pill(p.status[0], p.status[1])}</li>`).join("")}</ol>
      <div class="gd-ctx__group"><p class="cap">Built from</p>
        <div class="gd-tags"><span class="jp-tag">The posting</span><span class="jp-tag">${r?.tailored?.path ? "Tailored resume" : "Your resume"}</span>
          ${miss.length ? `<span class="jp-tag">Missing: ${esc(miss.slice(0, 2).join(", "))}</span>` : ""}</div></div>
      ${callout("This is practice, not a prediction. Claude doesn't know what the employer will ask; these are the questions the posting and your resume make likely.")}
      <p class="foot">When you end it, Claude writes a summary with what to practise, saved in this conversation, and offers to add the practice to your to-do list.</p>
    </div>
  </aside>`;
}
