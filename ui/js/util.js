// Small helpers shared by every screen: escaping, text formatting, dates, toast.
export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Inline: escape + **bold**
export const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
export const fmtDate = (s) => s ? new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
export const ago = (iso) => {
  if (!iso) return "";
  const d = (Date.now() - Date.parse(iso)) / 864e5;
  return d < 1 ? "today" : d < 2 ? "1 day ago" : d < 14 ? `${Math.round(d)} days ago` : d < 60 ? `${Math.round(d / 7)} weeks ago` : `${Math.round(d / 30)} months ago`;
};
export const lines = (s) => String(s || "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
export const pdfUrl = (p) => "/pdf?p=" + encodeURIComponent(p);

// Turns Claude's text into scannable HTML: "- " lines become bullets, **x** becomes bold,
// and long plain paragraphs are split into one bullet per sentence.
export function rich(text) {
  if (!text) return "";
  let ls = String(text).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (ls.length === 1 && !ls[0].startsWith("- ") && ls[0].length > 180)
    ls = ls[0].split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9"'(])/).map((s) => "- " + s);
  const bullets = ls.filter((l) => /^[-•*]\s/.test(l));
  if (!bullets.length) return `<div class="rich"><p>${md(ls.join(" "))}</p></div>`;
  return `<div class="rich">${ls.filter((l) => !/^[-•*]\s/.test(l)).map((l) => `<p>${md(l)}</p>`).join("")}<ul>${bullets.map((l) => `<li>${md(l.replace(/^[-•*]\s/, ""))}</li>`).join("")}</ul></div>`;
}

export const toast = (msg, ms = 4000) => {
  const t = $("#toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(t._h); t._h = setTimeout(() => (t.style.display = "none"), ms);
};

// Line icons (single weight, rounded), used by the shell
export const icon = (name, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${{
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path>',
  more: '<circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle>',
  check: '<path d="M5 12l5 5 9-10"></path>',
  close: '<path d="M6 6l12 12M18 6L6 18"></path>',
}[name] || ""}</svg>`;
