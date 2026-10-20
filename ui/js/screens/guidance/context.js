// Guidance, right column (canvas board Guidance): what Claude knows. Your goals as editable text (saved to your profile),
// and a switch per source: resumes, GitHub, the market review, analyzed jobs and each job it would send. Switches are saved per conversation.
import { S } from "../../state.js";
import { esc } from "../../util.js";
import * as M from "./model.js";

const sw = (k, title, sub, on, attrs = "") => `<div class="gd-src">
  <span class="gd-src__text"><span class="ellip gd-src__title">${esc(title)}</span><span class="foot ellip">${esc(sub)}</span></span>
  <button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="Use ${esc(title)}" ${attrs || `data-action="g-ctx" data-k="${k}"`}></button></div>`;

export const savedGoals = () => S.STATE?.profile?.goalsText || S.STATE?.profile?.preferences || "";

function costLine(c) {
  if (!c.usage?.calls) return `<p class="foot">Each message sends a short summary of this, never your whole history.</p>`;
  const l = c.lastCall;
  return `<p class="foot">This conversation: ${c.usage.calls} ${c.usage.calls === 1 ? "call" : "calls"} · ${M.money(c.costUsd)}${l ? `. Last answer: ${Math.round(l.promptChars / 1000)}k characters sent, ${M.money(l.costUsd)}` : ""}.</p>`;
}

export function contextHtml(c) {
  const ctx = c.context, n = M.counts(), goals = S.g.goals ?? savedGoals(), changed = S.g.goals != null && S.g.goals !== savedGoals();
  const market = S.MARKET?.review ? (S.MARKET.at || S.MARKET.generatedAt ? `Updated ${M.day(S.MARKET.at || S.MARKET.generatedAt)}` : "Claude's last review of all jobs") : "No review yet";
  const jobs = M.contextJobs(c);
  return `<aside class="jp-card gd-ctx" aria-label="What Claude knows">
    <div class="gd-ctx__head"><h2 class="t-headline">What Claude knows</h2><span class="foot">Switch anything off and Claude stops using it in this conversation.</span></div>
    <div class="gd-ctx__body">
      <div class="jp-field">
        <label class="cap" for="g-goals">Your goals</label>
        <textarea id="g-goals" class="jp-input gd-goals" rows="5">${esc(goals)}</textarea>
        <div class="gd-goals__foot">
          <span class="foot">${ctx.goals ? "Claude reads these before every answer" : "Not used in this conversation"}</span>
          <button class="jp-btn jp-btn--sm jp-btn--tinted" type="button" data-action="g-goals-save" ${changed ? "" : "disabled"}>Save goals</button>
        </div>
        ${sw("goals", "Use my goals", "Saved in your profile; every run reads them too", ctx.goals)}
      </div>
      <div class="gd-ctx__group">
        <p class="cap">Sources</p>
        ${sw("resumes", "Resumes", `${n.originals} originals · ${n.ready} ready · ${n.tailored} tailored`, ctx.resumes)}
        ${sw("github", "GitHub", n.repos ? `${n.repos} repos with Claude's review` : "No repos fetched yet", ctx.github)}
        ${sw("market", "Market review", market, ctx.market)}
        ${sw("jobs", "Analyzed jobs", `${n.jobs} jobs · Claude sends only the few that matter for each message`, ctx.jobs)}
      </div>
      <div class="gd-ctx__group${ctx.jobs ? "" : " is-off"}">
        <div class="gd-ctx__row"><p class="cap">Jobs it uses now</p><span class="foot">${jobs.filter((j) => j.on).length} of ${jobs.length} on</span></div>
        ${jobs.map((j) => `<div class="gd-src">
          <span class="jp-num gd-src__score" role="img" aria-label="Score ${j.score}">${j.score}</span>
          <span class="gd-src__text"><span class="ellip gd-src__title">${esc(j.r.title)}</span><span class="foot ellip">${esc(j.r.company)}${j.k === c.cid ? " · this conversation's job" : ""}</span></span>
          <button class="switch" type="button" role="switch" aria-checked="${j.on}" aria-label="Use ${esc(j.r.title)} at ${esc(j.r.company)}" data-action="g-ctx-job" data-k="${esc(j.k)}" ${ctx.jobs || j.k === c.cid ? "" : "disabled"}></button></div>`).join("")
          || `<p class="foot">Claude picks the jobs that matter for each message.</p>`}
      </div>
      ${costLine(c)}
    </div>
  </aside>`;
}
