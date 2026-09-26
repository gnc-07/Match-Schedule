// A small web server for the tests, so they see the site the way visitors get it from GitHub Pages:
// text files (the page, fixtures.json, the calendar) are sent gzip-compressed, fonts as they are.
// Without compression Lighthouse would count every byte of index.html, which visitors never download.
// It also finds the Chromium browser to test with.
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PORT = Number(process.env.PORT || 8123);
export const BASE = `http://localhost:${PORT}/`;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8", ".ics": "text/calendar; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".woff2": "font/woff2",
};
const COMPRESS = /^(text\/|application\/json|image\/svg)/;   // what GitHub Pages compresses; fonts and pictures already are

export function chromePath() {
  const candidates = [process.env.CHROME_PATH, "/usr/bin/chromium-browser", "/usr/bin/chromium",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"].filter(Boolean);
  const found = candidates.find(p => existsSync(p));
  if (!found) throw new Error("No Chromium or Chrome found. Install one, or set CHROME_PATH.");
  return found;
}

// The file a request asks for, or null: only files inside the project, and never a hidden one (.git, .github).
function fileFor(url) {
  let rel;
  try { rel = decodeURIComponent(new URL(url, BASE).pathname); } catch { return null; }
  if (rel.endsWith("/")) rel += "index.html";
  if (rel.split("/").some(part => part.startsWith("."))) return null;
  const file = path.join(ROOT, rel);
  return file.startsWith(ROOT + path.sep) && existsSync(file) && statSync(file).isFile() ? file : null;
}

export function startServer() {
  if (!existsSync(path.join(ROOT, "fixtures.json"))) {
    throw new Error("fixtures.json is missing. Run: python3 build_schedule.py");
  }
  const server = http.createServer((req, res) => {
    const file = fileFor(req.url);
    if (!file) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found"); return; }
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    const gzip = COMPRESS.test(type) && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    const body = gzip ? zlib.gzipSync(readFileSync(file)) : readFileSync(file);
    res.writeHead(200, { "content-type": type, "content-length": body.length,
      ...(gzip ? { "content-encoding": "gzip", vary: "accept-encoding" } : {}) });
    res.end(req.method === "HEAD" ? undefined : body);
  });
  return new Promise((resolve, reject) => {
    server.once("error", e => reject(new Error(`The local web server did not start on port ${PORT} (${e.code}). Is something else using it?`)));
    server.listen(PORT, "127.0.0.1", () => resolve({ kill: () => { server.closeAllConnections(); server.close(); } }));
  });
}
