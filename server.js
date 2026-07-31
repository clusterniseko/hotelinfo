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

/* ── login page (self-contained, no external assets) ───────── */
function loginPage(errorMsg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in — Hilton Niseko Village</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=Inter:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#16283F;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem}
.card{background:#fff;border-radius:12px;padding:2.25rem 2rem;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)}
h1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:1.5rem;color:#16283F;text-align:center;margin-bottom:.15rem}
p.sub{text-align:center;color:#6B7280;font-size:.8rem;margin-bottom:1.5rem}
label{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:#6B7280;font-weight:600;margin-bottom:.3rem}
input{width:100%;border:1px solid #E2E5EA;border-radius:6px;padding:.6rem .75rem;font-size:.9rem;margin-bottom:1rem;font-family:inherit}
input:focus{outline:none;border-color:#B08D3C}
button{width:100%;background:#B08D3C;color:#fff;border:none;border-radius:6px;padding:.7rem;font-size:.9rem;font-weight:600;cursor:pointer;font-family:inherit}
button:hover{background:#D6B767}
.err{background:#FDF3F3;border:1px solid #E8C4C4;color:#B02A2A;font-size:.8rem;padding:.6rem .8rem;border-radius:6px;margin-bottom:1rem}
</style>
</head>
<body>
  <form class="card" method="POST" action="/login">
    <h1>Content Manager</h1>
    <p class="sub">Hilton Niseko Village</p>
    ${errorMsg ? `<div class="err">${errorMsg}</div>` : ""}
    <label for="u">Username</label>
    <input id="u" name="username" autocomplete="username" autofocus>
    <label for="p">Password</label>
    <input id="p" name="password" type="password" autocomplete="current-password">
    <button type="submit">Sign in</button>
  </form>
</body>
</html>`;
}

function sendHTML(res, code, html) {
  res.writeHead(code, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(html);
}

function parseFormBody(bodyStr) {
  const out = {};
  new URLSearchParams(bodyStr).forEach((v, k) => { out[k] = v; });
  return out;
}

/* ── request handling ────────────────────────── */
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch (e) { res.writeHead(400); return res.end("Bad request"); }

  /* ---- login ---- */
  if (pathname === "/login") {
    if (req.method === "GET") {
      if (isAuthed(req)) { res.writeHead(302, { Location: "/admin" }); return res.end(); }
      return sendHTML(res, 200, loginPage());
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", c => { raw += c; });
      req.on("end", () => {
        const { username, password } = parseFormBody(raw);
        const ok = username && password &&
          timingSafeEqual(username, ADMIN_USER) && timingSafeEqual(password, ADMIN_PASS);
        if (!ok) return sendHTML(res, 401, loginPage("Incorrect username or password."));
        const token = newSession();
        res.writeHead(302, {
          Location: "/admin",
          "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}; SameSite=Lax`
        });
        res.end();
      });
      return;
    }
  }

  if (pathname === "/logout" && req.method === "POST") {
    const cookies = parseCookies(req);
    if (cookies[SESSION_COOKIE]) sessions.delete(cookies[SESSION_COOKIE]);
    res.writeHead(302, {
      Location: "/login",
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
    });
    return res.end();
  }

  /* ---- admin page (protected) ---- */
  if (pathname === "/admin" || pathname === "/admin.html") {
    if (!isAuthed(req)) { res.writeHead(302, { Location: "/login" }); return res.end(); }
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
