const $ = (id) => document.getElementById(id);
const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
                "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];
// ---------- Weekly: rating columns (notes are in "<name> count") ----------
const WEEKLY_METRICS = [
  "Technical execution",
  "Decision-making",
  "Scanning and awareness",
  "Off-ball movement and support",
  "Defending, pressing, and recovery",
  "Mentality and body language",
  "Coachability and listening",
];
// ---------- Monthly: sections (column names exactly as in the sheet header) ----------
const MONTHLY_SECTIONS = [
  { title: "Technical skills", cols: [
    "First touch/ball control",
    "Passing",
    "Dribbling/1v1",
    "Shooting",
    "Finishing",
    "Weak foot",
    "Turns/change direction",
    "Finter/body feints",
    "Top før bund",
  ] },
  { title: "Boldholder", cols: [
    "Technique (boldholder)",
    "Decision-making (boldholder)",
    "Scanning (boldholder)",
    "Timing (boldholder)",
    "Positioning/body orientation (boldholder)",
    "Pressure handling (boldholder)",
    "Maskering/disguise (boldholder)",
  ] },
  { title: "Medspiller", cols: [
    "Support position (medspiller)",
    "Scanning (medspiller)",
    "Movement (medspiller)",
    "Timing (medspiller)",
    "Body position (medspiller)",
    "Communication (Medspiller)",
    "Forfinteløb (medspiller)",
  ] },
  { title: "Presspiller", cols: [
    "Press timing (presspiller)",
    "Press angle (presspiller)",
    "Speed intensity (presspiller)",
    "Body position (presspiller)",
    "Top-før-bund (presspiller)",
    "Reaction after trigger (presspiller)",
    "Discipline (presspiller)",
    "Scanning (presspiller)",
  ] },
  { title: "Støttespiller", cols: [
    "Cover position (Støttespiller)",
    "Tracking (Støttespiller)",
    "Distance (Støttespiller)",
    "Scanning (Støttespiller)",
    "Blocking lanes (Støttespiller)",
    "Recovery movement (Støttespiller)",
    "Communication (Støttespiller)",
  ] },
  { title: "Mentality", cols: [
    "Confidence/bravery",
    "Handling mistakes",
    "Work rate",
    "Concentration",
    "Coachability/listening",
    "Teamwork/kindness",
    "Communication",
    "Enjoyment/fun",
  ] },
];
// ---------- Per-source settings ----------
const CONFIG = {
  weekly: {
    label: "Weekly",
    filters: [
      { col: "Type", label: "Type", options: ["Training", "Match", "Freeplay"] },
    ],
  },
  monthly: {
    label: "Monthly",
    filters: [
      { col: "Event", label: "Event", options: ["Match", "Training", "Free play"] },
      { col: "Video analysis?", label: "Video", options: ["Video", "No video"] },
    ],
  },
};
let source = "weekly";
let data = { columns: [], rows: [] };
const cache = {};                                  // source -> loaded data
const filterState = { weekly: {}, monthly: {} };   // source -> { column: value }
let instances = [];                                // Chart.js objects currently on screen
let dateCols = { ev: -1, ts: -1 };
let loadToken = 0;
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
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "–");
const setStatus = (t) => ($("status").textContent = t);
const showError = (e) => setStatus("Error: " + e.message);
// Match column names ignoring spaces and upper/lower case
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "");
const findCol = (name) => data.columns.findIndex((c) => norm(c.name) === norm(name));
// Match filter values ignoring spaces, hyphens and case ("Freeplay" = "Free play")
const normVal = (s) => String(s ?? "").toLowerCase().replace(/[\s-]+/g, "");
// Accept numbers even if the column was detected as text (e.g. "3" or "3,5")
function toNum(v) {
  if (typeof v === "number") return v;
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
// ---------- Weekly / Monthly switch (remembered in the URL hash) ----------
function sourceFromHash() {
  const h = location.hash.replace("#", "").toLowerCase();
  return CONFIG[h] ? h : "weekly";
}
function updateSwitch() {
  document.querySelectorAll("#sourceSwitch button").forEach((b) =>
    b.classList.toggle("active", b.dataset.source === source));
}
document.querySelectorAll("#sourceSwitch button").forEach((b) => {
  b.onclick = () => { location.hash = b.dataset.source; };
});
window.addEventListener("hashchange", () => switchSource().catch(showError));
async function switchSource() {
  source = sourceFromHash();
  if (location.hash !== "#" + source) history.replaceState(null, "", "#" + source);
  updateSwitch();
  await load(false);
}
// ---------- Loading ----------
async function load(force) {
  const token = ++loadToken;
  const src = source;
  if (force || !cache[src]) {
    setStatus(`Loading ${CONFIG[src].label.toLowerCase()} data…`);
    const d = await api("/api/data", { source: src });
    cache[src] = { ...d, loadedAt: new Date() };
  }
  if (token !== loadToken) return; // user switched while loading
  data = cache[src];
  computeDateCols();
  $("title").textContent = document.title = data.title || CONFIG[src].label;
  renderFilters();
  render();
  setStatus(`${data.rows.length} rows · tab "${data.tab}" · loaded ${data.loadedAt.toLocaleTimeString()}`);
}
$("reloadBtn").onclick = () => load(true).catch(showError);
// ---------- Dates: "Date of event" if filled, otherwise Timestamp ----------
function computeDateCols() {
  const ts = findCol("Timestamp");
  dateCols = {
    ev: findCol("Date of event"),
    ts: ts !== -1 ? ts : data.columns.findIndex((c) => c.type === "date"),
  };
}
const hasDates = () => dateCols.ev !== -1 || dateCols.ts !== -1;
const pad = (n) => String(n).padStart(2, "0");
// Value → "YYYY-MM-DD" (accepts "YYYY-MM-DD…" and US "M/D/YYYY…")
function toISODate(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}
function rowDate(r) {
  for (const i of [dateCols.ev, dateCols.ts]) {
    if (i === -1) continue;
    const d = toISODate(r[i]);
    if (d) return d;
  }
  return null;
}
// Oldest first. Same day → ordered by Timestamp.
function sortByDate(rows) {
  const key = (r) => `${rowDate(r) || ""} ${dateCols.ts !== -1 ? String(r[dateCols.ts] ?? "") : ""}`;
  return rows.map((r) => [key(r), r]).sort((a, b) => (a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0)).map((x) => x[1]);
}
// ---------- Quick filter buttons ----------
function renderFilters() {
  const state = filterState[source];
  $("filters").innerHTML = CONFIG[source].filters.map((f, n) => {
    const cur = state[f.col] || "";
    const btns = [["", "All"], ...f.options.map((o) => [o, o])].map(([v, l]) =>
      `<button class="chip${v === cur ? " active" : ""}" data-f="${n}" data-v="${esc(v)}">${esc(l)}</button>`
    ).join("");
    const missing = findCol(f.col) === -1 ? `<span class="missing-inline">(column not found)</span>` : "";
    return `<div class="filter-group"><span class="filter-label">${esc(f.label)}</span>${btns}${missing}</div>`;
  }).join("");
  $("filters").querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const f = CONFIG[source].filters[b.dataset.f];
      filterState[source][f.col] = b.dataset.v;
      renderFilters();
      render();
    };
  });
}
function filteredRows() {
  const state = filterState[source];
  const active = CONFIG[source].filters
    .map((f) => [findCol(f.col), state[f.col]])
    .filter(([i, v]) => i !== -1 && v);
  return data.rows.filter((r) => active.every(([i, v]) => normVal(r[i]) === normVal(v)));
}
// ---------- Series: average per date ----------
// `cols` can be one column index or an array of them. With several columns,
// each column is averaged per date first, then those averages are averaged
// (so every column counts equally).
function series(rows, cols) {
  const list = Array.isArray(cols) ? cols : [cols];
  const dated = hasDates();
  const groups = new Map(); // key -> per column [sum, count]
  rows.forEach((r, n) => {
    let key;
    if (!dated) key = String(n + 1);
    else {
      key = rowDate(r);
      if (!key) return;
    }
    list.forEach((yi, j) => {
      const y = toNum(r[yi]);
      if (y == null) return;
      if (!groups.has(key)) groups.set(key, list.map(() => [0, 0]));
      const g = groups.get(key)[j];
      g[0] += y;
      g[1]++;
    });
  });
  const entries = [...groups].map(([k, g]) => {
    const avgs = g.filter(([, c]) => c > 0).map(([s, c]) => s / c);
    return [k, avgs.reduce((a, b) => a + b, 0) / avgs.length];
  });
  if (dated) entries.sort((a, b) => (a[0] > b[0] ? 1 : -1));
  return { labels: entries.map((e) => e[0]), values: entries.map((e) => e[1]) };
}
// Average of the given columns within one row (one review)
function rowMean(r, cols) {
  return mean(cols.map((i) => toNum(r[i])).filter((v) => v != null));
}
// One entry per review (row), oldest first, only rows with values
function reviewSeries(rows, cols) {
  return sortByDate(rows)
    .map((r) => ({ r, date: rowDate(r), v: rowMean(r, cols) }))
    .filter((x) => Number.isFinite(x.v));
}
// ---------- Trends ----------
const TREND_EPS = 0.005; // smaller differences count as "no change"
const TREND = {
  1: ["▲", "up", "Improving"],
  "-1": ["▼", "down", "Getting worse"],
  0: ["▶", "flat", "No change"],
};
function trendOf(recent, prev) {
  if (!Number.isFinite(recent) || !Number.isFinite(prev)) return null;
  return recent > prev + TREND_EPS ? 1 : recent < prev - TREND_EPS ? -1 : 0;
}
// "YYYY-MM-DD" shifted by days/months → "YYYY-MM-DD"
function shiftISO(iso, { days = 0, months = 0 }) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Weekly: overall average + last 14 days vs. the 2 months before that
function weeklyStats(rows, cols) {
  const { labels, values } = series(rows, cols);
  const all = mean(values);
  if (!hasDates() || !labels.length) return { all, recent: NaN, prev: NaN, trend: null };
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
  return { all, recent, prev, trend: trendOf(recent, prev) };
}
// Monthly: overall average + latest review vs. average of the 3 reviews before it
function monthlyStats(rows, cols) {
  const all = mean(series(rows, cols).values);
  const reviews = reviewSeries(rows, cols);
  if (!reviews.length) return { all, recent: NaN, prev: NaN, trend: null };
  const recent = reviews[reviews.length - 1].v;
  const prev = mean(reviews.slice(-4, -1).map((x) => x.v));
  return { all, recent, prev, trend: trendOf(recent, prev) };
}
// ---------- Top cards ----------
function kpiCard(title, st, sub) {
  const t = st.trend == null ? null : TREND[st.trend];
  const arrow = t
    ? `<span class="trend ${t[1]}" title="${t[2]}">${t[0]}</span>`
    : `<span class="trend flat" title="Not enough data for a trend">–</span>`;
  return `<div class="kpi">
      <div class="kpi-value">${fmt(st.all)} ${arrow}</div>
      <div class="kpi-label">${esc(title)}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`;
}
function renderKpis(rows) {
  const empty = { all: NaN, recent: NaN, prev: NaN, trend: null };
  if (source === "weekly") {
    $("kpis").innerHTML = WEEKLY_METRICS.map((name) => {
      const i = findCol(name);
      const st = i === -1 ? empty : weeklyStats(rows, [i]);
      return kpiCard(name, st, `14 d: ${fmt(st.recent)} · prev 2 mo: ${fmt(st.prev)}`);
    }).join("");
  } else {
    $("kpis").innerHTML = MONTHLY_SECTIONS.map((sec) => {
      const found = sec.cols.map(findCol).filter((i) => i !== -1);
      const st = found.length ? monthlyStats(rows, found) : empty;
      return kpiCard(sec.title, st, `latest: ${fmt(st.recent)} · prev 3: ${fmt(st.prev)}`);
    }).join("");
  }
}
// ---------- Line chart ----------
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
// ---------- Weekly: one chart + notes log per rating ----------
function notesHtml(rows, scoreIdx, noteIdx, noteName) {
  if (noteIdx === -1) {
    return `<div class="missing">Notes column "${esc(noteName)}" not found</div>`;
  }
  const typeIdx = findCol("Type");
  const items = sortByDate(rows)
    .filter((r) => r[noteIdx] != null && String(r[noteIdx]).trim() !== "")
    .reverse(); // newest first
  if (!items.length) return `<div class="notes-empty">No notes yet</div>`;
  return `<div class="notes-title">Notes (${items.length})</div>
    <div class="notes-wrap"><table class="notes-table">
      <thead><tr><th>Date</th><th>Type</th><th>Score</th><th>Note</th></tr></thead>
      <tbody>${items.map((r) => `<tr>
        <td>${esc(rowDate(r) || "")}</td>
        <td>${esc(typeIdx === -1 ? "" : r[typeIdx])}</td>
        <td class="num">${fmt(toNum(r[scoreIdx]))}</td>
        <td class="note">${esc(r[noteIdx])}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
}
function renderWeekly(rows) {
  const section = document.createElement("section");
  section.className = "category";
  section.innerHTML = `<h2>Weekly ratings</h2><div class="grid wide"></div>`;
  $("sections").appendChild(section);
  const grid = section.querySelector(".grid");
  WEEKLY_METRICS.forEach((name, n) => {
    const color = COLORS[n % COLORS.length];
    const yi = findCol(name);
    const noteName = `${name} count`;
    const ni = findCol(noteName);
    const card = document.createElement("div");
    card.className = "card card-metric";
    card.style.borderLeftColor = color;
    grid.appendChild(card);
    if (yi === -1) {
      card.innerHTML = `<div class="card-head"><span>${esc(name)}</span></div>
        <div class="missing">Column "${esc(name)}" not found</div>`;
      return;
    }
    const colName = data.columns[yi].name;
    card.innerHTML = `<div class="card-head"><span>${esc(colName)}</span></div>
      <div class="chart-box"><canvas></canvas></div>
      ${notesHtml(rows, yi, ni, noteName)}`;
    instances.push(new Chart(card.querySelector("canvas"), lineConfig(colName, rows, yi, color)));
  });
}
// ---------- Monthly: latest review block ----------
function skillList(title, items, kind, emptyText) {
  const body = items.length
    ? items.map((s) => {
        const val = kind === "diff"
          ? `<span class="${s.diff > 0 ? "pos" : "neg"}">${s.diff > 0 ? "+" : ""}${fmt(s.diff)}</span>
             <span class="muted">${fmt(s.before)} → ${fmt(s.now)}</span>`
          : `<b>${fmt(s.now)}</b>`;
        return `<li><span>${esc(s.name)}</span><span class="val">${val}</span></li>`;
      }).join("")
    : `<li class="muted">${esc(emptyText)}</li>`;
  return `<div><h3>${esc(title)}</h3><ul class="skill-list">${body}</ul></div>`;
}
function renderLatest(rows) {
  const box = $("latest");
  box.innerHTML = "";
  box.hidden = source !== "monthly";
  if (source !== "monthly") return;
  const secCols = MONTHLY_SECTIONS.map((s) => ({
    title: s.title,
    idx: s.cols.map(findCol).filter((i) => i !== -1),
  }));
  const allCols = secCols.flatMap((s) => s.idx);
  const reviews = reviewSeries(rows, allCols);
  if (!reviews.length) {
    box.innerHTML = `<section class="category"><h2>Latest review</h2>
      <div class="grid"><div class="card missing">No reviews found for this filter</div></div></section>`;
    return;
  }
  const latest = reviews[reviews.length - 1];
  const prev = reviews.length > 1 ? reviews[reviews.length - 2] : null;
  const ev = findCol("Event"), vid = findCol("Video analysis?");
  const describe = (x) =>
    [x.date, ev === -1 ? null : x.r[ev], vid === -1 ? null : x.r[vid]].filter(Boolean).join(" · ");
  const skills = allCols.map((i) => ({
    name: data.columns[i].name,
    now: toNum(latest.r[i]),
    before: prev ? toNum(prev.r[i]) : null,
  }));
  const rated = skills.filter((s) => s.now != null);
  const strongest = [...rated].sort((a, b) => b.now - a.now).slice(0, 3);
  const weakest = [...rated].sort((a, b) => a.now - b.now).slice(0, 3);
  const changed = rated.filter((s) => s.before != null).map((s) => ({ ...s, diff: s.now - s.before }));
  const improved = changed.filter((s) => s.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 3);
  const declined = changed.filter((s) => s.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 3);
  const noPrev = "No previous review to compare";
  box.innerHTML = `<section class="category">
    <h2>Latest review</h2>
    <div class="grid latest-grid">
      <div class="card">
        <div class="card-head"><span>Section averages</span></div>
        <div class="card-sub">Latest: ${esc(describe(latest))}${prev ? ` · Previous: ${esc(describe(prev))}` : ""}</div>
        <div class="chart-box radar-box"><canvas></canvas></div>
      </div>
      <div class="card">
        <div class="card-head"><span>Skills</span></div>
        <div class="lists">
          ${skillList("▲ Most improved", improved, "diff", prev ? "Nothing improved" : noPrev)}
          ${skillList("▼ Most declined", declined, "diff", prev ? "Nothing declined" : noPrev)}
          ${skillList("💪 Strongest", strongest, "value", "No ratings")}
          ${skillList("🎯 Weakest", weakest, "value", "No ratings")}
        </div>
      </div>
    </div>
  </section>`;
  const toVal = (v) => (Number.isFinite(v) ? v : null);
  const datasets = [{
    label: `Latest${latest.date ? ` (${latest.date})` : ""}`,
    data: secCols.map((s) => toVal(rowMean(latest.r, s.idx))),
    borderColor: COLORS[0],
    backgroundColor: COLORS[0] + "33",
    pointRadius: 3,
    spanGaps: true,
  }];
  if (prev) {
    datasets.push({
      label: `Previous${prev.date ? ` (${prev.date})` : ""}`,
      data: secCols.map((s) => toVal(rowMean(prev.r, s.idx))),
      borderColor: COLORS[1],
      backgroundColor: COLORS[1] + "22",
      borderDash: [5, 4],
      pointRadius: 3,
      spanGaps: true,
    });
  }
  instances.push(new Chart(box.querySelector("canvas"), {
    type: "radar",
    data: { labels: secCols.map((s) => s.title), datasets },
    options: {
      maintainAspectRatio: false,
      scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.r)}` } },
      },
    },
  }));
}
// ---------- Monthly: sections with average chart + foldable per-column charts ----------
// Which sections are expanded (remembered across reloads)
const openSections = new Set(JSON.parse(localStorage.getItem("openSections") || "[]"));
const saveOpen = () => localStorage.setItem("openSections", JSON.stringify([...openSections]));
function renderSections(rows) {
  const root = $("sections");
  MONTHLY_SECTIONS.forEach((sec, s) => {
    const color = COLORS[s % COLORS.length];
    const found = sec.cols.map(findCol).filter((i) => i !== -1);
    const label = `Average · ${sec.title}`;
    const key = `${source}:${sec.title}`;
    const section = document.createElement("section");
    section.className = "category";
    section.innerHTML = `<h2>${esc(sec.title)}</h2>
      <div class="grid">
        <div class="card card-avg" style="border-left-color:${color}">
          <div class="card-head"><span>${esc(label)}</span><button class="toggle"></button></div>
          ${found.length
            ? `<div class="chart-box"><canvas></canvas></div>`
            : `<div class="missing">None of this section's columns were found in this sheet</div>`}
        </div>
      </div>
      <div class="grid details"></div>`;
    root.appendChild(section);
    if (found.length) {
      instances.push(new Chart(section.querySelector("canvas"),
        lineConfig(label, rows, found, color, true)));
    }
    // --- Fold / unfold the per-column graphs ---
    const btn = section.querySelector(".toggle");
    const details = section.querySelector(".details");
    const update = () => {
      const open = openSections.has(key);
      details.hidden = !open;
      btn.textContent = open ? "Hide graphs ▴" : `Show ${sec.cols.length} graphs ▾`;
      // Charts are only built the first time the section is opened
      if (open && !details.childElementCount) renderColumnCharts(sec, details, rows, color);
    };
    btn.onclick = () => {
      if (openSections.has(key)) openSections.delete(key);
      else openSections.add(key);
      saveOpen();
      update();
    };
    update();
  });
}
function renderColumnCharts(sec, grid, rows, color) {
  for (const name of sec.cols) {
    const yi = findCol(name);
    const card = document.createElement("div");
    card.className = "card";
    grid.appendChild(card);
    if (yi === -1) {
      card.innerHTML = `<div class="card-head"><span>${esc(name)}</span></div>
        <div class="missing">Column "${esc(name)}" not found in this sheet</div>`;
      continue;
    }
    const colName = data.columns[yi].name;
    card.innerHTML = `<div class="card-head"><span>${esc(colName)}</span></div>
      <div class="chart-box"><canvas></canvas></div>`;
    instances.push(new Chart(card.querySelector("canvas"), lineConfig(colName, rows, yi, color)));
  }
}
// ---------- Draw everything ----------
function render() {
  instances.forEach((c) => c.destroy());
  instances = [];
  const rows = filteredRows();
  renderKpis(rows);
  renderLatest(rows);
  $("sections").innerHTML = "";
  if (source === "weekly") renderWeekly(rows);
  else renderSections(rows);
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
switchSource().catch(showError);