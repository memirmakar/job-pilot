// Mock interview (Stage 5, canvas board Guidance-Interview): runs inside the job's conversation. Claude plans six questions from
// the posting and the tailored resume, asks them one at a time in English or Turkish, gives short feedback after each answer,
// and ends with a summary (strengths, weak answers, what to practise) saved in the conversation.
// One call to plan, one per answer (feedback + the next question in the chosen language), one to end. Skipping costs nothing.
import { ask } from "./llm.mjs";
import * as Store from "./coach_store.mjs";
import { cut, resumeText, statusOf, scoreOf } from "./coach_context.mjs";
import { currentStructured } from "./resumes.mjs";

const LANG = { en: "English", tr: "Turkish" };
const SYSTEM = `You run a realistic practice job interview for the candidate and coach them on their answers. You are not the employer and you
don't know what the real interviewers will ask; the questions are the ones the posting and the resume make likely. Be fair and specific,
never harsh, never flattering. Feedback is short: what worked (one sentence) and what to add or change (one or two sentences). Never invent
facts about the company or the candidate. Use the language you are told to.`;

// The job's facts an interviewer would have: posting (cut) and the resume they'd send
function brief(rec) {
  const t = rec.tailored, res = t?.path ? currentStructured(`t:${rec.site}-${rec.id}`)?.resume : null;
  const a = t?.used ? t.ats : rec.ats?.resumes?.find((x) => x.file === rec.ats.best_file);
  return [`Job: ${rec.title} at ${rec.company} (${rec.location || "?"}). Status in the app: ${statusOf(rec)}. Score ${scoreOf(rec)}.`,
    `Missing skills: ${(a?.missing_keywords || []).slice(0, 8).join(", ") || "none"}`,
    `Posting:\n${cut(rec.description, 2200)}`,
    `Resume they'd send:\n${res ? resumeText(res, 1600) : "(no tailored resume; use the posting only)"}`].join("\n\n");
}

const PlanSchema = { type: "object", additionalProperties: false, required: ["intro", "plan"], properties: {
  intro: { type: "string", description: "One or two sentences opening the interview, as the interviewer" },
  plan: { type: "array", minItems: 6, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["q", "about"], properties: {
    q: { type: "string", description: "The question as asked" }, about: { type: "string", description: "A 3-6 word topic label in English for the plan list" } } } } } };

export async function start(rec, lang = "en", { signal } = {}) {
  const conv = Store.forJob(rec);
  if (conv.interview) return conv;
  lang = LANG[lang] ? lang : "en";
  const prompt = `${brief(rec)}\n\nPlan a 6-question interview in ${LANG[lang]}: 1 about their most relevant experience, 2 technical from the posting's requirements,
1 on their biggest gap for this job (how they'd close it), 1 situational or behavioural, 1 practical (shifts, travel, licence, notice, only if the posting suggests it;
else another technical one). Questions come one at a time, so each stands alone.`;
  const { data, usage } = await ask({ system: SYSTEM, prompt, schema: PlanSchema, tools: [], timeoutMs: 3 * 60e3, signal });
  const at = new Date().toISOString();
  conv.interview = { job: `${rec.site}-${rec.id}`, lang, plan: data.plan.map((p) => ({ q: cut(p.q, 500), about: cut(p.about, 60) })), i: 0, startedAt: at, answers: [] };
  conv.messages.push({ role: "claude", kind: "iv-intro", text: data.intro, at }, { role: "claude", kind: "iv-question", n: 1, text: conv.interview.plan[0].q, at });
  Store.addUsage(conv, usage, SYSTEM.length + prompt.length);
  return Store.save(conv);
}

const FeedbackSchema = { type: "object", additionalProperties: false, required: ["worked", "improve"], properties: {
  worked: { type: "string" }, improve: { type: "string" },
  next_question: { type: "string", description: "The next planned question, asked in the interview language (may add a short bridge from this answer)" } } };

export async function answer(conv, rec, text, { signal } = {}) {
  const iv = conv.interview;
  if (!iv || iv.i >= iv.plan.length) throw new Error("No question is waiting for an answer");
  if (!text) throw new Error("Type your answer first, or skip the question");
  const q = iv.plan[iv.i], next = iv.plan[iv.i + 1];
  const prompt = `${brief(rec)}\n\nInterview language: ${LANG[iv.lang]}. Question ${iv.i + 1} of ${iv.plan.length}: ${q.q}\nCandidate's answer: ${cut(text, 3000)}\n\n` +
    `Give feedback in ${LANG[iv.lang]}: worked = what was good, improve = what to add or change (be concrete; if the answer claims something the resume doesn't show, say they should only say what's true).` +
    (next ? `\nThen next_question: ask this planned question in ${LANG[iv.lang]}: ${next.q}` : "\nThis was the last question; leave next_question empty.");
  const { data, usage } = await ask({ system: SYSTEM, prompt, schema: FeedbackSchema, tools: [], timeoutMs: 3 * 60e3, signal });
  const at = new Date().toISOString(), n = iv.i + 1;
  iv.answers.push({ n, q: q.q, a: cut(text, 3000), worked: data.worked, improve: data.improve });
  conv.messages.push({ role: "user", kind: "iv-answer", n, text, at },
    { role: "claude", kind: "iv-feedback", n, text: `${data.worked} ${data.improve}`, worked: data.worked, improve: data.improve, at });
  iv.i++;
  if (next) { if (data.next_question) next.q = cut(data.next_question, 500); conv.messages.push({ role: "claude", kind: "iv-question", n: n + 1, text: next.q, at }); }
  Store.addUsage(conv, usage, SYSTEM.length + prompt.length);
  return Store.save(conv);
}

// Skip: the next planned question, no call
export function skip(conv) {
  const iv = conv.interview;
  if (!iv || iv.i >= iv.plan.length) throw new Error("No question to skip");
  iv.answers.push({ n: iv.i + 1, q: iv.plan[iv.i].q, skipped: true });
  iv.i++;
  const at = new Date().toISOString();
  conv.messages.push({ role: "user", kind: "iv-answer", n: iv.i, text: "(skipped)", skipped: true, at });
  if (iv.plan[iv.i]) conv.messages.push({ role: "claude", kind: "iv-question", n: iv.i + 1, text: iv.plan[iv.i].q, at });
  return Store.save(conv);
}
// The language for the rest: the next feedback and question come in it
export function setLang(conv, lang) {
  if (!conv.interview || !LANG[lang]) throw new Error("No interview running");
  conv.interview.lang = lang;
  return Store.save(conv);
}

const SummarySchema = { type: "object", additionalProperties: false, required: ["overall", "strengths", "weak", "practise"], properties: {
  overall: { type: "string", description: "2-3 sentences" },
  strengths: { type: "array", maxItems: 4, items: { type: "string" } },
  weak: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false, required: ["n", "why"], properties: { n: { type: "integer" }, why: { type: "string" } } } },
  practise: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false, required: ["title", "why", "hours"], properties: {
    title: { type: "string", description: "Imperative, under 80 characters, e.g. 'Prepare a 1-minute Profinet answer'" }, why: { type: "string" }, hours: { type: "number" } } } } } };

export async function end(conv, rec, { signal } = {}) {
  const iv = conv.interview;
  if (!iv) throw new Error("No interview running");
  const answered = iv.answers.filter((a) => !a.skipped), at = new Date().toISOString();
  let msg;
  if (!answered.length) msg = { role: "claude", kind: "iv-summary", text: "Interview ended before any answers, so there's nothing to review.", at, summary: null, actions: [] };
  else {
    const prompt = `${brief(rec)}\n\nThe practice interview (in ${LANG[iv.lang]}) is over. Questions and answers:\n` +
      answered.map((a) => `Q${a.n}: ${a.q}\nA: ${a.a}\nFeedback given: ${a.worked} ${a.improve}`).join("\n\n") +
      `\n\nWrite the summary in English: overall, strengths, weak answers (question number and why) and 1-4 things to practise before the real interview.`;
    const { data, usage } = await ask({ system: SYSTEM, prompt, schema: SummarySchema, tools: [], timeoutMs: 3 * 60e3, signal });
    Store.addUsage(conv, usage, SYSTEM.length + prompt.length);
    const practise = data.practise.map((p) => ({ title: cut(p.title, 100), why: cut(p.why, 400), hours: p.hours, kind: "practice" }));
    msg = { role: "claude", kind: "iv-summary", text: data.overall, at, summary: { strengths: data.strengths, weak: data.weak, practise },
      actions: [{ type: "add_todo", label: "Add practice to to-do", items: practise }] };
  }
  conv.messages.push(msg);
  conv.interviews.push({ ...iv, endedAt: at, summary: msg.summary });
  conv.interview = null;
  return Store.save(conv);
}
