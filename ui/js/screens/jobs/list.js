// Jobs list (canvas board Main, A-Group): title and run numbers, Grouped by menu, search, status filter, grouped rows, archive footer.
import { S } from "../../state.js";
import { esc, icon } from "../../util.js";
import { scoreRing } from "../../components/score-ring.js";
import { statusPill } from "../../components/status-pill.js";
import { tag } from "../../components/tag.js";
import * as M from "./model.js";
import { shown, waitingCount } from "./track.js";
import { problemLine, problemCallout } from "./problems.js";

// The jobs the list shows, in display order (used for selection and arrow keys too)
export function visibleGroups() {
  const pool = S.DATA.filter((r) => S.showArchived ? r.archived : !r.archived);
  const rows = pool.filter((r) => M.matchesFilter(r, S.filter) && M.matchesQuery(r, S.query));
  return M.group(rows, S.groupBy);
}

function numbers() {
  const p = problemLine();
  if (p) return `<p class="meta">${p}</p>`;
  const n = M.runNumbers();
  if (!n) return `<p class="meta">No runs yet</p>`;
  const v = (x) => `<span class="data" style="color:var(--text)">${x}</span>`;
  return `<p class="meta">${esc(n.when)} ${v(n.analyzed)} analyzed · ${v(n.applied)} applied · ${v(n.external)} ready to apply externally</p>`;
}

function groupMenu() {
  const label = { day: "day analyzed", score: "score", field: "field" }[S.groupBy];
  return `<div class="group-wrap">
    <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="group-menu" aria-haspopup="menu" aria-expanded="${S.groupMenu}" aria-controls="group-menu">
      Grouped by ${label}${icon("down", "ico ico--14")}</button>
    ${S.groupMenu ? `<div class="menu" id="group-menu" role="menu" aria-label="Group jobs by">
      <p class="cap">Group by</p>
      ${M.GROUPS.map(([id, l, hint]) => `<button class="navbtn navbtn--tall" type="button" role="menuitemradio" aria-checked="${id === S.groupBy}" data-action="group-by" data-v="${id}">
        <span class="menu-check">${id === S.groupBy ? icon("check") : ""}</span>
        <span class="menu-text"><span>${esc(l)}</span><span class="foot">${esc(hint)}</span></span></button>`).join("")}
    </div>` : ""}</div>`;
}

function row(r) {
  const k = M.keyOf(r), s = M.scores(r), type = M.applyType(r), when = S.groupBy === "day" ? M.time(r.createdAt) : M.shortDay(r.createdAt);
  const where = [r.company, r.location].filter(Boolean).join(" · ");
  return `<button class="jp-row rowbtn job-row" type="button" role="listitem" data-action="job-select" data-k="${esc(k)}"${k === S.selected ? ' aria-current="true"' : ""}>
    <span class="job-row__score">${scoreRing(s.score, { target: M.target(), cutoff: M.cutoff(), size: "sm" })}
      <span class="jp-num job-row__from">${esc(M.fromLabel(r))}</span></span>
    <span class="job-row__body">
      <span class="job-row__top"><span class="jp-row__title">${esc(r.title)}</span>
        <span class="foot jp-num" aria-label="Analyzed ${esc(M.at(r.createdAt))}">${esc(when)}</span></span>
      <span class="meta ellip">${esc(where)}</span>
      <span class="job-row__tags">${statusPill(shown(r).key, shown(r).label)}${type ? tag(type) : ""}<span class="foot ellip">${esc(M.postedLine(r).replace(/^Posted /, ""))}</span></span>
    </span></button>`;
}

// To apply carries the number waiting for your OK
function filterCount(id) {
  const l = M.FILTERS.find((f) => f[0] === id)[1], n = id === "todo" && !S.showArchived ? waitingCount() : 0;
  return n ? ` aria-label="${l}, ${n} waiting for your OK" title="${n} waiting for your OK">${l} <span class="jp-num seg-count">${n}</span>` : `>${l}`;
}

export function listHtml() {
  const groups = visibleGroups();
  const archived = S.DATA.filter((r) => r.archived).length;
  const empty = S.showArchived ? ["No archived jobs", "Jobs you archive, and listings that close, show up here."]
    : S.DATA.length ? ["No jobs match this filter", "Try All, or another search."] : ["No jobs yet", S.RUNS?.length ? "Jobs appear here as Claude reads them on each run." : "Jobs appear here as Claude reads them on its first run."];
  return `<section class="jobs-list" aria-label="Jobs">
    <div class="jobs-list__head">
      <div class="jobs-list__title"><h1 class="t-large">${S.showArchived ? "Archived" : "Jobs"}</h1>${groupMenu()}</div>
      ${numbers()}
    </div>
    ${S.showArchived ? "" : problemCallout()}
    <label class="search"><span class="sr-only">Search jobs</span>${icon("search")}
      <input class="jp-input" id="q" type="search" placeholder="Search title, company, skill" value="${esc(S.query)}" autocomplete="off"></label>
    <div class="jp-seg jobs-filter" role="tablist" aria-label="Filter by status">
      ${M.FILTERS.map(([id, l]) => `<button class="jp-seg__item" type="button" role="tab" aria-selected="${id === S.filter}" aria-controls="job-scroll" data-action="job-filter" data-v="${id}"${filterCount(id)}</button>`).join("")}
    </div>
    <div class="jp-list jobs-list__box">
      <div class="jobs-list__scroll" role="list" aria-label="${S.showArchived ? "Archived jobs" : "Tracked jobs"}" id="job-scroll">
        ${groups.map((g) => `<div class="jobs-group" role="presentation"><span class="cap">${esc(g.label)}</span><span class="cap jp-num">${g.jobs.length}</span></div>
          ${g.jobs.map(row).join("")}`).join("")}
        ${groups.length ? "" : `<div class="jobs-empty"><p class="meta" style="color:var(--text)">${empty[0]}</p><p class="foot">${empty[1]}</p></div>`}
      </div>
      <div class="jobs-list__foot"${S.DATA.length ? "" : " hidden"}>
        <span class="foot">${S.showArchived ? "Archived jobs are kept with everything Claude saved" : "Closed listings are kept, never deleted"}</span>
        <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="show-archived" aria-pressed="${S.showArchived}">
          ${icon("archive", "ico ico--14")}${S.showArchived ? "Back to jobs" : `Show archived <span class="jp-num">${archived}</span>`}</button>
      </div>
    </div>
  </section>`;
}
