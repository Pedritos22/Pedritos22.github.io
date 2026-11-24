#!/usr/bin/env node
// Writes data/projects.json: a snapshot of the public repositories for the Projects board
// (js/projects.js reads it first, so visitors never hit the GitHub API rate limit). Run
// daily by .github/workflows/projects.yml; GITHUB_TOKEN raises the API limit when set.
// Only the fields the board shows are kept. Forks, archived repos and HIDDEN_PROJECTS are
// dropped here as well as in the browser.
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data/projects.json");
const { PROFILE, HIDDEN_PROJECTS } = await import(pathToFileURL(join(ROOT, "js/content.js")).href);

const headers = { Accept: "application/vnd.github+json", "User-Agent": "portfolio-projects-snapshot" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const response = await fetch(`https://api.github.com/users/${PROFILE.githubUser}/repos?per_page=100&sort=pushed&type=owner`, { headers });
if (!response.ok) {
  console.error(`GitHub API answered ${response.status}; keeping the previous snapshot.`);
  process.exit(1);
}
const list = await response.json();
const hidden = new Set(HIDDEN_PROJECTS.map((name) => name.toLowerCase()));

const repos = list
  .filter((repo) => !repo.fork && !repo.archived && !repo.private && !/\.github\.io$/i.test(repo.name))
  .filter((repo) => !hidden.has(repo.name.toLowerCase()))
  .map((repo) => ({
    name: repo.name,
    description: repo.description ?? "",
    language: repo.language ?? "",
    stars: repo.stargazers_count ?? 0,
    pushedAt: repo.pushed_at,
    url: repo.html_url,
    homepage: repo.homepage ?? "",
    topics: repo.topics ?? []
  }));

// The snapshot only changes when a repository does: the timestamp is left alone otherwise,
// so the workflow commits nothing on quiet days.
let previous = null;
try {
  previous = JSON.parse(await readFile(OUT, "utf8"));
} catch {}
if (previous && JSON.stringify(previous.repos) === JSON.stringify(repos)) {
  console.log(`data/projects.json is current (${repos.length} repositories).`);
  process.exit(0);
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), user: PROFILE.githubUser, repos }, null, 2)}\n`);
console.log(`wrote data/projects.json (${repos.length} repositories).`);
