// Insights → GitHub: your public repos ranked by relevance to your target fields, each with Claude's review and specific fixes,
// and which to pin. Reviews from before relevance and pins existed fall back to the verdict until you refresh.
import { S, isBusy } from "../../state.js";
import { esc, md, rich, fmtDate, icon } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import * as M from "./model.js";

const VERDICT = { real_value: ["Real value", "success", 75], moderate: ["Moderate", "warning", 50], ats_padding: ["Keywords only", "serious", 25], not_relevant: ["Not relevant", "neutral", 5] };
const PIN = { pin: ["Pin it", "accent"], maybe: ["Optional", "neutral"], dont: ["Don't pin", "warning"] };
const plain = (s) => String(s || "").replace(/\*\*/g, "").replace(/^\s*-\s*/gm, "").trim();

function repoView(r) {
  const v = r.review || {}, rated = v.relevance != null;
  const rel = rated ? v.relevance : VERDICT[v.verdict]?.[2] ?? 0;
  const pin = v.pin || (v.verdict === "real_value" ? "pin" : v.verdict === "moderate" ? "maybe" : "dont");
  const fixes = v.fixes?.length ? v.fixes : plain(v.to_make_it_valuable).split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean).slice(0, 2);
  return { r, v, rel, rated, pin, fixes, langs: Object.keys(r.languages || {}).slice(0, 2).join(" · ") || "No code" };
}

function row(x, i) {
  const { r, v } = x;
  return `<div class="gh-row">
    <span class="td-rank jp-num" aria-hidden="true">${i + 1}</span>
    <span class="gh-row__id">
      <a class="gh-row__name ellip" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
      <span class="foot">${esc(x.langs)} · ${esc(v.field || "field not rated yet")}</span>
      <span class="gh-row__rel">
        <span class="ins-track ins-track--thin gh-rel" role="img" aria-label="Relevance ${x.rel} of 100${x.rated ? "" : ", estimated from the verdict"}"><span class="${x.rel >= 50 ? "" : "is-muted"}" style="width: ${x.rel}%"></span></span>
        <span class="foot jp-num">${x.rel}${x.rated ? "" : "*"}</span>${pill(PIN[x.pin][0], PIN[x.pin][1])}
      </span>
    </span>
    <div class="gh-row__body">
      ${x.fixes.length ? `<ul class="t-callout gh-fixes">${x.fixes.map((f) => `<li>${md(f)}</li>`).join("")}</ul>` : `<p class="foot">No fixes suggested.</p>`}
      ${v.verdict ? `<details class="gh-review"><summary class="meta">Claude's review · ${esc(VERDICT[v.verdict]?.[0] || v.verdict)}</summary>
        <div class="gh-review__body">${rich(v.summary)}${v.critique ? `<p class="jp-card__label">Critique</p>${rich(v.critique)}` : ""}
        ${v.resume_line ? `<p class="jp-card__label">Resume line</p><p class="t-callout">${md(v.resume_line)}</p>` : ""}</div></details>` : `<p class="foot">Not reviewed yet.</p>`}
    </div>
  </div>`;
}

export function githubHtml() {
  const gh = S.GH || {}, user = gh.user;
  const refreshing = S.STATE?.tasks?.github?.running;
  const refresh = `<button class="jp-btn jp-btn--sm" type="button" data-action="task" data-task="github" ${refreshing || isBusy() ? "disabled" : ""}>${refreshing ? "Refreshing…" : "Refresh review"}</button>`;
  if (!user) return `<div class="ins-empty-page"><p class="t-headline">No GitHub account set</p>
    <p class="t-callout ins-muted">Add your GitHub username in Settings, and Claude reviews your public repos for the jobs you want.</p>
    <a class="jp-btn jp-btn--sm" href="#settings" data-nav="settings">Open Settings</a></div>`;
  const list = (gh.repos || []).map(repoView).sort((a, b) => b.rel - a.rel || (b.r.commits || 0) - (a.r.commits || 0));
  if (!list.length) return `<div class="ins-empty-page"><p class="t-headline">No public repos found for ${esc(user)}</p><p class="t-callout ins-muted">Refresh after you publish one.</p>${refresh}</div>`;
  const pins = list.filter((x) => x.pin === "pin").slice(0, 6), off = list.filter((x) => x.pin === "dont");
  const unrated = list.some((x) => !x.rated);
  const reviewed = list.map((x) => x.v.reviewedAt).filter(Boolean).sort().at(-1);
  return `<div class="ins-bar">
      <p class="foot">Your ${M.plural(list.length, "public repo")} ranked by relevance to ${esc(M.goalFields().join(", ").toLowerCase() || "your target fields")}${reviewed ? ` · reviewed ${esc(fmtDate(reviewed))}` : ""}</p>
      <span class="ins-bar__tools">${refresh}<a class="jp-btn jp-btn--plain jp-btn--sm" href="https://github.com/${encodeURIComponent(user)}" target="_blank" rel="noopener">Edit pins on GitHub${icon("external", "ico ico--14")}</a></span>
    </div>
    ${unrated ? `<div class="jp-callout" role="status"><span class="jp-callout__icon" aria-hidden="true">i</span><span>Scores marked * are estimated from Claude's verdict. Refresh the review to have Claude rate each repo for your fields, suggest fixes and plan your pins.</span></div>` : ""}
    <div class="ins-grid ins-grid--github">
      <div class="jp-list gh-list">${list.map(row).join("")}</div>
      <section class="jp-card gh-pins">
        <p class="cap ins-cap"><span class="jp-bar__mark ins-mark" aria-hidden="true"></span>Pin plan</p>
        <p class="t-headline">${pins.length ? `Pin ${pins.length === 1 ? "this repo" : `these ${pins.length}`} on your profile.` : "Nothing is strong enough to pin yet."}</p>
        ${pins.length ? `<div><p class="jp-card__label">Pinned after</p>${pins.map((x) => `<span class="gh-pin"><span class="ellip gh-pin__name">${esc(x.r.name)}</span><span class="foot">${esc(x.v.field || VERDICT[x.v.verdict]?.[0] || "")}</span></span>`).join("")}</div>` : ""}
        ${off.length ? `<p class="foot">Leave ${off.map((x) => esc(x.r.name)).join(", ")} off your pins. ${off.length === 1 ? "It" : "They"} can stay public.</p>` : ""}
        <p class="foot">GitHub doesn't tell the app which repos you've pinned, so this is the plan, not a comparison.</p>
      </section>
    </div>`;
}
