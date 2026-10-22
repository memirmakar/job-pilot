// Tailoring one job's resume: up to tailorMaxPasses passes from the best base resume, each scored again; stops at the search
// profile's target (profiles.mjs) or when a pass gains nothing. Saves rec.tailored.
import path from "node:path";
import config, { DIR } from "./config.mjs";
import { scoreResumes, tailorResume } from "./llm.mjs";
import { renderResumePdf } from "./resume_pdf.mjs";
import * as S from "./store.mjs";
import { neutralName, enforcePhoto } from "./resume_prefs.mjs";

const { log } = S;

// sub: a folder under data/tailored/<job>/ for this round (re-tailoring writes v<N>/pass1… so no earlier file is overwritten)
export async function tailorFor(rec, files, prof, github = "", { sub = "" } = {}) {
  const T = { ...config.tailor, target: prof.target };
  const base = rec.ats.resumes.find((r) => r.file === rec.ats.best_file);
  const baseFile = files.find((f) => f.file === base.file);
  const dir = path.join(DIR, "data", "tailored", `${rec.site}-${rec.id}`, sub);
  let best = null, previous = null, feedback = null;
  for (let pass = 1; pass <= T.maxPasses; pass++) {
    log(`  Tailoring resume (pass ${pass})...`);
    const { resume, usage } = await tailorResume({ job: rec, baseFile: base.file, basePath: baseFile?.path, ats: base, feedback, previous, github });
    S.addUsage(rec, usage, "tailor");
    enforcePhoto(resume);
    // The name employers see: only your name and the language (Resumes > Your resume rules), never the job, field or a pass
    const file = neutralName(resume.language);
    const out = await renderResumePdf(resume, path.join(dir, `pass${pass}`, file));
    const sc = await scoreResumes(rec, [{ file, path: out }]);
    S.addUsage(rec, sc.usage, "tailor");
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
