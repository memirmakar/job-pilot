// Claude's coach text -> HTML: paragraphs, "- " bullets, **bold**, and link tokens that open things in the app:
// [[job:<site>-<id>|label]] [[resume:<id>|label]] [[repo:<name>|label]] [[todo:<id>|label]]. A token whose target doesn't exist
// becomes its plain label. Used by Guidance and the Jobs Ask panel (same conversations). Clicks go to data-action="coach-link".
import { S } from "../state.js";
import { md } from "../util.js";

const exists = {
  job: (id) => S.DATA.some((r) => `${r.site}-${r.id}` === id),
  resume: (id) => !!S.RES && [...S.RES.originals, ...S.RES.ready, ...S.RES.tailored].some((x) => x.id === id),
  repo: (id) => (S.GH?.repos || []).some((r) => r.name === id),
  todo: (id) => (S.INS?.todo?.items || []).some((i) => i.id === id),
};
const TOKEN = /\[\[(job|resume|repo|todo):([^|\]]+)\|([^\]]+)\]\]/g;

// Runs on already-escaped text: ids and labels are escaped, the brackets aren't
const links = (html) => html.replace(TOKEN, (all, type, id, label) => {
  const raw = id.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  return exists[type](raw) ? `<a href="#" class="coach-link" data-action="coach-link" data-type="${type}" data-id="${id}">${label}</a>` : label;
});

// Plain text of a message (tokens -> labels), for previews and copying
export const plainText = (t) => String(t || "").replace(TOKEN, "$3").replace(/\*\*/g, "");

export function coachText(text) {
  const blocks = String(text || "").replace(/\r/g, "").split(/\n{2,}/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  return `<div class="coach-text">${blocks.map((ls) => {
    const out = []; let list = [];
    const flush = () => { if (list.length) out.push(`<ul>${list.map((l) => `<li>${links(md(l))}</li>`).join("")}</ul>`); list = []; };
    for (const l of ls) {
      if (/^[-•*]\s/.test(l)) list.push(l.replace(/^[-•*]\s/, ""));
      else if (/^\d+[.)]\s/.test(l)) list.push(l.replace(/^\d+[.)]\s/, ""));
      else { flush(); out.push(`<p>${links(md(l))}</p>`); }
    }
    flush();
    return out.join("");
  }).join("")}</div>`;
}
