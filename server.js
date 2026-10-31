import http from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { loadFirstTab, parseSheetId } from "./lib/sheets.js";
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PASSWORD = process.env.APP_PASSWORD || "";
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
const STATIC = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/app.js": ["public/app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["public/style.css", "text/css; charset=utf-8"],
};
const routes = {
  "/api/data": ({ source }) => {
    if (!Object.hasOwn(SOURCES, source)) throw httpError(400, `Unknown source "${source}"`);
    const id = SOURCES[source];
    if (!id) throw httpError(500, `${source.toUpperCase()}_SHEET_ID is not set on the server`);
    return loadFirstTab(id);
  },
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
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