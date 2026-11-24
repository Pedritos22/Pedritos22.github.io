#!/usr/bin/env node
// The modulepreload list in index.html: every module the first paint needs (js/main.js's
// MODULES and everything they import statically), so the browser fetches them all at once
// instead of discovering them level by level. The deferred group (DEFERRED in main.js) and
// dynamic import()s stay out.
//
// Usage: node tools/module-graph.mjs [--check]   (--check: exit 1 if index.html is stale)
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const START = "<!-- modulepreload:start (tools/module-graph.mjs) -->";
const END = "<!-- modulepreload:end -->";

/** Static import specifiers of a module (not dynamic import()). */
export function staticImports(source) {
  const found = [];
  const pattern = /^\s*import\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) found.push(match[1]);
  return found;
}

/** Names in `const NAME = [ "a", "b" ]` of main.js. */
function listFrom(source, name) {
  const block = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))?.[1] ?? "";
  return [...block.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
}

/** Every module path (relative to the root) the first paint loads, sorted. */
export async function firstPaintModules() {
  const main = await readFile(join(ROOT, "js/main.js"), "utf8");
  const queue = ["js/main.js", ...listFrom(main, "MODULES").map((name) => `js/${name}.js`)];
  const seen = new Set();
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const source = await readFile(join(ROOT, path), "utf8");
    for (const spec of staticImports(source)) {
      if (spec.startsWith(".")) queue.push(posix.normalize(posix.join(posix.dirname(path), spec)));
    }
  }
  seen.delete("js/main.js"); // loaded by its own <script type="module">
  return [...seen].sort();
}

export function preloadBlock(paths) {
  const links = paths.map((path) => `  <link rel="modulepreload" href="${path}" />`).join("\n");
  return `${START}\n${links}\n  ${END}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = await readFile(join(ROOT, "index.html"), "utf8");
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < 0) {
    console.error("index.html has no modulepreload markers.");
    process.exit(1);
  }
  const next = html.slice(0, start) + preloadBlock(await firstPaintModules()) + html.slice(end + END.length);
  if (next === html) {
    console.log("modulepreload list is up to date.");
  } else if (process.argv.includes("--check")) {
    console.error("modulepreload list in index.html is stale: run node tools/module-graph.mjs");
    process.exit(1);
  } else {
    await writeFile(join(ROOT, "index.html"), next);
    console.log("updated the modulepreload list in index.html.");
  }
}
