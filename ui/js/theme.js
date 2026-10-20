// Theme: follows the system (prefers-color-scheme) until the user flips the switch; "Match system" clears the choice.
// index.html applies the same rule inline before first paint, so there is no flash.
const KEY = "jp-theme"; // "light" | "dark" | absent
const media = matchMedia("(prefers-color-scheme: light)");

export const getChoice = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const isDark = () => (getChoice() || (media.matches ? "light" : "dark")) === "dark";

export function applyTheme() {
  const dark = isDark();
  document.documentElement.classList.toggle("jp-mocha", dark);
  document.documentElement.classList.toggle("jp-latte", !dark);
}
export function setChoice(choice) {
  try { choice ? localStorage.setItem(KEY, choice) : localStorage.removeItem(KEY); } catch {}
  applyTheme();
}
export function watchSystem(onChange) {
  media.addEventListener("change", () => { if (!getChoice()) { applyTheme(); onChange?.(); } });
}
