// List row (jp-row) inside a grouped list (jp-list). Rows are real buttons; the selected one gets aria-current.
import { esc } from "../util.js";

// title: text; meta: HTML; end: HTML (score, pill); lead: HTML before the text (e.g. a score ring); attrs: extra attributes (trusted)
export const listRow = ({ title, meta = "", end = "", lead = "", selected = false, attrs = "" }) => `
  <button class="jp-row rowbtn" type="button" ${selected ? 'aria-current="true"' : ""} ${attrs}
    style="${lead ? "grid-template-columns: auto minmax(0, 1fr) auto;" : ""}">
    ${lead ? `<span style="grid-row: span 2">${lead}</span>` : ""}
    <span class="jp-row__title">${esc(title)}</span>
    ${end ? `<span class="jp-row__end">${end}</span>` : ""}
    <span class="jp-row__meta">${meta}</span>
  </button>`;

export const list = (rows, label = "") => `<div class="jp-list" role="list"${label ? ` aria-label="${esc(label)}"` : ""}>${rows.join("")}</div>`;
