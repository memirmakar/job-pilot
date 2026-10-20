// Card (jp-card): label is an uppercase caption, title a headline; body is trusted HTML.
import { esc } from "../util.js";

export const card = ({ label = "", title = "", body = "", attrs = "" } = {}) => `<section class="jp-card" ${attrs}>
  ${label ? `<p class="jp-card__label">${esc(label)}</p>` : ""}${title ? `<h3 class="jp-card__title">${esc(title)}</h3>` : ""}${body}</section>`;

// Callout (jp-callout). tone: "" (info) | warning | danger
export const callout = (html, tone = "") => `<div class="jp-callout${tone ? " jp-callout--" + tone : ""}" role="${tone === "danger" ? "alert" : "status"}">
  <span class="jp-callout__icon" aria-hidden="true">${tone ? "!" : "i"}</span><span>${html}</span></div>`;
