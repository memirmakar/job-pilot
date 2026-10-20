// Jobs: the list of analyzed jobs with search, status filters and archived toggle; the detail is in job-detail.js.
import { S } from "../state.js";
import { detailHtml } from "./job-detail.js";
import { $, esc, fmtDate, ago } from "../util.js";
import { finalScore, pill } from "../legacy.js";
import { STATUS } from "../components/status-pill.js";

export function renderApps() {
  const pool = S.DATA.filter((r) => S.showArchived ? r.archived : !r.archived);
  const statuses = ["all", ...new Set(pool.map((r) => r.status))];
  if (!statuses.includes(S.filter)) S.filter = "all";
  const rows = pool.filter((r) => (S.filter === "all" || r.status === S.filter) && `${r.title} ${r.company} ${r.field || ""}`.toLowerCase().includes(S.query.toLowerCase()));
  if (!rows.some((r) => r.site + r.id === S.selected)) S.selected = rows[0] ? rows[0].site + rows[0].id : null;
  const archivedCount = S.DATA.filter((r) => r.archived).length;
  $("#view").innerHTML = `<div class="apps">
    <div class="card list">
      <div class="tools"><input class="search" id="q" placeholder="Search title, company or field" value="${esc(S.query)}">
        <div class="filters">${statuses.map((s) => `<button data-f="${s}" class="${s === S.filter ? "on" : ""}">${s === "all" ? "All" : (STATUS[s]?.[0] || s)} · ${s === "all" ? pool.length : pool.filter((r) => r.status === s).length}</button>`).join("")}</div>
        <label class="check"><input type="checkbox" data-action="toggle-archived" ${S.showArchived ? "checked" : ""}> Show archived (closed) listings · ${archivedCount}</label></div>
      <div class="items">${rows.map((r) => `
        <div class="item ${r.site + r.id === S.selected ? "sel" : ""}" data-k="${esc(r.site + r.id)}">
          <div class="t">${esc(r.title)}</div>
          <div class="sc">${finalScore(r) ?? "–"}<small>${r.tailored?.used ? `from ${r.tailored.baseScore}` : "ATS"}</small></div>
          <div class="c">${esc(r.company)} · ${pill(r.status)}${r.postedAt ? ` · <span data-tip="Posted ${esc(fmtDate(r.postedAt))}">${ago(r.postedAt)}</span>` : ""}${r.archived ? " · archived" : ""}</div>
        </div>`).join("") || `<div class="empty">${S.showArchived ? "No archived listings" : "Nothing here yet"}</div>`}</div>
    </div>
    <div id="detail">${detailHtml(S.DATA.find((r) => r.site + r.id === S.selected))}</div>
  </div>`;
}
