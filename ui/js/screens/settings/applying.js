// Settings > Applying (boards Settings-Applying, Settings-Review): the four apply modes in plain words with what each would
// have done with the last week's jobs, the overall daily limit, and the review sheet from Jobs as the example.
import { S } from "../../state.js";
import { esc, toast } from "../../util.js";
import { scores, keyOf } from "../jobs/model.js";
import { openReview, heldAnswers } from "../jobs/review.js";
import { settings, saveSettings } from "./index.js";

const MODES = [
  ["auto", "Apply automatically", "Claude applies to every Easy Apply job at or above a profile's cutoff, up to your daily limits. You see what it sent in Activity."],
  ["ask_below_target", "Apply at your target, ask below it", "Claude applies at a profile's target and up. Between the cutoff and the target it tailors the resume, fills the form, then waits for your OK."],
  ["ask_all", "Ask before every application", "Claude prepares every Easy Apply application and sends nothing until you approve it."],
  ["analyze_only", "Only analyze and tailor", "Claude finds, scores and tailors. Nothing is sent: you apply yourself with the tailored resume."],
];

// What each mode would have done with the last 7 days' Easy Apply jobs (at your default target and cutoff)
function example(mode) {
  const s = settings(), week = Date.now() - 7 * 864e5;
  const jobs = S.DATA.filter((r) => r.easyApply && !r.archived && Date.parse(r.createdAt) > week && r.ats);
  const ok = jobs.filter((r) => scores(r).score >= s.minAtsScore), above = ok.filter((r) => scores(r).score >= s.tailorTarget).length;
  if (!ok.length) return "No Easy Apply job reached your cutoff in the last 7 days.";
  const n = ok.length, jobs1 = (k) => `${k} ${k === 1 ? "job" : "jobs"}`;
  return { auto: `Last 7 days: this would have sent ${jobs1(n)}, within your daily limits.`,
    ask_below_target: `Last 7 days: ${above} sent on their own, ${n - above} waiting for your OK.`,
    ask_all: `Last 7 days: all ${jobs1(n)} would have waited for you.`,
    analyze_only: `Last 7 days: ${jobs1(n)} ready for you to send yourself.` }[mode];
}

export function applyingHtml() {
  const s = settings(), cur = MODES.some(([id]) => id === s.applyMode) ? s.applyMode : "analyze_only";
  const waiting = S.DATA.filter((r) => r.status === "waiting_ok" && !r.archived);
  return `<div class="st-head"><div class="st-head__text"><h2 class="t-title2">Applying</h2>
      <p class="meta">How much Claude does on its own. Each search profile's target, cutoff and limit still apply.</p></div></div>
    <div class="st-two">
      <div class="st-col">
        <div class="st-radios" role="radiogroup" aria-label="How much Claude does on its own">${MODES.map(([id, label, desc]) =>
          `<button class="st-radio" type="button" role="radio" aria-checked="${id === cur}" data-action="apply-mode" data-v="${id}">
            <span class="st-radio__dot" aria-hidden="true"></span>
            <span class="st-radio__text"><span class="st-radio__label">${label}</span><span class="t-callout st-sec">${desc}</span><span class="foot">${esc(example(id))}</span></span></button>`).join("")}</div>
        <div class="jp-list">
          <label class="st-row"><span class="st-row__text"><span class="st-row__label">Applications a day, at most</span>
            <span class="foot">Across every profile and every run, including Send now. A profile can set a lower limit.</span></span>
            <input class="jp-input jp-num st-numin" type="number" min="0" max="60" data-set="dailyApplyLimit" data-type="num" value="${s.dailyApplyLimit}"></label>
          <div class="st-row"><span class="st-row__text"><span class="st-row__label" id="st-up">Upload the tailored resume</span>
            <span class="foot">Off: Claude picks one of the resumes already on your LinkedIn account</span></span>
            <button class="switch" type="button" role="switch" aria-checked="${s.uploadTailored !== false}" aria-labelledby="st-up" data-action="set-toggle" data-key="uploadTailored"></button></div>
          <div class="st-row"><span class="st-row__text"><span class="st-row__label">Try it without sending</span>
            <span class="foot">A test run on 2 jobs: Claude fills the forms and stops before Submit</span></span>
            <button class="jp-btn jp-btn--sm" type="button" data-action="dry-run">Test run</button></div>
        </div>
      </div>
      <section class="jp-card st-ask" aria-labelledby="st-ask-title">
        <h3 id="st-ask-title" class="t-headline">When Claude asks</h3>
        <p class="t-callout st-sec">You get a review sheet with the tailored resume and every answer Claude wrote. Edit any answer, then send it or skip the job. Nothing goes out until you approve it.</p>
        <div class="st-mock" aria-hidden="true"><span class="st-mock__line st-mock__line--70"></span><span class="st-mock__box"></span>
          <span class="st-mock__line st-mock__line--55"></span><span class="st-mock__box"></span><span class="st-mock__btn"></span></div>
        <div class="st-ask__foot"><button class="jp-btn jp-btn--tinted" type="button" aria-haspopup="dialog" data-action="apply-example">See an example</button>
          <span class="foot">${waiting.length ? `<span class="jp-num">${waiting.length}</span> ${waiting.length === 1 ? "job is" : "jobs are"} waiting now: <a href="#jobs" data-action="show-waiting">${esc(waiting.slice(0, 3).map((r) => r.company).join(", "))}</a>` : "No job is waiting for your OK."}</span></div>
      </section>
    </div>`;
}

export const APPLYING_ACTIONS = {
  "apply-mode": (el) => saveSettings({ applyMode: el.dataset.v }, "Saved. The next run applies this way."),
  // A job that waits for your OK, else the latest job with answers Claude wrote (opened read-only)
  "apply-example": () => {
    const r = S.DATA.find((x) => x.status === "waiting_ok" && !x.archived) || S.DATA.find((x) => heldAnswers(x).length);
    if (!r) return toast("No job has a filled form yet. The first job Claude holds for your OK will show here.", 7000);
    openReview(keyOf(r), { preview: r.status !== "waiting_ok" });
  },
};
