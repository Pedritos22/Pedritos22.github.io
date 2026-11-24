#!/usr/bin/env node
// Local preview server: serves the repository as-is, like GitHub Pages, but with
// Cache-Control: no-store, so a reload always gets the files on disk (python's http.server
// sends no cache headers and browsers then keep modules by heuristics, mixing old and new).
// Usage: node tools/serve.mjs [port]   (default 8000)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep) && file !== ROOT) {
    res.writeHead(403).end();
    return;
  }
  try {
    let target = file;
    if ((await stat(target)).isDirectory()) {
      if (!path.endsWith("/")) {
        res.writeHead(301, { Location: `${path}/` }).end();
        return;
      }
      target = join(target, "index.html");
    }
    const body = await readFile(target);
    res.writeHead(200, { "Content-Type": TYPES[extname(target)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    // Like GitHub Pages: unknown paths get the 404 page.
    const page = await readFile(join(ROOT, "404.html")).catch(() => "Not found");
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(page);
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`Serving ${ROOT} at http://localhost:${PORT}/ (no cache)`));
