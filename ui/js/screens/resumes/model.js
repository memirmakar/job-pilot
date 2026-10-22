// Resumes data (S.RES from /api/resumes/all) turned into what the screen shows: groups, rows, words.
import { S } from "../../state.js";

export const LANG = { en: "English", tr: "Turkish" };
export const lang = (l) => LANG[l] || "Language not set";
// Tailored status -> [label, pill tone]; a pill always carries its word
export const RSTATUS = { sent: ["Sent", "success"], ready: ["Ready to send", "accent"], unused: ["Not used", "neutral"] };
export const FILTERS = [["all", "All"], ["originals", "Originals"], ["ready", "Ready"], ["tailored", "Tailored"], ["sent", "Sent"]];

export const res = () => S.RES || { originals: [], ready: [], tailored: [], answers: [], fields: [] };
export const all = () => { const r = res(); return [...r.originals, ...r.ready, ...r.tailored]; };
export const byId = (id) => all().find((x) => x.id === id) || null;
export const current = (x) => x.versions.at(-1);
export const vLabel = (x) => x.versions.length === 1 ? "1 version" : `${x.versions.length} versions`;
export const day = (iso) => {
  if (!iso) return "";
  const d = new Date(iso), today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString([], { month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
};
export const when = (iso) => iso ? `${day(iso) === "Today" ? "today" : day(iso)} at ${new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";
export const defaultLine = (o) => o.defaultFor.length ? `default for ${o.defaultFor.join(", ")}` : o.fields.length ? `for ${o.fields.join(", ")}` : "no fields set";

const match = (x, q) => !q || [x.name, x.file, x.job?.company, x.job?.title, x.field, x.parentName].some((s) => String(s || "").toLocaleLowerCase().includes(q));

// The list: Originals (tailored kids nested), Ready resumes (kids nested), and on the Tailored / Sent filters the kids alone under "From …"
export function groups() {
  const r = res(), f = S.res.filter, q = S.res.query.trim().toLocaleLowerCase();
  const keep = (t) => (f === "sent" ? t.status === "sent" : true) && (match(t, q) || match(byId(t.parent) || {}, q));
  const kidsOf = (p) => r.tailored.filter((t) => t.parent === p.id && keep(t));
  const nest = f === "all";
  const parents = (list) => list.map((p) => ({ p, kids: f === "originals" || f === "ready" ? [] : kidsOf(p) }))
    .filter(({ p, kids }) => (nest || f === "originals" || f === "ready") ? match(p, q) || kids.length : kids.length);
  const out = [];
  if (f === "all" || f === "originals") out.push({ label: "Originals", items: parents(r.originals), showParent: true });
  if (f === "all" || f === "ready") out.push({ label: "Ready resumes", items: parents(r.ready), showParent: true });
  // Tailored from an original that was removed since
  const lost = r.tailored.filter((t) => !t.parent && keep(t));
  if (f === "all" && lost.length) out.push({ label: "Tailored", items: [{ p: null, kids: lost }], showParent: false });
  if (f === "tailored" || f === "sent") {
    const items = parents([...r.originals, ...r.ready]);
    const orphans = r.tailored.filter((t) => !t.parent && keep(t));
    out.push({ label: f === "sent" ? "Sent" : "Tailored", items: [...items, ...(orphans.length ? [{ p: null, kids: orphans }] : [])], showParent: false });
  }
  return out.filter((g) => g.items.length);
}
// Rows in screen order, for arrow keys
export const order = () => groups().flatMap((g) => g.items.flatMap(({ p, kids }) => [...(g.showParent && p ? [p] : []), ...kids]));

export const counts = () => {
  const r = res();
  return { originals: r.originals.length, ready: r.ready.length, tailored: r.tailored.length, sent: r.tailored.filter((t) => t.status === "sent").length };
};
export const missingAnswers = () => res().answers.filter((a) => !a.tr && !a.en);

// Claude's change notes are free text ({ what, why }); the first verb says what kind of change it was
export function changeKind(what) {
  const w = String(what || "").trim();
  if (/^(moved|reordered|put|placed|led with|lead with|promoted|grouped|order)/i.test(w)) return "Moved";
  if (/^(removed|dropped|cut|deleted|omitted|left out)/i.test(w)) return "Removed";
  if (/^(added|brought in|included|introduced|new )/i.test(w)) return "Added";
  return "Reworded";
}
export const KIND_TONE = { Added: "success", Moved: "info", Reworded: "accent", Removed: "neutral" };

// What changed in the current version: Claude's notes for a version Claude wrote, the re-upload check for yours
export function changes(x) {
  const cur = current(x);
  // A re-upload's or an instruction's version carries its own checked changes; Claude's tailoring notes are free text
  if (cur.changes) return cur.changes.map((c) => ({ kind: c.kind, where: c.where, text: c.text, why: c.note, rule: c.rule || "", source: "" }));
  const list = (x.resume?.changes || []).map((c) => ({ kind: changeKind(c.what), where: "", text: c.what, why: c.why, rule: c.rule || "", source: "" }));
  for (const g of x.resume?.github_added || []) list.push({ kind: "Added", where: "Projects", text: g.repo, why: g.note, source: `From your GitHub: ${g.repo}` });
  return list;
}
export const notAdded = (x) => (x.resume?.not_added || []).map((s) => String(s).split(":")[0]);
