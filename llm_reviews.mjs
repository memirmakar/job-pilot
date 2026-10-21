// Weekly and setup calls to Claude: GitHub repo review, market review + to-do list, keyword audit, and the onboarding plan
// (also "Ask Claude to suggest searches" in Settings). Split from llm.mjs, which re-exports them.
import config from "./config.mjs";
import { ask, PROFILE, GOALS } from "./llm.mjs";

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
