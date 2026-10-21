// "Re-score on next run": ticking a to-do step done (todo.mjs setDone) flags the jobs it lifts with rec.rescore{ at items }.
// Each run re-scores a few of them (settings.rescorePerRun, oldest flag first) with your current resumes, telling Claude which
// steps you finished, and records rec.rescored{ at from to items }. Jobs that were below the cutoff and now pass become Ready to apply.
import config from "./config.mjs";
import { scoreResumes, ClaudeLoginError, ClaudeLimitError } from "./llm.mjs";
import { items } from "./todo.mjs";
import { profileFor } from "./profiles.mjs";
import * as S from "./store.mjs";

const finalScore = (r) => Math.round(r.tailored?.used ? r.tailored.score : r.ats?.best_score ?? 0);
export const flagged = () => S.loadAllRecords().filter((r) => r.rescore?.items?.length && r.ats && !r.archived && r.status !== "applied")
  .sort((a, b) => String(a.rescore.at).localeCompare(String(b.rescore.at)));

export async function rescoreFlagged(files, { github = "", max = config.rescorePerRun ?? 3, only = null, log = S.log } = {}) {
  const due = flagged().filter((r) => !only || r.id === only).slice(0, Math.max(0, Math.min(max, 5)));
  if (!due.length) return 0;
  const all = new Map(items({ save: false }).map((i) => [i.id, i]));
  log(`\nRe-scoring ${due.length} job(s) you lifted with to-do steps...`);
  let n = 0;
  for (const r of due) {
    const steps = r.rescore.items.map((id) => all.get(id)).filter(Boolean);
    const extra = `Steps the candidate says they finished since this job was last scored. Count one only where the resumes, profile or GitHub show it, or where it plainly needs no proof (e.g. a course completed):\n` +
      steps.map((s) => `- ${s.title || s.do}`).join("\n");
    try {
      const from = finalScore(r);
      const ats = await scoreResumes(r, files, github, extra);
      S.addUsage(r, ats.usage, "analyze"); delete ats.usage;
      r.ats = ats;
      if (r.tailored) { r.tailored.baseScore = ats.best_score; r.tailored.used = r.tailored.score >= ats.best_score; }
      r.chosenResume = r.tailored?.used ? r.tailored.file : ats.best_file;
      const to = finalScore(r);
      r.rescored = { at: new Date().toISOString(), from, to, items: r.rescore.items };
      delete r.rescore;
      log(`  ${r.title} @ ${r.company}: ${from} → ${to}`);
      if (r.status === "resume_insufficient" && to >= profileFor(config, r.field).cutoff) S.finish(r, "ready_to_apply", `Re-scored ${from} → ${to} after your to-do steps; review and apply`);
      else S.saveRecord(r);
      n++;
    } catch (e) {
      if (e instanceof ClaudeLoginError || e instanceof ClaudeLimitError) throw e;
      log(`  Couldn't re-score ${r.title}: ${e.message.split("\n")[0]}`);
    }
  }
  return n;
}
