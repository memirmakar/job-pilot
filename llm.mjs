// Claude-powered decisions (resume scoring and answering application questions),
// run through the Claude Code CLI in headless mode, so it uses your Claude subscription.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "./config.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));

// Finds the user's Claude Code CLI: settings path, the default install location, or anything named claude on PATH.
export function findClaude() {
  const candidates = [config.llm.claudePath, path.join(os.homedir(), ".local", "bin", "claude.exe"),
    ...(process.env.PATH || "").split(path.delimiter).flatMap((d) => [path.join(d, "claude.exe"), path.join(d, "claude.cmd")])];
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}
const CLAUDE = findClaude();

// Read-only calls run from an empty folder with no settings, MCP servers or skills, so the CLI does not load this repo's
// CLAUDE.md or the user's setup into every prompt (about 19k tokens of cache creation per call before, about 2k after).
// Read still opens the absolute paths the prompts give. Calls with wider tools (the doctor) keep the repo as cwd.
const LIGHT_DIR = path.join(os.tmpdir(), "job-pilot-claude");
const LIGHT_ARGS = ["--setting-sources", "", "--strict-mcp-config", "--disable-slash-commands"];

export class ClaudeLoginError extends Error {}
export class ClaudeLimitError extends Error {} // plan usage/session limit reached

// ---------- resumes ----------
let resumeCache = null;
export function loadResumes() {
  if (resumeCache) return resumeCache;
  const dir = path.resolve(DIR, config.llm.resumesDir);
  if (!fs.existsSync(dir)) throw new Error(`Resume folder not found: ${dir}`);
  resumeCache = fs.readdirSync(dir)
    .filter((f) => /\.(pdf|txt|md)$/i.test(f))
    .sort()
    .map((file) => ({ file, path: path.join(dir, file) }));
  if (!resumeCache.length) throw new Error(`No resumes (.pdf/.txt/.md) in ${dir}`);
  return resumeCache;
}

// ---------- Claude Code call ----------
// Runs `claude -p` with a JSON schema for the reply. By default only the Read tool is available (to open resume files);
// the doctor passes a wider tool set. `weekly: true` uses the weekly (stronger) model. `signal` (AbortSignal) stops the call (Guidance's Cancel).
export function ask({ system, prompt, schema, weekly = false, model, tools = ["Read"], permissionMode, timeoutMs = 5 * 60e3, signal }) {
  return new Promise((resolve, reject) => {
    if (!CLAUDE) return reject(new ClaudeLoginError("Claude Code CLI not found. Install it, then set its path in Settings if it isn't detected."));
    const args = [
      "-p", "--output-format", "json",
      "--json-schema", JSON.stringify(schema),
      "--system-prompt", system,
      "--model", model || (weekly ? config.llm.modelWeekly : config.llm.model),
      "--effort", config.llm.effort,
      "--tools", tools.map((t) => t.replace(/\(.*$/, "")).filter((t, i, a) => a.indexOf(t) === i).join(","),
      "--allowedTools", tools.join(","),
      "--no-session-persistence",
      ...(permissionMode ? ["--permission-mode", permissionMode] : []),
    ];
    const light = tools.every((t) => t === "Read");
    if (light) { args.push(...LIGHT_ARGS); fs.mkdirSync(LIGHT_DIR, { recursive: true }); }
    const p = spawn(CLAUDE, args, { cwd: light ? LIGHT_DIR : DIR, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "", err = "";
    const timer = setTimeout(() => { p.kill(); reject(new Error(`Claude Code timed out after ${Math.round(timeoutMs / 60e3)} minutes`)); }, timeoutMs);
    signal?.addEventListener("abort", () => { clearTimeout(timer); p.kill(); reject(Object.assign(new Error("Cancelled"), { cancelled: true })); }, { once: true });
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", () => {
      clearTimeout(timer);
      let res;
      try { res = JSON.parse(out); } catch { return reject(new Error(`Unreadable Claude Code output: ${(out || err).slice(0, 300)}`)); }
      if (res.is_error) {
        const msg = String(res.result || res.terminal_reason || "unknown error");
        if (/hit your .*limit|usage limit|session limit|rate limit/i.test(msg)) return reject(new ClaudeLimitError(msg));
        return reject(/not logged in|\/login|authenticat/i.test(msg) ? new ClaudeLoginError(msg) : new Error(`Claude Code: ${msg}`));
      }
      let data = res.structured_output;
      if (!data) { try { data = JSON.parse(res.result); } catch { return reject(new Error(`No structured output: ${String(res.result).slice(0, 300)}`)); } }
      resolve({ data, usage: { costUsd: res.total_cost_usd || 0, ...res.usage } });
    });
    p.stdin.end(prompt);
  });
}

export const PROFILE = () => `Candidate profile (facts supplied by the candidate):\n${config.profile}`;
export const GOALS = () => `Candidate's goals: ${config.preferences || "(not specified)"}`;
export const JOB = (job) => `Job posting\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location || "?"}\n\n${job.description}`;

// ---------- ATS scoring (+ improvement steps for the candidate) ----------
const ScoreSchema = {
  type: "object", additionalProperties: false, required: ["resumes", "best_file", "summary", "recommendations"],
  properties: {
    resumes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["file", "ats_score", "matched_keywords", "missing_keywords", "unmet_requirements", "reasoning"],
        properties: {
          file: { type: "string" },
          ats_score: { type: "number", description: "0-100 estimated ATS match score" },
          matched_keywords: { type: "array", items: { type: "string" } },
          missing_keywords: { type: "array", items: { type: "string" }, description: "ONLY learnable skills, tools, technologies, domain knowledge or certifications the job wants and the candidate lacks. Short canonical names (e.g. 'TIA Portal', 'RTOS')." },
          unmet_requirements: { type: "array", items: { type: "string" }, description: "Non-skill requirements the candidate does NOT meet per resume+profile: location, travel, years of experience, degree field, etc. Leave out anything the profile already satisfies." },
          reasoning: { type: "string" },
        },
      },
    },
    best_file: { type: "string" },
    summary: { type: "string", description: "Why the best resume wins, and whether the candidate is a realistic fit" },
    recommendations: {
      type: "array",
      description: "3-6 concrete things the candidate can do themselves to become a stronger match for THIS job, most impactful first",
      items: {
        type: "object", additionalProperties: false, required: ["type", "action", "why", "estimated_gain", "effort"],
        properties: {
          type: { type: "string", enum: ["project", "github", "portfolio", "certification", "course", "skill", "resume", "linkedin_profile", "other"] },
          action: { type: "string", description: "Specific and actionable, e.g. 'Build a CAN-bus logger on STM32 with FreeRTOS, publish it on GitHub with a README and a demo video, and add it to your portfolio site's Projects section'" },
          why: { type: "string", description: "Which requirement of this job it covers" },
          estimated_gain: { type: "number", description: "Estimated ATS points gained" },
          effort: { type: "string", enum: ["hours", "days", "weeks", "months"] },
        },
      },
    },
  },
};

const SCORER = `You are an applicant tracking system (ATS) and an experienced recruiter for the job's field and location.
Score how well each resume matches the job posting, the way an ATS plus a recruiter's first screen would:
required hard skills and tools, domain keywords, seniority/years of experience, education, certifications, language requirements, location.
Score 0-100 where 75+ is a strong match, 50-74 is a plausible match and below 50 is a weak match. Be calibrated and consistent between jobs.
Use the Read tool to open every resume file listed, and score each one using its exact file name.
The candidate profile is given too: facts in it (military status, driving license, languages, relocation willingness, citizenship)
count as met even if a resume doesn't state them.
Sanity rules for keywords: "missing_keywords" is ONLY for learnable skills, tools, technologies, domain knowledge and certifications.
Never put locations (e.g. Ankara), military status, driving licenses, travel willingness, generic duties or document words
(e.g. "teknik şartname", "raporlama", "koordinasyon"), soft skills or company-specific phrases there. Real unmet non-skill
requirements go in "unmet_requirements". Merge duplicates and use canonical names.
Also give recommendations: concrete steps the candidate can take on their own to become a better match for this specific job
(portfolio projects with a suggested scope, publishing work on GitHub or a personal website's projects section, named certifications or courses,
skills to learn, LinkedIn profile changes, or things they've likely done that the resume doesn't mention). Be realistic about effort and gain.
Formatting of explanation fields (reasoning, summary, critique, honest_take, why, how_to_present, to_make_it_valuable): 2-4 short lines, each starting with "- ", with the key term of each line in **bold**. No long paragraphs.
Reply only with the structured result.`;

ScoreSchema.required.push("github_projects");
ScoreSchema.properties.github_projects = {
  type: "array",
  description: "The candidate's GitHub repos that relate to this job (leave out unrelated ones), most relevant first",
  items: {
    type: "object", additionalProperties: false, required: ["repo", "relevance", "recommendation", "honest_take", "how_to_present"],
    properties: {
      repo: { type: "string" },
      relevance: { type: "number", description: "0-10 relevance to this job" },
      recommendation: { type: "string", enum: ["feature_on_resume", "mention_briefly", "leave_off"] },
      honest_take: { type: "string", description: "Blunt: does it actually help in interviews for this job, or is it only ATS padding? If padding, say exactly: 'ATS padding: not really beneficial for actual job hunting'." },
      how_to_present: { type: "string", description: "A truthful resume bullet for it, or what to improve first before showing it" },
    },
  },
};

const GITHUB_SCORING = `
The candidate's GitHub repos and an independent critical review of each are included. In "github_projects", judge which ones
are worth putting on the resume FOR THIS JOB. Be critical: a project only really helps if it shows real engineering a hiring
manager would want to discuss in an interview. If a repo would only add keywords, say plainly that it's ATS padding and not
really beneficial for actual job hunting. Recommendations of type "github" can suggest improving an existing repo.`;

// Scores the given resume files (default: everything in the resumes folder) against a job.
// extra: more candidate context (rescore.mjs passes the to-do steps you marked done)
export async function scoreResumes(job, files = loadResumes(), github = "", extra = "") {
  const prompt = `Resume files to read and score:\n${files.map((r) => `- ${r.file}: ${r.path}`).join("\n")}\n\n${PROFILE()}${extra ? `\n\n${extra}` : ""}\n\n${JOB(job)}${github ? `\n\n${github}\n${GITHUB_SCORING}` : ""}`;
  const { data, usage } = await ask({ system: SCORER, prompt, schema: ScoreSchema });
  if (!files.some((r) => r.file === data.best_file)) {
    data.best_file = [...data.resumes].sort((a, b) => b.ats_score - a.ats_score)[0]?.file;
  }
  data.best_score = data.resumes.find((r) => r.file === data.best_file)?.ats_score ?? 0;
  return { ...data, usage };
}

// ---------- resume tailoring ----------
export const ResumeSchema = {
  type: "object", additionalProperties: false,
  required: ["language", "name", "headline", "contact", "summary", "sections", "skills", "github_added", "changes", "not_added"],
  properties: {
    language: { type: "string", enum: ["en", "tr"] },
    name: { type: "string" },
    headline: { type: "string", description: "One line under the name, e.g. 'Embedded Software Engineer | STM32 · Embedded C · RTOS'" },
    contact: { type: "array", items: { type: "string" }, description: "Email, phone, city, LinkedIn, GitHub, website: exactly as on the source resume" },
    summary: { type: "string", description: "3-4 lines tailored to this job" },
    sections: {
      type: "array", description: "Experience, Projects, Education, Certifications, Languages... in the order that best fits the job",
      items: {
        type: "object", additionalProperties: false, required: ["title", "items"],
        properties: {
          title: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["heading", "subheading", "meta", "bullets"],
              properties: {
                heading: { type: "string", description: "Role / project / degree" },
                subheading: { type: "string", description: "Company / institution, or empty" },
                meta: { type: "string", description: "Dates and location, exactly as in the source" },
                bullets: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
    skills: { type: "array", items: { type: "object", additionalProperties: false, required: ["group", "items"], properties: { group: { type: "string" }, items: { type: "array", items: { type: "string" } } } } },
    github_added: {
      type: "array", description: "GitHub repos put on this resume as projects",
      items: {
        type: "object", additionalProperties: false, required: ["repo", "verdict", "note"],
        properties: {
          repo: { type: "string" },
          verdict: { type: "string", enum: ["real_value", "moderate", "ats_padding"] },
          note: { type: "string", description: "Why it was added. For ats_padding, state plainly that it's there for the ATS and isn't really beneficial for actual job hunting." },
        },
      },
    },
    changes: { type: "array", description: "What was changed versus the source resume and why", items: { type: "object", additionalProperties: false, required: ["what", "why"], properties: { what: { type: "string" }, why: { type: "string" } } } },
    not_added: { type: "array", items: { type: "string" }, description: "Job requirements deliberately NOT claimed because the source resumes don't support them" },
  },
};

const TAILOR = `You are an expert technical resume writer. Rewrite the candidate's resume so it scores as high as possible
in an ATS screen for the given job, while staying 100% truthful.

Allowed:
- Rephrase real experience using the job posting's terminology, when it accurately describes what the candidate did.
- Reorder sections and bullets so the most relevant work comes first; drop or shorten irrelevant items.
- Write a summary and headline targeted at this role.
- Bring in true facts, projects, skills and certifications from the candidate's OTHER resume versions and profile.
- Quantify results only with numbers that appear in the sources.
- Write in the language of the job posting (English or Turkish).

Not allowed:
- Adding any skill, tool, technology, certification, employer, title, degree, date, number or responsibility the sources don't support.
- Inflating years of experience, seniority or level of involvement.
- Hidden text or keyword stuffing.
List every job requirement you couldn't honestly cover under "not_added". Keep it to one or two pages.
GitHub repos (if provided) are true facts you may use as projects, described exactly as their README/code supports, with the repo URL.
Prefer repos reviewed as real value. Only add an "ats_padding" repo if it covers a requirement nothing else covers, and record it
in github_added with a note saying plainly it's there for the ATS and isn't really beneficial for actual job hunting.
Use the Read tool to open the resume files. Reply only with the structured result.`;

// basePath: the base resume when it's not one of the uploads (e.g. a library resume)
export async function tailorResume({ job, baseFile, basePath = null, ats, feedback = null, previous = null, github = "" }) {
  const all = loadResumes();
  const base = basePath ? { file: baseFile, path: basePath } : (all.find((r) => r.file === baseFile) ?? all[0]);
  const others = all.filter((r) => r.path !== base.path);
  const prompt = [
    `Base resume to tailor: ${base.file} (read it at ${base.path})`,
    `Other versions of the candidate's resume (read them too; they're sources of true facts only):\n${others.map((r) => `- ${r.file}: ${r.path}`).join("\n")}`,
    PROFILE(),
    github,
    JOB(job),
    `ATS analysis of the base resume: score ${ats.ats_score}. Missing keywords: ${ats.missing_keywords.join(", ")}. ${ats.reasoning}`,
    previous ? `Your previous tailored version:\n${JSON.stringify(previous)}` : "",
    feedback ? `The ATS re-scored that version: ${feedback}. Improve it further, but only with truthful changes.` : "",
  ].filter(Boolean).join("\n\n");
  const { data, usage } = await ask({ system: TAILOR, prompt, schema: ResumeSchema, timeoutMs: 8 * 60e3 });
  return { resume: data, usage };
}

// Answering form questions and picking the day's jobs live in llm_daily.mjs (re-exported here)
export { answerQuestions, selectJobs } from "./llm_daily.mjs";
// GitHub review, market review, keyword audit and the onboarding plan live in llm_reviews.mjs (re-exported here)
export { assessRepos, marketReview, auditKeywords, planTargets } from "./llm_reviews.mjs";

// ---------- resume library: one ready resume per target field ----------
export async function libraryResume({ field, requirements, github }) {
  const all = loadResumes();
  const system = TAILOR.replace("for the given job", "for the TYPICAL job in the given field (not one specific posting)");
  const prompt = [
    `Field: ${field.field}. Typical searches: ${(field.searchTerms || []).join(", ")}.`,
    `What employers in this field asked for most often in the jobs analyzed so far (sanity-checked; may be empty early on):\n${requirements || "(no data yet)"}`,
    `The candidate's resume versions (read them; they are the only sources of facts):\n${all.map((r) => `- ${r.file}: ${r.path}`).join("\n")}`,
    PROFILE(), GOALS(), github || "",
    `Write the strongest truthful general-purpose resume for applications in this field, in the language most jobs in this field and location use.`,
  ].filter(Boolean).join("\n\n");
  const { data, usage } = await ask({ system, prompt, schema: ResumeSchema, weekly: true, timeoutMs: 10 * 60e3 });
  return { resume: data, usage };
}
