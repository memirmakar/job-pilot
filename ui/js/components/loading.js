// Loading state: a calm skeleton of the screen's layout, a gentle message if it takes a while, and an error with Try again.
// kind: "split" (list + detail: Jobs, Resumes, Activity) | "three" (Guidance) | "page" (cards: Insights, Doctor, Settings)
import { esc } from "../util.js";

const bar = (w, h = 12) => `<span class="sk-bar" style="width:${w}%;height:${h}px"></span>`;
const row = () => `<div class="sk-row"><span class="sk-bar sk-dot"></span><div class="sk-lines">${bar(70)}${bar(45, 10)}</div></div>`;
const rows = (n) => Array.from({ length: n }, row).join("");
const card = (n = 3) => `<div class="sk-card">${bar(30, 10)}${bar(55, 16)}${Array.from({ length: n }, (_, i) => bar(i % 2 ? 80 : 95)).join("")}</div>`;

const LAYOUT = {
  split: () => `<div class="sk-split"><div class="sk-col sk-list">${bar(40, 20)}${bar(100, 30)}${rows(7)}</div>
    <div class="sk-col sk-main">${bar(50, 22)}${bar(30, 10)}${card(4)}${card(3)}</div></div>`,
  three: () => `<div class="sk-three"><div class="sk-col sk-list">${bar(50, 18)}${rows(5)}</div>
    <div class="sk-col sk-main">${card(5)}${card(3)}</div><div class="sk-col sk-side">${card(3)}${card(2)}</div></div>`,
  page: () => `<div class="sk-page">${bar(25, 22)}${bar(40, 10)}<div class="sk-grid">${card(3)}${card(3)}${card(2)}${card(4)}</div></div>`,
};

// what: "your jobs", "your runs" … The message after a few seconds is pure CSS (it fades in on a delay), so nothing needs a timer.
export function loadingHtml(kind = "page", what = "this screen") {
  return `<div class="sk" role="status" aria-live="polite" aria-busy="true"><span class="sr-only">Loading ${esc(what)}…</span>
    ${(LAYOUT[kind] || LAYOUT.page)()}<p class="sk-slow t-callout">Still loading ${esc(what)}. This can take a moment the first time.</p></div>`;
}

// A failed load says what went wrong; Try again runs the screen's reload (action: retry-load in actions.js, or the screen's own)
export function loadFailedHtml(error, what = "this screen", action = "retry-load") {
  let msg = typeof error === "string" ? error : error?.message || "";
  if (/failed to fetch|networkerror|load failed/i.test(msg)) msg = "Job Pilot's server didn't answer";
  return `<div class="sk-fail"><div class="jp-callout jp-callout--danger" role="alert">
    <p class="t-headline">Couldn't load ${esc(what)}</p>
    <p class="meta">${esc((msg || "The app didn't get an answer").slice(0, 200).replace(/[.\s]+$/, ""))}. Check that Job Pilot is still running, then try again.</p>
    <button class="jp-btn jp-btn--primary jp-btn--sm" type="button" data-action="${action}">Try again</button></div></div>`;
}
