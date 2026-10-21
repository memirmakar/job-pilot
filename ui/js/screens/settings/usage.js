// Settings > Claude usage (board Settings-Usage): recorded usage per run and per kind of work (GET /api/usage), with
// costUsd always called an estimate (Claude Code's API-price figure; a subscription isn't billed per call), then the
// controls that work on a subscription (usage-controls.js).
import { S } from "../../state.js";
import { esc } from "../../util.js";
import { controlsHtml, CONTROL_ACTIONS } from "./usage-controls.js";

const usd = (n) => `$${(n || 0).toFixed(n >= 100 ? 0 : 2)}`;
const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const KIND = {
  jobs: ["Analyzing and tailoring", (n) => `${n} ${n === 1 ? "job" : "jobs"}: picking, scoring, tailoring and form answers`],
  coaching: ["Coaching", (n) => `${n} ${n === 1 ? "conversation" : "conversations"}: Guidance, Ask, check-ins and mock interviews`],
  reviews: ["Reviews", (n) => `${n} ${n === 1 ? "review" : "reviews"}: ready resumes, market review and the doctor`],
};
const SPLIT = { analyze: "scoring", tailor: "tailoring", answers: "form answers", select: "picking" };

function metric(label, value, foot) {
  return `<div class="jp-card st-metric"><span class="jp-card__label">${label}</span><span class="metric">${value}</span><span class="foot">${foot}</span></div>`;
}

// One bar per run, last 14; test runs and runs that stopped early in the muted tone (said in the foot, not by color alone)
function chart(runs) {
  const shown = runs.slice(-14), max = Math.max(...shown.map((r) => r.costUsd), 0.01);
  if (!shown.length) return `<p class="foot">No finished runs in the last 30 days.</p>`;
  const label = (r) => `${day(r.at)}: ${usd(r.costUsd)} estimated, ${r.jobs} ${r.jobs === 1 ? "job" : "jobs"} analyzed${r.dryRun ? ", test run" : ""}${r.stopKind ? ", stopped early" : ""}`;
  return `<div class="st-bars" role="img" aria-label="Estimated usage per run. ${esc(shown.map(label).join("; "))}" style="--n:${shown.length}">
    ${shown.map((r, i) => `<span class="st-bar" data-tip="${esc(label(r))}">
      <span class="jp-num st-bar__val${i === shown.length - 1 ? " st-bar__val--last" : ""}">${(r.costUsd || 0).toFixed(2)}</span>
      <span class="st-bar__track"><span class="st-bar__fill${r.dryRun || r.stopKind ? " st-bar__fill--muted" : ""}" style="height:${Math.max(2, Math.round((r.costUsd / max) * 100))}%"></span></span>
      <span class="jp-num st-bar__day">${new Date(r.at).getDate()}</span><span class="foot jp-num">${r.jobs}</span></span>`).join("")}</div>
    <p class="foot">Estimated dollars above, day of the month and jobs analyzed below. Lighter bars are test runs or runs that stopped early.</p>`;
}

export function usageHtml() {
  const u = S.set.usage;
  const head = `<div class="st-head"><div class="st-head__text"><h2 class="t-title2">Claude usage</h2>
    <p class="meta">${u?.runs ? `Last ${u.days} days · <span class="jp-num">${u.runs.length}</span> ${u.runs.length === 1 ? "run" : "runs"} · ` : ""}from your Claude Code subscription</p></div></div>`;
  if (!u || u === "loading") return head + `<p class="meta">Adding up your usage…</p>` + controlsHtml();
  if (u.error) return head + `<p class="t-callout">Couldn't read your usage: ${esc(u.error)}</p>` + controlsHtml();
  const real = u.runs.filter((r) => !r.dryRun), jobs = real.reduce((a, r) => a + r.jobs, 0), runCost = real.reduce((a, r) => a + r.costUsd, 0);
  return `${head}
    <div class="st-metrics">
      ${metric("Last 30 days, estimated", usd(u.totalUsd), "What these calls would cost on the API. Your plan isn't billed per call.")}
      ${metric("Per run, average", real.length ? usd(runCost / real.length) : "–", `${real.length} ${real.length === 1 ? "run" : "runs"}, test runs left out`)}
      ${metric("Per job analyzed", jobs ? usd(runCost / jobs) : "–", "Scoring, tailoring and answering one job")}
    </div>
    <div class="st-two st-two--usage">
      <section class="jp-card st-runs" aria-labelledby="st-per-run"><div class="st-runs__head"><h3 id="st-per-run" class="jp-card__label">Each run</h3><span class="foot">Bigger runs read more jobs</span></div>${chart(u.runs)}</section>
      <section class="jp-list" aria-label="By kind of work">${u.kinds.map((k) => {
        const parts = Object.entries(k.split || {}).filter(([, v]) => v > 0.005);
        return `<div class="st-row"><span class="st-row__text"><span class="st-row__label">${KIND[k.id][0]}</span><span class="foot">${KIND[k.id][1](k.n)}</span>
          ${parts.length ? `<span class="foot">Since runs record it: ${parts.map(([p, v]) => `${SPLIT[p] || p} ${usd(v)}`).join(", ")}</span>` : ""}</span>
          <span class="data st-strong">${usd(k.costUsd)}</span></div>`; }).join("")}
        <p class="foot st-pad">Estimates from Claude Code. What actually limits you is your plan's own usage allowance, not these dollars.</p></section>
    </div>
    ${controlsHtml()}`;
}

export const USAGE_ACTIONS = { ...CONTROL_ACTIONS };
