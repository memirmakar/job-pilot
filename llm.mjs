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
// the doctor passes a wider tool set. `weekly: true` uses the weekly (stronger) model.
export function ask({ system, prompt, schema, weekly = false, model, tools = ["Read"], permissionMode, timeoutMs = 5 * 60e3 }) {
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
    const p = spawn(CLAUDE, args, { cwd: DIR, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "", err = "";
    const timer = setTimeout(() => { p.kill(); reject(new Error(`Claude Code timed out after ${Math.round(timeoutMs / 60e3)} minutes`)); }, timeoutMs);
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
const GOALS = () => `Candidate's goals: ${config.preferences || "(not specified)"}`;
const JOB = (job) => `Job posting\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location || "?"}\n\n${job.description}`;

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

// ---------- answering questions ----------
const AnswerSchema = {
  type: "object", additionalProperties: false, required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["id", "value", "reasoning", "confidence"],
        properties: {
          id: { type: "string", description: "The field id exactly as given" },
          value: { type: "string", description: "For select/radio/checkbox: exactly one of the listed options, verbatim. For text: the text to type. Empty string to leave blank." },
          reasoning: { type: "string", description: "One or two sentences on why this answer" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
  },
};

export async function answerQuestions({ job, resumeFile, resumePath = null, fields, previous, rejection = null }) {
  const resume = resumePath ? { file: resumeFile, path: resumePath } : (loadResumes().find((r) => r.file === resumeFile) ?? loadResumes()[0]);
  const system = `You fill in job application forms for a candidate. Your goal is to maximize the chance of getting an interview.

Rules:
- The candidate's standard answers (in the profile) come first: when a question matches one, use it, in the question's language, fitted to the field's options and format.
- Facts about experience, skills, tools, education, certifications and legal status must come from the resume or the candidate profile. Don't claim a skill, degree or certification that isn't there. For "years of experience with X", count from the resume; if X is closely related to something the candidate did, credit that time.
- Preference and negotiable questions (salary expectation, notice period, start date, relocation, travel, shifts, remote/onsite, willingness to learn) are your call: pick the answer most likely to get an interview. For salary, give a competitive, realistic figure for this role, seniority and location (in the currency and convention the form or job location implies, e.g. monthly net or yearly gross) that won't screen the candidate out. Follow any hints in the candidate profile.
- For select, radio and checkbox fields, the value must be exactly one of the listed options.
- Numeric fields get digits only.
- Keep free-text answers short, specific and professional, in the language of the question. A field with maxLength must fit within that many characters (aim for 90% of it); cover letters/messages without a limit: under 600 characters.
- Answer every field in the list.
Use the Read tool to open the resume file. Reply only with the structured result.`;
  const prompt = [
    `Resume being submitted: ${resume.file} (read it at ${resume.path})`,
    PROFILE(),
    JOB(job),
    previous.length ? `Answers already given earlier in this application:\n${JSON.stringify(previous.map(({ label, value }) => ({ label, value })), null, 1)}` : "",
    rejection ? `The form REJECTED the previous answers on this step. Here is the page text, including its error messages. Fix whatever it complains about (length limits, formats, required fields) and answer every field again:\n---\n${rejection}\n---` : "",
    `Fields to fill on this step:\n${JSON.stringify(fields.map(({ id, kind, label, options, numeric, maxLength }) => ({ id, kind, label, ...(options ? { options } : {}), ...(numeric ? { numeric: true } : {}), ...(maxLength ? { maxLength } : {}) })), null, 1)}`,
  ].filter(Boolean).join("\n\n");
  const { data, usage } = await ask({ system, prompt, schema: AnswerSchema });
  return { answers: data.answers, usage };
}

// ---------- GitHub repo review (cached by github.mjs; re-run only when a repo changes) ----------
const RepoReviewSchema = {
  type: "object", additionalProperties: false, required: ["reviews"],
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "summary", "skills_demonstrated", "verdict", "critique", "to_make_it_valuable", "resume_line", "relevance", "field", "fixes", "pin"],
        properties: {
          name: { type: "string" },
          summary: { type: "string", description: "What the project actually is and does, from the README and code" },
          skills_demonstrated: { type: "array", items: { type: "string" }, description: "Only skills the repo really shows" },
          verdict: { type: "string", enum: ["real_value", "moderate", "ats_padding", "not_relevant"] },
          critique: { type: "string", description: "Blunt assessment of depth, originality, quality and documentation" },
          to_make_it_valuable: { type: "string", description: "Concrete improvements that would make it worth showing an employer" },
          resume_line: { type: "string", description: "One truthful resume bullet for it, or empty if it shouldn't be on a resume" },
          relevance: { type: "integer", minimum: 0, maximum: 100, description: "How much it matters to an employer in the candidate's target fields" },
          field: { type: "string", description: "The target field it fits best, exactly as listed, or 'none of your fields'" },
          fixes: { type: "array", items: { type: "string" }, description: "1-3 specific fixes, each one short sentence an employer would notice (no bullets, no bold)" },
          pin: { type: "string", enum: ["pin", "maybe", "dont"], description: "Pin it on the GitHub profile: the strongest repo per target field gets pin; at most 6 pins in total" },
        },
      },
    },
  },
};

export async function assessRepos(repos) {
  const system = `You are a blunt senior hiring manager for the candidate's target roles. ${GOALS()}
Review each of the candidate's GitHub repositories the way you would before an interview. Judge substance, not keywords:
original work vs tutorial/exercise/toy code, depth (commits, files, code size), documentation, whether it actually works,
and relevance to the candidate's target roles.
Verdicts:
- real_value: real work you'd want to discuss in an interview; genuinely strengthens an application
- moderate: some real work but thin, unfinished or poorly documented; worth a brief mention
- ats_padding: mainly adds keywords (exercises, tutorials, trivial or empty repos); not really beneficial for actual job hunting
- not_relevant: unrelated to the target roles, whatever its quality
Be accurate rather than harsh for its own sake.
Target fields: ${(config.targets || []).map((t) => t.field).join("; ") || "(not specified)"}. Rate relevance to them, name the field it fits best, and plan the profile pins across all repos.
Formatting of explanation fields (reasoning, summary, critique, honest_take, why, how_to_present, to_make_it_valuable): 2-4 short lines, each starting with "- ", with the key term of each line in **bold**. No long paragraphs.
Reply only with the structured result.`;
  const prompt = repos.map((r) => `### ${r.name}\nURL: ${r.url}\nDescription: ${r.description}\nLanguages (bytes): ${JSON.stringify(r.languages)}\n` +
    `Commits: ${r.commits} | Files: ${r.fileCount} | Size: ${r.sizeKb} KB | Created: ${r.created.slice(0, 10)} | Last push: ${r.pushed.slice(0, 10)}\n` +
    `Files: ${r.files.slice(0, 60).join(", ")}\nREADME:\n${r.readme || "(none)"}`).join("\n\n");
  const { data, usage } = await ask({ system, prompt, schema: RepoReviewSchema, weekly: true });
  return { reviews: data.reviews, usage };
}

// ---------- market review + prioritized to-do list (across all scored jobs) ----------
const MarketSchema = {
  type: "object", additionalProperties: false,
  required: ["headline", "verdict_points", "segments", "strengths", "gaps", "resume_fixes", "todo", "stop_doing"],
  properties: {
    headline: { type: "string", description: "One sentence: where the candidate stands in the market right now" },
    verdict_points: { type: "array", items: { type: "string" }, description: "3-5 short bullets with the big picture; key terms in **bold**" },
    segments: {
      type: "array", description: "One per job segment seen in the data (Robotics, Automation, Embedded, Technician, Other...)",
      items: {
        type: "object", additionalProperties: false, required: ["segment", "demand", "fit", "employers_want", "note"],
        properties: {
          segment: { type: "string" },
          demand: { type: "string", enum: ["high", "medium", "low"], description: "How many junior-friendly openings the data shows" },
          fit: { type: "string", enum: ["strong", "moderate", "weak"] },
          employers_want: { type: "array", items: { type: "string" }, description: "Top 4-6 requirements in this segment" },
          note: { type: "string", description: "One or two short sentences" },
        },
      },
    },
    strengths: { type: "array", items: { type: "object", additionalProperties: false, required: ["point", "evidence"], properties: { point: { type: "string" }, evidence: { type: "string" } } } },
    gaps: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["gap", "frequency", "severity"],
        properties: { gap: { type: "string" }, frequency: { type: "string", description: "e.g. 'missing in 23 of 41 scored jobs'" }, severity: { type: "string", enum: ["high", "medium", "low"] } },
      },
    },
    resume_fixes: { type: "array", items: { type: "object", additionalProperties: false, required: ["issue", "fix"], properties: { issue: { type: "string" }, fix: { type: "string" } } }, description: "Quick fixes to the resumes themselves (hours, not weeks)" },
    todo: {
      type: "array", description: "6-10 items, ordered by priority: biggest improvement in interview chances per hour of effort across ALL target jobs first",
      items: {
        type: "object", additionalProperties: false, required: ["title", "category", "impact", "effort_hours", "why", "steps", "done_when", "unlocks"],
        properties: {
          title: { type: "string" },
          category: { type: "string", enum: ["resume", "github", "project", "certification", "course", "skill", "linkedin", "applications"] },
          impact: { type: "string", enum: ["high", "medium", "low"] },
          effort_hours: { type: "number" },
          why: { type: "string", description: "One or two short sentences tied to the data" },
          steps: { type: "array", items: { type: "string" }, description: "3-6 concrete steps" },
          done_when: { type: "string", description: "A clear finish line" },
          unlocks: { type: "string", description: "Which job types it helps, and roughly how many of the scored jobs" },
        },
      },
    },
    stop_doing: { type: "array", items: { type: "string" }, description: "Things wasting time or hurting the candidate (e.g. applying to segment X, a repo to hide)" },
  },
};

export async function marketReview({ stats, preferences, github, resumes }) {
  const system = `You are a frank career coach and hiring manager for the candidate's target roles and locations (given below).
You get statistics computed from every job the candidate's auto-apply tool scored (ATS scores, missing/matched keywords, per-segment numbers,
per-job improvement suggestions), the candidate's best resumes, their GitHub review, profile and preferences.
Produce a market review and a PRIORITIZED to-do list. The candidate has limited time: rank by improvement in interview chances per hour,
across all target jobs (not one job). Focus on their preferred segments. Ground every claim in the numbers you were given.
Be honest: if a gap can't be closed quickly, say so; don't pad the list.
The missing-skill statistics were sanity-checked: only real skills/tools/knowledge/certifications are counted. Non-skill requirements
(location, travel, military, license...) are in "otherRequirements" with a "satisfied" flag; never present those as skill gaps, and
don't suggest fixing what the profile already satisfies (beyond stating it on the resume, if relevant). Prefer finishing/strengthening real projects over new toy projects,
and never suggest ATS padding. Text fields: short and scannable, key terms in **bold**.
Use the Read tool to open the resume files. Reply only with the structured result.`;
  const prompt = [
    `Candidate preferences: ${preferences}`,
    PROFILE(),
    `Resumes most often chosen as best (read them):\n${resumes.map((r) => `- ${r.file}: ${r.path}`).join("\n")}`,
    github,
    `Statistics from the scored jobs:\n${JSON.stringify(stats, null, 1)}`,
  ].filter(Boolean).join("\n\n");
  const { data, usage } = await ask({ system, prompt, schema: MarketSchema, weekly: true, timeoutMs: 10 * 60e3 });
  return { review: data, usage };
}

// ---------- keyword sanity audit (cached per keyword by market.mjs) ----------
const KeywordAuditSchema = {
  type: "object", additionalProperties: false, required: ["keywords"],
  properties: {
    keywords: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["keyword", "canonical", "kind", "satisfied_by_profile", "relevant_to_targets", "note"],
        properties: {
          keyword: { type: "string", description: "Exactly as given" },
          canonical: { type: "string", description: "Clean canonical name, merging synonyms/translations (e.g. 'siemens tia portal' -> 'TIA Portal', 'gömülü yazılım' -> 'Embedded software')" },
          kind: { type: "string", enum: ["skill", "tool", "domain_knowledge", "certification", "language", "education", "experience", "location", "travel", "military", "driving_license", "soft_skill", "generic_duty", "noise"] },
          satisfied_by_profile: { type: "boolean", description: "True if the candidate profile already meets it (e.g. license, military status, relocation, language)" },
          relevant_to_targets: { type: "boolean", description: "Would it matter for the candidate's target roles?" },
          note: { type: "string", description: "Very short, e.g. 'location, not a skill; you're willing to relocate'" },
        },
      },
    },
  },
};

export async function auditKeywords(keywords, preferences) {
  const system = `You sanity-check keywords that an ATS step extracted as "missing" from a candidate's resume.
Many are not skills at all: locations, military status, driving licenses, travel, generic duties ("raporlama", "teknik şartname"),
soft skills, or noise. Classify each keyword honestly. Only skill, tool, domain_knowledge and certification are things to learn.
Mark satisfied_by_profile when the candidate profile already covers it. Give a canonical name that merges duplicates and
Turkish/English variants. Reply only with the structured result.`;
  const prompt = `Candidate preferences: ${preferences}\n\n${PROFILE()}\n\nKeywords:\n${keywords.map((k) => `- ${k}`).join("\n")}`;
  const { data, usage } = await ask({ system, prompt, schema: KeywordAuditSchema });
  return { keywords: data.keywords, usage };
}

// ---------- onboarding: turn the user's own words into a search plan ----------
const PlanSchema = {
  type: "object", additionalProperties: false,
  required: ["name", "targets", "locations", "titleExclude", "seniority", "preferences", "facts", "notes"],
  properties: {
    name: { type: "string", description: "Candidate's full name from the resume" },
    targets: {
      type: "array", description: "2-6 target fields, most wanted first",
      items: {
        type: "object", additionalProperties: false, required: ["field", "searchTerms", "why"],
        properties: {
          field: { type: "string", description: "Short field name, e.g. 'Industrial automation', 'Data analytics', 'Nursing (ICU)'" },
          searchTerms: { type: "array", items: { type: "string" }, description: "3-6 LinkedIn job-title searches, including the local-language titles used in the chosen locations" },
          why: { type: "string", description: "One line: why this field fits the person's goals and background" },
        },
      },
    },
    locations: { type: "array", items: { type: "string" }, description: "LinkedIn location strings, e.g. 'Istanbul, Türkiye', 'Germany', 'European Union'" },
    titleExclude: { type: "array", items: { type: "string" }, description: "Title words that rule a job out for this person (wrong seniority, unwanted functions), in all relevant languages" },
    seniority: { type: "string" },
    preferences: { type: "string", description: "2-3 sentences summarizing what they want and don't want" },
    facts: { type: "string", description: "Profile facts from the resume and answers, one per line: email, phone, city, languages, work authorization, etc. Mark anything unknown as 'unknown'" },
    notes: { type: "string", description: "Anything worth telling the user about their plan (e.g. a goal that conflicts with their background)" },
  },
};

export async function planTargets({ goals, locations, workplace, seniority, extra, resumes }) {
  const system = `You help a job seeker set up an automated job search. From their own description of what they want, their locations
and their resumes, produce a concrete LinkedIn search plan. Use their words; don't push them toward a field they didn't ask for, but use
the resumes to choose realistic titles and seniority. Include local-language job titles for non-English locations.
Use the Read tool to open the resume files. Reply only with the structured result.`;
  const prompt = [
    `What they want to work on, in their words:\n${goals}`,
    `Locations: ${locations.join("; ") || "(not given)"}`, `Workplace: ${workplace.join(", ") || "any"}`, `Seniority they mention: ${seniority || "(not given)"}`,
    extra ? `Other things they told us:\n${extra}` : "",
    `Resumes:\n${resumes.map((r) => `- ${r.file}: ${r.path}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  const { data } = await ask({ system, prompt, schema: PlanSchema, weekly: true });
  return data;
}

// ---------- daily selection: pick the most relevant listings ----------
const SelectSchema = {
  type: "object", additionalProperties: false, required: ["picks", "poor_fits", "skipped_summary"],
  properties: {
    poor_fits: { type: "array", items: { type: "string" }, description: "Keys of listings that are clearly NOT a fit (wrong field, seniority, function, location). Leave out decent matches that just didn't make today's cut; they're reconsidered tomorrow." },
    picks: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["key", "field", "relevance", "reason"],
        properties: {
          key: { type: "string" },
          field: { type: "string", description: "Which of the candidate's target fields it belongs to (exact name), or 'Other'" },
          relevance: { type: "number", description: "0-10" },
          reason: { type: "string", description: "One short line" },
        },
      },
    },
    skipped_summary: { type: "string", description: "One or two lines on what kinds of listings were left out and why" },
  },
};

export async function selectJobs(candidates, n) {
  const system = `You pick which job listings a job seeker's tool should analyze today. Choose at most ${n} listings that best match the
candidate's goals, target fields, seniority and locations. Prefer realistic fits over prestige; skip wrong seniority, wrong function,
duplicates (same role reposted) and spam. Fewer than ${n} is fine if the rest are poor fits. Reply only with the structured result.`;
  const prompt = [
    GOALS(),
    `Target fields: ${(config.targets || []).map((t) => t.field).join("; ")}`,
    `Listings (key | title | company | location | posted | apply type):\n` +
      candidates.map((c) => `${c.key} | ${c.title} | ${c.company} | ${c.location || "?"} | ${c.posted || "?"} | ${c.easyApply ? "Easy Apply" : "external"}`).join("\n"),
  ].join("\n\n");
  const { data, usage } = await ask({ system, prompt, schema: SelectSchema });
  return { ...data, usage };
}

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
