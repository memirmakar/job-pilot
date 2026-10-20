// Guidance, left column (canvas board Guidance): the pinned weekly check-in, conversations about a job (with its score),
// and general ones. New conversation starts an empty one; it's saved with its first message.
import { S } from "../../state.js";
import { esc, icon } from "../../util.js";
import * as M from "./model.js";

function row(c) {
  const lead = c.isJob
    ? `<span class="gd-badge jp-num" role="img" aria-label="Score ${c.score ?? "unknown"}">${c.score ?? "–"}</span>`
    : `<span class="gd-badge" aria-hidden="true">${icon(c.kind === "weekly" ? "clock" : "chat")}</span>`;
  return `<button class="jp-row rowbtn gd-row" type="button" data-action="g-select" data-cid="${esc(c.cid)}" aria-current="${c.current}">
    ${lead}
    <span class="gd-row__text">
      <span class="jp-row__title gd-row__title">${esc(c.title)}</span>
      <span class="foot ellip">${esc(c.sub || "")}</span>
      ${c.badge ? `<span class="jp-pill jp-pill--accent gd-row__badge">${esc(c.badge)}</span>` : ""}
    </span>
  </button>`;
}

export function listHtml() {
  const q = (S.g.query || "").trim().toLocaleLowerCase();
  const gs = M.groups().map((g) => ({ ...g, items: g.items.filter((c) => !q || `${c.title} ${c.sub}`.toLocaleLowerCase().includes(q)) })).filter((g) => g.items.length);
  return `<nav class="gd-list" aria-label="Conversations">
    <div class="gd-list__head">
      <h1 class="t-title1">Guidance</h1>
      <button class="jp-btn jp-btn--tinted jp-btn--sm btn-icon" type="button" data-action="g-new" aria-label="New conversation">${icon("plus")}</button>
    </div>
    <label class="search"><span class="sr-only">Search conversations</span>${icon("search")}
      <input class="jp-input" id="g-q" type="search" placeholder="Search conversations" value="${esc(S.g.query || "")}" autocomplete="off"></label>
    <div class="jp-list gd-list__box" id="g-list-scroll">
      ${S.g.list ? "" : `<p class="foot gd-list__empty">Loading conversations…</p>`}
      ${gs.map((g) => `<p class="cap gd-group">${esc(g.label)}</p>${g.items.map(row).join("")}`).join("")}
      ${S.g.list && !gs.length ? `<p class="foot gd-list__empty">No conversation matches “${esc(S.g.query)}”.</p>` : ""}
    </div>
  </nav>`;
}
