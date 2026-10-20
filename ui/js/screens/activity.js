// Activity: every listing the tool looked at (applications.csv), newest first.
import { S } from "../state.js";
import { $, esc, fmtDate } from "../util.js";
import { pill } from "../legacy.js";
import { STATUS } from "../components/status-pill.js";

export function renderLog() {
  const statuses = ["all", ...new Set(S.LOG.map((r) => r.status))];
  const rows = S.LOG.filter((r) => S.filter === "all" || r.status === S.filter || !statuses.includes(S.filter));
  $("#view").innerHTML = `
    <div class="section-title" style="margin-top:0">Activity log <small>every listing the tool looked at, newest first</small></div>
    <div class="filters" style="margin-bottom:12px">${statuses.map((s) => `<button data-f="${s}" class="${s === S.filter ? "on" : ""}">${s === "all" ? "All" : (STATUS[s]?.[0] || s)} · ${s === "all" ? S.LOG.length : S.LOG.filter((r) => r.status === s).length}</button>`).join("")}</div>
    <div class="card" style="padding:0;overflow:auto"><table class="log"><thead><tr><th>When</th><th>Status</th><th>Job</th><th>Reason</th></tr></thead><tbody>
      ${rows.slice(0, 600).map((l) => `<tr><td style="white-space:nowrap" class="sub">${fmtDate(l.date)}</td><td>${pill(l.status)}</td>
        <td><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || "(title not captured)")}</a>${l.company ? `<div class="muted" style="font-size:12px">${esc(l.company)}</div>` : ""}</td>
        <td class="sub">${esc(l.reason)}</td></tr>`).join("")}</tbody></table></div>`;
}
