// One job's detail: score, status, actions, resume match, tailored resume, recommendations, GitHub fit, Q&A, description.
import { esc, md, rich, fmtDate, ago, pdfUrl } from "../util.js";
import { usd, finalScore, pill, verdict, chips, gauge, hbars, KIND, splitMissing } from "../legacy.js";

export function detailHtml(r) {
  if (!r) return `<div class="card empty">Select an application</div>`;
  const resumes = [...(r.ats?.resumes || [])].sort((a, b) => b.ats_score - a.ats_score);
  const fields = (r.steps || []).flatMap((s) => s.fields);
  const claudeFields = fields.filter((f) => f.source === "claude");
  return `<div class="stack">
    <div class="card"><div class="head">${gauge(finalScore(r))}
      <div style="min-width:0"><h2>${esc(r.title)}</h2>
        <div class="who">${esc(r.company)}${r.location ? " · " + esc(r.location) : ""}</div>
        <div class="row">${pill(r.status)}${r.archived ? `<span class="pill p-neutral">Archived</span>` : ""}
          ${r.easyApply === false ? `<span class="pill p-accent">External application</span>` : r.easyApply ? `<span class="pill p-neutral">Easy Apply</span>` : ""}
          ${r.tailored?.used ? `<span class="pill p-accent">Tailored ${r.tailored.baseScore} → ${r.tailored.score}</span>` : ""}
          ${r.field ? `<span class="tag">${esc(r.field)}</span>` : ""}</div>
        <div class="row">
          ${r.postedAt ? `<span class="tag" data-tip="${esc(r.postedText || "")}">Posted ${esc(fmtDate(r.postedAt).split(",")[0])} (${ago(r.postedAt)})</span>` : r.postedText ? `<span class="tag">${esc(r.postedText)}</span>` : ""}
          ${r.applicants ? `<span class="tag">${esc(r.applicants)}</span>` : ""}
          <span class="tag">${r.submittedAt ? "Applied" : "Analyzed"} ${fmtDate(r.submittedAt || r.createdAt)}</span><span class="tag">usage $${usd(r.usage).toFixed(2)}</span></div>
        ${r.statusReason ? `<div class="sub" style="margin-top:6px">${esc(r.statusReason)}</div>` : ""}
        <div class="btns" style="margin-top:10px">
          ${r.externalUrl ? `<a class="btn sm primary" href="${esc(r.externalUrl)}" target="_blank" rel="noopener">Apply on company site ↗</a>` : ""}
          <a class="btn sm" href="${esc(r.url)}" target="_blank" rel="noopener">Open on LinkedIn ↗</a>
          ${r.tailored?.path ? `<a class="btn sm ${["external", "ready_to_apply", "resume_insufficient"].includes(r.status) ? "primary" : ""}" href="${pdfUrl(r.tailored.used ? r.tailored.path : (r.tailored.basePath || "resumes/" + r.tailored.baseFile))}&dl=1">Download the resume to send</a>` : ""}
          <button class="btn sm" data-action="archive" data-site="${esc(r.site)}" data-id="${esc(r.id)}" data-v="${r.archived ? "" : "1"}">${r.archived ? "Unarchive" : "Archive"}</button>
        </div></div></div></div>

    ${r.archived ? `<div class="callout info"><div class="ico">🗄</div><div><b>Archived ${fmtDate(r.archived.at)}</b>: ${esc(r.archived.reason)}. Everything below is kept.</div></div>` : ""}
    ${["external", "ready_to_apply"].includes(r.status) && !r.archived ? `<div class="callout info"><div class="ico">→</div><div><b>To apply:</b> download the resume above, then open the listing on LinkedIn and click
      ${r.status === "external" ? "<b>Apply</b> (it continues on the company's site)" : "<b>Easy Apply</b>"}. Claude's notes below help with the questions.</div></div>` : ""}

    ${(r.warnings || []).map((w) => `<div class="callout warn"><div class="ico">⚠</div><div>${esc(w)}</div></div>`).join("")}

    <details class="card" open><summary>Resume match</summary>
      ${r.ats?.summary ? `<div style="margin-bottom:14px">${rich(r.ats.summary)}</div>` : ""}
      ${resumes.map((x) => `<div class="resume-row ${x.file === r.ats.best_file ? "best" : ""}">
        <div class="top"><div class="name">${esc(x.file)} ${x.file === r.ats.best_file ? `<span class="pill p-accent">best</span>` : ""}</div>
          <div class="trk" style="height:8px;background:var(--chart-track);border-radius:4px"><div style="height:100%;border-radius:4px;width:${x.ats_score}%;background:${x.file === r.ats.best_file ? "var(--accent)" : "var(--chart-muted)"}"></div></div>
          <div style="text-align:right;font-weight:700">${x.ats_score}</div></div>
        <details><summary>Keywords & reasoning</summary><div style="margin-top:8px" class="stack">
          ${x.matched_keywords?.length ? `<div><div class="muted" style="font-size:12px;margin-bottom:4px">MATCHED</div>${chips(x.matched_keywords, "y", 14)}</div>` : ""}
          ${(() => { const m = splitMissing(x); return `
            ${m.skills.length ? `<div><div class="muted" style="font-size:12px;margin-bottom:4px">MISSING SKILLS</div>${chips(m.skills.map((a) => a.canonical), "n", 14)}</div>` : ""}
            ${m.other.length ? `<div><div class="muted" style="font-size:12px;margin-bottom:4px">OTHER REQUIREMENTS (NOT SKILLS)</div><div class="chips">${m.other.map((a) =>
              `<span class="chip ${a.satisfied_by_profile ? "y" : "more"}" data-tip="${esc(a.note || "")}">${a.satisfied_by_profile ? "✓ " : ""}${esc(a.canonical)} · ${esc(KIND[a.kind] || a.kind)}</span>`).join("")}</div></div>` : ""}`; })()}
          ${rich(x.reasoning)}</div></details>
      </div>`).join("") || `<div class="muted">Not scored</div>`}
    </details>

    ${tailoredHtml(r)}
    ${recsHtml(r)}
    ${githubJobHtml(r)}

    <details class="card" ${claudeFields.length ? "open" : ""}><summary>Questions & answers <span class="muted" style="text-transform:none;letter-spacing:0">· ${claudeFields.length} by Claude, ${fields.length - claudeFields.length} prefilled</span></summary>
      ${fields.length ? fields.map((f) => `<div class="qa">
        <div class="q">${esc(f.label || "(unlabelled field)")}</div>
        <div class="a">${esc(f.source === "prefilled" ? "(filled by LinkedIn)" : f.value) || "<i class='muted'>blank</i>"}</div>
        ${f.source === "claude" ? `<div class="r"><span class="pill ${f.confidence === "low" ? "p-bad" : f.confidence === "medium" ? "p-warn" : "p-good"}">${esc(f.confidence)} confidence</span> <span class="sub">${md(f.reasoning)}</span></div>` : ""}
        ${f.error ? `<div class="r" style="color:var(--danger-text)">Couldn't fill: ${esc(f.error)}</div>` : ""}
      </div>`).join("") : `<div class="muted">No questions answered${r.status === "resume_insufficient" ? " (skipped before applying)" : ""}</div>`}
    </details>

    <details class="card"><summary>Job description</summary><pre class="jd">${esc(r.description)}</pre></details>
  </div>`;
}

export function tailoredHtml(r) {
  const t = r.tailored; if (!t) return "";
  const status = !t.used ? "Not used: it didn't beat the original" : t.uploaded === true ? "Uploaded to LinkedIn and used"
    : t.uploaded === false ? "Upload failed, the original was used" : r.status === "resume_insufficient" ? "Not sent (job skipped)" : "Selected for this application";
  const added = t.resume?.github_added || [];
  return `<details class="card" open><summary>Tailored resume</summary>
    <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:6px">${gauge(t.baseScore, 58)}<span style="font-size:20px;color:var(--text-tertiary)">→</span>${gauge(t.score, 58)}</div>
      <div><div style="font-weight:600">${t.score - t.baseScore >= 0 ? "+" : ""}${t.score - t.baseScore} ATS points · ${t.pass} pass${t.pass > 1 ? "es" : ""}</div><div class="sub">${esc(status)}</div></div></div>
    <div class="grid g2">
      <div><div class="muted" style="font-size:12px;margin-bottom:6px">WHAT CHANGED</div>
        <div class="rich"><ul>${(t.resume?.changes || []).map((c) => `<li><b>${md(c.what)}</b><br><span class="sub">${md(c.why)}</span></li>`).join("")}</ul></div></div>
      <div class="stack">
        ${t.resume?.not_added?.length ? `<div><div class="muted" style="font-size:12px;margin-bottom:6px">NOT ADDED: YOUR RESUMES DON'T SUPPORT IT</div>${chips(t.resume.not_added.map((s) => s.split(":")[0]), "n", 16)}</div>` : ""}
        ${added.length ? `<div><div class="muted" style="font-size:12px;margin-bottom:6px">GITHUB PROJECTS ADDED</div><div class="rich"><ul>${added.map((a) => `<li>${verdict(a.verdict)} <b>${esc(a.repo)}</b>: ${md(a.note)}</li>`).join("")}</ul></div></div>` : ""}
      </div></div>
    <div class="compare" style="margin-top:16px">
      <div><div class="cap"><span>Original · <b>${esc(t.baseFile)}</b> (${t.baseScore})</span><a href="${pdfUrl(t.basePath || "resumes/" + t.baseFile)}" target="_blank" rel="noopener">Open ↗</a></div>
        <iframe src="${pdfUrl(t.basePath || "resumes/" + t.baseFile)}" title="Original resume" loading="lazy"></iframe></div>
      <div><div class="cap"><span>Tailored · <b>${esc(t.file)}</b> (${t.score})</span><a href="${pdfUrl(t.path)}" target="_blank" rel="noopener">Open ↗</a></div>
        <iframe src="${pdfUrl(t.path)}" title="Tailored resume" loading="lazy"></iframe></div>
    </div></details>`;
}

export const RECTYPE = { project: "Project", github: "GitHub", portfolio: "Portfolio", certification: "Certification", course: "Course", skill: "Skill", resume: "Resume", linkedin_profile: "LinkedIn", other: "Other" };
export function recsHtml(r) {
  const recs = [...(r.ats?.recommendations || [])].sort((a, b) => b.estimated_gain - a.estimated_gain);
  if (!recs.length) return "";
  return `<details class="card" open><summary>Improve your chances for this job</summary>
    ${hbars(recs.map((x) => ({ label: `${RECTYPE[x.type] || x.type} · ${x.effort}`, value: x.estimated_gain, display: `+${x.estimated_gain}`, tip: x.action.slice(0, 160) })))}
    <div class="stack" style="margin-top:14px">${recs.map((x) => `<div style="border-top:1px solid var(--separator);padding-top:12px">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px"><span class="pill p-accent">+${x.estimated_gain} ATS</span><span class="tag">${RECTYPE[x.type] || esc(x.type)}</span><span class="tag">effort: ${esc(x.effort)}</span></div>
      ${rich(x.action)}<div class="sub">${rich(x.why)}</div></div>`).join("")}</div>
    <div class="sub" style="margin-top:12px">For the across-the-board list, see <a href="#overview" data-nav="overview">Overview → to-do list</a>.</div>
  </details>`;
}

export function githubJobHtml(r) {
  const gp = r.ats?.github_projects || [];
  if (!gp.length) return "";
  const REC = { feature_on_resume: ["Feature on resume", "p-good"], mention_briefly: ["Mention briefly", "p-warn"], leave_off: ["Leave off", "p-neutral"] };
  return `<details class="card" open><summary>Your GitHub for this job</summary><div class="stack">
    ${gp.map((g) => { const [l, c] = REC[g.recommendation] || [g.recommendation, "p-neutral"]; return `<div style="border-top:1px solid var(--separator);padding-top:12px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(g.repo)}</b><span class="pill ${c}">${l}</span><span class="tag">relevance ${g.relevance}/10</span></div>
      ${rich(g.honest_take)}<div class="sub">${rich(g.how_to_present)}</div></div>`; }).join("")}</div></details>`;
}
