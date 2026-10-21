// Claude usage controls that work on a subscription: pause runs after about N jobs a day (dailyJobs) and optionally M a
// week (weeklyJobs, pipeline.mjs quota), what happens at the plan's limit, the models (Balanced = Sonnet daily, Opus weekly),
// tailoring passes, the run time limit, and the Claude Code CLI itself.
import { S } from "../../state.js";
import { esc } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { callout } from "../../components/card.js";
import { settings, saveSettings } from "./index.js";

const PRESETS = [["balanced", "Balanced", "sonnet", "opus"], ["best", "Best quality", "opus", "opus"], ["light", "Lightest", "sonnet", "sonnet"]];
const MODELS = [["haiku", "Haiku (lightest)"], ["sonnet", "Sonnet"], ["opus", "Opus (best, uses the most)"]];
const opts = (list, cur) => list.map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join("");
const num = (key, v, min, max, label) => `<label class="jp-field st-numw"><span class="sr-only">${label}</span><input class="jp-input jp-num" type="number" min="${min}" max="${max}" data-set="${key}" data-type="num" value="${v}"></label>`;

function claudeRow() {
  const c = S.STATE.claude || {}, s = settings();
  const state = !c.found ? pill("Not found", "danger") : c.loggedIn === false ? pill("Signed out", "danger") : c.loggedIn ? pill("Signed in", "success") : pill("Not checked", "neutral");
  return `<div class="st-srow"><span class="st-srow__head"><span class="st-row__label">Claude Code</span><span class="foot">The CLI every Claude call goes through</span></span>
    <span class="st-srow__body"><span class="st-inline">${state}${c.path ? `<span class="foot ellip st-path">${esc(c.path)}</span>` : ""}
      ${c.found && !c.loggedIn ? `<button class="jp-btn jp-btn--sm" type="button" data-action="claude-login">Sign in</button>` : ""}
      <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="recheck">Check again</button></span>
      ${c.note && !c.loggedIn ? `<span class="foot">${esc(c.note)}</span>` : ""}
      <label class="jp-field"><span class="foot">Its path, only if it isn't found automatically</span>
        <input class="jp-input" type="text" data-set="claudePath" value="${esc(s.claudePath || "")}" placeholder="C:\\Users\\you\\.local\\bin\\claude.exe" spellcheck="false"></label></span></div>`;
}

export function controlsHtml() {
  const s = settings(), weekly = s.weeklyJobs > 0;
  const preset = PRESETS.find(([, , d, w]) => d === s.modelDaily && w === s.modelWeekly)?.[0] || "custom";
  return `<div class="st-two st-two--controls">
    <section class="jp-card st-pause" aria-labelledby="st-pause"><h3 id="st-pause" class="t-headline">Pause runs</h3>
      <div class="st-inline"><span class="meta">After about</span>${num("dailyJobs", s.dailyJobs, 1, 60, "Jobs a day")}<span class="meta">jobs a day</span></div>
      <div class="st-inline"><button class="switch" type="button" role="switch" aria-checked="${weekly}" aria-label="Also pause after a number of jobs a week" data-action="usage-weekly"></button>
        <span class="meta">and about</span>${weekly ? num("weeklyJobs", s.weeklyJobs, 1, 400, "Jobs a week") : `<span class="meta">no cap</span>`}<span class="meta">jobs a week</span></div>
      <p class="foot">Counted across every run, Run now included. At the cap the run finishes the job it's on and stops cleanly; the rest waits for tomorrow${weekly ? ", or Monday for the weekly cap" : ""}. Guidance keeps working.</p>
      ${callout("When your Claude plan's limit is reached mid-run, the run stops cleanly and says so on Jobs and in Activity. Nothing is lost: the jobs it didn't get to are picked up next time.")}
    </section>
    <section class="jp-list" aria-label="Models and run length">
      <div class="st-srow"><span class="st-srow__head"><span class="st-row__label">Models</span><span class="foot">Daily: picking, scoring, tailoring, answers. Weekly: ready resumes, reviews, doctor.</span></span>
        <span class="st-srow__body"><span class="jp-seg" role="radiogroup" aria-label="Model preset">${PRESETS.map(([id, label]) =>
          `<button class="jp-seg__item" type="button" role="radio" aria-checked="${id === preset}" aria-selected="${id === preset}" data-action="usage-preset" data-v="${id}">${label}</button>`).join("")}</span>
          <span class="foot">${preset === "balanced" ? "Sonnet daily, Opus weekly. Recommended." : preset === "best" ? "Opus for everything: best results, uses your plan fastest." : preset === "light" ? "Sonnet for everything: lightest on your plan." : "Your own mix:"}</span>
          <span class="st-inline"><label class="jp-field st-sel"><span class="foot">Daily</span><select class="jp-input" data-set="modelDaily">${opts(MODELS, s.modelDaily)}</select></label>
            <label class="jp-field st-sel"><span class="foot">Weekly</span><select class="jp-input" data-set="modelWeekly">${opts(MODELS.slice(1), s.modelWeekly)}</select></label></span></span></div>
      <div class="st-srow"><span class="st-srow__head"><span class="st-row__label">Tailoring passes</span><span class="foot">A second pass when the first scores under target</span></span>
        <span class="st-srow__body"><label class="jp-field st-sel"><span class="sr-only">Tailoring passes</span><select class="jp-input" data-set="tailorMaxPasses" data-type="num">${opts([["1", "1 (uses less)"], ["2", "2 (higher scores)"]], String(s.tailorMaxPasses))}</select></label></span></div>
      <div class="st-srow"><span class="st-srow__head"><span class="st-row__label">Stop a run after</span><span class="foot">The rest waits for the next run</span></span>
        <span class="st-srow__body"><span class="st-inline">${num("maxRunMinutes", s.maxRunMinutes, 15, 600, "Minutes")}<span class="meta">minutes</span></span></span></div>
      ${claudeRow()}
    </section></div>`;
}

export const CONTROL_ACTIONS = {
  "usage-weekly": () => saveSettings({ weeklyJobs: settings().weeklyJobs > 0 ? 0 : Math.max(settings().dailyJobs * 5, 20) }),
  "usage-preset": (el) => { const [, label, d, w] = PRESETS.find(([id]) => id === el.dataset.v); return saveSettings({ modelDaily: d, modelWeekly: w }, `${label}: saved.`); }
};
