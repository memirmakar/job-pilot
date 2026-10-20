// Standard answers: the questions every application asks, filled in once with Turkish and English text.
// Stored in data/profile.json `answers`; the old free-text `facts` stay as the fallback every prompt still reads.

// key -> [label, what a form question about it looks like (labels in jobs' steps[].fields), TR / EN placeholders]
export const ANSWER_KEYS = {
  salary: ["Expected salary", /salary|maaş|ücret|compensation|pay expectation/i, "Örn. 45.000 TL net/ay", "e.g. 45,000 TRY net per month"],
  military: ["Military service status", /military|askerlik|askeri/i, "Örn. Tamamlandı / Tecilli / Muaf", "e.g. Completed / Deferred / Exempt"],
  license: ["Driving license", /driv(ing|er)|ehliyet|sürücü belgesi/i, "Örn. Evet, B sınıfı ehliyetim var", "e.g. Yes, I hold a class B license"],
  notice: ["Notice period", /notice|start date|when can you start|başlayabil|işe başla|ihbar/i, "Örn. Hemen başlayabilirim", "e.g. I can start immediately"],
  travel: ["Willing to travel", /travel|seyahat/i, "Örn. Evet, zamanın %30'una kadar", "e.g. Yes, up to 30% of the time"],
  relocation: ["Willing to relocate", /relocat|taşın|yer değiştir|şehir değiş/i, "Örn. Evet, Türkiye içinde", "e.g. Yes, anywhere in Türkiye"],
  english: ["English level", /english|ingilizce|\beng\b|language proficiency/i, "Örn. İleri seviye (C1)", "e.g. Advanced (C1)"],
};
export const keyFor = (label) => Object.keys(ANSWER_KEYS).find((k) => ANSWER_KEYS[k][1].test(label || "")) || null;

// One-time move out of facts. Lines that are only an answer leave facts; lines that also hold other facts
// (city, other languages) are copied and stay. The full old text is kept in factsBeforeAnswers.
const MOVE = { military: /^military service\s*:\s*(.+)$/i, license: /^driving licen[sc]e\s*:\s*(.+)$/i, salary: /^salary\s*:\s*(.+)$/i,
  notice: /^(currently employed\s*:.+|notice period\s*:.+)$/i, travel: /^(?:willing to )?travel\s*:\s*(.+)$/i };
const COPY = { english: /English\s*\(([^)]+)\)|English[^,;\n]*/i, relocation: /(willing to relocate[^)\n]*)/i };

export function migrateAnswers(profile) {
  if (!profile || profile.answers) return false;
  const answers = Object.fromEntries(Object.keys(ANSWER_KEYS).map((k) => [k, { tr: "", en: "" }]));
  const keep = [];
  for (const line of String(profile.facts || "").split("\n")) {
    const t = line.trim();
    const k = Object.keys(MOVE).find((key) => MOVE[key].test(t));
    if (k) { const m = t.match(MOVE[k]); answers[k].en = (m[1] && k !== "notice" ? m[1] : t).trim(); continue; }
    for (const [key, re] of Object.entries(COPY)) { const m = t.match(re); if (m && !answers[key].en) answers[key].en = m[0].trim(); }
    keep.push(line);
  }
  profile.factsBeforeAnswers = profile.facts || "";
  profile.facts = keep.join("\n");
  profile.answers = answers;
  return true;
}

// The text every Claude prompt gets: standard answers first, then the remaining facts
export function answersText(profile) {
  const a = profile?.answers || {};
  const rows = Object.entries(ANSWER_KEYS).map(([k, [label]]) => {
    const v = a[k] || {};
    return v.tr || v.en ? `- ${label}: ${[v.en && `EN: ${v.en}`, v.tr && `TR: ${v.tr}`].filter(Boolean).join(" | ")}` : "";
  }).filter(Boolean);
  return rows.length ? `Standard answers (written by the candidate; use them first, in the question's language):\n${rows.join("\n")}` : "";
}

// For the Resumes screen: each answer, the last job that asked it, and the Needs manual jobs it holds up
export function answersView(profile, records) {
  const a = profile?.answers || {};
  return Object.entries(ANSWER_KEYS).map(([key, [label, re, phTr, phEn]]) => {
    const asked = [];
    for (const r of records) for (const s of r.steps || []) for (const f of s.fields || []) if (re.test(f.label || "")) asked.push({ r, f });
    const blocking = asked.filter(({ r, f }) => r.status === "needs_manual" && (!f.value || f.confidence === "low" || f.error));
    const jobs = [...new Map(blocking.map(({ r, f }) => [`${r.site}-${r.id}`, { k: `${r.site}-${r.id}`, title: r.title, company: r.company, q: f.label }])).values()];
    const last = asked.filter(({ f }) => f.value).sort((x, y) => (y.r.submittedAt || y.r.createdAt || "").localeCompare(x.r.submittedAt || x.r.createdAt || ""))[0];
    return { key, label, tr: a[key]?.tr || "", en: a[key]?.en || "", phTr, phEn, blocks: jobs,
      lastUsed: last ? { company: last.r.company, at: last.r.submittedAt || last.r.createdAt, q: last.f.label } : null };
  });
}
