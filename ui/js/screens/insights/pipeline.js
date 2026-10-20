// Insights → Pipeline: analyzed → picked → applied → replied → interview for the week or month, by field;
// what happened after you applied; and whether your score predicts replies (rates only from 15 applications per band).
import { S } from "../../state.js";
import { esc } from "../../util.js";
import { pill } from "../../components/status-pill.js";
import { noReplyDays } from "../jobs/track.js";
import * as M from "./model.js";

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + "%";
const n = (v) => `<span class="jp-num">${v}</span>`;

function controls() {
  const fields = [["all", "All"], ...M.goalFields().map((f) => [f, f]), ["Other", "Other"]];
  return `<div class="ins-bar">
    <p class="foot">${esc(M.pipeline(S.ins.period, "all").range)} · from the jobs Claude read to the ones that became interviews</p>
    <div class="ins-bar__tools">
      <div class="ins-chips" role="group" aria-label="Field">${fields.map(([id, label]) =>
        `<button class="chip" type="button" aria-pressed="${S.ins.field === id}" data-action="ins-field" data-v="${esc(id)}">${esc(label)}</button>`).join("")}</div>
      <div class="jp-seg" role="group" aria-label="Period">${[["week", "Week"], ["month", "Month"]].map(([id, label]) =>
        `<button class="jp-seg__item" type="button" aria-pressed="${S.ins.period === id}" aria-selected="${S.ins.period === id}" data-action="ins-period" data-v="${id}">${label}</button>`).join("")}</div>
    </div></div>`;
}

function funnel() {
  const p = M.pipeline(S.ins.period, S.ins.field), [a, , ap, rep, iv] = p.nums;
  const label = `${S.ins.field === "all" ? "All fields" : esc(S.ins.field)} · ${S.ins.period === "week" ? "this week" : "last 30 days"}`;
  if (!a) return `<section class="jp-card ins-funnel"><p class="jp-card__label">${label}</p>
    <div class="ins-empty"><p class="t-callout">No jobs analyzed in the last ${p.days} days${S.ins.field === "all" ? "" : " in this field"}.</p>
    ${S.ins.period === "week" ? `<button class="jp-btn jp-btn--sm" type="button" data-action="ins-period" data-v="month">Show the last 30 days</button>` : ""}</div></section>`;
  return `<section class="jp-card ins-funnel">
    <div class="ins-card-head"><p class="jp-card__label">${label}</p><span class="foot">Each step as a share of the one before</span></div>
    ${M.STAGES.map((s, i) => { const v = p.nums[i]; return `<div class="ins-stage">
      <span class="ins-stage__label">${s}</span>
      <span class="ins-track" aria-hidden="true"><span style="width: ${a ? Math.max(v ? 1.2 : 0, (v / a) * 100) : 0}%"></span></span>
      <span class="ins-stage__n jp-num">${v}</span>
      <span class="foot">${i === 0 ? "Jobs Claude read" : `${pct(v, p.nums[i - 1])} of ${M.STAGES[i - 1].toLowerCase()}`}</span></div>`; }).join("")}
    <p class="meta ins-card-foot">${ap ? `${rep} of ${M.plural(ap, "application")} got a reply${iv ? `, ${iv === 1 ? "1 became an interview" : `${iv} became interviews`}.` : ". No interviews yet."}` : "No applications from these jobs yet."}</p>
  </section>`;
}

function after() {
  const a = M.afterApplied(S.ins.period);
  return `<section class="jp-card ins-after">
    <div class="ins-card-head"><p class="jp-card__label">After you applied</p><span class="foot">All fields · ${n(a.n)} ${a.n === 1 ? "application" : "applications"}</span></div>
    ${a.n ? a.rows.map((r) => `<div class="ins-after__row">${pill(r.label, r.tone)}<span class="foot jp-num">${pct(r.n, a.n)}</span><span class="ins-after__n jp-num">${r.n}</span></div>`).join("")
      : `<p class="t-callout ins-muted ins-empty">No applications sent ${S.ins.period === "week" ? "this week" : "in the last 30 days"}.</p>`}
    <p class="foot ins-card-foot">No reply means none after ${n(noReplyDays())} days. Change it in Settings.</p>
  </section>`;
}

function predict() {
  const b = M.bands(), s = M.suggestion(b), max = Math.max(50, ...b.rows.map((r) => r.rate ?? 0));
  const aria = b.rows.map((r) => `${r.label}: ${r.rate == null ? `not enough data, ${r.r} of ${r.n}` : `${r.r} of ${r.n}`}`).join("; ");
  const rate = (x) => Math.round((x.r / x.n) * 100);
  const say = {
    wait: [`Not enough answers to judge your target of ${b.T} yet.`,
      `${b.n ? `${M.plural(b.n, "application")} ${b.n === 1 ? "has" : "have"} had an answer or ${noReplyDays()} days to get one` : "None of your applications has had an answer or enough time to get one yet"}: ${b.above.n} at ${b.T} and up, ${b.below.n} below. A rate needs about ${M.MIN_SAMPLE} on each side.`,
      `Your target stays at ${b.T}. This updates as replies come in.`],
    keep: [`Keep your target at ${b.T}.`, `At ${b.T} and up, ${b.above.r} of ${b.above.n} applications got a reply (${s.ra}%); below ${b.T}, ${b.below.r} of ${b.below.n} (${s.rb}%).`, `${b.n} applications is still a small sample.`],
    small: [`Keep your target at ${b.T} for now.`, `At ${b.T} and up, ${s.ra}% got a reply; below, ${s.rb}%. The difference is small so far.`, `Checked again as replies come in.`],
    lower: [`Your target of ${b.T} isn't predicting replies.`, `Below ${b.T}, ${s.rb}% of applications got a reply, about as many as at ${b.T} and up (${s.ra}%). A lower target means fewer extra tailoring passes and fewer jobs waiting for your OK.`, `${b.n} applications is a small sample.`],
  }[s.kind];
  return `<section class="jp-card ins-predict">
    <div class="ins-predict__chart">
      <div><h2 class="t-headline">Does your score predict replies?</h2>
        <span class="foot">Reply rate by the score of the resume you sent · ${n(b.n)} of ${n(b.all)} applications have had an answer or ${noReplyDays()} days</span></div>
      <div class="ins-bands" role="img" aria-label="Reply rate by score. ${esc(aria)}">${b.rows.map((r) => `<div class="ins-band">
        ${r.target ? `<span class="ins-band__target" aria-hidden="true"></span><span class="foot ins-band__tlabel">Target ${n(b.T)}</span>` : ""}
        <span class="ins-band__pct jp-num">${r.rate == null ? "" : r.rate + "%"}</span>
        <span class="ins-band__col"><span style="height: ${r.rate == null ? 0 : Math.round((r.rate / max) * 100)}%"></span></span>
        <span class="ins-band__label jp-num">${esc(r.label)}</span>
        <span class="foot">${r.rate == null ? (r.n ? `${n(r.n)} so far · not enough data yet` : "Not enough data yet") : `${n(r.r)} of ${n(r.n)} replied`}</span></div>`).join("")}</div>
    </div>
    <div class="ins-predict__say">
      <p class="cap ins-cap"><span class="jp-bar__mark ins-mark" aria-hidden="true"></span>Suggestion</p>
      <p class="t-headline">${esc(say[0])}</p>
      <p class="t-callout ins-muted">${esc(say[1])}</p>
      <p class="foot">${esc(say[2])}${s.kind !== "wait" && b.above.n && b.below.n ? ` Overall: ${rate(b.above)}% vs ${rate(b.below)}%.` : ""}</p>
      ${s.kind === "lower" ? `<div class="ins-actions"><button class="jp-btn jp-btn--primary jp-btn--sm" type="button" data-action="ins-target" data-v="${s.to}">Set target to ${s.to}</button>
        <button class="jp-btn jp-btn--plain jp-btn--sm" type="button" data-action="insights-tab" data-tab="pipeline">Keep ${b.T}</button></div>` : ""}
    </div>
  </section>`;
}

export const pipelineHtml = () => `${controls()}<div class="ins-grid ins-grid--pipe">${funnel()}${after()}</div>${predict()}`;
