// The Easy Apply form in the browser: scanning fields, filling an answer, picking or uploading the resume, closing the dialog.
// Split from linkedin.mjs, which re-exports these.
import { sleep, btn, exists, LI } from "./linkedin.mjs";

// ---------- Easy Apply form ----------
// Tags every input inside `root` and returns descriptors, including current values.
export async function scanFields(root) {
  return root.evaluate((rootEl) => {
    let n = Date.now() % 100000;
    const tag = (el) => { const id = `f${n++}`; el.setAttribute("data-ab", id); return id; };
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 400);
    const labelOf = (el) => {
      let t = "";
      if (el.id) { const l = rootEl.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t = l.innerText; }
      if (!t) t = el.getAttribute("aria-label") || "";
      if (!t) { const fs = el.closest("fieldset"); const lg = fs && fs.querySelector("legend"); if (lg) t = lg.innerText; }
      if (!t) { const p = el.parentElement?.parentElement; if (p) t = p.innerText; }
      return clean(t);
    };
    const fields = [], radioGroups = {};
    rootEl.querySelectorAll("input, textarea, select").forEach((el) => {
      const type = el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : (el.type || "text");
      if (["hidden", "file", "submit", "button", "search"].includes(type)) return;
      if (type === "radio") {
        const key = el.name || el.closest("fieldset")?.id || "r";
        const fs = el.closest("fieldset");
        const legend = clean(fs?.querySelector("legend")?.innerText || fs?.getAttribute("aria-label") || "");
        const g = (radioGroups[key] ||= { kind: "radio", id: tag(fs || el), label: legend, value: "", options: [], optionIds: {}, name: el.name });
        const lab = el.id ? rootEl.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        // Option text: its label, else the text of the largest wrapper that contains only this radio
        let wrap = el;
        while (wrap.parentElement && wrap.parentElement !== rootEl && wrap.parentElement.querySelectorAll('input[type="radio"]').length === 1) wrap = wrap.parentElement;
        let text = clean(lab?.innerText || el.closest("label")?.innerText || el.getAttribute("aria-label") || wrap.innerText || el.value);
        if (g.options.includes(text)) text = `${text} (${g.options.length + 1})`;
        g.options.push(text);
        g.optionIds[text] = tag(lab || el);
        if (el.checked) g.value = text;
        return;
      }
      if (type === "checkbox") {
        if (/follow/i.test(el.id + el.name) || el.checked) return; // skip "follow company" and already-ticked boxes
        const lab = el.id ? rootEl.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        const label = clean(lab?.innerText || labelOf(el));
        if (/top choice|en çok tercih/i.test(label)) return; // LinkedIn "top choice": limited per month, leave it to the user
        fields.push({ kind: "checkbox", id: tag(lab || el), label, value: "", options: ["check", "leave unchecked"] });
        return;
      }
      if (el.offsetParent === null) return;
      if (type === "select") {
        const opts = [...el.options].map((o) => clean(o.text));
        const placeholder = el.selectedIndex <= 0 || /select|seçiniz|seçin/i.test(opts[el.selectedIndex] || "");
        fields.push({ kind: "select", id: tag(el), label: labelOf(el), value: placeholder ? "" : opts[el.selectedIndex], options: opts.slice(1) });
        return;
      }
      const numeric = type === "number" || /numeric/i.test(el.id) || el.inputMode === "numeric";
      // Character limit: maxlength attribute, or a hint like "Maximum 400 characters" / "Maksimum 400 karakter" near the field
      let maxLength = el.maxLength > 0 ? el.maxLength : 0;
      for (let box = el.parentElement, i = 0; !maxLength && box && box !== rootEl && i < 4; box = box.parentElement, i++) {
        if (box.querySelectorAll("input, select, textarea").length > 1) break;
        const m = (box.innerText || "").match(/(?:max(?:imum)?|maksimum|en fazla)\s*([\d.,]+)\s*(?:karakter|characters?|chars?)/i);
        if (m) maxLength = parseInt(m[1].replace(/[.,]/g, ""), 10);
      }
      fields.push({ kind: type === "textarea" ? "textarea" : "text", id: tag(el), label: labelOf(el), value: el.value || "", numeric, ...(maxLength ? { maxLength } : {}) });
    });
    // Question text for groups without a <legend>: the text of the smallest wrapper holding all the
    // group's radios, minus the option texts
    for (const g of Object.values(radioGroups)) {
      if (g.label || !g.name) continue;
      const radios = rootEl.querySelectorAll(`input[type="radio"][name="${CSS.escape(g.name)}"]`);
      let box = radios[0];
      while (box.parentElement && box !== rootEl && box.querySelectorAll(`input[type="radio"][name="${CSS.escape(g.name)}"]`).length < radios.length) box = box.parentElement;
      const textOf = (b) => { let t = b.innerText || ""; for (const o of g.options) t = t.replace(o.replace(/ \(\d+\)$/, ""), " "); return clean(t); };
      // The question often sits beside the radio wrapper: widen until there's text, without swallowing other questions
      const ownInputs = radios.length;
      while (!textOf(box) && box.parentElement && box.parentElement !== rootEl &&
             box.parentElement.querySelectorAll("input, select, textarea").length === ownInputs) box = box.parentElement;
      g.label = textOf(box);
      // Still nothing: take the text just before the group (a sibling heading/span)
      for (let b = box, i = 0; !g.label && b && i < 4; b = b.parentElement, i++) {
        const prev = b.previousElementSibling;
        if (prev && !prev.querySelector("input, select, textarea")) g.label = clean(prev.innerText);
      }
    }
    const notResumePicker = (g) => !g.options.some((o) => /\.(pdf|docx?)\b/i.test(o)); // handled by selectResume
    return [...fields, ...Object.values(radioGroups).filter(notResumePicker).map(({ name, ...g }) => g)];
  });
}

function matchOption(options, value) {
  const v = (value || "").trim().toLowerCase();
  if (!v) return null;
  return options.find((o) => o.toLowerCase() === v) ?? options.find((o) => o.toLowerCase().includes(v) || v.includes(o.toLowerCase())) ?? null;
}

export async function applyAnswer(page, root, f, value) {
  const loc = (id) => root.locator(`[data-ab="${id}"]`);
  if (f.kind === "text" || f.kind === "textarea") {
    let v = f.numeric ? String(value).replace(/[^\d.,]/g, "") : String(value);
    if (f.maxLength && v.length > f.maxLength) {
      // Safety net: cut at the last sentence end that fits
      const cut = v.slice(0, f.maxLength);
      const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
      v = end > f.maxLength * 0.5 ? cut.slice(0, end + 1) : cut;
    }
    await loc(f.id).fill(v);
    await sleep(900);
    // Typeahead fields (e.g. city) need a suggestion picked
    const option = page.locator('[role="listbox"] [role="option"]').filter({ visible: true }).first();
    if (await option.count()) await option.click().catch(() => {});
    return v;
  }
  if (f.kind === "select") {
    const opt = matchOption(f.options, value);
    if (!opt) throw new Error(`"${value}" is not an option`);
    await loc(f.id).selectOption({ label: opt });
    return opt;
  }
  if (f.kind === "radio") {
    const opt = matchOption(f.options, value);
    if (!opt) throw new Error(`"${value}" is not an option`);
    await loc(f.optionIds[opt]).click({ force: true });
    return opt;
  }
  if (f.kind === "checkbox") {
    if (/^check/i.test(value)) await loc(f.id).click({ force: true });
    return value;
  }
}

// On the resume step, select the named file. Returns null if this isn't a resume step.
export async function selectResume(page, root, file) {
  const findIt = () => root.evaluate((rootEl, file) => {
    const strip = (s) => s.toLowerCase().replace(/\.(pdf|docx?)$/i, "").trim();
    const leaves = [...rootEl.querySelectorAll("h3, h4, span, p, div, label")].filter((el) => !el.children.length || el.tagName.startsWith("H"));
    const names = [...new Set(leaves.map((el) => (el.innerText || "").trim()).filter((t) => /\.(pdf|docx?)$/i.test(t)))];
    const hit = leaves.find((el) => strip(el.innerText || "") === strip(file));
    if (hit) (hit.closest('label, button, [role="radio"], [role="button"], [class*="document"][class*="card"]') || hit).setAttribute("data-ab-resume", "1");
    return { names, found: !!hit };
  }, file);
  let r = await findIt();
  if (!r.names.length) return null;
  if (!r.found) {
    const more = btn(root, /show more resumes|daha fazla özgeçmiş/i);
    if (await exists(more)) { await more.click(); await sleep(1200); r = await findIt(); }
  }
  if (!r.found) return { selected: false, onLinkedIn: r.names };
  await root.locator('[data-ab-resume="1"]').first().click({ force: true });
  await sleep(800);
  return { selected: true, onLinkedIn: r.names };
}

export async function uploadResume(page, dialog, file) {
  try {
    const input = dialog.locator('input[type="file"]');
    if (await input.count()) await input.first().setInputFiles(file);
    else {
      const b = btn(dialog, /upload resume|cv yükle|özgeçmiş yükle/i);
      if (!(await exists(b))) return false;
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 8000 }), b.click()]);
      await chooser.setFiles(file);
    }
    await sleep(6000); // LinkedIn processes the upload
    return true;
  } catch { return false; }
}

export async function closeDialog(page) {
  await btn(page, LI.dismiss).click().catch(() => {});
  await sleep(1200);
  const discard = btn(page, LI.discard);
  if (await exists(discard)) await discard.click().catch(() => {});
  await sleep(800);
}
