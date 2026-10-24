const $ = (id) => document.getElementById(id);
let data = { columns: [], rows: [] };
let tab = "";
let instances = []; // Chart.js objects currently on screen
const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
                "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];
// ---------- Sections (column names as in the sheet header) ----------
const SECTIONS = [
  { title: "De tre", cols: ["Hjerne", "Hjerte", "Krop"] },
  { title: "Motivation", cols: [
    "Enjoyment/Fun",
    "Teamwork & Kindness",
    "Handling Mistakes/Challenges",
    "Confidence/Bravery",
    "Listening to Coach/Instructions",
  ] },
  { title: "Skills", cols: [
    "Dribbling skills",
    "Passing skills",
    "Finishing skills",
    "Shooting skills",
    "Ball Control/First Touch skills",
    "Top før bund skills",
    "Finter skills",
  ] },
  { title: "Boldholder", cols: [
    "Teknik(boldholder)",
    "Bevægelse(boldholder)",
    "Scanning(boldholder)",
    "Timing(boldholder)",
    "Maskering(boldholder)",
    "Positionering(boldholder)",
  ] },
  { title: "Medspiller", cols: [
    "Positionering(medspiller)",
    "Scanning(medspiller)",
    "Bevægelse(medspiller)",
    "Maskering(medspiller)",
    "Teknik(medspiller)",
    "Timing(medspiller)",
  ] },
  { title: "Presspiller", cols: [
    "Positionering(presspiller)",
    "Teknik (presspiller)",
    "Bevægelse(presspiller)",
    "Timing(presspiller)",
    "Scanning(presspiller)",
  ] },
  { title: "Støttespiller", cols: [
    "Positionering(støttespiller)",
    "Scanning(støttespiller)",
    "Bevægelse(støttespiller)",
  ] },
];
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
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opt = (v, label = v) => `<option value="${esc(v)}">${esc(label)}</option>`;
const idx = (name) => data.columns.findIndex((c) => c.name === name);
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "–");
const setStatus = (t) => ($("status").textContent = t);
const showError = (e) => setStatus("Error: " + e.message);
// Match column names ignoring spaces and upper/lower case
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "");
const findCol = (name) => data.columns.findIndex((c) => norm(c.name) === norm(name));
// Accept numbers even if the column was detected as text (e.g. "3" or "3,5")
function toNum(v) {
  if (typeof v === "number") return v;
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
// ---------- Loading ----------
async function init() {
  try {
    setStatus("Loading…");
    const { title, tabs } = await api("/api/tabs");
    $("title").textContent = document.title = title;
    $("tabSelect").innerHTML = tabs.map((t) => opt(t)).join("");
    const saved = localStorage.getItem("tab");
    if (tabs.includes(saved)) $("tabSelect").value = saved;
    await loadTab();
  } catch (e) {
    showError(e);
  }
}
async function loadTab() {
  tab = $("tabSelect").value;
  localStorage.setItem("tab", tab);
  setStatus("Loading data…");
  data = await api("/api/data", { tab });
  fillSelectors();
  render();
  setStatus(`${data.rows.length} rows · loaded ${new Date().toLocaleTimeString()}`);
}
$("tabSelect").onchange = () => loadTab().catch(showError);
$("reloadBtn").onclick = () => loadTab().catch(showError);
// ---------- Filter ----------
function fillSelectors() {
  $("filterCol").innerHTML = opt("", "(none)") +
    data.columns.filter((c) => c.type === "text").map((c) => opt(c.name)).join("");
  $("filterVal").innerHTML = opt("", "All");
}
$("filterCol").onchange = () => {
  const i = idx($("filterCol").value);
  const vals = i === -1 ? [] : [...new Set(data.rows.map((r) => String(r[i] ?? "(blank)")))].sort();
  $("filterVal").innerHTML = opt("", "All") + vals.map((v) => opt(v)).join("");
  render();
};
$("filterVal").onchange = () => render();
function filteredRows() {
  const i = idx($("filterCol").value);
  const val = $("filterVal").value;
  if (i === -1 || val === "") return data.rows;
  return data.rows.filter((r) => String(r[i] ?? "(blank)") === val);
}
// ---------- Top cards: one average per section + trend arrow ----------
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const TREND_EPS = 0.005; // smaller differences count as "no change"
// "YYYY-MM-DD" shifted by days/months → "YYYY-MM-DD"
function shiftISO(iso, { days = 0, months = 0 }) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Overall average + last 14 days vs. the 2 months before that
function sectionStats(rows, cols) {
  const { labels, values } = series(rows, cols);
  const all = mean(values);
  const hasDates = data.columns.some((c) => c.type === "date");
  if (!hasDates || !labels.length) return { all, recent: NaN, prev: NaN, trend: null };
  // Anchored on the newest date in the data. To anchor on today instead, use:
  // const end = new Date().toISOString().slice(0, 10);
  const end = labels[labels.length - 1];
  const recentFrom = shiftISO(end, { days: -13 });         // last 14 days incl. end
  const prevFrom = shiftISO(recentFrom, { months: -2 });   // 2 months before that
  const recentVals = [], prevVals = [];
  labels.forEach((d, i) => {
    if (d > end) return;
    if (d >= recentFrom) recentVals.push(values[i]);
    else if (d >= prevFrom) prevVals.push(values[i]);
  });
  const recent = mean(recentVals), prev = mean(prevVals);
  let trend = null;
  if (Number.isFinite(recent) && Number.isFinite(prev)) {
    trend = recent > prev + TREND_EPS ? 1 : recent < prev - TREND_EPS ? -1 : 0;
  }
  return { all, recent, prev, trend };
}
const TREND = {
  1: ["▲", "up", "Improving"],
  "-1": ["▼", "down", "Getting worse"],
  0: ["▶", "flat", "No change"],
};
function renderKpis(rows) {
  $("kpis").innerHTML = SECTIONS.map((sec) => {
    const found = sec.cols.map(findCol).filter((i) => i !== -1);
    const st = found.length ? sectionStats(rows, found) : { all: NaN, trend: null };
    const t = st.trend == null ? null : TREND[st.trend];
    const arrow = t
      ? `<span class="trend ${t[1]}" title="${t[2]}">${t[0]}</span>`
      : `<span class="trend flat" title="Not enough data for a trend">–</span>`;
    return `<div class="kpi">
        <div class="kpi-value">${fmt(st.all)} ${arrow}</div>
        <div class="kpi-label">${esc(sec.title)}</div>
        <div class="kpi-sub">14 d: ${fmt(st.recent)} · prev 2 mo: ${fmt(st.prev)}</div>
      </div>`;
  }).join("");
}
// Average value per date (or per row number if the sheet has no date column).
// `cols` can be one column index or an array of them. With several columns,
// each column is averaged per date first, then those averages are averaged
// (so every column counts equally).
function series(rows, cols) {
  const list = Array.isArray(cols) ? cols : [cols];
  const di = data.columns.findIndex((c) => c.type === "date");
  const groups = new Map(); // key -> per column [sum, count]
  rows.forEach((r, n) => {
    let key;
    if (di === -1) key = String(n + 1);
    else if (r[di]) key = String(r[di]).slice(0, 10);
    else return;
    list.forEach((yi, j) => {
      const y = toNum(r[yi]);
      if (y == null) return;
      if (!groups.has(key)) groups.set(key, list.map(() => [0, 0]));
      const g = groups.get(key)[j];
      g[0] += y;
      g[1]++;
    });
  });
  let entries = [...groups].map(([k, g]) => {
    const avgs = g.filter(([, c]) => c > 0).map(([s, c]) => s / c);
    return [k, avgs.reduce((a, b) => a + b, 0) / avgs.length];
  });
  if (di !== -1) entries.sort((a, b) => (a[0] > b[0] ? 1 : -1));
  return { labels: entries.map((e) => e[0]), values: entries.map((e) => e[1]) };
}
function lineConfig(label, rows, cols, color, fill = false) {
  const { labels, values } = series(rows, cols);
  return {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        borderColor: color,
        backgroundColor: fill ? color + "33" : color, // light fill for average chart
        fill,
        borderWidth: fill ? 3 : 2,
        tension: 0.25,
        pointRadius: 3,
        spanGaps: true,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${label}: ${fmt(ctx.parsed.y)}` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: { min: 1, max: 5, ticks: { stepSize: 1 }, grid: { display: false } },
      },
    },
  };
}
// Which sections are expanded (remembered across reloads)
const openSections = new Set(JSON.parse(localStorage.getItem("openSections") || "[]"));
const saveOpen = () => localStorage.setItem("openSections", JSON.stringify([...openSections]));
function renderSections(rows) {
  instances.forEach((c) => c.destroy());
  instances = [];
  const root = $("sections");
  root.innerHTML = "";
  SECTIONS.forEach((sec, s) => {
    const color = COLORS[s % COLORS.length];
    const found = sec.cols.map(findCol).filter((i) => i !== -1);
    const label = `Average · ${sec.title}`;
    const section = document.createElement("section");
    section.className = "category";
    section.innerHTML = `<h2>${esc(sec.title)}</h2>
      <div class="grid">
        <div class="card card-avg" style="border-left-color:${color}">
          <div class="card-head"><span>${esc(label)}</span><button class="toggle"></button></div>
          ${found.length
            ? `<div class="chart-box"><canvas></canvas></div>`
            : `<div class="missing">None of this section's columns were found in this tab</div>`}
        </div>
      </div>
      <div class="grid details"></div>`;
    if (found.length) {
      instances.push(new Chart(section.querySelector("canvas"),
        lineConfig(label, rows, found, color, true)));
    }
    // --- Fold / unfold the per-column graphs ---
    const btn = section.querySelector(".toggle");
    const details = section.querySelector(".details");
    const update = () => {
      const open = openSections.has(sec.title);
      details.hidden = !open;
      btn.textContent = open ? "Hide graphs ▴" : `Show ${sec.cols.length} graphs ▾`;
      // Charts are only built the first time the section is opened
      if (open && !details.childElementCount) renderColumnCharts(sec, details, rows, color);
    };
    btn.onclick = () => {
      if (openSections.has(sec.title)) openSections.delete(sec.title);
      else openSections.add(sec.title);
      saveOpen();
      update();
    };
    update();
    root.appendChild(section);
  });
}
function renderColumnCharts(sec, grid, rows, color) {
  for (const name of sec.cols) {
    const yi = findCol(name);
    const card = document.createElement("div");
    card.className = "card";
    if (yi === -1) {
      card.innerHTML = `<div class="card-head"><span>${esc(name)}</span></div>
        <div class="missing">Column "${esc(name)}" not found in this tab</div>`;
      grid.appendChild(card);
      continue;
    }
    const colName = data.columns[yi].name;
    card.innerHTML = `<div class="card-head"><span>${esc(colName)}</span></div>
      <div class="chart-box"><canvas></canvas></div>`;
    grid.appendChild(card);
    instances.push(new Chart(card.querySelector("canvas"), lineConfig(colName, rows, yi, color)));
  }
}
// ---------- Draw everything ----------
function render() {
  const rows = filteredRows();
  renderKpis(rows);
  renderSections(rows);
  renderTable(rows);
}
function renderTable(rows) {
  const cols = data.columns;
  $("dataTable").innerHTML =
    `<thead><tr>${cols.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>` +
    rows.slice(0, 200).map((r) =>
      `<tr>${r.map((v, i) => cols[i].type === "number"
        ? `<td class="num">${v == null ? "" : fmt(v)}</td>`
        : `<td>${esc(v)}</td>`).join("")}</tr>`).join("") +
    "</tbody>";
  $("tableNote").textContent = rows.length > 200 ? `Showing first 200 of ${rows.length} rows` : "";
}
init();