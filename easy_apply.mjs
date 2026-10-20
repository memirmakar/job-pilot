// The Easy Apply form: upload the chosen resume, fill each step, then submit, hold for your OK, or stop (dry run).
// hold: fill everything and close without submitting (status waiting_ok). approved: fill only with the answers you
// approved in the review sheet; anything new stops the job instead of asking Claude.
import path from "node:path";
import config, { DIR } from "./config.mjs";
import { answerQuestions, ClaudeLimitError, ClaudeLoginError } from "./llm.mjs";
import * as LIN from "./linkedin.mjs";
import { LI, sleep, short, pause, btn, exists } from "./linkedin.mjs";
import { approvedValue } from "./approval.mjs";
import * as S from "./store.mjs";

const { log } = S;
export const chosenPath = (rec, files) => rec.tailored?.used ? path.join(DIR, rec.tailored.path) : (files.find((f) => f.file === rec.chosenResume)?.path || null);

async function fillStep(page, root, rec, files, { rejection = null, approved = false } = {}) {
  const fields = await LIN.scanFields(root);
  const empty = rejection ? fields.filter((f) => f.kind !== "select" || !f.value) : fields.filter((f) => !f.value);
  const step = { fields: [], ...(rejection ? { retry: true } : {}) };
  for (const f of fields.filter((f) => !empty.includes(f))) step.fields.push({ label: f.label, kind: f.kind, value: f.value, source: "prefilled" });
  if (approved) {
    for (const f of empty) {
      const v = approvedValue(rec, f.label);
      if (v == null) return { ...step, unknown: f.label };
      const entry = { label: f.label, kind: f.kind, options: f.options, source: "approved", value: v };
      if (v !== "") { try { entry.value = await LIN.applyAnswer(page, root, f, v); } catch (e) { entry.error = e.message; } }
      step.fields.push(entry);
      await sleep(250);
    }
    return step;
  }
  if (empty.length) {
    const { answers, usage } = await answerQuestions({
      job: rec, resumeFile: rec.chosenResume, resumePath: chosenPath(rec, files), fields: empty, previous: rec.steps.flatMap((s) => s.fields), rejection,
    });
    S.addUsage(rec, usage);
    for (const f of empty) {
      const a = answers.find((x) => x.id === f.id);
      const entry = { label: f.label, kind: f.kind, options: f.options, source: "claude", value: a?.value ?? "", reasoning: a?.reasoning ?? "No answer returned", confidence: a?.confidence ?? "low" };
      if (a && a.value !== "") {
        try { entry.value = await LIN.applyAnswer(page, root, f, a.value); } catch (e) { entry.error = e.message; }
      }
      step.fields.push(entry);
      await sleep(250);
    }
  }
  return step;
}

// An approved job (status "approved"): open it again and send it with your approved answers
export async function sendApproved(page, rec, files, { dryRun }) {
  log(`\n[approved] ${rec.title} @ ${rec.company}`);
  const jp = await LIN.readJobPage(page, rec.id);
  if (jp.alreadyApplied) return S.finish(rec, "already_applied", "LinkedIn already shows this job as applied");
  if (jp.closed) return S.finish(rec, "closed", "The listing stopped accepting applications before it was sent");
  if (!jp.easyApply) return S.finish(rec, "needs_manual", "Easy Apply isn't offered on this listing any more; apply on LinkedIn");
  // Fill from scratch: the steps saved now are what's sent
  rec.heldSteps ||= rec.steps;
  rec.steps = [];
  delete rec.resumeSelection;
  try { return await easyApply(page, rec, files, { dryRun, easyBtn: jp.easyBtn, approved: true }); }
  finally { S.saveRecord(rec); }
}

// The approved queue; returns how many were sent. limit: today's application limit (Send now ignores it).
// Login and limit errors stop the run; anything else leaves the job approved for the next run.
export async function sendQueue(page, recs, files, { dryRun, limit }) {
  let sent = 0;
  for (const rec of recs) {
    if (!dryRun && S.appliedToday() >= limit) { log(`Daily limit reached; ${rec.title} @ ${rec.company} stays approved for the next run.`); continue; }
    try { if ((await sendApproved(page, rec, files, { dryRun })) === "applied") sent++; }
    catch (e) {
      if (e instanceof ClaudeLimitError || e instanceof ClaudeLoginError || e instanceof LIN.LinkedInLoginError || e instanceof LIN.LinkedInLimitError) throw e;
      S.count("errors");
      S.writeLog({ ...rec, status: "error", reason: `sending your approved job: ${e.message.split("\n")[0]}` });
      await LIN.closeDialog(page).catch(() => {});
    }
    await pause();
  }
  return sent;
}

// opts: { dryRun, easyBtn, hold (reason text) , approved }
export async function easyApply(page, rec, files, { dryRun, easyBtn, hold = null, approved = false }) {
  await easyBtn.click();
  await sleep(2500);
  const dialog = page.getByRole("dialog").filter({ visible: true }).last();
  let lastProgress = "", stuck = 0, retries = 0;
  for (let n = 0; n < 15; n++) {
    // Resume step: upload the chosen PDF (tailored, library or original); fall back to picking it by name
    if (!rec.resumeSelection && (await LIN.selectResume(page, dialog, "\u0000"))) {
      const file = chosenPath(rec, files);
      let res = file && config.tailor.uploadToLinkedIn && (await LIN.uploadResume(page, dialog, file)) ? await LIN.selectResume(page, dialog, path.basename(file)) : null;
      if (!res?.selected) {
        res = await LIN.selectResume(page, dialog, rec.ats.best_file);
        rec.warnings.push(res?.selected ? `Couldn't upload ${rec.chosenResume}; used "${rec.ats.best_file}" from your LinkedIn resumes.` : "Couldn't upload or find the chosen resume; LinkedIn's default resume was used.");
      } else if (rec.tailored) rec.tailored.uploaded = rec.tailored.used;
      rec.resumeSelection = res || { selected: false };
    }
    const step = await fillStep(page, dialog, rec, files, { approved });
    if (step.fields.length) rec.steps.push(step);
    S.saveRecord(rec);
    if (step.unknown) {
      await LIN.closeDialog(page);
      return S.finish(rec, "needs_manual", `LinkedIn asked "${step.unknown.slice(0, 120)}", which wasn't in the answers you approved. Nothing was sent.`);
    }
    await short();

    const submit = btn(dialog, LI.submit);
    if (await exists(submit)) {
      if (hold) { await LIN.closeDialog(page); return S.finish(rec, "waiting_ok", hold); }
      if (dryRun && approved) {
        await LIN.closeDialog(page);
        rec.approval.lastDryRun = new Date().toISOString();
        S.saveRecord(rec);
        log("  Dry run: reached Submit with your approved answers; nothing sent, the job stays approved.");
        return "approved";
      }
      if (dryRun) { await LIN.closeDialog(page); return S.finish(rec, "dry_run", "stopped before submit (dry run)"); }
      await submit.click();
      await sleep(3000);
      const done = btn(page, LI.done);
      if (await exists(done)) await done.click().catch(() => {}); else await btn(page, LI.dismiss).click().catch(() => {});
      rec.submittedAt = new Date().toISOString();
      // The Resumes screen shows this version as sent and read-only
      if (rec.tailored?.uploaded) rec.tailored.sent = { v: rec.tailored.versions?.at(-1)?.v || 1, at: rec.submittedAt, company: rec.company };
      S.count("applied");
      return S.finish(rec, "applied", approved ? "Sent with the answers you approved" : undefined);
    }
    const nextBtn = (await exists(btn(dialog, LI.review))) ? btn(dialog, LI.review) : btn(dialog, LI.next);
    if (!(await exists(nextBtn))) break;
    const progress = await dialog.innerText().catch(() => "");
    if (progress === lastProgress) stuck++; else stuck = 0;
    lastProgress = progress;
    if (stuck >= 1 && approved) {
      // Fixing a rejected answer would mean sending something you didn't approve
      rec.warnings.push(`LinkedIn rejected an approved answer. The form said: ${progress.replace(/\s+/g, " ").slice(0, 300)}`);
      break;
    } else if (stuck >= 1 && retries < 2) {
      log("  Step rejected, asking Claude to fix the answers...");
      const fix = await fillStep(page, dialog, rec, files, { rejection: progress.slice(0, 3000) });
      if (fix.fields.length) rec.steps.push(fix);
      retries++; stuck = 0; lastProgress = "";
    } else if (stuck >= 1) {
      rec.warnings.push(`Stuck on a step. The form said: ${progress.replace(/\s+/g, " ").slice(0, 400)}`);
      break;
    }
    await nextBtn.click();
    await sleep(2000);
  }
  await LIN.closeDialog(page);
  return S.finish(rec, "needs_manual", rec.warnings.at(-1) || "The form couldn't be completed automatically");
}
