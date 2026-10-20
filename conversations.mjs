// "Ask Claude about this job": a short chat with one job as context, through llm.mjs ask().
// Each job's conversation is kept in data/conversations/<site>-<id>.json, so Guidance (stage 5) can list them.
import fs from "node:fs";
import path from "node:path";
import { DIR, DATA } from "./config.mjs";
import config from "./config.mjs";
import { ask } from "./llm.mjs";
import { githubBrief } from "./github.mjs";

const CONV_DIR = path.join(DATA, "conversations");
const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
const safe = (s) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "");
const convPath = (site, id) => path.join(CONV_DIR, `${safe(site)}-${safe(id)}.json`);

export const loadConversation = (site, id) => readJson(convPath(site, id), { site, id, messages: [] });

export function listConversations() {
  if (!fs.existsSync(CONV_DIR)) return [];
  return fs.readdirSync(CONV_DIR).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(CONV_DIR, f))).filter(Boolean)
    .map(({ messages, ...c }) => ({ ...c, count: messages.length, last: messages.at(-1)?.at }));
}

const Reply = { type: "object", additionalProperties: false, required: ["reply"], properties: { reply: { type: "string" } } };

const SYSTEM = `You are Claude inside Job Pilot, an app that finds jobs for the candidate, scores their resumes and applies for them.
The candidate is asking about ONE job. You have the posting, Claude's earlier analysis (ATS score, matched and missing skills,
improvement steps), the candidate's goals and profile, and their GitHub. Use the Read tool to open the tailored resume if it helps.
Be honest and specific to this job; never invent experience. Answer in the language the candidate writes in.
Keep replies short: 2-6 sentences or a few "- " bullets. Plain text, no headings.`;

// Cached GitHub repos + reviews (never fetches: the daily run keeps them fresh)
function github() {
  const repos = readJson(path.join(DATA, "github", "repos.json"))?.repos || [];
  const reviews = readJson(path.join(DATA, "github", "review.json"), {});
  try { return githubBrief(repos.map((r) => ({ ...r, languages: r.languages || {}, review: reviews[r.name] || null }))); } catch { return ""; }
}

function context(rec) {
  const t = rec.tailored, final = t?.used ? t.ats : rec.ats?.resumes?.find((r) => r.file === rec.ats.best_file);
  const resume = t?.used ? t.path : rec.tailored?.basePath || `resumes/${rec.ats?.best_file}`;
  return [
    `Job posting\nTitle: ${rec.title}\nCompany: ${rec.company}\nLocation: ${rec.location || "?"}\nPosted: ${rec.postedText || "?"} · Applicants: ${rec.applicants || "?"}\n\n${rec.description}`,
    `Status in Job Pilot: ${rec.status}${rec.statusReason ? ` (${rec.statusReason})` : ""}`,
    `ATS score: ${t?.used ? `${t.score} tailored, ${t.baseScore} before tailoring` : rec.ats?.best_score}. Cutoff ${config.settings.minAtsScore}, target ${config.settings.tailorTarget}.`,
    final ? `Matched: ${(final.matched_keywords || []).join(", ")}\nMissing: ${(final.missing_keywords || []).join(", ")}\nReasoning: ${final.reasoning}` : "",
    rec.ats?.summary ? `Claude's summary: ${rec.ats.summary}` : "",
    `Improvement steps Claude suggested:\n${((t?.used && t.recommendations) || rec.ats?.recommendations || []).map((r) => `- (+${r.estimated_gain}, ${r.effort}) ${r.action}`).join("\n")}`,
    `Resume to send: ${path.join(DIR, resume)}`,
    `Candidate's goals: ${config.preferences || "(not specified)"}`,
    `Candidate profile (facts supplied by the candidate):\n${config.profile}`,
    github(),
  ].filter(Boolean).join("\n\n");
}

// Appends the user's message and Claude's reply; returns the whole conversation.
export async function askAboutJob(rec, message) {
  const conv = loadConversation(rec.site, rec.id);
  const history = conv.messages.slice(-12).map((m) => `${m.role === "user" ? "Candidate" : "Claude"}: ${m.text}`).join("\n\n");
  const prompt = `${context(rec)}\n\n---\n${history ? `Conversation so far:\n${history}\n\n` : ""}Candidate: ${message}`;
  const { data, usage } = await ask({ system: SYSTEM, prompt, schema: Reply, timeoutMs: 3 * 60e3 });
  const at = new Date().toISOString();
  conv.messages.push({ role: "user", text: message, at }, { role: "claude", text: data.reply, at: new Date().toISOString() });
  Object.assign(conv, { site: rec.site, id: rec.id, title: rec.title, company: rec.company, updatedAt: at, costUsd: (conv.costUsd || 0) + (usage.costUsd || 0) });
  fs.mkdirSync(CONV_DIR, { recursive: true });
  fs.writeFileSync(convPath(rec.site, rec.id), JSON.stringify(conv, null, 2));
  return conv;
}
