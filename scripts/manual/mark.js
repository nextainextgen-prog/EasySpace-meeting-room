// Draws numbered red outlines over [data-tour=...] elements for the manual's
// screenshots. Usage: window.__mark([{ sel: "[data-tour=now]", n: 1 }, ...])
window.__mark = function (marks) {
  document.querySelectorAll(".tour-mark, nextjs-portal").forEach((e) => e.remove());
  const sx = window.scrollX, sy = window.scrollY;
  for (const m of marks) {
    // The first *visible* match: some sections exist twice (mobile and desktop copies).
    const el = [...document.querySelectorAll(m.sel)].find((e) => e.getBoundingClientRect().width > 0);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const pad = m.pad ?? 6;
    const box = document.createElement("div");
    box.className = "tour-mark";
    Object.assign(box.style, {
      position: "absolute", left: `${r.left + sx - pad}px`, top: `${r.top + sy - pad}px`,
      width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
      border: "3px solid #EF4444", borderRadius: `${m.round ?? 24}px`, zIndex: 9999, pointerEvents: "none",
    });
    const n = document.createElement("div");
    n.className = "tour-mark";
    n.textContent = String(m.n);
    Object.assign(n.style, {
      position: "absolute", left: `${r.left + sx - pad - 15}px`, top: `${r.top + sy - pad - 15}px`,
      width: "32px", height: "32px", borderRadius: "50%", background: "#EF4444", color: "#fff",
      font: "700 17px/32px system-ui, sans-serif", textAlign: "center", zIndex: 10000, pointerEvents: "none",
      boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
    });
    document.body.append(box, n);
  }
  return marks.length;
};
