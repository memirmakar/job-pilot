// Company logo tile: the saved logo when there is one, initials underneath as the fallback (and while it loads).
import { esc } from "../util.js";

// "Ege Otomasyon" -> EO, "Alignerr" -> AL
export function initials(name) {
  const w = String(name || "").split(/[\s·,.&-]+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || "?").slice(0, 2)).toLocaleUpperCase();
}

// size: "" (56px, detail header) | "sm" (32px, posting sheet)
export const companyLogo = (company, url, size = "") => `<span class="logo${size ? " logo--" + size : ""}" role="img" aria-label="${esc(company)} logo">
  <span aria-hidden="true">${esc(initials(company))}</span>${url ? `<img src="${esc(url)}" alt="" onerror="this.remove()">` : ""}</span>`;
