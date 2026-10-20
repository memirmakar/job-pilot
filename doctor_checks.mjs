// Doctor screen health checks, all read only and cheap: what the app already knows (runs, resumes, GitHub, usage),
// plus an on-demand LinkedIn session check that opens one page in a hidden browser. The Claude CLI check is server.mjs claudeInfo().
import fs from "node:fs";
import path from "node:path";
import { DIR, DATA, loadProfile } from "./config.mjs";

const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
const jsonFiles = (d) => !fs.existsSync(d) ? [] : fs.readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(d, f))).filter(Boolean);
const LI_FILE = path.join(DATA, "doctor", "linkedin_check.json");

// Is the LinkedIn session still signed in? One visit to the feed; the run's own page guard decides.
export async function checkLinkedin() {
  const { launch } = await import(`./linkedin.mjs?t=${Date.now()}`);
  const { guard, LinkedInLoginError, LinkedInLimitError } = await import("./linkedin_guard.mjs");
  const res = { at: new Date().toISOString(), loggedIn: null, limited: false, error: "" };
  let ctx;
  try {
    ctx = await launch({ headless: true });
    const page = ctx.pages()[0] || (await ctx.newPage());
    const r = await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 45e3 });
    await guard(page, r);
    res.loggedIn = true;
  } catch (e) {
    if (e instanceof LinkedInLoginError) res.loggedIn = false;
    else if (e instanceof LinkedInLimitError) Object.assign(res, { loggedIn: true, limited: true, error: e.message });
    else res.error = String(e.message).split("\n")[0].slice(0, 200);
  } finally { await ctx?.close().catch(() => {}); }
  fs.mkdirSync(path.dirname(LI_FILE), { recursive: true });
  fs.writeFileSync(LI_FILE, JSON.stringify(res, null, 2));
  return res;
}

// Originals in resumes/: read by Claude (Resumes screen) or scored on a job, and not empty
function resumes() {
  const dir = path.join(DIR, "resumes");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(pdf|txt|md)$/i.test(f)) : [];
  const meta = readJson(path.join(DATA, "resumes.json"), {});
  const recs = jsonFiles(path.join(DATA, "applications"));
  const scored = new Set(recs.flatMap((r) => (r.ats?.resumes || []).filter((x) => x.ats_score != null).map((x) => x.file)));
  const tailored = recs.filter((r) => r.tailored?.used).length;
  const list = files.map((f) => ({ file: f, empty: fs.statSync(path.join(dir, f)).size < 200, read: !!meta[f]?.read, scored: scored.has(f) }));
  return { originals: list.length, tailored, empty: list.filter((x) => x.empty).map((x) => x.file),
    unread: list.filter((x) => !x.empty && !x.read && !x.scored).map((x) => x.file), read: list.filter((x) => x.read).length };
}

function github() {
  const user = loadProfile()?.githubUser || null, repos = readJson(path.join(DATA, "github", "repos.json"));
  return { user, fetchedAt: repos?.fetchedAt || null, repos: repos?.repos?.length ?? null, sameUser: !repos?.user || repos.user === user };
}

// What Job Pilot spent on Claude this month (job analysis, Ask Claude, the doctor)
function usage() {
  const month = new Date().toISOString().slice(0, 7), inMonth = (iso) => String(iso || "").startsWith(month);
  const sum = (xs) => xs.reduce((a, b) => a + (b || 0), 0);
  const recs = jsonFiles(path.join(DATA, "applications")).filter((r) => inMonth(r.createdAt));
  const chats = jsonFiles(path.join(DATA, "conversations")).filter((c) => inMonth(c.updatedAt));
  const docs = jsonFiles(path.join(DATA, "doctor")).filter((d) => d.id && inMonth(d.startedAt));
  return { month, costUsd: sum([...recs.map((r) => r.usage?.costUsd), ...chats.map((c) => c.costUsd), ...docs.map((d) => d.usage?.costUsd)]) };
}

export function checks() {
  return { at: new Date().toISOString(), linkedin: readJson(LI_FILE), linkedinProfile: fs.existsSync(path.join(DIR, "browser_profile")),
    resumes: resumes(), github: github(), usage: usage() };
}
