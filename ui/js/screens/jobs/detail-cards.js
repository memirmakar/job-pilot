// Job detail cards below the resume: why Claude picked it, skills, how to raise the score, Claude's answers.
import { esc, md, rich, icon } from "../../util.js";
import { tags, tag } from "../../components/tag.js";
import { pill } from "../../components/status-pill.js";
import * as M from "./model.js";

export function whyCard(r) {
  const reason = String(r.selection?.reason || "");
  return `<section class="jp-card">
    <p class="jp-card__label">Why Claude picked it</p>
    ${reason.length > 25 ? `<p class="t-callout">${md(reason)}</p>` : ""}
    ${r.ats?.summary ? rich(r.ats.summary) : reason.length > 25 ? "" : `<p class="t-callout jd-muted">Claude didn't save a reason for this job.</p>`}
  </section>`;
}

export function skillsCard(r) {
  const s = M.skills(r);
  return `<section class="jp-card jd-skills">
    <div><p class="jp-card__label">Matched skills</p>${tags(s.matched, "met", 14) || `<p class="foot">None found</p>`}</div>
    <div><p class="jp-card__label">Missing skills</p>${tags(s.missing, "missing", 14) || `<p class="foot">Nothing missing</p>`}</div>
  </section>`;
}

export function raiseCard(r) {
  const rs = M.raise(r);
  const gainW = Math.max(0, rs.potential - rs.now);
  return `<section id="raise" class="jp-card jd-wide jd-raise" tabindex="-1">
    <div class="jd-raise__head"><p class="jp-card__label">How to raise this score</p>${rs.items.length > 1 ? `<span class="foot">Ranked by points per hour</span>` : ""}</div>
    ${r.status === "applied" && rs.items.length ? `<p class="foot">You already applied. These still lift your score for similar roles.</p>` : ""}
    ${rs.items.length ? `<ol class="jd-steps">${rs.items.map((x, i) => `<li>
        <span class="jd-rank jp-num" aria-hidden="true">${i + 1}</span>
        <span class="jd-step">${md(x.action)}${x.why ? `<span class="foot">${md(x.why)}</span>` : ""}</span>
        <span>${tag(M.RECTYPE[x.type] || "Other")}</span>
        <span class="foot jd-time">${icon("clock", "ico ico--13")}${esc(M.EFFORT[x.effort] || x.effort || "")}</span>
        <span class="jd-pts jp-num" aria-label="plus ${x.gain} points">+${x.gain}</span></li>`).join("")}</ol>
      <div class="jd-raise__foot">
        <span class="meta">Now <span class="data" style="color:var(--text)">${rs.now}</span> → up to <span class="data" style="color:var(--accent-text)">${rs.potential}</span></span>
        <div class="jd-bar" role="img" aria-label="Score now ${rs.now}, up to ${rs.potential} if you do all of them">
          <span style="width:${rs.now}%"></span><span class="jd-bar__gain" style="width:${gainW}%"></span></div>
        <span class="foot">Claude's estimates; gains can overlap</span>
      </div>`
    : `<p class="t-callout jd-muted">Claude didn't suggest steps for this job.</p>`}
  </section>`;
}

export function answersCard(r) {
  const qa = M.answers(r);
  if (!qa.length) return "";
  return `<section class="jp-card jd-wide jd-answers">
    <p class="jp-card__label">Claude's answers to the application</p>
    ${qa.map((f) => `<div class="jd-qa">
      <span class="meta">${esc(f.label.replace(/\*$/, ""))}</span>
      <span class="t-callout">${esc(f.value) || `<span class="jd-muted">Left blank</span>`}</span>
      ${f.confidence && f.confidence !== "high" ? `<span class="jd-qa__check">${pill(f.confidence === "low" ? "Check this answer" : "Probably right", f.confidence === "low" ? "warning" : "neutral")}
        ${f.reasoning ? `<span class="foot">${md(f.reasoning)}</span>` : ""}</span>` : ""}
    </div>`).join("")}
  </section>`;
}
