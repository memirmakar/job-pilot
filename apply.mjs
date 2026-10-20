// Command-line entry point. The app and the scheduled task call these; you normally don't need to.
//   node apply.mjs run [--dry-run] [--limit N] [--job ID] [--no-doctor]   the daily run
//   node apply.mjs login                                                  open LinkedIn in a normal Edge window to sign in
//   node apply.mjs selftest                                               check LinkedIn can be read (JSON; used by the doctor)
//   node apply.mjs review | library | github [--refresh] | doctor "<problem>"
import { runDaily, selftest } from "./pipeline.mjs";
import { openNormalEdge } from "./linkedin.mjs";
import { loadGithub, githubBrief } from "./github.mjs";
import { runMarketReview } from "./market.mjs";
import { buildLibrary } from "./library.mjs";
import { runDoctor } from "./doctor.mjs";

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const cmd = argv[0] || "run";
const brief = async () => { try { return githubBrief(await loadGithub()); } catch { return ""; } };

try {
  if (cmd === "run") {
    const r = await runDaily({ dryRun: flag("--dry-run"), limit: Number(val("--limit")) || Infinity, onlyJob: val("--job") || null, noDoctor: flag("--no-doctor") });
    process.exitCode = r?.outcome?.stop?.startsWith("Run failed") ? 1 : 0;
  } else if (cmd === "login") {
    const p = openNormalEdge(["https://www.linkedin.com/login"]);
    console.log("Sign in to LinkedIn in the Edge window, then close it.");
    await new Promise((r) => p.on("exit", r));
  } else if (cmd === "selftest") {
    console.log(JSON.stringify(await selftest(), null, 2));
  } else if (cmd === "review") {
    const s = await runMarketReview(await brief());
    console.log(s.review.headline);
  } else if (cmd === "library") {
    const built = await buildLibrary(await brief());
    console.log(`Built ${built.length} library resume(s): ${built.map((b) => b.file).join(", ")}`);
  } else if (cmd === "github") {
    const repos = await loadGithub({ force: flag("--refresh") });
    for (const r of repos) console.log(`${r.name}: ${r.review?.verdict || "not reviewed"}`);
  } else if (cmd === "doctor") {
    const rep = await runDoctor({ reason: argv.slice(1).join(" ") || "Manual check requested from the app" });
    console.log(JSON.stringify({ fixed: rep.fixed, diagnosis: rep.diagnosis, needs_user: rep.needs_user, changedFiles: rep.changedFiles }, null, 2));
  } else {
    console.log(`Unknown command "${cmd}".`);
    process.exitCode = 2;
  }
} catch (e) {
  console.error(e.stack || e.message);
  process.exitCode = 1;
}
