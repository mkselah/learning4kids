import http from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import {
  loadFirstTab, parseSheetId, appendRow, loadTabIfExists, upsertRow,
} from "./lib/sheets.js";
import { analyzeSession } from "./lib/analysis.js";
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PASSWORD = process.env.APP_PASSWORD || "";
const LOG_TAB = process.env.LOG_TAB || "Skill log";
const ANALYSIS_TAB = process.env.ANALYSIS_TAB || "Notes analysis";
// One spreadsheet per form. The first tab of each is loaded automatically.
const SOURCES = {
  weekly: parseSheetId(process.env.WEEKLY_SHEET_ID),
  monthly: parseSheetId(process.env.MONTHLY_SHEET_ID),
};
if (!SOURCES.weekly && !SOURCES.monthly) {
  console.error(
    "Missing WEEKLY_SHEET_ID and MONTHLY_SHEET_ID (put them in .env or Render environment variables)."
  );
  process.exit(1);
}
for (const [name, id] of Object.entries(SOURCES)) {
  if (!id) console.warn(`Warning: ${name.toUpperCase()}_SHEET_ID is not set – the ${name} view will not work.`);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("Warning: ANTHROPIC_API_KEY is not set – the notes analysis page will not work.");
}
if (HOST !== "127.0.0.1" && !PASSWORD) {
  console.error("Refusing to start: APP_PASSWORD must be set when the server is public.");
  process.exit(1);
}
function authorized(req) {
  if (!PASSWORD) return true;
  const given = Buffer.from(String(req.headers["x-app-password"] || ""));
  const want = Buffer.from(PASSWORD);
  return given.length === want.length && timingSafeEqual(given, want);
}
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function sheetFor(source) {
  if (!Object.hasOwn(SOURCES, source)) throw httpError(400, `Unknown source "${source}"`);
  const id = SOURCES[source];
  if (!id) throw httpError(500, `${source.toUpperCase()}_SHEET_ID is not set on the server`);
  return id;
}
// ---------- Guide log (one row per saved counter) ----------
const LOG_HEADER = [
  "Saved at", "Session date", "Type", "Section", "Skill",
  "Actions", "Points", "Max points", "Percentage", "Score",
  "Average (0–3)", "Variation (SD)", "0s", "1s", "2s", "3s", "Taps", "Notes",
];
// Monthly: percentage → 1–5 (first row where pct >= from)
const MONTHLY_SCALE = [[80, 5], [60, 4], [40, 3], [20, 2], [0, 1]];
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
// Text is prefixed with ' so Sheets keeps it as plain text
// (no formulas, and "3,2" is not turned into a number)
const asText = (v, max) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s ? "'" + s : "";
};
async function saveEntry({ source, sessionDate, type, section, skill, taps, notes, savedAt }) {
  const id = sheetFor(source);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sessionDate || ""))) {
    throw httpError(400, "Session date is missing or invalid");
  }
  if (!String(skill || "").trim()) throw httpError(400, "Skill is missing");
  if (
    !Array.isArray(taps) || !taps.length || taps.length > 2000 ||
    !taps.every((p) => Number.isInteger(p) && p >= 0 && p <= 3)
  ) {
    throw httpError(400, "Invalid counter data");
  }
  const n = taps.length;
  const points = taps.reduce((a, b) => a + b, 0);
  const max = n * 3;
  const pct = (points * 100) / max;
  const avg = points / n;
  const sd = Math.sqrt(taps.reduce((a, p) => a + (p - avg) ** 2, 0) / n);
  const counts = [0, 1, 2, 3].map((v) => taps.filter((p) => p === v).length);
  const score = source === "monthly"
    ? MONTHLY_SCALE.find(([from]) => pct >= from)[1]
    : round(avg, 2);
  const stamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(String(savedAt || ""))
    ? savedAt
    : new Date().toISOString().slice(0, 16).replace("T", " ");
  const row = [
    stamp, sessionDate, asText(type, 40), asText(section, 100), asText(skill, 200),
    n, points, max, round(pct, 1), score,
    round(avg, 2), round(sd, 2), ...counts,
    asText(taps.join(" "), 5000), asText(notes, 5000),
  ];
  await appendRow(id, LOG_TAB, LOG_HEADER, row);
  const summary = `${n} actions · ${Math.round(pct)}% · ` +
    (source === "monthly" ? `score ${score}` : `avg ${round(avg, 2)}`);
  return { ok: true, tab: LOG_TAB, summary };
}
// ---------- Notes analysis (one row per session date) ----------
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ANALYSIS_HEADER = [
  "Session date", "Analyzed at", "Entries analyzed", "Summary",
  "Strengths", "Weaknesses", "Main focus", "Secondary focus", "Data (JSON)",
];
const colIndex = (columns, name) =>
  columns.findIndex((c) => c.name.trim().toLowerCase() === name.toLowerCase());
// "2025-01-05…" or "1/5/2025…" → "2025-01-05" ("" if not a date)
function dayOf(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : "";
}
// All rows of the skill log: { date, section, skill, notes }
async function logEntries(source) {
  const d = await loadTabIfExists(sheetFor(source), LOG_TAB);
  if (!d || !d.rows.length) return [];
  const iDate = colIndex(d.columns, "Session date");
  const iSection = colIndex(d.columns, "Section");
  const iSkill = colIndex(d.columns, "Skill");
  const iNotes = colIndex(d.columns, "Notes");
  if ([iDate, iSection, iSkill, iNotes].includes(-1)) {
    throw httpError(500, `Tab "${LOG_TAB}" needs the columns: Session date, Section, Skill, Notes`);
  }
  return d.rows
    .map((r) => ({
      date: dayOf(r[iDate]),
      section: String(r[iSection] ?? "").trim(),
      skill: String(r[iSkill] ?? "").trim(),
      notes: String(r[iNotes] ?? "").trim(),
    }))
    .filter((e) => e.date);
}
// Saved analyses: Map "YYYY-MM-DD" -> { analysis, analyzedAt, entryCount }
async function loadAnalyses(source) {
  const map = new Map();
  const d = await loadTabIfExists(sheetFor(source), ANALYSIS_TAB);
  if (!d) return map;
  const iDate = colIndex(d.columns, "Session date");
  const iData = colIndex(d.columns, "Data (JSON)");
  if (iDate === -1 || iData === -1) return map;
  for (const r of d.rows) {
    const day = dayOf(r[iDate]);
    if (!day || !r[iData]) continue;
    try { map.set(day, JSON.parse(r[iData])); } catch { /* ignore broken row */ }
  }
  return map;
}
function checkDate(date) {
  if (!ISO_DAY.test(String(date || ""))) throw httpError(400, "Session date is missing or invalid");
}
// Dates that exist in the skill log
async function listSessions({ source }) {
  const [entries, analyses] = await Promise.all([logEntries(source), loadAnalyses(source)]);
  const byDate = new Map();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, { date: e.date, entries: 0, withNotes: 0 });
    const s = byDate.get(e.date);
    s.entries++;
    if (e.notes) s.withNotes++;
  }
  const sessions = [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // newest first
    .map((s) => {
      const saved = analyses.get(s.date);
      return { ...s, analyzed: !!saved, stale: !!saved && saved.entryCount !== s.entries };
    });
  return { sessions };
}
// Saved analysis (if any) + the entries of that date
async function getAnalysis({ source, date }) {
  checkDate(date);
  const [entries, analyses] = await Promise.all([logEntries(source), loadAnalyses(source)]);
  const todays = entries.filter((e) => e.date === date);
  const saved = analyses.get(date) || null;
  return {
    date,
    entries: todays,
    saved,
    stale: !!saved && saved.entryCount !== todays.length,
  };
}
// Runs the AI, saves the result in the analysis tab, returns it
async function analyze({ source, date }) {
  checkDate(date);
  const id = sheetFor(source);
  const todays = (await logEntries(source)).filter((e) => e.date === date);
  if (!todays.length) throw httpError(404, "No skill log entries for this date");
  if (!todays.some((e) => e.notes)) throw httpError(400, "None of the entries on this date have notes");
  const analysis = await analyzeSession(date, todays);
  const record = {
    analysis,
    analyzedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    entryCount: todays.length,
  };
  const bullets = (list) => list.map((s) => "• " + s).join("\n");
  const focusText = (f) => `${f.area}\n${f.why}\nTry: ${f.ideas}`;
  const row = [
    asText(date, 10),
    asText(record.analyzedAt, 16),
    todays.length,
    asText(analysis.summary, 5000),
    asText(bullets(analysis.strengths), 5000),
    asText(bullets(analysis.weaknesses), 5000),
    asText(focusText(analysis.main_focus), 5000),
    asText(focusText(analysis.secondary_focus), 5000),
    asText(JSON.stringify(record), 45000),
  ];
  await upsertRow(id, ANALYSIS_TAB, ANALYSIS_HEADER, date, row);
  return { date, entries: todays, saved: record, stale: false, tab: ANALYSIS_TAB };
}
// ---------- Routes ----------
const STATIC = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/app.js": ["public/app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["public/style.css", "text/css; charset=utf-8"],
  "/guide": ["public/guide.html", "text/html; charset=utf-8"],
  "/guide.js": ["public/guide.js", "text/javascript; charset=utf-8"],
  "/guide.css": ["public/guide.css", "text/css; charset=utf-8"],
  "/analysis": ["public/analysis.html", "text/html; charset=utf-8"],
  "/analysis.js": ["public/analysis.js", "text/javascript; charset=utf-8"],
  "/analysis.css": ["public/analysis.css", "text/css; charset=utf-8"],
};
const routes = {
  "/api/data": ({ source }) => loadFirstTab(sheetFor(source), [LOG_TAB, ANALYSIS_TAB]),
  "/api/save": (body) => saveEntry(body),
  "/api/sessions": (body) => listSessions(body),
  "/api/analysis": (body) => getAnalysis(body),
  "/api/analyze": (body) => analyze(body),
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) {
        reject(httpError(413, "Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "POST" && routes[url.pathname]) {
        if (!authorized(req)) {
          return send(res, 401, JSON.stringify({ error: "Wrong password" }), "application/json");
        }
        const body = JSON.parse((await readBody(req)) || "{}");
        const out = await routes[url.pathname](body);
        return send(res, 200, JSON.stringify(out), "application/json");
      }
      const file = STATIC[url.pathname];
      if (req.method === "GET" && file) {
        const content = await readFile(new URL(file[0], import.meta.url));
        return send(res, 200, content, file[1]);
      }
      send(res, 404, "Not found", "text/plain");
    } catch (e) {
      console.error(`${url.pathname} error:`, e.message);
      send(res, e.status || 500, JSON.stringify({ error: e.message }), "application/json");
    }
  })
  .listen(PORT, HOST, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
  });