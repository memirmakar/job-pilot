// Insights → Skill gaps: missing skills ranked by how many analyzed jobs ask for them (market.mjs computeStats, after the keyword
// audit), the to-do step that covers each, and skills your profile already has that the resume doesn't show.
// Bars: accent on chart-track for common gaps, chart-muted for minor ones, never by rank.
import { S } from "../../state.js";
import { esc } from "../../util.js";
import * as M from "./model.js";

const COMMON = 4;
const n = (v) => `<span class="jp-num">${v}</span>`;
const words = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, " ").split(/[^a-z0-9#+çğıöşü]+/).filter((w) => w.length > 1);

// The to-do step that covers a skill: its title or text names the skill (all its words)
function stepFor(skill, items) {
  const want = words(skill);
  if (!want.length) return null;
  const has = (t) => { const w = new Set(words(t)); return want.every((x) => w.has(x)); };
  return items.filter((i) => has(i.label) || has(i.do)).sort((a, b) => b.total - a.total)[0] || null;
}

export function gapsHtml() {
  const st = S.STATS, total = st?.scoredJobs || 0;
  const gaps = (st?.topMissingOverall || []).slice(0, 16);
  if (!total || !gaps.length) return `<div class="ins-empty-page"><p class="t-headline">No skill gaps yet</p>
    <p class="t-callout ins-muted">Once Claude has analyzed a few jobs, the skills they ask for and your resume doesn't show appear here.</p></div>`;
  const items = M.todoItems(), max = Math.max(...gaps.map((g) => g.count));
  const rows = gaps.map((g) => ({ ...g, step: stepFor(g.keyword, items) }));
  const starts = rows.filter((g) => g.step && !g.step.done && !g.step.hidden).filter((g, i, a) => a.findIndex((x) => x.step.id === g.step.id) === i).slice(0, 3);
  const have = st.onProfileNotResume || [];
  return `<div class="ins-bar">
      <p class="foot">Skills the postings ask for and your resume doesn't show, across the ${n(total)} jobs Claude analyzed. Locations, licenses and duties are left out.</p>
      <span class="foot ins-legend"><span><i class="ins-key"></i>Common: in ${n(COMMON)} or more</span><span><i class="ins-key ins-key--muted"></i>Minor: in ${n(COMMON - 1)} or fewer</span></span>
    </div>
    <div class="ins-grid ins-grid--gaps">
      <div class="jp-card gp-list">${rows.map((g) => `<div class="gp-row">
        <span class="gp-skill">${esc(g.keyword)}</span>
        <span class="ins-track ins-track--thin" role="img" aria-label="${esc(g.keyword)} missing in ${g.count} of ${total} jobs"><span class="${g.count >= COMMON ? "" : "is-muted"}" style="width: ${(g.count / max) * 100}%"></span></span>
        <span class="foot">missing in <span class="jp-num" style="color: var(--text)">${g.count}</span> of ${n(total)}</span>
        ${g.step ? `<button class="rowbtn foot jp-num gp-todo" type="button" data-action="ins-open-todo" data-id="${esc(g.step.id)}" data-hidden="${g.step.hidden ? 1 : 0}"
          aria-label="Open the to-do step for ${esc(g.keyword)}">${g.step.done ? "to-do done" : g.step.hidden ? "not in goals" : g.step.total ? `to-do +${g.step.total}` : "in to-do"}</button>` : `<span class="foot gp-todo">no step yet</span>`}
      </div>`).join("")}</div>
      <div class="gp-side">
        <section class="jp-card gp-start">
          <p class="cap ins-cap"><span class="jp-bar__mark ins-mark" aria-hidden="true"></span>Where to start</p>
          <p class="t-headline">${starts.length ? `${starts.length === 1 ? "One step covers" : `${starts.length} steps cover`} your most common gap${starts.length === 1 ? "" : "s"} with a step.` : "No to-do step matches these gaps yet."}</p>
          ${starts.map((g) => `<div class="gp-start__row"><span class="gp-start__text"><span class="gp-start__label">${esc(g.step.label)}</span>
            <span class="foot">${esc(g.keyword)} · missing in ${g.count} · ${esc(g.step.time)}${g.step.jobs.length ? ` · ${esc(M.ptsText(g.step))}` : ""}</span></span>
            <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="ins-open-todo" data-id="${esc(g.step.id)}" data-hidden="${g.step.hidden ? 1 : 0}">Open in to-do</button></div>`).join("")}
          <p class="foot">The right column shows what the matching to-do step adds across the jobs it lifts. A skill can be missing in more jobs than the step counts: steps only count the jobs where Claude suggested them.</p>
        </section>
        <section class="jp-card gp-have">
          <p class="jp-card__label">Add to your resume</p>
          ${have.length ? `<p class="foot">Your profile says you have these, but the resume Claude scored didn't show them. Not gaps: just write them in.</p>
            ${have.map((h) => `<div class="gp-have__row"><span>${esc(h.keyword)}</span><span class="foot">asked in ${n(h.count)}</span></div>`).join("")}`
          : `<p class="foot">Nothing to add: no job asked for a skill your profile has and your resume leaves out.</p>`}
        </section>
      </div>
    </div>`;
}
