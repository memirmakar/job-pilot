// The daily run: collect -> Claude picks -> analyze + tailor each -> apply (Easy Apply) or prepare (external)
// -> archive closed listings -> weekly upkeep. Anomalies (no listings, unreadable pages, repeated errors) call the doctor.
import fs from "node:fs";
import path from "node:path";
import config, { DIR } from "./config.mjs";
import { loadResumes, scoreResumes, answerQuestions, tailorResume, selectJobs, findClaude, ClaudeLoginError, ClaudeLimitError } from "./llm.mjs";
import { renderResumePdf, closePdfBrowser } from "./resume_pdf.mjs";
import { loadGithub, githubBrief } from "./github.mjs";
import { runMarketReview, reviewDue } from "./market.mjs";
import { libraryDue, buildLibrary, libraryFiles } from "./library.mjs";
import { runDoctor, shouldAutoRun } from "./doctor.mjs";
import * as LIN from "./linkedin.mjs";
import { LI, sleep, short, pause, btn, exists, norm } from "./linkedin.mjs";
import * as S from "./store.mjs";

const { log } = S;
let GH_BRIEF = "";

// ---------- helpers ----------
const ascii = (s) => String(s || "").normalize("NFKD").replace(/\p{M}/gu, "").replace(/ı/g, "i").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
function titleExcluded(title, company) {
  const t = norm(title), c = norm(company);
  return config.titleExclude.some((k) => t.includes(norm(k))) || config.companyExclude.some((k) => c.includes(norm(k)));
}
// Jobs we've already handled (a record exists, or the log says filtered/not picked/applied)
function handledIds() {
  const ids = new Set(S.loadAllRecords().map((r) => r.id));
  for (const r of S.readLog()) if (["applied", "already_applied", "filtered", "not_selected", "closed"].includes(r.status)) ids.add(r.id);
  return ids;
}

// ---------- tailoring ----------
async function tailorFor(rec, files) {
  const T = config.tailor;
  const base = rec.ats.resumes.find((r) => r.file === rec.ats.best_file);
  const baseFile = files.find((f) => f.file === base.file);
  const dir = path.join(DIR, "data", "tailored", `${rec.site}-${rec.id}`);
  let best = null, previous = null, feedback = null;
  for (let pass = 1; pass <= T.maxPasses; pass++) {
    log(`  Tailoring resume (pass ${pass})...`);
    const { resume, usage } = await tailorResume({ job: rec, baseFile: base.file, basePath: baseFile?.path, ats: base, feedback, previous, github: GH_BRIEF });
    S.addUsage(rec, usage);
    const file = `${ascii(resume.name)}_CV_${ascii(rec.title).slice(0, 40)}.pdf`;
    const out = await renderResumePdf(resume, path.join(dir, `pass${pass}`, file));
    const sc = await scoreResumes(rec, [{ file, path: out }]);
    S.addUsage(rec, sc.usage);
    const entry = sc.resumes[0];
    log(`  Tailored resume scores ${entry.ats_score} (base ${base.ats_score})`);
    const cand = { file, path: path.relative(DIR, out).replace(/\\/g, "/"), score: entry.ats_score, ats: entry, resume, pass, recommendations: sc.recommendations };
    const improved = !best || cand.score > best.score;
    if (improved) best = cand;
    // stop when it's good enough, or when another pass didn't gain anything
    if (cand.score >= T.target || (pass > 1 && !improved)) break;
    previous = resume;
    feedback = `score ${entry.ats_score}; still missing: ${entry.missing_keywords.join(", ")}. ${entry.reasoning}`;
  }
  rec.tailored = { ...best, baseFile: base.file, basePath: baseFile ? path.relative(DIR, baseFile.path).replace(/\\/g, "/") : null, baseScore: base.ats_score, used: best.score >= base.ats_score };
  rec.chosenResume = rec.tailored.used ? best.file : base.file;
  S.saveRecord(rec);
}
const chosenPath = (rec, files) => rec.tailored?.used ? path.join(DIR, rec.tailored.path) : (files.find((f) => f.file === rec.chosenResume)?.path || null);

// ---------- Easy Apply ----------
async function fillStep(page, root, rec, files, rejection = null) {
  const fields = await LIN.scanFields(root);
  const empty = rejection ? fields.filter((f) => f.kind !== "select" || !f.value) : fields.filter((f) => !f.value);
  const step = { fields: [], ...(rejection ? { retry: true } : {}) };
  for (const f of fields.filter((f) => !empty.includes(f))) step.fields.push({ label: f.label, kind: f.kind, value: f.value, source: "prefilled" });
  if (empty.length) {
    const { answers, usage } = await answerQuestions({
      job: rec, resumeFile: rec.chosenResume, resumePath: chosenPath(rec, files), fields: empty, previous: rec.steps.flatMap((s) => s.fields), rejection,
    });
    S.addUsage(rec, usage);
    for (const f of empty) {
      const a = answers.find((x) => x.id === f.id);
      const entry = { label: f.label, kind: f.kind, options: f.options, source: "claude", value: a?.value ?? "", reasoning: a?.reasoning ?? "No answer returned", confidence: a?.confidence ?? "low" };
      if (a && a.value !== "") {
        try { entry.value = await LIN.applyAnswer(page, root, f, a.value); } catch (e) { entry.error = e.message; }
      }
      step.fields.push(entry);
      await sleep(250);
    }
  }
  return step;
}

async function easyApply(page, rec, files, { dryRun, easyBtn }) {
  await easyBtn.click();
  await sleep(2500);
  const dialog = page.getByRole("dialog").filter({ visible: true }).last();
  let lastProgress = "", stuck = 0, retries = 0;
  for (let n = 0; n < 15; n++) {
    // Resume step: upload the chosen PDF (tailored, library or original); fall back to picking it by name
    if (!rec.resumeSelection && (await LIN.selectResume(page, dialog, "\u0000"))) {
      const file = chosenPath(rec, files);
      let res = file && config.tailor.uploadToLinkedIn && (await LIN.uploadResume(page, dialog, file)) ? await LIN.selectResume(page, dialog, path.basename(file)) : null;
      if (!res?.selected) {
        res = await LIN.selectResume(page, dialog, rec.ats.best_file);
        rec.warnings.push(res?.selected ? `Couldn't upload ${rec.chosenResume}; used "${rec.ats.best_file}" from your LinkedIn resumes.` : "Couldn't upload or find the chosen resume; LinkedIn's default resume was used.");
      } else if (rec.tailored) rec.tailored.uploaded = rec.tailored.used;
      rec.resumeSelection = res || { selected: false };
    }
    const step = await fillStep(page, dialog, rec, files);
    if (step.fields.length) rec.steps.push(step);
    S.saveRecord(rec);
    await short();

    const submit = btn(dialog, LI.submit);
    if (await exists(submit)) {
      if (dryRun) { await LIN.closeDialog(page); return S.finish(rec, "dry_run", "stopped before submit (dry run)"); }
      await submit.click();
      await sleep(3000);
      const done = btn(page, LI.done);
      if (await exists(done)) await done.click().catch(() => {}); else await btn(page, LI.dismiss).click().catch(() => {});
      rec.submittedAt = new Date().toISOString();
      S.count("applied");
      return S.finish(rec, "applied");
    }
    const nextBtn = (await exists(btn(dialog, LI.review))) ? btn(dialog, LI.review) : btn(dialog, LI.next);
    if (!(await exists(nextBtn))) break;
    const progress = await dialog.innerText().catch(() => "");
    if (progress === lastProgress) stuck++; else stuck = 0;
    lastProgress = progress;
    if (stuck >= 1 && retries < 2) {
      log("  Step rejected, asking Claude to fix the answers...");
      const fix = await fillStep(page, dialog, rec, files, progress.slice(0, 3000));
      if (fix.fields.length) rec.steps.push(fix);
      retries++; stuck = 0; lastProgress = "";
    } else if (stuck >= 1) {
      rec.warnings.push(`Stuck on a step. The form said: ${progress.replace(/\s+/g, " ").slice(0, 400)}`);
      break;
    }
    await nextBtn.click();
    await sleep(2000);
  }
  await LIN.closeDialog(page);
  return S.finish(rec, "needs_manual", rec.warnings.at(-1) || "The form couldn't be completed automatically");
}

// ---------- one job ----------
async function processJob(page, pick, files, opts) {
  const jp = await LIN.readJobPage(page, pick.id);
  if (!jp.title) { S.count("parse_errors"); S.writeLog({ site: "linkedin", id: pick.id, title: pick.title, company: pick.company, url: jp.url, status: "parse_error", reason: "couldn't read the job page" }); return; }
  log(`\n[${pick.field}] ${jp.title} @ ${jp.company} (${jp.postedText || "date unknown"}, ${jp.easyApply ? "Easy Apply" : "external"})`);
  if (jp.closed) { S.writeLog({ site: "linkedin", id: pick.id, title: jp.title, company: jp.company, url: jp.url, status: "closed", reason: "no longer accepting applications" }); return; }
  if (jp.alreadyApplied) { S.writeLog({ site: "linkedin", id: pick.id, title: jp.title, company: jp.company, url: jp.url, status: "already_applied" }); return; }

  const rec = {
    site: "linkedin", id: pick.id, url: jp.url, title: jp.title, company: jp.company, location: jp.location || pick.location,
    field: pick.field, selection: { relevance: pick.relevance, reason: pick.reason, searchTerm: pick.searchTerm },
    postedAt: jp.postedAt, postedText: jp.postedText, applicants: jp.applicants, easyApply: jp.easyApply, logoUrl: jp.logoUrl,
    createdAt: new Date().toISOString(), lastCheckedAt: new Date().toISOString(), status: "in_progress",
    description: await LIN.jobDescription(page), steps: [], warnings: [],
  };
  S.count("analyzed");
  log("  Scoring resumes...");
  rec.ats = await scoreResumes(rec, files, GH_BRIEF);
  S.addUsage(rec, rec.ats.usage); delete rec.ats.usage;
  rec.chosenResume = rec.ats.best_file;
  log(`  Best base resume: ${rec.chosenResume} (ATS ${rec.ats.best_score})`);
  S.saveRecord(rec);

  try { await tailorFor(rec, files); }
  catch (e) { if (e instanceof ClaudeLoginError || e instanceof ClaudeLimitError) throw e; rec.warnings.push(`Tailoring failed, used ${rec.chosenResume}: ${e.message}`); }
  const finalScore = rec.tailored?.used ? rec.tailored.score : rec.ats.best_score;

  if (!jp.easyApply) {
    rec.externalUrl = await LIN.externalApplyUrl(page).catch(() => null);
    return S.finish(rec, "external", "Apply on the company's site; your tailored resume is ready to download");
  }
  if (finalScore < config.llm.minAtsScore) return S.finish(rec, "resume_insufficient", `final ATS score ${finalScore} < ${config.llm.minAtsScore}`);
  if (config.mode !== "auto") return S.finish(rec, "ready_to_apply", "Analyze-only mode: review and apply yourself");
  if (S.appliedToday() >= config.dailyLimit) return S.finish(rec, "ready_to_apply", "Daily application limit reached");
  try { return await easyApply(page, rec, files, { ...opts, easyBtn: jp.easyBtn }); }
  finally { S.saveRecord(rec); }
}

// ---------- availability ----------
async function checkOpenListings(page, maxChecks = 80) {
  const hours = config.availabilityCheckHours ?? 20;
  const due = S.loadAllRecords().filter((r) => !r.archived && r.url && !["filtered", "parse_error"].includes(r.status) &&
    Date.now() - Date.parse(r.lastCheckedAt || r.createdAt || 0) > hours * 36e5).slice(0, maxChecks);
  if (!due.length) return;
  S.setPhase("availability", `${due.length} listings`);
  log(`\nChecking ${due.length} listing(s) are still open...`);
  for (const r of due) {
    const res = await LIN.checkAvailability(page, r.url);
    r.lastCheckedAt = new Date().toISOString();
    if (!res.open) {
      r.archived = { at: new Date().toISOString(), reason: res.reason };
      S.count("archived");
      log(`  Archived: ${r.title} @ ${r.company} (${res.reason})`);
    }
    S.saveRecord(r);
    await sleep(1500 + Math.random() * 1500);
  }
}

// ---------- the run ----------
export async function runDaily({ dryRun = false, onlyJob = null, limit = Infinity, noDoctor = false } = {}) {
  const run = S.startRun(dryRun ? "dry-run" : "daily", { dryRun, onlyJob });
  const started = Date.now();
  let stop = "", ctx = null, page = null;
  const outcome = { applied: 0, analyzed: 0 };
  try {
    // 1. preflight
    S.setPhase("preflight");
    if (!findClaude()) throw new ClaudeLoginError("Claude Code CLI not found");
    const uploads = loadResumes();
    try { GH_BRIEF = githubBrief(await loadGithub()); } catch (e) { if (e instanceof ClaudeLimitError || e instanceof ClaudeLoginError) throw e; log(`GitHub unavailable: ${e.message}`); }
    const why = libraryDue();
    if (why && !dryRun) {
      S.setPhase("library", why);
      log(`Updating your resume library (${why})...`);
      try { await buildLibrary(GH_BRIEF, log); } catch (e) { if (e instanceof ClaudeLimitError || e instanceof ClaudeLoginError) throw e; S.anomaly("library_failed", e.message); }
    }
    const files = [...uploads, ...libraryFiles()];
    log(`Resumes: ${files.map((f) => f.file).join(", ")}`);

    ctx = await LIN.launch();
    page = ctx.pages()[0] || (await ctx.newPage());

    // 2. collect
    let picks = [];
    if (onlyJob) picks = [{ id: onlyJob, key: onlyJob, field: config.targets[0]?.field || "Other", relevance: 10, reason: "requested" }];
    else {
      const quota = Math.min(config.dailyJobs - S.analyzedToday(), limit);
      if (quota <= 0) { log(`Already analyzed ${config.dailyJobs} jobs today.`); }
      else {
        S.setPhase("collect");
        const handled = handledIds(), listings = new Map();
        const collectAll = async () => {
          for (const t of config.targets) for (const term of t.searchTerms || []) for (const loc of config.locations) {
            log(`Searching "${term}"${loc ? ` in ${loc}` : ""}...`);
            for (const c of await LIN.collectListings(page, term, loc)) if (!listings.has(c.id)) listings.set(c.id, { ...c, targetField: t.field });
          }
        };
        await collectAll();
        S.count("listings_seen", listings.size);
        if (!listings.size && !noDoctor && shouldAutoRun("No listings")) {
          S.anomaly("no_listings", "LinkedIn searches returned no listings at all");
          const rep = await runDoctor({ reason: "No listings: every LinkedIn search returned zero results", context: JSON.stringify({ targets: config.targets, locations: config.locations, events: run.events.slice(-30) }, null, 1) });
          log(`Doctor: ${rep.fixed ? "fixed" : "not fixed"}. ${rep.needs_user || ""}`);
          if (rep.retry_run) await collectAll();
        }
        // 3. cheap filters, then Claude picks
        const fresh = [...listings.values()].filter((c) => !handled.has(c.id) && !c.alreadyApplied);
        for (const c of fresh.filter((c) => titleExcluded(c.title, c.company)))
          S.writeLog({ site: "linkedin", id: c.id, title: c.title, company: c.company, url: `https://www.linkedin.com/jobs/view/${c.id}/`, status: "filtered", reason: "excluded title/company word" });
        const candidates = fresh.filter((c) => !titleExcluded(c.title, c.company)).slice(0, 220).map((c) => ({ ...c, key: c.id }));
        log(`${listings.size} listings found, ${candidates.length} new candidates.`);
        if (candidates.length) {
          S.setPhase("select", `${candidates.length} candidates`);
          const sel = await selectJobs(candidates, quota);
          run.selection = { candidates: candidates.length, picked: sel.picks.length, skipped_summary: sel.skipped_summary };
          const byId = new Map(candidates.map((c) => [c.id, c]));
          picks = sel.picks.filter((p) => byId.has(p.key)).sort((a, b) => b.relevance - a.relevance).slice(0, quota)
            .map((p) => ({ ...byId.get(p.key), field: p.field, relevance: p.relevance, reason: p.reason }));
          // Only clear poor fits are recorded (and never shown to Claude again); good jobs that missed today's quota stay candidates
          const picked = new Set(picks.map((p) => p.id)), poor = new Set(sel.poor_fits || []);
          for (const c of candidates.filter((c) => poor.has(c.id) && !picked.has(c.id)))
            S.writeLog({ site: "linkedin", id: c.id, title: c.title, company: c.company, url: `https://www.linkedin.com/jobs/view/${c.id}/`, status: "not_selected", reason: "Claude: not a fit for your goals" });
          log(`Claude picked ${picks.length}: ${sel.skipped_summary}`);
        }
      }
    }

    // 4. analyze + tailor + apply
    S.setPhase("analyze", `${picks.length} jobs`);
    let consecutiveErrors = 0;
    for (const pick of picks) {
      if (Date.now() - started > config.maxRunMinutes * 60e3) { stop = `Stopped after ${config.maxRunMinutes} minutes.`; break; }
      try {
        const r = await processJob(page, pick, files, { dryRun });
        consecutiveErrors = 0;
        if (r === "applied") outcome.applied++;
        if (r) outcome.analyzed++;
      } catch (e) {
        if (e instanceof ClaudeLimitError) throw e;
        if (e instanceof ClaudeLoginError || e instanceof LIN.LinkedInLoginError) throw e;
        if (/has been closed/i.test(e.message)) { stop = "The browser window was closed."; break; }
        consecutiveErrors++;
        S.count("errors");
        S.writeLog({ site: "linkedin", id: pick.id, title: pick.title, company: pick.company, url: `https://www.linkedin.com/jobs/view/${pick.id}/`, status: "error", reason: e.message.split("\n")[0] });
        await LIN.closeDialog(page).catch(() => {});
        if (consecutiveErrors >= 3 && !noDoctor && shouldAutoRun("Repeated errors")) {
          S.anomaly("repeated_errors", e.message);
          const rep = await runDoctor({ reason: `Repeated errors while processing jobs: ${e.message.split("\n")[0]}`, context: (e.stack || "").slice(0, 2000) + "\n\nRecent events:\n" + run.events.slice(-30).map((x) => x.line).join("\n") });
          if (!rep.fixed) { stop = "Stopped after repeated errors; see the Doctor page."; break; }
          consecutiveErrors = 0;
        }
      }
      await pause();
    }
    const parseErrors = run.counts.parse_errors || 0;
    if (parseErrors >= 3 && parseErrors >= picks.length / 2 && !noDoctor && shouldAutoRun("Unreadable job pages")) {
      S.anomaly("parse_errors", `${parseErrors} job pages couldn't be read`);
      await runDoctor({ reason: "Unreadable job pages: LinkedIn's job page layout may have changed", context: run.events.slice(-40).map((x) => x.line).join("\n") });
    }

    // 5. archive closed listings
    if (!dryRun && !onlyJob) await checkOpenListings(page);
  } catch (e) {
    if (e instanceof ClaudeLimitError) stop = `Claude plan limit reached (${e.message.replace(/^.*?·\s*/, "")}). The rest continues next run.`;
    else if (e instanceof ClaudeLoginError) stop = `Claude Code isn't ready: ${e.message}`;
    else if (e instanceof LIN.LinkedInLoginError) stop = "You're logged out of LinkedIn. Use \"Log in to LinkedIn\" in the app.";
    else { stop = `Run failed: ${e.message}`; S.anomaly("crash", e.stack || e.message); }
    log("\n" + stop);
  } finally {
    await ctx?.close().catch(() => {});
    await closePdfBrowser().catch(() => {});
  }

  // 6. weekly upkeep (needs no browser)
  if (!stop.startsWith("Claude") && !dryRun) {
    if (reviewDue()) { S.setPhase("market review"); try { await runMarketReview(GH_BRIEF); log("Market review updated."); } catch (e) { log(`Market review skipped: ${e.message.split("\n")[0]}`); } }
  }
  if (stop.startsWith("Run failed") && !noDoctor && shouldAutoRun("Run crashed")) {
    const rep = await runDoctor({ reason: `Run crashed: ${stop}`, context: run.anomalies.map((a) => a.detail).join("\n").slice(0, 3000) });
    log(`Doctor: ${rep.fixed ? "fixed" : "could not fix"}. ${rep.needs_user || ""}`);
  }
  const summary = `${outcome.applied} applied, ${outcome.analyzed} analyzed${run.counts.archived ? `, ${run.counts.archived} archived` : ""}.`;
  S.notify(stop ? "Job Pilot stopped early" : "Job Pilot finished", `${summary}${stop ? " " + stop : ""}`);
  log(`\nDone. ${summary}${stop ? " " + stop : ""}`);
  return S.endRun({ ...outcome, stop, summary });
}

// ---------- selftest (used by the doctor): can we read LinkedIn at all? No Claude, no applying. ----------
export async function selftest() {
  const res = { linkedinLoggedIn: false, listings: 0, sampleCard: null, jobPage: null, descriptionChars: 0, claude: !!findClaude(), errors: [] };
  const ctx = await LIN.launch({ headless: true });
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    const t = config.targets[0], term = t?.searchTerms?.[0] || "engineer";
    const cards = await LIN.collectListings(page, term, config.locations[0]);
    res.linkedinLoggedIn = true;
    res.listings = cards.length;
    res.sampleCard = cards[0] || null;
    if (cards[0]) {
      const jp = await LIN.readJobPage(page, cards[0].id);
      res.jobPage = { title: jp.title, company: jp.company, location: jp.location, postedText: jp.postedText, postedAt: jp.postedAt, easyApply: jp.easyApply, closed: jp.closed };
      res.descriptionChars = (await LIN.jobDescription(page)).length;
    }
  } catch (e) { res.errors.push(e.message); if (e instanceof LIN.LinkedInLoginError) res.linkedinLoggedIn = false; }
  finally { await ctx.close().catch(() => {}); }
  res.ok = res.linkedinLoggedIn && res.listings > 0 && !!res.jobPage?.title && res.descriptionChars > 200;
  return res;
}
