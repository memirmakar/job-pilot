// Photo crop sheet: a 3:4 frame over the picture (an upload, or an image found in one of your PDF originals). Drag or use the
// arrow keys to move it, the slider to zoom; Save writes a 600×800 JPEG to data/photo/.
import { app, loadData } from "../../state.js";
import * as api from "../../api.js";
import { esc, toast } from "../../util.js";
import { openSheet, updateSheet, closeSheet } from "../../components/sheet.js";
import * as M from "./model.js";

const W = 240, H = 320, OUT_W = 600, OUT_H = 800;
let C = null; // { img, zoom, x, y, source }

function draw() {
  const cv = document.getElementById("crop-canvas"); if (!cv || !C) return;
  const g = cv.getContext("2d"), s = C.base * C.zoom;
  g.clearRect(0, 0, W, H);
  g.drawImage(C.img, C.x, C.y, C.img.width * s, C.img.height * s);
}
// Keep the frame covered by the picture
function clamp() {
  const s = C.base * C.zoom, w = C.img.width * s, h = C.img.height * s;
  C.x = Math.min(0, Math.max(W - w, C.x)); C.y = Math.min(0, Math.max(H - h, C.y));
}

function cropBody() {
  return `<div class="rs-crop"><canvas id="crop-canvas" class="rs-crop__canvas" width="${W}" height="${H}" tabindex="0"
      aria-label="Photo crop. Arrow keys move the picture."></canvas>
    <div class="rs-crop__side"><label class="jp-field"><span class="jp-field__label">Zoom</span>
      <input id="crop-zoom" type="range" min="1" max="3" step="0.01" value="${C.zoom}"></label>
      <p class="foot">Drag the picture so your face sits in the upper middle. Resumes show it at 27×36 mm.</p></div></div>`;
}

function bindCrop() {
  const cv = document.getElementById("crop-canvas"); if (!cv) return;
  let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, ox: C.x, oy: C.y }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; C.x = drag.ox + e.clientX - drag.x; C.y = drag.oy + e.clientY - drag.y; clamp(); draw(); });
  cv.addEventListener("pointerup", () => { drag = null; });
  cv.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }[e.key]; if (!d) return;
    e.preventDefault(); C.x += d[0]; C.y += d[1]; clamp(); draw();
  });
  document.getElementById("crop-zoom").addEventListener("input", (e) => {
    const cx = (W / 2 - C.x) / (C.base * C.zoom), cy = (H / 2 - C.y) / (C.base * C.zoom);
    C.zoom = Number(e.target.value);
    C.x = W / 2 - cx * C.base * C.zoom; C.y = H / 2 - cy * C.base * C.zoom; clamp(); draw();
  });
  draw();
}

async function save() {
  const out = document.createElement("canvas"); out.width = OUT_W; out.height = OUT_H;
  const k = OUT_W / W, s = C.base * C.zoom * k;
  out.getContext("2d").drawImage(C.img, C.x * k, C.y * k, C.img.width * s, C.img.height * s);
  await api.savePhoto(out.toDataURL("image/jpeg", 0.9).split(",")[1], C.source);
  closeSheet(); await loadData(); app.render();
  toast("Photo saved. New resumes include it as your photo rule says.");
}

export function openCrop(src, source = "upload") {
  const img = new Image();
  img.onload = () => {
    C = { img, zoom: 1, base: Math.max(W / img.width, H / img.height), x: 0, y: 0, source };
    C.x = (W - img.width * C.base) / 2; C.y = (H - img.height * C.base) / 2;
    const el = openSheet({ center: true, title: "Crop your photo", subtitle: "3:4, like a passport photo", body: cropBody(),
      actions: `<button class="jp-btn" type="button" data-sheet-close>Cancel</button><button class="jp-btn jp-btn--primary" type="button" data-crop-save>Save photo</button>`,
      onClose: () => { C = null; } });
    el.querySelector(".sheet").classList.add("sheet--narrow");
    el.querySelector("[data-crop-save]").addEventListener("click", () => save().catch((e) => toast(e.message, 7000)));
    bindCrop();
  };
  img.onerror = () => toast("That file isn't a picture this browser can open.");
  img.src = src;
}

// "Take it from an original": pick a PDF original, then one of the pictures found in it
export function openFromOriginal() {
  const pdfs = M.res().originals.filter((o) => /\.pdf$/i.test(o.file));
  if (!pdfs.length) return toast("Add a PDF original first.");
  const el = openSheet({ center: true, title: "Take your photo from an original", subtitle: "Claude isn't involved: the app reads the picture out of the PDF",
    body: `<div class="rs-chips" role="group" aria-label="Originals">${pdfs.map((o) => `<button class="chip" type="button" data-pf="${esc(o.file)}">${esc(o.name)}</button>`).join("")}</div><div id="pf-out"></div>`,
    actions: `<button class="jp-btn" type="button" data-sheet-close>Cancel</button>` });
  el.querySelector(".sheet").classList.add("sheet--narrow");
  el.addEventListener("click", async (e) => {
    const pick = e.target.closest("[data-pf-img]");
    if (pick) { const src = pick.dataset.pfImg; closeSheet(); return openCrop(src, "original"); }
    const b = e.target.closest("[data-pf]"); if (!b) return;
    el.querySelector("#pf-out").innerHTML = `<p class="meta rs-wait"><span class="rs-spin" aria-hidden="true"></span>Looking for pictures…</p>`;
    try {
      const { images } = await api.photosFrom(b.dataset.pf);
      el.querySelector("#pf-out").innerHTML = images.length ? `<div class="rs-found-photos">${images.map((im, i) => `<button class="rs-found-photo" type="button" data-pf-img="${im.url}" aria-label="Use picture ${i + 1}, ${im.w} by ${im.h}">
        <img src="${im.url}" alt=""></button>`).join("")}</div>` : `<p class="meta">No photo found in this file. Upload one instead.</p>`;
    } catch (err) { updateSheet({}); el.querySelector("#pf-out").innerHTML = `<p class="meta">${esc(err.message)}</p>`; }
  });
}
