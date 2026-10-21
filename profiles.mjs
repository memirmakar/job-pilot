// Search profiles: each one is a profile.targets entry ({ field searchTerms why }) plus optional overrides. Anything a profile
// doesn't set falls back to the global profile/settings, so old targets keep working unchanged.
//   on (false = not searched)  locations[]  workplace[] (onsite|hybrid|remote)  resume ("o:<file>" original | "r:<field slug>" ready)
//   tailorTarget  minAtsScore (cutoff)  dailyApplyLimit  titleExclude[] (added to the global list)
// The pipeline reads resolved profiles from here; Settings > Search profiles writes them.
import { loadAllRecords } from "./store.mjs";
import { slug } from "./library.mjs";

const norm = (s) => String(s || "").replace(/[İIı]/g, "i").toLowerCase().trim();

export const WORKPLACES = ["onsite", "hybrid", "remote"];
const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

// One target with every value filled in; `own` lists the keys the profile sets itself
export function resolve(t, p = {}, s = {}) {
  const own = [];
  const pick = (key, value, fallback) => { if (value != null && !(Array.isArray(value) && !value.length)) { own.push(key); return value; } return fallback; };
  return {
    field: t.field, searchTerms: list(t.searchTerms), why: t.why || "", on: t.on !== false,
    locations: pick("locations", list(t.locations), p.locations?.length ? p.locations : [""]),
    workplace: pick("workplace", list(t.workplace).filter((w) => WORKPLACES.includes(w)), p.workplace?.length ? p.workplace : WORKPLACES),
    resume: pick("resume", t.resume || null, null),
    target: pick("tailorTarget", num(t.tailorTarget), s.tailorTarget),
    cutoff: pick("minAtsScore", num(t.minAtsScore), s.minAtsScore),
    dailyLimit: pick("dailyApplyLimit", num(t.dailyApplyLimit), s.dailyApplyLimit),
    titleExclude: [...(p.titleExclude || []), ...pick("titleExclude", list(t.titleExclude), [])],
    own,
  };
}

export const profilesOf = (p, s) => (p?.targets || []).filter((t) => t?.field).map((t) => resolve(t, p, s));
export const activeProfiles = (p, s) => profilesOf(p, s).filter((x) => x.on && x.searchTerms.length);

// The profile a job belongs to: the field Claude gave it, else the search that found it, else the global values
export function profileFor(cfg, ...fields) {
  const all = profilesOf(cfg.profileData, cfg.settings);
  for (const f of fields.filter(Boolean)) { const hit = all.find((x) => norm(x.field) === norm(f)); if (hit) return hit; }
  return resolve({ field: fields.find(Boolean) || "Other" }, cfg.profileData, cfg.settings);
}

// LinkedIn's workplace filter (f_WT: 1 on-site, 2 remote, 3 hybrid); "" when every kind is wanted, as before
export function workplaceParam(workplace) {
  const set = new Set(workplace);
  if (!set.size || WORKPLACES.every((w) => set.has(w))) return "";
  return [["onsite", 1], ["remote", 2], ["hybrid", 3]].filter(([w]) => set.has(w)).map(([, n]) => n).join(",");
}

// The resume files a profile scores with: its own resume when it names one that exists, else all of them
export function filesFor(prof, files) {
  if (!prof?.resume) return { files, warning: null };
  const [kind, id] = [prof.resume.slice(0, 2), prof.resume.slice(2)];
  const hit = files.find((f) => (kind === "o:" ? !f.library && f.file === id : f.library && slug(f.library) === id));
  return hit ? { files: [hit], warning: null } : { files, warning: `The resume set on the ${prof.field} profile wasn't found, so Claude picked from all of them.` };
}

const today = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();
// Applications sent today for one profile (records carry the field Claude gave them)
export const appliedTodayFor = (field) => loadAllRecords().filter((r) => r.status === "applied" && today(r.submittedAt) && norm(r.field) === norm(field)).length;

const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
// Jobs analyzed since Monday, across runs (settings.weeklyJobs)
export const analyzedThisWeek = () => loadAllRecords().filter((r) => r.createdAt && Date.parse(r.createdAt) >= weekStart()).length;
