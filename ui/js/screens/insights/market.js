// Insights → Job market: listings by field and city, remote share, applicants per posting, how fast postings fill and the
// companies that keep hiring, from your records, the activity log and one snapshot per run (insights.mjs, market_snapshot.mjs).
// Trends need a few snapshots; until then the cards say when they start.
import { S } from "../../state.js";
import { esc } from "../../util.js";
import { statusPill } from "../../components/status-pill.js";
import { shown } from "../jobs/track.js";
import * as M from "./model.js";

const TREND_MIN = 3;
const n = (v) => `<span class="jp-num">${v}</span>`;
const low = (text) => `<span class="foot ins-low">Not enough data yet${text ? `. ${esc(text)}` : ""}</span>`;
const norm = (s) => String(s || "").normalize("NFKD").replace(/\p{M}/gu, "").replace(/ı/g, "i").toLowerCase();

function trend(mk, field) {
  const pts = mk.snapshots.map((s) => s.fields[field] || 0), hi = Math.max(1, ...pts);
  const line = pts.map((v, i) => `${((i * 240) / Math.max(1, pts.length - 1)).toFixed(1)},${(76 - (v / hi) * 70).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 240 80" preserveAspectRatio="none" role="img" aria-label="${esc(field)}: listings per run, from ${pts[0]} to ${pts.at(-1)}" class="mk-spark">
    <line x1="0" y1="76" x2="240" y2="76"></line><polyline points="${line}" vector-effect="non-scaling-stroke"></polyline></svg>
    <span class="foot mk-spark__axis"><span>${M.monthDay(mk.snapshots[0].at)}</span><span>${M.monthDay(mk.snapshots.at(-1).at)}</span></span>`;
}

function fieldsCard(mk) {
  const fields = [...M.goalFields(), "Other"], max = Math.max(1, ...fields.map((f) => mk.byField[f] || 0));
  const ready = mk.snapshots.length >= TREND_MIN;
  return `<section class="jp-card mk-fields">
    <div class="ins-card-head"><p class="jp-card__label">Listings by field</p>
      <span class="foot">${ready ? `Per run · ${M.plural(mk.snapshots.length, "run")}` : `Trend starts building from ${mk.snapshots[0] ? M.monthDay(mk.snapshots[0].at) : "your next run"}`}</span></div>
    ${ready ? `<div class="mk-trends">${M.goalFields().map((f) => `<div class="mk-trend"><span class="mk-trend__label">${esc(f)}</span>
        <span class="mk-trend__now"><span class="metric">${mk.snapshots.at(-1).fields[f] || 0}</span><span class="foot">last run</span></span>${trend(mk, f)}</div>`).join("")}</div>`
    : fields.map((f) => { const v = mk.byField[f] || 0; return `<div class="mk-bar"><span class="meta mk-bar__label ellip" style="color: var(--text)">${esc(f)}</span>
        <span class="ins-track ins-track--thin" aria-hidden="true"><span class="${f === "Other" ? "is-muted" : ""}" style="width: ${(v / max) * 100}%"></span></span>
        <span class="data mk-bar__n">${v}</span></div>`; }).join("")}
    ${ready ? "" : `<p class="foot ins-card-foot">All ${n(mk.seen)} listings the app has seen so far. Each run now saves a snapshot, so this becomes a trend after ${TREND_MIN} runs.</p>`}
  </section>`;
}

function companiesCard(mk) {
  const map = M.byKey();
  return `<section class="jp-list mk-companies">
    <div class="ins-card-head mk-pad"><p class="jp-card__label">Companies that keep hiring</p><span class="foot">2 or more listings in your fields</span></div>
    ${mk.companies.length ? mk.companies.map((c) => { const r = c.job && map.get(c.job); return `<div class="mk-co">
      <span class="mk-co__name ellip">${esc(c.name)}</span>
      <span class="meta ellip">${esc(c.field)}${c.city ? ` · ${esc(c.city)}` : ""}</span>
      <span class="meta"><span class="data" style="color: var(--text)">${c.n}</span> listings</span>
      <span class="mk-co__status">${r ? `${statusPill(shown(r).key)}<button class="rowbtn foot ellip" type="button" data-action="ins-open-job" data-k="${esc(c.job)}">${esc(r.title)}</button>` : `<span class="foot">Not analyzed</span>`}</span>
    </div>`; }).join("") : `<p class="foot mk-pad">No company has posted twice in your fields yet.</p>`}
  </section>`;
}

function citiesCard(mk) {
  const goals = [...(S.STATE?.profile?.locations || []), ...(S.STATE?.profile?.workplace?.includes("remote") ? ["remote"] : [])].map(norm);
  const inGoals = (c) => goals.some((g) => g.includes(norm(c)) || norm(c).includes(g.split(",")[0].trim()));
  const list = Object.entries(mk.cities).sort((a, b) => b[1] - a[1]).slice(0, 7), max = Math.max(1, ...list.map((x) => x[1]));
  return `<section class="jp-card mk-cities">
    <div class="ins-card-head"><p class="jp-card__label">By city</p><span class="foot ins-legend"><span><i class="ins-key"></i>In your goals</span></span></div>
    ${list.map(([c, v]) => `<div class="mk-bar mk-bar--city"><span class="meta mk-bar__label ellip" style="color: var(--text)">${esc(c)}</span>
      <span class="ins-track ins-track--thin" aria-hidden="true"><span class="${inGoals(c) ? "" : "is-muted"}" style="width: ${(v / max) * 100}%"></span></span>
      <span class="data mk-bar__n">${v}</span></div>`).join("")}
    ${mk.citiesFrom === "records" ? `<p class="foot ins-card-foot">${mk.citiesOf < 10 ? `Only ${M.plural(mk.citiesOf, "analyzed job")} saved a location so far. ` : ""}From the next run, this counts every listing your searches return.</p>`
      : `<p class="foot ins-card-foot">The ${n(mk.citiesOf)} listings of your last run's searches</p>`}
  </section>`;
}

function stats(mk) {
  const rem = mk.remote, ap = mk.applicants, fill = mk.fill;
  return `<section class="jp-list mk-stats">
    <div class="mk-stat"><p class="jp-card__label">Remote roles</p>
      ${rem.of >= 10 ? `<span class="mk-stat__line"><span class="metric mk-metric">${Math.round((rem.n / rem.of) * 100)}%</span><span class="meta">${rem.n} of ${rem.of} ${rem.from === "search" ? "listings, last run" : "analyzed jobs"}</span></span>` : low(rem.from === "records" ? "Each run's search counts this from now on." : "")}</div>
    <div class="mk-stat"><p class="jp-card__label">Applicants per posting, median</p>
      ${ap.n >= 5 ? `<span class="mk-stat__line"><span class="metric mk-metric">${ap.median}${ap.plus && ap.median >= 100 ? "+" : ""}</span><span class="meta">Easy Apply · ${M.plural(ap.n, "posting")}</span></span>`
        : low(`${M.plural(ap.n, "posting")} so far showed applicants${ap.n ? `: median ${ap.median}${ap.plus && ap.median >= 100 ? "+" : ""}` : ""}`)}
      ${ap.externalN ? `<span class="foot">External: ${n(ap.externalClicks)} clicked Apply, median of ${ap.externalN}</span>` : ""}</div>
    <div class="mk-stat"><p class="jp-card__label">How fast postings fill</p>
      ${fill.n >= 5 ? `<span class="mk-stat__line"><span class="metric mk-metric">${fill.median}</span><span class="meta">days open, median of ${fill.n}</span></span>`
        : low(`From posting until LinkedIn closed it; ${M.plural(fill.n, "closed posting")} so far`)}</div>
  </section>`;
}

export function marketHtml() {
  const mk = S.INS.market;
  if (!mk.seen) return `<div class="ins-empty-page"><p class="t-headline">No listings yet</p><p class="t-callout ins-muted">After your first run, what LinkedIn returns for your searches shows up here.</p></div>`;
  return `<div class="ins-bar"><p class="foot">From the ${n(mk.seen)} listings your LinkedIn searches returned that the app recorded, ${M.monthDay(mk.from)} – ${M.monthDay(mk.to)}</p></div>
    <div class="ins-grid ins-grid--market">
      <div class="ins-col">${fieldsCard(mk)}${companiesCard(mk)}</div>
      <div class="ins-col">${citiesCard(mk)}${stats(mk)}</div>
    </div>`;
}
