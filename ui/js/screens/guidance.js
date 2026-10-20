// Guidance: Claude as a coach (weekly check-in, mock interview). New in Stage 5; until then a pointer to what exists.
import { card, callout } from "../components/card.js";
import { $ } from "../util.js";

export function renderGuidance() {
  $("#view").innerHTML = `<div class="placeholder">
    <h1 class="t-large">Guidance</h1>
    ${card({ label: "Coming in a later stage", title: "Coaching from Claude",
      body: `<p class="t-callout" style="color:var(--text-secondary)">Weekly check-ins and mock interviews will live here. Until then, Claude's advice is in
        Insights: the market review and your prioritized to-do list.</p>
        <p style="margin:var(--space-4) 0 0"><a class="jp-btn jp-btn--tinted" href="#insights" data-nav="insights">Open Insights</a></p>` })}
    ${callout("Each job's own detail still explains how to raise your chances for that job.")}
  </div>`;
}
