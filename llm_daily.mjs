// Per-job calls to Claude besides scoring and tailoring: answering Easy Apply questions, and picking which listings to
// analyze today. Split from llm.mjs, which re-exports them.
import config from "./config.mjs";
import { ask, PROFILE, GOALS, JOB, loadResumes } from "./llm.mjs";

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

// fields: the search profiles that are on (all target fields by default)
export async function selectJobs(candidates, n, fields = (config.targets || []).map((t) => t.field)) {
  const system = `You pick which job listings a job seeker's tool should analyze today. Choose at most ${n} listings that best match the
candidate's goals, target fields, seniority and locations. Prefer realistic fits over prestige; skip wrong seniority, wrong function,
duplicates (same role reposted) and spam. Fewer than ${n} is fine if the rest are poor fits. Reply only with the structured result.`;
  const prompt = [
    GOALS(),
    `Target fields: ${fields.join("; ")}`,
    `Listings (key | title | company | location | posted | apply type):\n` +
      candidates.map((c) => `${c.key} | ${c.title} | ${c.company} | ${c.location || "?"} | ${c.posted || "?"} | ${c.easyApply ? "Easy Apply" : "external"}`).join("\n"),
  ].join("\n\n");
  const { data, usage } = await ask({ system, prompt, schema: SelectSchema });
  return { ...data, usage };
}
