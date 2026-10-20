// Overview (now under Insights): today's status, numbers, pipeline and score charts, market review and to-do list.
import { S } from "../state.js";
import { $, esc, md, rich, fmtDate, ago } from "../util.js";
import { usd, finalScore, lvl, chips, hbars, KIND, PHASE } from "../legacy.js";

export function todayHtml() {
  const run = S.STATE.run, c = run.current, last = S.RUNS[0];
  const needs = [];
  if (!S.STATE.claude?.found) needs.push(`Claude Code CLI not found. <a href="#settings" data-nav="settings">Settings</a>`);
  else if (S.STATE.claude.loggedIn === false) needs.push(`Claude Code isn't signed in. <button class="btn sm" data-action="claude-login">Sign in to Claude</button>`);
  if (!S.STATE.resumes.length) needs.push(`No resumes uploaded. <a href="#resumes" data-nav="resumes">Add one</a>`);
  if (last?.outcome?.stop && /LinkedIn/.test(last.outcome.stop)) needs.push(`${esc(last.outcome.stop)} <button class="btn sm" data-action="linkedin-login">Log in to LinkedIn</button>`);
  const openDoc = S.DOCS.find((d) => d.needs_user && Date.now() - Date.parse(d.startedAt) < 3 * 864e5);
  if (openDoc) needs.push(`Doctor: ${md(openDoc.needs_user)} <a href="#doctor" data-nav="doctor">Details</a>`);
  return `
    ${needs.map((n) => `<div class="callout bad" style="margin-bottom:12px"><div class="ico">!</div><div>${n}</div></div>`).join("")}
    <div class="grid g2" style="margin-bottom:16px">
      <div class="card"><h3>${run.running ? `<span class="dot live"></span> Running now` : "Today"}</h3>
        ${run.running ? `<div style="font-weight:600;margin-bottom:8px">${esc(PHASE[c.phase] || c.phase)}${c.detail ? ` · <span class="sub">${esc(c.detail)}</span>` : ""}</div>
          <div class="btns" style="margin-bottom:10px">${Object.entries(c.counts || {}).map(([k, v]) => `<span class="tag">${esc(k.replace(/_/g, " "))}: ${v}</span>`).join("")}</div>
          <pre class="events">${esc((c.events || []).slice(-10).map((e) => e.line).join("\n"))}</pre>`
        : last ? `<div style="font-weight:600">${esc(last.outcome?.summary || "Last run")}</div>
          <div class="sub">${fmtDate(last.endedAt || last.startedAt)}${last.selection ? ` · Claude picked ${last.selection.picked} of ${last.selection.candidates} new listings` : ""}</div>
          ${last.selection?.skipped_summary ? `<div class="sub" style="margin-top:6px">${md(last.selection.skipped_summary)}</div>` : ""}
          ${last.outcome?.stop ? `<div class="callout warn" style="margin-top:10px"><div class="ico">⚠</div><div>${esc(last.outcome.stop)}</div></div>` : ""}`
        : `<div class="sub">No runs yet. Press <b>Run now</b>, or wait for the scheduled run.</div>`}
      </div>
      <div class="card"><h3>Schedule & library</h3>
        <div class="stack">
          <div><b>${S.STATE.schedule.exists ? `Daily at ${esc(S.STATE.settings.scheduleTime)}` : "Not scheduled"}</b>
            <div class="sub">${S.STATE.schedule.exists ? `Next run ${fmtDate(S.STATE.schedule.next)} · up to ${S.STATE.settings.dailyJobs} jobs a day · ${S.STATE.settings.applyMode === "auto" ? "submits Easy Apply jobs" : "analyze only, you apply"}` : `Turn it on in <a href="#settings" data-nav="settings">Settings</a>.`}</div></div>
          <div><b>${S.LIB.entries.length} ready resume${S.LIB.entries.length === 1 ? "" : "s"}</b> <span class="sub">for ${S.LIB.entries.map((e) => esc(e.field)).join(", ") || "your target fields"}</span>
            <div class="sub">${S.LIB.due ? `Update due: ${esc(S.LIB.due)}` : `Updated ${ago(S.LIB.entries[0]?.generatedAt)}`} · <a href="#resumes" data-nav="resumes">Open</a></div></div>
        </div>
      </div>
    </div>`;
}

export function latestByJob() {
  const m = new Map();
  for (const row of [...S.LOG].reverse()) m.set(row.id, row); // S.LOG is newest-first
  return [...m.values()];
}

export function renderOverview() {
  const jobs = latestByJob();
  const scored = S.DATA.filter((r) => r.ats);
  const applied = S.DATA.filter((r) => r.status === "applied");
  const localDay = (d) => new Date(d).toDateString();
  const today = localDay(Date.now());
  const errors = jobs.filter((r) => r.status === "error");
  const relevant = jobs.filter((r) => !["filtered", "parse_error"].includes(r.status));
  const passed = scored.filter((r) => finalScore(r) >= S.META.minAtsScore);
  const avg = scored.length ? Math.round(scored.reduce((s, r) => s + r.ats.best_score, 0) / scored.length) : 0;
  const tail = S.DATA.filter((r) => r.tailored?.used);
  const gain = tail.length ? Math.round(tail.reduce((s, r) => s + (r.tailored.score - r.tailored.baseScore), 0) / tail.length) : 0;
  const usage = S.DATA.reduce((s, r) => s + usd(r.usage), 0);

  // histogram of best ATS scores, bins of 10
  const bins = Array.from({ length: 10 }, (_, i) => ({ lo: i * 10, n: 0 }));
  scored.forEach((r) => bins[Math.min(9, Math.floor(r.ats.best_score / 10))].n++);
  const hmax = Math.max(1, ...bins.map((b) => b.n));

  // segments + missing skills: from the market review stats when present, else computed here
  const segs = S.STATS?.segments || [];
  const missing = (S.STATS?.topMissingInTargets || []).slice(0, 12);

  const errReasons = errors.reduce((m, r) => ((m[r.reason || "Unknown"] = (m[r.reason || "Unknown"] || 0) + 1), m), {});
  const rv = S.MARKET?.review;

  $("#view").innerHTML = `
    ${todayHtml()}
    ${errors.length ? `<div class="callout warn" style="margin-bottom:16px"><div class="ico">⚠</div><div>
      <b>${errors.length} job${errors.length > 1 ? "s" : ""} errored and will be retried on the next run.</b>
      <ul style="margin:6px 0 0;padding-left:18px">${Object.entries(errReasons).map(([k, n]) => `<li>${esc(k)}: <b>${n}</b></li>`).join("")}</ul>
      <div class="sub" style="margin-top:6px">Runs now stop by themselves when your Claude plan limit is hit, instead of erroring on every remaining job.</div></div></div>` : ""}

    <div class="grid g4">
      <div class="card tile"><div class="v">${applied.length}</div><div class="l">Applications sent</div><div class="s">${applied.filter((r) => localDay(r.submittedAt || r.updatedAt || 0) === today).length} today · limit ${S.META.dailyLimit}/day</div></div>
      <div class="card tile"><div class="v">${scored.length}</div><div class="l">Jobs scored by Claude</div><div class="s">${passed.length} passed the ${S.META.minAtsScore} cutoff</div></div>
      <div class="card tile"><div class="v">${avg}</div><div class="l">Average best ATS score</div><div class="s">${tail.length ? `tailoring adds +${gain} on average (${tail.length} jobs)` : "no tailored resumes yet"}</div></div>
      <div class="card tile"><div class="v">$${usage.toFixed(2)}</div><div class="l">Claude usage</div><div class="s">API-equivalent, covered by your plan</div></div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>Pipeline</h3>
        <div class="funnel">${[["Listings seen", jobs.length, 1], ["Relevant title", relevant.length, .85], ["Scored by Claude", scored.length, .7], [`Score ≥ ${S.META.minAtsScore}`, passed.length, .55], ["Applied", applied.length, .42]]
          .map(([l, n, o]) => `<div class="row" data-tip="${esc(l)}: ${n}"><div class="sub">${l}</div><div><div class="seg" style="--o:${o};width:${Math.max(4, (n / Math.max(1, jobs.length)) * 100)}%">${n}</div></div><div class="pct">${jobs.length ? Math.round((n / jobs.length) * 100) : 0}%</div></div>`).join("")}</div>
      </div>
      <div class="card"><h3>ATS score distribution <span class="count">best resume per job</span></h3>
        <div class="hist">${bins.map((b) => `<div class="col" data-tip="Score ${b.lo}–${b.lo + 9}: ${b.n} job${b.n === 1 ? "" : "s"}"><div class="n">${b.n || ""}</div><div class="b ${b.lo + 10 <= S.META.minAtsScore ? "low" : ""}" style="height:${(b.n / hmax) * 82}%"></div></div>`).join("")}
          <div class="thr" style="left:calc(${S.META.minAtsScore}% )"><span>cutoff ${S.META.minAtsScore}</span></div></div>
        <div class="hist-axis">${bins.map((b) => `<span>${b.lo}</span>`).join("")}</div>
        <div class="legend"><span><i style="background:var(--accent)"></i>At or near the cutoff</span><span><i style="background:var(--chart-muted)"></i>Clearly below the cutoff</span></div>
      </div>
    </div>

    ${segs.length || missing.length ? `<div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>Average score by segment</h3>
        ${hbars(segs.map((s) => ({ label: `${s.segment} (${s.jobs})`, value: s.averageScore, tip: `${s.segment}: ${s.jobs} jobs, average ${s.averageScore}, ${s.passedThreshold} passed the cutoff` })), { max: 100, marker: S.META.minAtsScore })}
        <div class="legend"><span><i style="background:var(--text-secondary);width:3px"></i>Cutoff (${S.META.minAtsScore})</span></div></div>
      <div class="card"><h3>Skills you're missing most often <span class="count">target jobs only</span></h3>
        ${hbars(missing.map((k) => ({ label: k.keyword, value: k.count, display: `${k.count}×`, tip: `"${k.keyword}" was missing from your best resume in ${k.count} scored jobs` })))}</div>
    </div>` : ""}

    ${(S.STATS?.otherRequirements || []).length ? `<div class="card" style="margin-top:16px"><h3>Other requirements in job ads <span class="count">not skills · from the sanity check</span></h3>
      <div class="grid g3" style="gap:10px">${S.STATS.otherRequirements.map((o) => `
        <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:var(--fill);border-radius:10px">
          <span class="pill ${o.satisfied ? "p-good" : "p-warn"}" style="flex:none">${o.satisfied ? "You meet it" : "Not met"}</span>
          <div style="min-width:0"><b>${esc(o.requirement)}</b> <span class="muted">· ${esc(KIND[o.kind] || o.kind)} · ${o.count}×</span>
            <div class="sub">${esc(o.note)}</div></div></div>`).join("")}</div></div>` : ""}

    ${rv ? marketHtml(rv) : `<div class="callout info" style="margin-top:24px"><div class="ico">ℹ</div><div><b>No market review yet.</b> Run <code>node apply.mjs review</code>. It also refreshes automatically after runs every ${3} days.</div></div>`}
  `;
}

export function marketHtml(rv) {
  const done = (t) => !!S.DONE[t.title];
  const todos = rv.todo.map((t, i) => ({ ...t, i }));
  const hours = todos.filter((t) => !done(t)).reduce((s, t) => s + (t.effort_hours || 0), 0);
  return `
    <div class="section-title">Market review <small>${S.MARKET.basedOnJobs} scored jobs · ${fmtDate(S.MARKET.generatedAt)}</small></div>
    <div class="card"><div style="font-size:16px;font-weight:600;margin-bottom:8px">${md(rv.headline)}</div>
      ${rich(rv.verdict_points.map((p) => "- " + p).join("\n"))}</div>

    <div class="grid g3" style="margin-top:16px">${rv.segments.map((s) => `
      <div class="card"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <b style="font-size:15px">${esc(s.segment)}</b>${lvl(s.demand, "demand: ")}${lvl(s.fit, "your fit: ")}</div>
        <div class="sub" style="margin-bottom:6px">${rich(s.note)}</div>
        <div class="muted" style="font-size:12px;margin:8px 0 4px">EMPLOYERS WANT</div>${chips(s.employers_want, "more", 8)}</div>`).join("")}</div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3><span style="color:var(--success-text)">▲</span> Your strengths</h3>
        <div class="rich"><ul>${rv.strengths.map((s) => `<li><b>${md(s.point)}</b>: ${md(s.evidence)}</li>`).join("")}</ul></div></div>
      <div class="card"><h3><span style="color:var(--danger-text)">▼</span> Your gaps</h3>
        <div class="stack">${rv.gaps.map((g) => `<div style="display:flex;gap:10px;align-items:baseline"><span style="flex:none">${lvl(g.severity === "medium" ? "moderate" : g.severity === "high" ? "weak" : "low", "")
          .replace(/>(weak|moderate|low)</, `>${g.severity}<`)}</span><div>${md(g.gap)}<div class="sub">${md(g.frequency)}</div></div></div>`).join("")}</div></div>
    </div>

    <div class="section-title">Your prioritized to-do list <small>${todos.filter(done).length}/${todos.length} done · ~${hours}h left · ordered by impact per hour across all your target jobs</small></div>
    <div class="stack">${todos.map((t) => `
      <div class="card todo ${done(t) ? "done" : ""}">
        <div class="rank">${t.i + 1}</div>
        <div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:space-between">
            <div class="t">${md(t.title)}</div>
            <label class="check"><input type="checkbox" data-todo="${esc(t.title)}" ${done(t) ? "checked" : ""}> Done</label>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0">${lvl(t.impact, "impact: ")}<span class="tag">~${t.effort_hours}h</span><span class="tag">${esc(t.category)}</span></div>
          ${rich(t.why)}
          <ol>${t.steps.map((s) => `<li>${rich(s).replace(/^<div class="rich"><p>|<\/p><\/div>$/g, "")}</li>`).join("")}</ol>
          <dl class="facts"><dt>Done when</dt><dd>${md(t.done_when)}</dd><dt>Helps with</dt><dd>${md(t.unlocks)}</dd></dl>
        </div>
      </div>`).join("")}</div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>Quick resume fixes</h3><div class="rich"><ul>${rv.resume_fixes.map((f) => `<li><b>${md(f.issue)}</b>: ${md(f.fix)}</li>`).join("")}</ul></div></div>
      <div class="card"><h3>Stop doing</h3><div class="rich"><ul>${rv.stop_doing.map((s) => `<li>${md(s)}</li>`).join("")}</ul></div></div>
    </div>`;
}
