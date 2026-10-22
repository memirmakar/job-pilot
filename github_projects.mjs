// Projects for your resume: which GitHub repos may go on resumes (Use on resumes / Never use / Not reviewed), each approved repo
// with the name and one-line description resumes use. Stored in data/github/projects.json; only approved repos reach any prompt.
import fs from "node:fs";
import path from "node:path";
import { DATA } from "./config.mjs";

const DIR_GH = path.join(DATA, "github");
const FILE = path.join(DIR_GH, "projects.json");
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };

export const loadProjects = () => readJson(FILE, {});
export function saveProjects(p) { fs.mkdirSync(DIR_GH, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(p, null, 2)); return p; }
const repos = () => readJson(path.join(DIR_GH, "repos.json"), {})?.repos || [];
const reviews = () => readJson(path.join(DIR_GH, "review.json"), {});

// Every repo with its review and your choice; state "unreviewed" when you haven't decided
export function projectsView() {
  const p = loadProjects(), rv = reviews();
  return repos().map((r) => {
    const mine = p[r.name] || {}, v = rv[r.name] || null;
    return { repo: r.name, url: r.url, description: r.description, languages: Object.keys(r.languages || {}).slice(0, 4), commits: r.commits,
      review: v && { verdict: v.verdict, summary: v.summary, pin: v.pin, relevance: v.relevance, field: v.field },
      state: mine.state === "use" || mine.state === "never" ? mine.state : "unreviewed",
      resumeName: mine.resumeName || "", resumeLine: mine.description || "", suggested: mine.suggested || null, at: mine.at || null };
  });
}

export function setProject(repo, patch) {
  const p = loadProjects(), cur = p[repo] || {};
  const next = { ...cur, at: new Date().toISOString() };
  if (patch.state !== undefined) next.state = ["use", "never"].includes(patch.state) ? patch.state : undefined;
  if (patch.resumeName !== undefined) next.resumeName = String(patch.resumeName).trim().slice(0, 90);
  if (patch.resumeLine !== undefined) next.description = String(patch.resumeLine).trim().slice(0, 220);
  // Approving fills the name and line from Claude's suggestion until you write your own
  if (next.state === "use") { next.resumeName ||= cur.suggested?.name || ""; next.description ||= cur.suggested?.description || ""; }
  p[repo] = next;
  return saveProjects(p)[repo];
}

// The repos tailoring, scoring, ready resumes, re-upload checks and the coach may use: approved ones only, under their resume names
export function approvedRepos(all = repos()) {
  const p = loadProjects(), rv = reviews();
  return all.filter((r) => p[r.name]?.state === "use").map((r) => ({ ...r, review: r.review || rv[r.name] || null,
    resumeName: p[r.name].resumeName || p[r.name].suggested?.name || r.name, resumeLine: p[r.name].description || p[r.name].suggested?.description || "" }));
}
export function approvedBrief(all) {
  const list = approvedRepos(all);
  if (!list.length) return "";
  return `GitHub projects the candidate approved for resumes. On a resume, call each one EXACTLY by its resume name (never the repo name) and describe it only with its line and what the review states; invent no other details. No other repo may appear on a resume:\n` +
    list.map((r) => {
      const v = r.review;
      return `- Resume name: "${r.resumeName}" | line: ${r.resumeLine || "(none)"} | repo ${r.name} (${r.url}) | ${Object.keys(r.languages || {}).join(", ") || "no code"}` +
        (v ? `\n  Review: ${String(v.verdict || "").toUpperCase()}. ${v.summary || ""} Skills shown: ${(v.skills_demonstrated || []).join(", ")}.` : "");
    }).join("\n");
}

// ---------- Claude's suggestions (you decide) ----------
const SuggestSchema = {
  type: "object", additionalProperties: false, required: ["projects"],
  properties: { projects: { type: "array", items: { type: "object", additionalProperties: false, required: ["repo", "state", "name", "description", "why"], properties: {
    repo: { type: "string" },
    state: { type: "string", enum: ["use", "never"], description: "use = worth showing employers in the candidate's target fields; never = hobby, gaming, tutorial exercises or padding" },
    name: { type: "string", description: "A professional resume project name with the key specs from the review, e.g. 'Closed-loop FOC motor driver (STM32G4, 36–48 V)'" },
    description: { type: "string", description: "One short line (at most 140 characters) in professional wording, only what the README/review supports" },
    why: { type: "string", description: "One short sentence" } } } } },
};

export async function suggestProjects(targets = "") {
  const { ask } = await import("./llm.mjs");
  const rv = reviews(), list = repos();
  if (!list.length) return projectsView();
  const prompt = `Candidate's target fields: ${targets || "(not set)"}\n\nRepos:\n` + list.map((r) => {
    const v = rv[r.name] || {};
    return `- ${r.name}: ${r.description || "(no description)"} | ${Object.keys(r.languages || {}).join(", ")} | ${r.commits} commits\n  Review: ${v.verdict || "none"}. ${v.summary || ""} ${v.critique || ""}`;
  }).join("\n");
  const system = `You help a candidate choose which GitHub repos to put on their resumes, and how to name them. Suggest "never" for hobby,
gaming, tutorial-exercise and ATS-padding repos (e.g. a game demo uploader or a game server guide). Name projects professionally with real specs from the review,
never inventing details. The candidate decides; you only suggest. Reply only with the structured result.`;
  const { data } = await ask({ system, prompt, schema: SuggestSchema, timeoutMs: 4 * 60e3 });
  const p = loadProjects();
  for (const s of data.projects) if (list.some((r) => r.name === s.repo)) {
    p[s.repo] = { ...(p[s.repo] || {}), suggested: { state: s.state, name: s.name, description: s.description, why: s.why, at: new Date().toISOString() } };
  }
  saveProjects(p);
  return projectsView();
}
