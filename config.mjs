// Configuration = built-in defaults + data/settings.json (app settings) + data/profile.json (the user's onboarding answers).
// Both files are written by the app (onboarding wizard and Settings page); there's nothing to edit here by hand.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const DATA = path.join(DIR, "data");
const SETTINGS_FILE = path.join(DATA, "settings.json");
const PROFILE_FILE = path.join(DATA, "profile.json");

export const DEFAULT_SETTINGS = {
  applyMode: "auto",            // "auto" = submit Easy Apply jobs; "analyze_only" = analyze + tailor, you apply yourself
  dailyJobs: 20,                // jobs Claude picks and analyzes per day
  dailyApplyLimit: 20,          // Easy Apply submissions per day
  scheduleTime: "10:00",
  scheduleEnabled: true,
  modelDaily: "sonnet",         // per-job work: picking, scoring, tailoring, answering
  modelWeekly: "opus",          // resume library, market review, GitHub review, doctor
  effort: "medium",
  minAtsScore: 55,              // don't apply below this final score (analysis is kept)
  tailorTarget: 80,             // extra tailoring pass when below this
  tailorMaxPasses: 2,
  uploadTailored: true,         // upload the tailored PDF in Easy Apply
  postedWithin: "r604800",      // LinkedIn: r86400 = 24h, r604800 = week, r2592000 = month
  pagesPerSearch: 2,
  maxRunMinutes: 120,
  libraryEveryDays: 7,
  marketEveryDays: 3,
  githubRefreshHours: 96,
  availabilityCheckHours: 20,   // re-check open listings at most this often
  browserChannel: "msedge",
  delaySeconds: [6, 15],
  claudePath: null,
};

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };

export function loadSettings() { return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) }; }
export function loadProfile() { return readJson(PROFILE_FILE, null); }
export function isOnboarded() { return !!loadProfile()?.onboardedAt; }

export function saveSettings(patch) {
  const s = { ...loadSettings(), ...patch };
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
  return s;
}
export function saveProfile(p) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(p, null, 2));
  return p;
}

// The object the rest of the app reads. Built fresh by loadConfig(); `config` is the snapshot taken at startup.
export function loadConfig() {
  const s = loadSettings();
  const p = loadProfile() || { targets: [], locations: [], facts: "", preferences: "", titleExclude: [], companyExclude: [] };
  const searches = [...new Set((p.targets || []).flatMap((t) => t.searchTerms || []))];
  return {
    settings: s, profileData: p,
    mode: s.applyMode === "auto" ? "auto" : "analyze_only",
    dailyLimit: s.dailyApplyLimit,
    dailyJobs: s.dailyJobs,
    delaySeconds: s.delaySeconds,
    pagesPerSearch: s.pagesPerSearch,
    searches,
    targets: p.targets || [],
    locations: p.locations?.length ? p.locations : [""],
    linkedinPostedWithin: s.postedWithin,
    titleInclude: [],                       // relevance is decided by Claude now; only excludes are applied cheaply
    titleExclude: p.titleExclude || [],
    companyExclude: p.companyExclude || [],
    preferences: [p.preferences || p.goalsText || "", p.seniority ? `Seniority: ${p.seniority}.` : "",
      p.workplace?.length ? `Workplace: ${p.workplace.join(", ")}.` : "", p.locations?.length ? `Locations: ${p.locations.join("; ")}.` : ""].filter(Boolean).join(" "),
    profile: p.facts || "",
    maxRunMinutes: s.maxRunMinutes,
    marketReview: { everyDays: s.marketEveryDays, minNewJobs: 10 },
    llm: { model: s.modelDaily, modelWeekly: s.modelWeekly, effort: s.effort, claudePath: s.claudePath, resumesDir: "resumes", minAtsScore: s.minAtsScore },
    github: p.githubUser ? { user: p.githubUser, refreshHours: s.githubRefreshHours } : null,
    tailor: { enabled: true, minScore: 0, target: s.tailorTarget, maxPasses: s.tailorMaxPasses, uploadToLinkedIn: s.uploadTailored },
    library: { everyDays: s.libraryEveryDays },
    availabilityCheckHours: s.availabilityCheckHours,
    browserChannel: s.browserChannel,
  };
}

const config = loadConfig();
export default config;
