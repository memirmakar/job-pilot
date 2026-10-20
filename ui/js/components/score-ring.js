// Score ring (jp-ring): fill = score/100; success at or above target, serious below the cutoff. The number is always shown.
const R = 30, C = 2 * Math.PI * R;

// size: "" (72px) | "md" (60px) | "sm" (46px)
export function scoreRing(score, { target = 80, cutoff = 55, size = "", muted = false } = {}) {
  const v = Math.max(0, Math.min(100, Math.round(score || 0)));
  const tone = muted ? "ring-muted" : v >= target ? "jp-ring--good" : v < cutoff ? "jp-ring--low" : "";
  return `<span class="jp-ring ${size ? "ring-" + size : ""} ${tone}" role="img" aria-label="ATS score ${v}">
    <svg viewBox="0 0 72 72" aria-hidden="true"><circle class="jp-ring__track" cx="36" cy="36" r="${R}"></circle>
      <circle class="jp-ring__value" cx="36" cy="36" r="${R}" stroke-dasharray="${((v / 100) * C).toFixed(1)} ${C.toFixed(1)}"></circle></svg>
    <span class="jp-ring__num">${v}</span></span>`;
}
