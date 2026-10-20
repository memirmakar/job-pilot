// Drop zone: drag-and-drop or click to pick files. onFiles gets [{ name, size, data (base64) }].
export const readFiles = (list) => Promise.all([...list].map((f) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res({ name: f.name, size: f.size, data: String(r.result).split(",")[1] });
  r.onerror = () => rej(new Error(`Couldn't read ${f.name}`));
  r.readAsDataURL(f);
})));

export function bindDrop(drop, input, onFiles) {
  if (!drop || !input) return;
  const take = async (files) => { if (files?.length) onFiles(await readFiles(files)); };
  drop.addEventListener("click", (e) => { if (e.target !== input) input.click(); });
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { take(input.files); input.value = ""; });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); take(e.dataTransfer.files); });
}
