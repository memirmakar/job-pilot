// Claude reads resume files back into the structured resume (the same shape tailoring writes), through llm.mjs ask():
// a new original (roles, skills, languages) and an edited re-upload (what changed, and lines the sources don't support).
import fs from "node:fs";
import path from "node:path";
import { DIR, DATA } from "./config.mjs";
import { ask, PROFILE, ResumeSchema } from "./llm.mjs";
import { githubBrief } from "./github.mjs";
import { rulesText } from "./resume_prefs.mjs";

const CORE = ["language", "name", "headline", "contact", "summary", "sections", "skills", "photo"];
const Structured = { type: "object", additionalProperties: false, required: CORE, properties: Object.fromEntries(CORE.map((k) => [k, ResumeSchema.properties[k]])) };
const strs = { type: "array", items: { type: "string" } };

// The cached GitHub repos and reviews (never fetched or reviewed here)
function cachedGithub() {
  try {
    const repos = JSON.parse(fs.readFileSync(path.join(DATA, "github", "repos.json"), "utf8")).repos || [];
    const reviews = JSON.parse(fs.readFileSync(path.join(DATA, "github", "review.json"), "utf8"));
    return githubBrief(repos.map((r) => ({ ...r, review: reviews[r.name] || null })));
  } catch { return ""; }
}
// The originals as they are now (llm.mjs caches its list for a run; the app's server lives longer)
const sources = (exclude) => fs.readdirSync(path.join(DIR, "resumes")).filter((f) => /\.(pdf|txt|md)$/i.test(f)).sort()
  .map((file) => ({ file, path: path.join(DIR, "resumes", file) })).filter((r) => path.resolve(r.path) !== path.resolve(exclude || ""));

// ---------- a new original ----------
const OriginalSchema = {
  type: "object", additionalProperties: false, required: ["resume", "roles", "skills", "languages", "suggested_name", "new_skills"],
  properties: {
    resume: Structured,
    roles: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "org", "dates"],
      properties: { title: { type: "string" }, org: { type: "string" }, dates: { type: "string" } } }, description: "Jobs and internships, newest first" },
    skills: { ...strs, description: "Hard skills and tools, short canonical names, most prominent first (at most 14)" },
    languages: { ...strs, description: "Spoken languages with level, e.g. 'English, C1'" },
    suggested_name: { type: "string", description: "A short name for this resume: its focus and language, e.g. 'Embedded (EN)'" },
    new_skills: { ...strs, description: "Skills in this file that none of the candidate's other resumes mention" },
  },
};

export async function readOriginal(filePath) {
  const others = sources(filePath);
  const prompt = [
    `Read this resume file and return it as a structured resume, word for word (don't improve or translate anything): ${filePath}`,
    others.length ? `The candidate's other resumes (read them only to find skills that are new in this file):\n${others.map((r) => `- ${r.file}: ${r.path}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  const system = `You read resumes exactly as written. Copy every line into the structured resume without rewording, adding or dropping anything.
"language" is the language the resume is written in. Use the Read tool to open the files. Reply only with the structured result.`;
  const { data, usage } = await ask({ system, prompt, schema: OriginalSchema, timeoutMs: 6 * 60e3 });
  return { ...data, usage };
}

// ---------- an edited version of a tailored or ready resume ----------
const CheckSchema = {
  type: "object", additionalProperties: false, required: ["resume", "changes", "unsupported"],
  properties: {
    resume: Structured,
    changes: { type: "array", description: "Every difference from the current version, in reading order", items: { type: "object", additionalProperties: false,
      required: ["kind", "where", "text", "note", "rule"], properties: {
        kind: { type: "string", enum: ["Added", "Moved", "Reworded", "Removed"] },
        where: { type: "string", description: "Section, e.g. 'Summary' or 'Projects'" },
        text: { type: "string", description: "The new line, or the removed one" },
        note: { type: "string", description: "Short: where the fact comes from (an original, the profile, GitHub), or 'can't verify'" },
        rule: { type: "string", description: "The candidate's standing rule this change follows, word for word, or empty" } } } },
    unsupported: { type: "array", description: "Lines in the edited file that state a fact (skill, tool, employer, title, date, number, responsibility, project) that no original resume, profile fact or GitHub repo supports", items: { type: "object",
      additionalProperties: false, required: ["text", "where"], properties: { text: { type: "string" }, where: { type: "string" } } } },
  },
};

export async function checkEdited({ filePath, current }) {
  const all = sources();
  const prompt = [
    `The candidate edited their resume outside the app. Read the edited file: ${filePath}`,
    `The current version it was edited from (structured):\n${JSON.stringify(current)}`,
    `The candidate's original resumes, the only sources of facts besides the profile and GitHub (read them):\n${all.map((r) => `- ${r.file}: ${r.path}`).join("\n")}`,
    PROFILE(), rulesText(), cachedGithub(),
  ].filter(Boolean).join("\n\n");
  const system = `You check an edited resume. Lines the profile lists as "Confirmed by me" count as supported. Keep "photo" as the photo rule says. 1) Copy the edited file into the structured resume exactly as written, without rewording or fixing it.
2) List what changed against the current version. 3) List every line whose facts none of the sources support. Rewording a supported fact is fine;
a new skill, tool, employer, title, date, number, project or responsibility that no source shows is unsupported. Never invent or assume experience.
Use the Read tool to open the files. Reply only with the structured result.`;
  const { data, usage } = await ask({ system, prompt, schema: CheckSchema, timeoutMs: 8 * 60e3 });
  return { ...data, usage };
}

// Drops the lines the user chose to remove (bullets, summary sentences, skills) from a structured resume
// Claude quotes lines with small differences (punctuation, spacing), so lines match on their letters and digits
const norm = (s) => String(s || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function removeLines(resume, lines) {
  const drop = lines.map(norm).filter(Boolean);
  if (!drop.length) return resume;
  const hit = (s) => { const n = norm(s); return !!n && drop.some((d) => d === n || (d.length > 24 && n.includes(d)) || (n.length > 24 && d.includes(n))); };
  const r = structuredClone(resume);
  r.sections = r.sections.map((s) => ({ ...s, items: s.items.filter((it) => !hit(it.heading)).map((it) => ({ ...it, bullets: it.bullets.filter((b) => !hit(b)) })) }));
  r.skills = r.skills.map((g) => ({ ...g, items: g.items.filter((i) => !hit(i)) })).filter((g) => g.items.length);
  r.summary = r.summary.split(/(?<=[.!?])\s+/).filter((sentence) => !hit(sentence)).join(" ");
  return r;
}

// Shared with resume_instruct.mjs ("Ask Claude to change this resume")
export { Structured, CheckSchema, sources, cachedGithub };
