/* Shared by the kiosk (/) and the admin (/admin): icons, flags and page rendering,
   so what staff preview in the admin is exactly what the screen shows. */
(function (g) {
  const ICONS = {
    check: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3h6v3H9zM8.5 11l1.5 1.5 3-3M8.5 16.5l1.5 1.5 3-3"/>',
    form: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14h7M9 17h4"/>',
    fee: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M14.5 8.5a2.5 2.5 0 0 0-5 0c0 3 0 4-1.5 6h7M8.5 12h5"/>',
    cal: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M8 14h2M14 14h2M8 17h2"/>',
    rules: '<rect x="4" y="3" width="13" height="18" rx="2"/><path d="M8 8h5M8 12h5M8 16h3"/><path d="M15 15l5-5 1.5 1.5-5 5-2 .5z"/>',
    lock: '<rect x="3" y="4" width="13" height="14" rx="2"/><path d="M6 8h7M6 11h7M6 14h3"/><rect x="14" y="13" width="7" height="7" rx="1"/><path d="M15.5 13v-1.5a2 2 0 0 1 4 0V13"/>',
    info: '<path d="M8 7V4h11v13h-3"/><rect x="5" y="7" width="11" height="14" rx="1"/><path d="M8 12h5M8 15h5M8 18h3"/>',
    like: '<path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2 3l-1 3h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/><path d="M18 2l.6 1.4L20 4l-1.4.6L18 6l-.6-1.4L16 4l1.4-.6z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M18 20a6 6 0 0 0-3-5.2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'
  };
  const ICON_NAMES = {
    check: "Checklist", form: "Form", fee: "Fees / receipt", cal: "Calendar", rules: "Rules", lock: "Security",
    info: "Information", like: "Feedback", clock: "Opening hours", pin: "Location", phone: "Contact",
    star: "Featured", alert: "Warning", card: "Payment", people: "Staff / people", globe: "Travel"
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pick = (obj, lang) => (obj && (obj[lang] || obj.en)) || "";
  const icon = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.info}</svg>`;

  function flag(c, size) {
    const dir = c.direction === "horizontal" ? "column" : "row";
    const st = (c.stripes && c.stripes.length ? c.stripes : ["#888"]).map((col, i, a) =>
      `<span style="flex:${a.length === 3 && dir === "column" && i === 1 ? 2 : 1};background:${esc(col)}"></span>`).join("");
    return `<span class="flag" style="flex-direction:${dir};${size ? `width:${size}px;height:${size}px` : ""}">${st}</span>`;
  }

  // Plain text -> safe HTML. Blank line = new paragraph, lines starting "- " = bullet points.
  function formatBody(text) {
    const blocks = String(text || "").replace(/\r/g, "").split(/\n\s*\n/);
    return blocks.map((b) => {
      const lines = b.split("\n").filter((l) => l.trim() !== "");
      if (!lines.length) return "";
      let html = "", list = [];
      const flush = () => { if (list.length) { html += "<ul>" + list.map((l) => `<li>${esc(l)}</li>`).join("") + "</ul>"; list = []; } };
      for (const l of lines) {
        const m = l.match(/^\s*[-•*]\s+(.*)$/);
        if (m) list.push(m[1]); else { flush(); html += `<p>${esc(l)}</p>`; }
      }
      flush();
      return html;
    }).join("");
  }

  function renderPage(p, lang) {
    if (!p) return "";
    const h = pick(p.heading, lang), note = pick(p.note, lang);
    let out = h ? `<h2>${esc(h)}</h2>` : "";
    if (p.type === "table") {
      out += `<div class="tablewrap"><table><thead><tr><th>${esc(pick(p.col1, lang))}</th><th>${esc(pick(p.col2, lang))}</th></tr></thead><tbody>` +
        (p.rows || []).map((r) => `<tr><td>${esc(pick(r.a, lang))}</td><td>${esc(pick(r.b, lang))}</td></tr>`).join("") + "</tbody></table></div>";
    } else if (p.type === "image") {
      out += p.src ? `<figure><img src="${esc(p.src)}" alt="${esc(pick(p.caption, lang) || h)}"><figcaption>${esc(pick(p.caption, lang))}</figcaption></figure>` : "";
    } else {
      out += formatBody(pick(p.body, lang));
    }
    if (note) out += `<p class="note">${esc(note)}</p>`;
    return out;
  }

  g.TNB = { ICONS, ICON_NAMES, esc, pick, icon, flag, formatBody, renderPage };
})(window);
