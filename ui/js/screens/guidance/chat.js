// Guidance, center (canvas board Guidance): the conversation. The weekly check-in renders as a card at the top of the pinned
// conversation; Claude's answers can end in action buttons (handled in act.js); a call in flight shows "Claude is thinking" with Cancel.
import { S } from "../../state.js";
import { esc, icon } from "../../util.js";
import { coachText } from "../../components/coach-text.js";
import { callout } from "../../components/card.js";
import { pill } from "../../components/status-pill.js";
import * as M from "./model.js";

const n = (v) => `<span class="jp-num">${v}</span>`;
const ICON = { add_todo: "plus", update_goals: "target", resume_edit: "edit", mock_interview: "mic", draft_message: "mail" };
const DONE = { add_todo: "Added to to-do", update_goals: "Goals saved", resume_edit: "Opened in Resumes", mock_interview: "Interview started" };

function draftCard(a, key) {
  return `<div class="gd-draft">
    <p class="cap">Draft${a.recipient ? ` to ${esc(a.recipient)}` : ""}</p>
    <p class="gd-draft__text" id="draft-${esc(key)}">${esc(a.draft)}</p>
    <div class="gd-draft__foot"><button class="jp-btn jp-btn--sm jp-btn--tinted" type="button" data-action="g-copy" data-key="${esc(key)}">${icon("copy")}${S.g.done[key] ? "Copied" : "Copy"}</button>
      <span class="foot">Job Pilot never sends messages. Paste it into LinkedIn yourself.</span></div></div>`;
}
export function actionsHtml(cid, m) {
  const list = m.actions || [];
  if (!list.length) return "";
  const drafts = list.map((a, j) => a.type === "draft_message" ? draftCard(a, `${cid}:${m.i}:${j}`) : "").join("");
  let first = true;
  const btns = list.map((a, j) => {
    if (a.type === "draft_message") return "";
    const key = `${cid}:${m.i}:${j}`, done = S.g.done[key], tone = first ? " jp-btn--tinted" : ""; first = false;
    return `<button class="jp-btn jp-btn--sm${tone}" type="button" data-action="g-act" data-cid="${esc(cid)}" data-i="${m.i}" data-j="${j}" ${done ? "disabled" : ""}>
      ${icon(done ? "check" : ICON[a.type])}${esc(done ? DONE[a.type] : a.label)}</button>`;
  }).join("");
  const hint = list.some((a) => a.type === "resume_edit") ? `<span class="foot gd-actions__hint">Resume edits open in Resumes, checked against your originals</span>` : "";
  return `${drafts}${btns ? `<div class="gd-actions">${btns}${hint}</div>` : ""}`;
}

function checkinCard(cid, m) {
  const s = m.stats || {};
  return `<article class="gd-checkin" aria-label="Weekly check-in, ${esc(M.day(m.at))}">
    <div class="gd-checkin__head"><span class="jp-bar__mark gd-mark" aria-hidden="true"></span><span class="gd-checkin__title">Weekly check-in</span>
      <span class="foot">${esc(M.day(m.at))}${s.from ? ` · ${esc(M.monthDay(s.from))} – ${esc(M.monthDay(s.to))}` : ""}</span></div>
    ${s.from ? `<p class="meta gd-checkin__stats">${n(s.applied)} applied · ${n(s.replies)} ${s.replies === 1 ? "reply" : "replies"} · ${n(s.interviews)} ${s.interviews === 1 ? "interview" : "interviews"} · ${n(s.todoDone)} to-do ${s.todoDone === 1 ? "step" : "steps"} done</p>` : ""}
    ${coachText(m.text)}
    ${actionsHtml(cid, m)}
  </article>`;
}

function summaryCard(cid, m) {
  const s = m.summary;
  return `<article class="gd-checkin" aria-label="Mock interview summary">
    <div class="gd-checkin__head"><span class="jp-bar__mark gd-mark" aria-hidden="true"></span><span class="gd-checkin__title">Mock interview summary</span><span class="foot">${esc(M.day(m.at))}</span></div>
    ${coachText(m.text)}
    ${s ? `<div class="gd-sum">
      ${s.strengths?.length ? `<div><p class="cap">Strengths</p><ul class="t-callout">${s.strengths.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      ${s.weak?.length ? `<div><p class="cap">Weak answers</p><ul class="t-callout">${s.weak.map((w) => `<li><span class="jp-num">Q${w.n}</span> · ${esc(w.why)}</li>`).join("")}</ul></div>` : ""}
      ${s.practise?.length ? `<div><p class="cap">What to practise</p><ul class="t-callout">${s.practise.map((p) => `<li>${esc(p.title)} <span class="foot">~${esc(p.hours)}h</span></li>`).join("")}</ul></div>` : ""}
    </div>` : ""}
    ${actionsHtml(cid, m)}
  </article>`;
}

export const feedbackCard = (m) => `<article class="gd-feedback" aria-label="Feedback on answer ${m.n}">
  <p class="cap gd-feedback__cap"><span class="jp-bar__mark gd-mark gd-mark--sm" aria-hidden="true"></span>Claude as your coach · feedback on answer ${n(m.n)}</p>
  <div class="gd-feedback__grid">${pill("Worked", "success")}<span class="t-callout">${esc(m.worked || "")}</span>${pill("Add", "warning")}<span class="t-callout">${esc(m.improve || "")}</span></div>
</article>`;
const me = (text) => `<div class="bubble bubble--me">${esc(text).replace(/\n/g, "<br>")}</div>`;

export function messageHtml(cid, m) {
  if (m.kind === "checkin") return checkinCard(cid, m);
  if (m.kind === "iv-summary") return summaryCard(cid, m);
  if (m.kind === "iv-feedback") return feedbackCard(m);
  if (m.kind === "iv-question") return `<p class="cap gd-q">Mock interview · question ${n(m.n)}</p><div class="bubble bubble--claude">${esc(m.text)}</div>`;
  if (m.role === "user") return m.skipped ? `<p class="foot gd-skip">Skipped question ${n(m.n)}</p>` : me(m.text);
  return `<div class="bubble bubble--claude gd-answer">${coachText(m.text)}${m.weekly ? `<p class="foot">Answered with your weekly model</p>` : ""}${actionsHtml(cid, m)}</div>`;
}

// "Claude is thinking" with Cancel; also when the call was started before a reload (the server still has it)
export function thinkingHtml(cid) {
  const p = S.g.pending[cid], sp = S.g.serverPending[cid];
  if (!p && !sp) return "";
  const what = (p || sp).what;
  const label = what === "checkin" ? "Claude is writing your check-in" : what?.startsWith("interview") ? "Claude is preparing the interview" : "Claude is thinking";
  return `${p?.text ? me(p.text) : ""}<div class="bubble bubble--claude gd-thinking" role="status">
    <span class="gd-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${label}… <span class="jp-num gd-elapsed" data-since="${esc((p || sp).at)}">${M.elapsed((p || sp).at)}</span></span>
    <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="g-cancel" data-cid="${esc(cid)}">Cancel</button></div>`;
}

const SUGGEST = {
  job: (r) => [`Why haven't I heard back from ${r?.company || "them"}?`, "What should I prepare for an interview?", "Draft a short note to the recruiter"],
  general: () => ["What should I focus on this week?", "Which of my repos should I improve first?", "Are my goals realistic for this market?"],
  weekly: () => ["What should I do first this week?", "Why haven't I had more replies?"],
};
function emptyHtml(c) {
  if (c.kind === "weekly") return `<div class="gd-empty"><p class="t-headline">No check-in yet</p>
    <p class="t-callout gd-muted">Claude writes one once a week after a run: what happened in the last 7 days and 2–3 next steps. You can ask for one now.</p>
    <button class="jp-btn jp-btn--tinted" type="button" data-action="g-checkin" ${M.isRunning("weekly") ? "disabled" : ""}>Check in now</button></div>`;
  return `<div class="gd-empty"><p class="t-callout gd-muted">${c.kind === "job" ? "Ask anything about this job: the fit, the gaps, what to say. Claude answers from what it saved about it."
    : "Ask about your search, a job, your resumes or your GitHub. Claude answers from your data and says when it can't know something."}</p></div>`;
}
const suggestions = (c) => {
  const list = (SUGGEST[c.kind] || SUGGEST.general)(M.jobOf(c.cid));
  return `<div class="gd-suggest" role="group" aria-label="Suggested questions">${list.map((s) => `<button class="chip" type="button" data-action="g-suggest" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
};

function head(c) {
  const r = c.kind === "job" ? M.jobOf(c.cid) : null;
  const lastCheckin = [...c.messages].reverse().find((m) => m.kind === "checkin");
  const sub = c.kind === "weekly" ? `Claude writes one once a week after a run${lastCheckin ? ` · last ${M.day(lastCheckin.at)}` : ""}`
    : r ? `<a href="#" class="coach-link" data-action="coach-link" data-type="job" data-id="${esc(c.cid)}">${esc(r.company)} · open the job</a>`
    : c.kind === "job" ? "This job isn't in your list any more" : c.cid === "new" ? "Not saved until you send the first message" : `Started ${M.day(c.createdAt)}`;
  const tools = c.kind === "weekly" ? `<button class="jp-btn jp-btn--sm" type="button" data-action="g-checkin" ${M.isRunning("weekly") ? "disabled" : ""}>Check in now</button>`
    : c.cid === "new" ? "" : `${r ? `<button class="jp-btn jp-btn--tinted jp-btn--sm" type="button" data-action="g-iv-start" data-cid="${esc(c.cid)}" ${M.isRunning(c.cid) ? "disabled" : ""}>${icon("mic")}Mock interview</button>` : ""}
      <button class="jp-btn jp-btn--sm btn-icon" type="button" data-action="g-rename" aria-label="Rename conversation">${icon("edit")}</button>
      <button class="jp-btn jp-btn--sm btn-icon" type="button" data-action="g-delete" aria-label="Delete conversation">${icon("trash")}</button>`;
  return `<div class="gd-head">
    <button class="jp-btn jp-btn--plain jp-btn--sm gd-back" type="button" data-action="g-back">${icon("back")}Conversations</button>
    <div class="gd-head__text"><h2 class="t-headline ellip">${esc(c.title)}</h2><span class="foot ellip">${sub}</span></div>
    <div class="gd-head__tools">${tools}</div></div>`;
}

export function chatHtml(c) {
  const cid = c.cid, ms = M.chatMessages(c), err = S.g.errors[cid], busy = M.isRunning(cid);
  const earlier = M.earlierCount(c);
  const model = S.STATE?.settings?.modelWeekly || "weekly model";
  return `<section class="jp-card gd-chat" aria-label="${esc(c.title)}">
    ${head(c)}
    <div class="gd-log" id="g-log" role="log" aria-live="polite" aria-busy="${busy}">
      ${earlier ? `<button class="jp-btn jp-btn--plain jp-btn--sm gd-earlier" type="button" data-action="g-history">${S.g.history ? "Show the latest check-in only" : `Show ${earlier} earlier ${earlier === 1 ? "check-in" : "check-ins"}`}</button>` : ""}
      ${ms.length ? ms.map((m) => messageHtml(cid, m)).join("") : busy ? "" : emptyHtml(c)}
      ${thinkingHtml(cid)}
      ${err ? (err.cancelled ? `<p class="foot gd-note">Cancelled. Your message is back in the box.</p>` : callout(esc(err.message), "danger")) : ""}
      ${!busy && !ms.some((m) => m.role === "user") && (c.kind !== "weekly" || ms.length) ? suggestions(c) : ""}
    </div>
    <form class="gd-form" data-g-form>
      <label class="jp-field gd-form__field"><span class="sr-only">Message Claude</span>
        <input class="jp-input" id="g-input" type="text" placeholder="${c.kind === "job" ? "Ask about this job" : "Ask about your search, a job or a repo"}" autocomplete="off"
          value="${esc(S.g.drafts[cid] || "")}" ${busy ? 'readonly aria-disabled="true"' : ""}></label>
      <button class="chip gd-deep" type="button" data-action="g-deep" aria-pressed="${S.g.deep}" title="Uses ${esc(model)}: slower and more of your plan">Deeper answer</button>
      <button class="jp-btn jp-btn--primary" type="submit" ${busy ? "disabled" : ""}>Send</button>
    </form>
  </section>`;
}
