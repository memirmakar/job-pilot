// Insights: hosts the old Overview and GitHub review screens under one section until Stage 4 rebuilds them as tabs.
import { S } from "../state.js";
import { $, esc } from "../util.js";
import { renderOverview } from "./overview.js";
import { renderGithub } from "./github.js";

const TABS = [["overview", "Overview"], ["github", "GitHub review"]];

export function renderInsights() {
  if (!TABS.some(([id]) => id === S.sub)) S.sub = "overview";
  (S.sub === "github" ? renderGithub : renderOverview)();
  $("#view").insertAdjacentHTML("afterbegin", `<div class="jp-seg subnav" role="tablist" aria-label="Insights">${TABS.map(([id, label]) =>
    `<button class="jp-seg__item" type="button" role="tab" aria-selected="${id === S.sub}" data-action="insights-tab" data-tab="${id}">${esc(label)}</button>`).join("")}</div>`);
}
