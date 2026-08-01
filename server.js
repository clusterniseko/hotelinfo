/* =============================================================
   Hilton Niseko Village — server

   Serves the three landing pages and the content manager, and
   stores the content the admin edits. Plain Node, no packages
   to install.

   Environment variables:
     PORT             set automatically by Railway
     DATA_DIR         where content.json lives. Set this to your
                      volume mount path so edits survive redeploys.
     ADMIN_USER       login username (default: admin)
     ADMIN_PASSWORD   login password (default: niseko2026 — change this)
   ============================================================= */

const http   = require("http");
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

const PORT      = process.env.PORT || 3000;
const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "content.json");

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "niseko2026";
const USING_DEFAULT_PASSWORD = !process.env.ADMIN_PASSWORD;

const MAX_BODY        = 2 * 1024 * 1024; // 2 MB
const SESSION_COOKIE   = "hnv_session";
const SESSION_MAX_AGE  = 12 * 60 * 60 * 1000; // 12 hours

/* ── sessions (in memory — logging in again after a redeploy is fine) ── */
const sessions = new Map(); // token -> expiry timestamp

function newSession() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_MAX_AGE);
  return token;
}
function isValidSession(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  return true;
}
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ── storage ─────────────────────────────────── */
function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); }
  catch (e) { console.error("Could not create", DATA_DIR, e.message); }
}
function readContent() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch (e) { return null; }
}
function writeContent(obj) {
  ensureDir();
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, DATA_FILE); // atomic, never a half-written file
}

/* ── helpers ─────────────────────────────────── */
const PAGES = {
  "/":       "hh.html",
  "/hh":     "hh.html",
  "/non-hh": "non-hh.html",
  "/nonhh":  "non-hh.html",
  "/jtb":    "jtb.html"
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml",
  ".webp": "image/webp",
  ".ico":  "image/x-icon"
};

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  header.split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i === -1) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  return isValidSession(cookies[SESSION_COOKIE]);
}

function readBody(req, cb) {
  let size = 0;
  const chunks = [];
  req.on("data", c => {
    size += c.length;
    if (size > MAX_BODY) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", () => {
    try { cb(null, JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
    catch (e) { cb(e); }
  });
}

function sendHTML(res, code, html) {
  res.writeHead(code, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(html);
}

/* ── request handling ────────────────────────── */
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch (e) { res.writeHead(400); return res.end("Bad request"); }

  /* ---- login (JSON — the form lives inside admin.html itself) ---- */
  if (pathname === "/api/login" && req.method === "POST") {
    readBody(req, (err, body) => {
      if (err) return json(res, 400, { error: "Malformed request." });
      const { username, password } = body || {};
      const ok = username && password &&
        timingSafeEqual(username, ADMIN_USER) && timingSafeEqual(password, ADMIN_PASS);
      if (!ok) return json(res, 401, { error: "Incorrect username or password." });
      const token = newSession();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}; SameSite=Lax`
      });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    const cookies = parseCookies(req);
    if (cookies[SESSION_COOKIE]) sessions.delete(cookies[SESSION_COOKIE]);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  /* ---- admin page ----
     Always serve the file itself. admin.html shows its own login
     screen and only builds the dashboard after /api/login succeeds,
     so there is nothing useful to gate here — the real protection is
     on the PUT /api/content route below, which still requires a
     valid session no matter how admin.html was opened. */
  if (pathname === "/admin" || pathname === "/admin.html") {
    return fs.readFile(path.join(__dirname, "admin.html"), (err, data) => {
      if (err) return sendHTML(res, 500, "Could not load admin.html");
      sendHTML(res, 200, data.toString("utf8"));
    });
  }

  /* ---- content API ---- */
  if (pathname === "/api/content") {
    if (req.method === "GET") {
      const content = readContent();
      return json(res, 200, { content, updatedAt: content?.meta?.updatedAt || null });
    }

    if (req.method === "PUT") {
      if (!isAuthed(req)) return json(res, 401, { error: "Not signed in — please log in again." });
      readBody(req, (err, body) => {
        if (err || !body || typeof body.content !== "object" || body.content === null) {
          return json(res, 400, { error: "Expected { content: {...} }" });
        }
        writeContent(body.content);
        json(res, 200, { ok: true, updatedAt: body.content?.meta?.updatedAt || null });
      });
      return;
    }

    res.writeHead(405, { Allow: "GET, PUT" });
    return res.end("Method not allowed");
  }

  if (pathname === "/api/session") {
    return json(res, 200, { authed: isAuthed(req) });
  }

  if (pathname === "/api/health") {
    return json(res, 200, { ok: true, hasContent: !!readContent(), dataDir: DATA_DIR });
  }

  /* ---- static pages ---- */
  const file = PAGES[pathname] || pathname.replace(/^\/+/, "");
  const safe = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(__dirname, safe);

  if (!full.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end("<h1>404</h1><p>Try <a href='/hh'>/hh</a>, <a href='/non-hh'>/non-hh</a>, <a href='/jtb'>/jtb</a> or <a href='/admin'>/admin</a>.</p>");
    }
    const type = TYPES[path.extname(full).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": type.startsWith("text/html") ? "no-cache" : "public, max-age=3600"
    });
    res.end(data);
  });
});

ensureDir();
server.listen(PORT, () => {
  console.log("Hilton Niseko Village");
  console.log("  listening on port " + PORT);
  console.log("  content file: " + DATA_FILE);
  if (!process.env.DATA_DIR) {
    console.log("  WARNING: DATA_DIR is not set. Edits will be lost on redeploy.");
    console.log("           Add a volume in Railway and set DATA_DIR to its mount path.");
  }
  console.log("  admin login: " + ADMIN_USER + " / " + (USING_DEFAULT_PASSWORD ? ADMIN_PASS + "  (default — set ADMIN_PASSWORD)" : "(custom password set)"));
});
