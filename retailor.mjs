// "Re-tailor unsent resumes with your rules" (`node apply.mjs retailor [--limit N] [--ids t:a,t:b]`): tailors each unsent job again with
// today's rules, approved GitHub projects, neutral file names and photo. Each result is a new version in data/tailored/<job>/v<N>/;
// earlier versions, and any version that was sent, stay exactly as they are.
import fs from "node:fs";
import path from "node:path";
import config, { DATA } from "./config.mjs";
import { loadResumes } from "./llm.mjs";
import { libraryFiles } from "./library.mjs";
import { tailorFor } from "./tailor.mjs";
import { profileFor } from "./profiles.mjs";
import { approvedBrief } from "./github_projects.mjs";
import { resumesView, tailoredVersions, sentVersion } from "./resumes.mjs";
import { retailorable } from "./resume_prefs.mjs";

const recFile = (k) => path.join(DATA, "applications", `${k}.json`);

export async function retailor({ ids = null, limit = Infinity, log = console.log } = {}) {
  const todo = (ids?.length ? ids : retailorable(resumesView().tailored).map((t) => t.id)).slice(0, limit);
  const files = [...loadResumes(), ...libraryFiles()];
  let github = "";
  try { github = approvedBrief(JSON.parse(fs.readFileSync(path.join(DATA, "github", "repos.json"), "utf8")).repos || []); } catch {}
  const done = [];
  for (const id of todo) {
    const key = id.replace(/^t:/, ""), rec = JSON.parse(fs.readFileSync(recFile(key), "utf8"));
    if (!rec.tailored || !rec.ats) { log(`  ${key}: no tailored resume, skipped`); continue; }
    const old = JSON.parse(JSON.stringify(rec.tailored)), sent = sentVersion(rec);
    // Earlier versions keep their own structured resume so their "What Claude changed" stays readable
    const versions = tailoredVersions(rec).map((v, i, a) => i === a.length - 1 && !v.resume ? { ...v, resume: old.resume } : v);
    const v = versions.at(-1).v + 1;
    log(`Re-tailoring ${rec.title} at ${rec.company} as v${v}...`);
    rec.tailoredBefore = old; // kept until the new version is merged, in case the run stops halfway
    fs.writeFileSync(recFile(key), JSON.stringify(rec, null, 2));
    await tailorFor(rec, files, profileFor(config, rec.field), github, { sub: `v${v}` });
    const t = rec.tailored;
    const entry = { v, by: "claude", file: t.file, path: t.path, score: t.score, at: new Date().toISOString(), note: "Re-tailored with your rules", resume: t.resume };
    rec.tailored = { ...t, versions: [...versions, entry], ...(sent ? { sent } : {}), ...(old.displayName ? { displayName: old.displayName } : {}) };
    delete rec.tailoredBefore;
    fs.writeFileSync(recFile(key), JSON.stringify(rec, null, 2));
    log(`  v${v} scores ${Math.round(t.score)} (was ${Math.round(old.score)})`);
    done.push({ id, v, score: t.score, was: old.score });
  }
  return done;
}
