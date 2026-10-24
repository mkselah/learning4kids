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
// ---------- Rendering ----------
function render() {
  const rows = filteredRows();
  renderKpis(rows);
  renderSections(rows);
  renderTable(rows);
}
function renderKpis(rows) {
  const cards = [["Rows", rows.length]];
  for (const c of data.columns.filter((c) => c.type === "number").slice(0, 3)) {
    const vals = rows.map((r) => r[idx(c.name)]).filter((v) => typeof v === "number");
    const sum = vals.reduce((a, b) => a + b, 0);
    cards.push([`${c.name} · total`, sum], [`${c.name} · average`, vals.length ? sum / vals.length : NaN]);
  }
  $("kpis").innerHTML = cards
    .map(([label, v]) =>
      `<div class="kpi"><div class="kpi-value">${fmt(v)}</div><div class="kpi-label">${esc(label)}</div></div>`)
    .join("");
}
// Average value per date (or per row number if the sheet has no date column)
function series(rows, yi) {
  const di = data.columns.findIndex((c) => c.type === "date");
  const groups = new Map();
  rows.forEach((r, n) => {
    const y = toNum(r[yi]);
    if (y == null) return;
    let key;
    if (di === -1) key = String(n + 1);
    else if (r[di]) key = String(r[di]).slice(0, 10);
    else return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(y);
  });
  let entries = [...groups].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]);
  if (di !== -1) entries.sort((a, b) => (a[0] > b[0] ? 1 : -1));
  return { labels: entries.map((e) => e[0]), values: entries.map((e) => e[1]) };
}
function lineConfig(label, rows, yi, color) {
  const { labels, values } = series(rows, yi);
  return {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        borderColor: color,
        backgroundColor: color,
        tension: 0.25,
        pointRadius: 3,
        spanGaps: true,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { min: 1, max: 5, ticks: { stepSize: 1 }, grid: { display: false } },
      },
    },
  };
}
function renderSections(rows) {
  instances.forEach((c) => c.destroy());
  instances = [];
  const root = $("sections");
  root.innerHTML = "";
  SECTIONS.forEach((sec, s) => {
    const section = document.createElement("section");
    section.className = "category";
    section.innerHTML = `<h2>${esc(sec.title)}</h2><div class="grid"></div>`;
    const grid = section.querySelector(".grid");
    const color = COLORS[s % COLORS.length];
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
      card.innerHTML = `<div class="card-head"><span>${esc(data.columns[yi].name)}</span></div>
        <div class="chart-box"><canvas></canvas></div>`;
      grid.appendChild(card);
      instances.push(new Chart(card.querySelector("canvas"),
        lineConfig(data.columns[yi].name, rows, yi, color)));
    }
    root.appendChild(section);
  });
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