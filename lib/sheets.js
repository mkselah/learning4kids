import { GoogleAuth } from "google-auth-library";
const auth = new GoogleAuth({
  keyFile: process.env.GOOGLE_KEY_FILE || "./service-account.json",
  // read + write (needed to save guide entries into the log tab)
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
async function api(url, { method = "GET", data } = {}) {
  const client = await auth.getClient();
  try {
    const res = await client.request({ url, method, data });
    return res.data;
  } catch (e) {
    throw new Error(`Google Sheets: ${e.response?.data?.error?.message || e.message}`);
  }
}
export function parseSheetId(input) {
  const s = String(input || "").trim();
  const m = s.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}
function quoteTab(tab) {
  return `'${String(tab).replace(/'/g, "''")}'`;
}
// Sheets date serial number → "YYYY-MM-DD" (or "YYYY-MM-DD HH:MM" if it has a time)
function serialToISO(v) {
  const iso = new Date(Math.round((v - 25569) * 86400000)).toISOString();
  return iso.slice(11, 16) === "00:00" ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
}
const DATE_RE = /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/;
export async function listTabs(sheetId) {
  const d = await api(`${BASE}/${sheetId}?fields=properties.title,sheets.properties.title`);
  return { title: d.properties.title, tabs: d.sheets.map((s) => s.properties.title) };
}
// Loads the first tab of the spreadsheet (for Forms this is "Form Responses 1").
// Tabs listed in `skip` (e.g. the guide log tab) are never used.
export async function loadFirstTab(sheetId, skip = []) {
  const { title, tabs } = await listTabs(sheetId);
  const skipSet = new Set(skip.map((t) => String(t).toLowerCase()));
  const tab = tabs.find((t) => !skipSet.has(t.toLowerCase()));
  if (!tab) throw new Error("The spreadsheet has no data tab");
  const d = await loadTab(sheetId, tab);
  return { title, tab, ...d };
}
export async function loadTab(sheetId, tab) {
  const range = encodeURIComponent(`${quoteTab(tab)}!A1:ZZ`);
  // raw = real numbers/date serials, shown = what you see in the sheet
  const [raw, shown] = await Promise.all([
    api(`${BASE}/${sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`),
    api(`${BASE}/${sheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`),
  ]);
  const R = raw.values || [];
  const S = shown.values || [];
  if (!R.length) return { columns: [], rows: [] };
  // Header names (fill blanks, make duplicates unique)
  const width = Math.max(...R.map((r) => r.length));
  const seen = {};
  const header = Array.from({ length: width }, (_, i) => {
    let name = String(R[0][i] ?? "").trim() || `Column ${i + 1}`;
    if (seen[name]) name = `${name} (${++seen[name]})`;
    else seen[name] = 1;
    return name;
  });
  // Detect column types
  const columns = header.map((name, c) => {
    let filled = 0, nums = 0, dates = 0;
    for (let i = 1; i < R.length; i++) {
      const v = R[i][c];
      if (v === "" || v == null) continue;
      filled++;
      if (typeof v === "number") {
        nums++;
        if (DATE_RE.test(String(S[i]?.[c] ?? ""))) dates++;
      }
    }
    const type =
      filled && dates / filled > 0.8 ? "date" : filled && nums / filled > 0.8 ? "number" : "text";
    return { name, type };
  });
  // Convert rows
  const rows = [];
  for (let i = 1; i < R.length; i++) {
    const r = R[i];
    if (!r.some((v) => v !== "" && v != null)) continue; // skip empty rows
    rows.push(
      columns.map((col, c) => {
        const v = r[c];
        if (v === "" || v == null) return null;
        if (col.type === "date") return typeof v === "number" ? serialToISO(v) : null;
        if (col.type === "number") return typeof v === "number" ? v : null;
        return String(S[i]?.[c] ?? v);
      })
    );
  }
  return { columns, rows };
}
// ---------- Writing (guide log) ----------
// Writes to the same spreadsheet run one after another, so two quick saves
// can't both try to create the log tab at the same time.
const queues = new Map(); // sheetId -> promise
function queued(sheetId, fn) {
  const prev = queues.get(sheetId) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(sheetId, next);
  return next;
}
// Creates the tab (with frozen header row) if it doesn't exist yet
async function ensureTab(sheetId, tab) {
  const { tabs } = await listTabs(sheetId);
  if (tabs.some((t) => t.toLowerCase() === tab.toLowerCase())) return;
  try {
    await api(`${BASE}/${sheetId}:batchUpdate`, {
      method: "POST",
      data: {
        requests: [{
          addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } },
        }],
      },
    });
  } catch (e) {
    if (!/already exists/i.test(e.message)) throw e;
  }
}
// Writes the header into row 1 if row 1 is empty
async function ensureHeader(sheetId, tab, header) {
  const range = encodeURIComponent(`${quoteTab(tab)}!1:1`);
  const d = await api(`${BASE}/${sheetId}/values/${range}`);
  const first = d.values?.[0] || [];
  if (first.some((v) => String(v).trim() !== "")) return;
  await api(`${BASE}/${sheetId}/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    data: { values: [header] },
  });
}
// Appends one row to `tab` (creates the tab + header row first if needed).
// USER_ENTERED: dates become real dates, and values starting with ' stay plain text.
export function appendRow(sheetId, tab, header, row) {
  return queued(sheetId, async () => {
    await ensureTab(sheetId, tab);
    await ensureHeader(sheetId, tab, header);
    const range = encodeURIComponent(`${quoteTab(tab)}!A1`);
    return api(
      `${BASE}/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", data: { values: [row] } }
    );
  });
}