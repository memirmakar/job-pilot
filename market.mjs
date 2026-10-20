// Market review across every scored job: statistics computed here, interpreted by Claude, cached in data/market/review.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config, { loadConfig } from "./config.mjs";
import { marketReview, loadResumes, auditKeywords } from "./llm.mjs";
import crypto from "node:crypto";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RECORDS_DIR = path.join(DIR, "data", "applications");
const OUT = path.join(DIR, "data", "market", "review.json");
const AUDIT = path.join(DIR, "data", "market", "keyword_audit.json");
const SKILL_KINDS = new Set(["skill", "tool", "domain_knowledge", "certification"]);

// ---------- keyword sanity audit ----------
// Every "missing" keyword is classified once by Claude (skill vs location/military/duty/noise...), cached here.
// The cache is reset when the profile or preferences change, since "satisfied by profile" depends on them.
export function loadAudit() {
  try { return JSON.parse(fs.readFileSync(AUDIT, "utf8")); } catch { return { profileHash: "", entries: {} }; }
}
const profileHash = () => crypto.createHash("sha1").update(String(config.profile) + String(config.preferences)).digest("hex").slice(0, 12);

export async function refreshAudit(records) {
  let audit = loadAudit();
  if (audit.profileHash !== profileHash()) audit = { profileHash: profileHash(), entries: {} };
  const all = new Set(records.flatMap((r) => { const b = bestEntry(r); return [...(b.missing_keywords || []), ...(b.unmet_requirements || [])]; }).map((k) => norm(k).trim()).filter(Boolean));
  const todo = [...all].filter((k) => !audit.entries[k]);
  for (let i = 0; i < todo.length; i += 150) {
    console.log(`  Sanity-checking ${Math.min(150, todo.length - i)} keyword(s)...`);
    const { keywords } = await auditKeywords(todo.slice(i, i + 150), config.preferences || "");
    for (const k of keywords) audit.entries[norm(k.keyword).trim()] = k;
    fs.mkdirSync(path.dirname(AUDIT), { recursive: true });
    fs.writeFileSync(AUDIT, JSON.stringify(audit, null, 2));
  }
  return audit;
}

// Missing keywords of a job split into real skills (canonical, deduped) and other requirements, using the audit.
export function auditedMissing(r, audit) {
  const b = bestEntry(r), skills = new Map(), other = new Map();
  for (const k of [...(b.missing_keywords || []), ...(b.unmet_requirements || [])]) {
    const a = audit.entries[norm(k).trim()];
    if (!a) { skills.set(k, { canonical: k, kind: "skill" }); continue; } // not audited yet: show as-is
    if (a.kind === "noise" || a.kind === "generic_duty" || a.kind === "soft_skill") continue;
    if (SKILL_KINDS.has(a.kind)) { if (!a.satisfied_by_profile) skills.set(a.canonical, a); }
    else other.set(a.canonical, a);
  }
  return { skills: [...skills.values()], other: [...other.values()] };
}

const norm = (s) => (s || "").replace(/[İIı]/g, "i").toLowerCase();
// A job's segment is the user's target field it belongs to. New jobs get it from Claude when it picks them (rec.field);
// older records are matched by distinctive words from each target's search terms. Anything else is "Other".
const GENERIC = new Set(["engineer", "engineering", "mühendis", "mühendisi", "mühendisliği", "specialist", "uzman", "uzmanı", "senior", "junior", "and", "the", "for", "ve", "intern", "stajyer"]);
function targetMatchers() {
  return (loadConfig().targets || []).map((t) => ({
    field: t.field,
    words: [...new Set((t.searchTerms || []).flatMap((s) => norm(s).split(/[^a-z0-9çğıöşü+#]+/)).filter((w) => w.length > 3 && !GENERIC.has(w)))],
  }));
}
export const segmentOf = (r) => {
  if (typeof r === "object" && r.field) return r.field;
  const t = norm(typeof r === "string" ? r : r.title);
  return targetMatchers().find((m) => m.words.some((w) => t.includes(w)))?.field ?? "Other";
};

export function loadRecords() {
  if (!fs.existsSync(RECORDS_DIR)) return [];
  return fs.readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".json"))
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(RECORDS_DIR, f), "utf8")); } catch { return null; } })
    .filter((r) => r?.ats);
}

const countTop = (items, n) => {
  const c = {};
  for (const k of items) { const key = norm(k).trim(); if (key) c[key] = (c[key] || 0) + 1; }
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([keyword, count]) => ({ keyword, count }));
};
const bestEntry = (r) => r.ats.resumes.find((x) => x.file === r.ats.best_file) || r.ats.resumes[0] || { missing_keywords: [], matched_keywords: [] };
const finalScore = (r) => (r.tailored?.used ? r.tailored.score : r.ats.best_score);

export function computeStats(records, audit = loadAudit()) {
  const missingSkills = (rs, relevantOnly = true) => {
    const c = {};
    for (const r of rs) for (const a of auditedMissing(r, audit).skills) {
      if (relevantOnly && a.relevant_to_targets === false) continue;
      c[a.canonical] = (c[a.canonical] || 0) + 1;
    }
    return Object.entries(c).sort((x, y) => y[1] - x[1]).map(([keyword, count]) => ({ keyword, count }));
  };
  const otherReqs = () => {
    const c = {};
    for (const r of records) for (const a of auditedMissing(r, audit).other) {
      const e = (c[a.canonical] ||= { requirement: a.canonical, kind: a.kind, satisfied: !!a.satisfied_by_profile, note: a.note, count: 0 });
      e.count++;
    }
    return Object.values(c).sort((x, y) => y.count - x.count).slice(0, 15);
  };
  const bySeg = {};
  for (const r of records) (bySeg[segmentOf(r)] ||= []).push(r);
  const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
  return {
    scoredJobs: records.length,
    statusCounts: records.reduce((c, r) => ((c[r.status] = (c[r.status] || 0) + 1), c), {}),
    minAtsScore: config.llm.minAtsScore,
    averageBestScore: avg(records.map((r) => r.ats.best_score)),
    segments: Object.entries(bySeg).map(([segment, rs]) => ({
      segment, jobs: rs.length,
      averageScore: avg(rs.map((r) => r.ats.best_score)),
      passedThreshold: rs.filter((r) => finalScore(r) >= config.llm.minAtsScore).length,
      topMissing: missingSkills(rs).slice(0, 10),
      topMatched: countTop(rs.flatMap((r) => bestEntry(r).matched_keywords), 8),
    })).sort((a, b) => b.jobs - a.jobs),
    topMissingOverall: missingSkills(records).slice(0, 25),
    otherRequirements: otherReqs(),
    // same, counted only over jobs in your target segments (not "Other")
    topMissingInTargets: missingSkills(records.filter((r) => segmentOf(r) !== "Other")).slice(0, 15),
    keywordsAudited: Object.keys(audit.entries).length,
    topMatchedOverall: countTop(records.flatMap((r) => bestEntry(r).matched_keywords), 15),
    bestResumeCounts: records.reduce((c, r) => ((c[r.ats.best_file] = (c[r.ats.best_file] || 0) + 1), c), {}),
    tailoring: records.filter((r) => r.tailored).map((r) => ({ title: r.title, from: r.tailored.baseScore, to: r.tailored.score })),
    perJobSuggestions: records.flatMap((r) => (r.ats.recommendations || []).map((x) => ({ job: r.title, type: x.type, action: x.action.slice(0, 220), gain: x.estimated_gain, effort: x.effort })))
      .sort((a, b) => b.gain - a.gain).slice(0, 40),
    jobs: records.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 80)
      .map((r) => ({ title: r.title, company: r.company, segment: segmentOf(r), score: r.ats.best_score, status: r.status })),
  };
}

export function lastReview() {
  try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { return null; }
}

// Runs the Claude market review. Returns the saved object.
export async function runMarketReview(githubBrief = "") {
  const records = loadRecords();
  if (records.length < 5) throw new Error(`Only ${records.length} scored jobs so far; the market review needs at least 5.`);
  const audit = await refreshAudit(records);
  const stats = computeStats(records, audit);
  const top = Object.entries(stats.bestResumeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f);
  const resumes = loadResumes().filter((r) => top.includes(r.file));
  console.log(`  Market review over ${records.length} scored jobs...`);
  const { review, usage } = await marketReview({ stats, preferences: config.preferences || "", github: githubBrief, resumes });
  const saved = { generatedAt: new Date().toISOString(), basedOnJobs: records.length, stats, review, usage };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(saved, null, 2));
  return saved;
}

// True when the review is old enough and enough new jobs were scored since.
export function reviewDue() {
  const M = config.marketReview || {};
  const prev = lastReview();
  const n = loadRecords().length;
  if (!prev) return n >= 5;
  return Date.now() - Date.parse(prev.generatedAt) > (M.everyDays ?? 3) * 86400e3 && n - prev.basedOnJobs >= (M.minNewJobs ?? 10);
}
