const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SOURCE = "monthly";
// ---------- Server calls (same password handling as the other pages) ----------
async function api(path, body = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Password": localStorage.getItem("appPassword") || "",
      },
      body: JSON.stringify(body),
    });
    if (r.status === 401) {
      const pw = prompt("Password:");
      if (pw === null) throw new Error("Password required");
      localStorage.setItem("appPassword", pw);
      continue;
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }
  throw new Error("Wrong password");
}
let sessions = [];     // [{ date, entries, withNotes, analyzed, stale }]
let date = "";         // selected session date
let view = null;       // { entries, saved, stale } for the selected date
let busy = false;      // analysis running
let loading = false;   // loading the selected date
let message = null;    // { kind: "ok" | "err" | "warn", text }
let token = 0;
const setStatus = (t) => ($("status").textContent = t);
// ---------- Date dropdown ----------
function buildSelect() {
  $("session").innerHTML = sessions.length
    ? sessions.map((s) => {
        const tag = s.analyzed ? (s.stale ? " · ⚠ outdated" : " · ✓ analyzed") : "";
        return `<option value="${esc(s.date)}">${esc(s.date)} · ${s.entries} entries (${s.withNotes} with notes)${tag}</option>`;
      }).join("")
    : `<option value="">No sessions found</option>`;
  $("session").value = date;
}
$("session").onchange = (e) => {
  date = e.target.value;
  localStorage.setItem("analysisDate", date);
  openDate();
};
$("analyzeBtn").onclick = () => analyze();
async function init() {
  setStatus("Loading sessions…");
  const out = await api("/api/sessions", { source: SOURCE });
  sessions = out.sessions;
  const last = localStorage.getItem("analysisDate");
  date = sessions.some((s) => s.date === last) ? last : sessions[0]?.date || "";
  buildSelect();
  setStatus("");
  await openDate();
}
// ---------- Open a date: show the saved analysis if there is one ----------
async function openDate() {
  const t = ++token;
  view = null;
  message = null;
  loading = !!date;
  render();
  if (!date) return;
  try {
    const v = await api("/api/analysis", { source: SOURCE, date });
    if (t !== token) return;
    view = v;
    if (v.stale) {
      message = { kind: "warn", text: "New log entries were added after this analysis. Press Re-analyze to include them." };
    }
  } catch (e) {
    if (t !== token) return;
    message = { kind: "err", text: e.message };
  }
  loading = false;
  render();
}
// ---------- Analyze (runs the AI and saves into the sheet) ----------
async function analyze() {
  if (!date || busy) return;
  busy = true;
  message = null;
  render();
  try {
    const v = await api("/api/analyze", { source: SOURCE, date });
    view = v;
    const s = sessions.find((x) => x.date === date);
    if (s) { s.analyzed = true; s.stale = false; }
    buildSelect();
    message = { kind: "ok", text: `Saved ✓ in tab "${v.tab}"` };
  } catch (e) {
    message = { kind: "err", text: "Not analyzed: " + e.message };
  } finally {
    busy = false;
    render();
  }
}
// ---------- Drawing ----------
const list = (items) => items.length
  ? `<ul class="points">${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`
  : `<p class="muted">Nothing noted</p>`;
const focusCard = (label, f, cls) => `
  <div class="card ${cls}">
    <div class="focus-label">${esc(label)}</div>
    <h3>${esc(f.area)}</h3>
    <p>${esc(f.why)}</p>
    <p class="ideas"><b>Try:</b> ${esc(f.ideas)}</p>
  </div>`;
function notesTable(entries) {
  return `<details class="panel">
    <summary>📝 Log entries used (${entries.length})</summary>
    <div class="table-wrap"><table class="notes-table">
      <thead><tr><th>Section</th><th>Skill</th><th>Notes</th></tr></thead>
      <tbody>${entries.map((e) => `<tr>
        <td>${esc(e.section)}</td>
        <td>${esc(e.skill)}</td>
        <td class="note">${e.notes ? esc(e.notes) : `<span class="none">(no notes)</span>`}</td>
      </tr>`).join("")}</tbody>
    </table></div>
  </details>`;
}
function render() {
  const saved = view?.saved;
  const btn = $("analyzeBtn");
  btn.disabled = !date || busy || loading;
  btn.textContent = busy ? "Analyzing…" : saved ? "Re-analyze" : "Analyze";
  $("session").disabled = busy;
  setStatus(busy ? "Asking the AI, this can take ~10–20 s…" : "");
  let html = "";
  if (message) html += `<div class="msg ${message.kind}">${esc(message.text)}</div>`;
  if (!date) {
    html += `<div class="card empty">No sessions found in the skill log yet.</div>`;
  } else if (loading) {
    html += `<div class="card empty">Loading…</div>`;
  } else if (view && !saved) {
    html += `<div class="card empty">No analysis saved for ${esc(date)} yet.<br>Press <b>Analyze</b>.</div>`;
  } else if (saved) {
    const a = saved.analysis;
    html += `
      <div class="card">
        <h2>Summary · ${esc(date)}</h2>
        <p>${esc(a.summary)}</p>
        <div class="meta">Analyzed ${esc(saved.analyzedAt)} · ${saved.entryCount} entries</div>
      </div>
      <div class="cols">
        <div class="card good"><h2>💪 Strengths</h2>${list(a.strengths)}</div>
        <div class="card bad"><h2>🎯 Weaknesses</h2>${list(a.weaknesses)}</div>
      </div>
      <div class="cols">
        ${focusCard("Main focus · next 1–2 weeks", a.main_focus, "main")}
        ${focusCard("Secondary focus", a.secondary_focus, "second")}
      </div>`;
  }
  if (view?.entries?.length) html += notesTable(view.entries);
  $("result").innerHTML = html;
}
render();
init().catch((e) => {
  message = { kind: "err", text: e.message };
  setStatus("");
  render();
});