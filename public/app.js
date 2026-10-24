const $ = (id) => document.getElementById(id);
let data = { columns: [], rows: [] };
let tab = "";
let charts = [];    // chart settings for the current tab
let instances = []; // Chart.js objects currently on screen
const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
                "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];
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
const colType = (name) => data.columns[idx(name)]?.type;
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "–");
const setStatus = (t) => ($("status").textContent = t);
const showError = (e) => setStatus("Error: " + e.message);
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
  charts = JSON.parse(localStorage.getItem("charts:" + tab) || "null") || defaultCharts();
  fillSelectors();
  render();
  setStatus(`${data.rows.length} rows · loaded ${new Date().toLocaleTimeString()}`);
}
$("tabSelect").onchange = () => loadTab().catch(showError);
$("reloadBtn").onclick = () => loadTab().catch(showError);
// ---------- Default charts ----------
function defaultCharts() {
  const distinct = (name) => new Set(data.rows.map((r) => r[idx(name)])).size;
  const nums = data.columns.filter((c) => c.type === "number").map((c) => c.name);
  const date = data.columns.find((c) => c.type === "date")?.name;
  const cat = data.columns.find((c) => c.type === "text" && distinct(c.name) >= 2 && distinct(c.name) <= 30)?.name;
  const out = [];
  for (const y of nums.slice(0, 4)) {
    if (date) out.push({ type: "line", x: date, y, agg: "sum", group: "day" });
    else if (cat) out.push({ type: "bar", x: cat, y, agg: "sum" });
  }
  if (cat) out.push({ type: "doughnut", x: cat, y: "", agg: "count" });
  return out;
}
function saveCharts() {
  localStorage.setItem("charts:" + tab, JSON.stringify(charts));
}
// ---------- Selectors & filter ----------
function fillSelectors() {
  const cols = data.columns;
  $("filterCol").innerHTML = opt("", "(none)") +
    cols.filter((c) => c.type === "text").map((c) => opt(c.name)).join("");
  $("filterVal").innerHTML = opt("", "All");
  $("cX").innerHTML = cols.map((c) => opt(c.name, `${c.name} (${c.type})`)).join("");
  $("cY").innerHTML = opt("", "(count rows)") +
    cols.filter((c) => c.type === "number").map((c) => opt(c.name)).join("");
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
// ---------- Add / reset charts ----------
$("addBtn").onclick = () => {
  const cfg = {
    type: $("cType").value,
    x: $("cX").value,
    y: $("cY").value,
    agg: $("cAgg").value,
    group: $("cGroup").value,
  };
  if (cfg.type === "scatter" && (!cfg.y || colType(cfg.x) !== "number")) {
    return alert("Scatter needs a number column for both X and Y.");
  }
  charts.push(cfg);
  saveCharts();
  render();
};
$("resetBtn").onclick = () => {
  localStorage.removeItem("charts:" + tab);
  charts = defaultCharts();
  render();
};
// ---------- Rendering ----------
function render() {
  const rows = filteredRows();
  renderKpis(rows);
  renderCharts(rows);
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
function chartTitle(cfg) {
  if (cfg.type === "scatter") return `${cfg.y} vs ${cfg.x}`;
  return `${cfg.y ? `${cfg.agg} of ${cfg.y}` : "Count of rows"} by ${cfg.x}`;
}
function reduce(vals, agg) {
  if (agg === "count") return vals.length;
  if (!vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return { sum, avg: sum / vals.length, min: Math.min(...vals), max: Math.max(...vals) }[agg];
}
function aggregate(rows, xi, yi, agg, group, xType) {
  const groups = new Map();
  for (const r of rows) {
    let k = r[xi];
    if (k == null) k = "(blank)";
    else if (xType === "date") k = k.slice(0, { year: 4, month: 7, day: 10 }[group] || 10);
    if (!groups.has(k)) groups.set(k, []);
    if (yi === -1) groups.get(k).push(1);
    else if (typeof r[yi] === "number") groups.get(k).push(r[yi]);
  }
  let entries = [...groups].map(([k, vals]) => [k, reduce(vals, agg)]);
  if (xType === "text") entries = entries.sort((a, b) => b[1] - a[1]).slice(0, 30); // top 30
  else entries.sort((a, b) => (a[0] > b[0] ? 1 : -1));
  return { labels: entries.map((e) => String(e[0])), values: entries.map((e) => e[1]) };
}
function chartConfig(cfg, rows) {
  const xi = idx(cfg.x);
  const yi = cfg.y ? idx(cfg.y) : -1;
  if (cfg.type === "scatter") {
    const points = rows
      .filter((r) => typeof r[xi] === "number" && typeof r[yi] === "number")
      .map((r) => ({ x: r[xi], y: r[yi] }));
    return {
      type: "scatter",
      data: { datasets: [{ label: cfg.y, data: points, backgroundColor: COLORS[0] }] },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: cfg.x } },
          y: { title: { display: true, text: cfg.y } },
        },
      },
    };
  }
  const agg = cfg.y ? cfg.agg : "count";
  const { labels, values } = aggregate(rows, xi, yi, agg, cfg.group, colType(cfg.x));
  const round = cfg.type === "pie" || cfg.type === "doughnut";
  return {
    type: cfg.type,
    data: {
      labels,
      datasets: [{
        label: chartTitle(cfg),
        data: values,
        backgroundColor: round ? labels.map((_, i) => COLORS[i % COLORS.length]) : COLORS[0],
        borderColor: round ? "#fff" : COLORS[0],
        tension: 0.25,
      }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { display: round } } },
  };
}
function renderCharts(rows) {
  instances.forEach((c) => c.destroy());
  instances = [];
  const grid = $("charts");
  grid.innerHTML = "";
  charts.forEach((cfg, n) => {
    if (idx(cfg.x) === -1 || (cfg.y && idx(cfg.y) === -1)) return; // column no longer exists
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-head"><span>${esc(chartTitle(cfg))}</span><button title="Remove">✕</button></div>
      <div class="chart-box"><canvas></canvas></div>`;
    card.querySelector("button").onclick = () => {
      charts.splice(n, 1);
      saveCharts();
      render();
    };
    grid.appendChild(card);
    instances.push(new Chart(card.querySelector("canvas"), chartConfig(cfg, rows)));
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