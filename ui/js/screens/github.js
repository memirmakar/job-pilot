// GitHub review (now under Insights): Claude's verdict on each repo.
import { S } from "../state.js";
import { $, esc, md, rich, fmtDate } from "../util.js";
import { VERDICT, verdict, chips } from "../legacy.js";

export function renderGithub() {
  const order = { real_value: 0, moderate: 1, ats_padding: 2, not_relevant: 3 };
  const repos = [...(S.GH?.repos || [])].sort((a, b) => (order[a.review?.verdict] ?? 9) - (order[b.review?.verdict] ?? 9));
  const counts = repos.reduce((m, r) => ((m[r.review?.verdict] = (m[r.review?.verdict] || 0) + 1), m), {});
  $("#view").innerHTML = `
    <div class="section-title" style="margin-top:0">GitHub review <small>${esc(S.GH?.user || "no user set")}${S.GH?.fetchedAt ? " · fetched " + fmtDate(S.GH.fetchedAt) : ""} · refreshes every 4 days · <code>node apply.mjs github --refresh</code></small></div>
    <div class="grid g4">${Object.keys(VERDICT).map((v) => `<div class="card tile"><div class="v">${counts[v] || 0}</div><div class="l">${verdict(v)}</div></div>`).join("")}</div>
    <div class="stack" style="margin-top:16px">${repos.map((r) => { const v = r.review || {}; return `
      <div class="card"><div class="repo-head"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>${v.verdict ? verdict(v.verdict) : ""}
        <span class="tag">${r.commits} commits</span><span class="tag">${r.fileCount} files</span><span class="tag">${esc(Object.keys(r.languages).join(", ") || "no code")}</span></div>
        <div class="grid g2" style="margin-top:12px">
          <div><div class="muted" style="font-size:12px;margin-bottom:4px">WHAT IT IS</div>${rich(v.summary)}
            ${v.skills_demonstrated?.length ? `<div class="muted" style="font-size:12px;margin:10px 0 4px">SKILLS IT SHOWS</div>${chips(v.skills_demonstrated, "y", 12)}` : ""}</div>
          <div><div class="muted" style="font-size:12px;margin-bottom:4px">CRITIQUE</div>${rich(v.critique)}</div></div>
        <div style="margin-top:12px"><div class="muted" style="font-size:12px;margin-bottom:4px">TO MAKE IT VALUABLE</div>${rich(v.to_make_it_valuable)}</div>
        ${v.resume_line ? `<div class="callout info" style="margin-top:12px"><div class="ico">✎</div><div><b>Resume line:</b> ${md(v.resume_line)}</div></div>` : ""}
      </div>`; }).join("") || `<div class="card empty">No repos yet. Run <code>node apply.mjs github</code></div>`}</div>`;
}
