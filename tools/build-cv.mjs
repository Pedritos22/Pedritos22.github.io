#!/usr/bin/env node
// Builds the calm, one-page version of the profile from js/content.js, the same data the
// interactive site renders, so the two never disagree:
//   cv/index.html, cv/pl/index.html   the CV pages (static HTML: crawlers, no-JS, print)
//   cv/pietro-molendys-cv.pdf, cv/pl/pietro-molendys-cv.pdf   with --pdf (Playwright)
//   sitemap.xml, llms.txt             for search engines and LLM crawlers
//
// Usage: node tools/build-cv.mjs [--pdf] [--check]
//   --pdf    also print the PDFs (needs Playwright; CHROME_PATH picks a local browser)
//   --check  write nothing; exit 1 if a generated text file is out of date (CI)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://pedritos22.github.io/";
const PDF_NAME = "pietro-molendys-cv.pdf";
const args = new Set(process.argv.slice(2));

const { PROFILE, FEATURED_PROJECTS, contentFor } = await import(pathToFileURL(join(ROOT, "js/content.js")).href);
const { STRINGS, formatPeriod, formatMonth } = await import(pathToFileURL(join(ROOT, "js/i18n.js")).href);

const L = {
  en: {
    htmlLang: "en",
    locale: "en_GB",
    path: "cv/",
    title: "Pietro Molendys · CV",
    description: "CV of Pietro Molendys: Junior Fullstack Developer (Java) at Smart4Aviation and Computer Science student at Cracow University of Technology. HackNation 2026 finalist, founder of the Tensor ML club.",
    kicker: "Curriculum vitae",
    interactive: "Interactive version",
    interactiveHref: "../",
    pdf: "Download PDF",
    print: "Print",
    other: "Polski",
    otherHref: "pl/",
    otherLang: "pl",
    profile: "Profile",
    experience: "Experience",
    lead: "Leadership and activities",
    certificates: "Certificates",
    also: "Also",
    activities: "Activities",
    highlights: "Highlights",
    projects: "Selected projects",
    code: "Code",
    skills: "Skills",
    exploring: "Exploring",
    education: "Education",
    focus: "Focus areas",
    languages: "Languages",
    contact: "Contact",
    generated: "Generated from the same data as the interactive site.",
    updated: "Updated"
  },
  pl: {
    htmlLang: "pl",
    locale: "pl_PL",
    path: "cv/pl/",
    title: "Pietro Molendys · CV",
    description: "CV Pietro Molendysa: Junior Fullstack Developer (Java) w Smart4Aviation i student informatyki na Politechnice Krakowskiej. Finalista HackNation 2026, założyciel koła ML Tensor.",
    kicker: "Curriculum vitae",
    interactive: "Wersja interaktywna",
    interactiveHref: "../../?lang=pl",
    pdf: "Pobierz PDF",
    print: "Drukuj",
    other: "English",
    otherHref: "../",
    otherLang: "en",
    profile: "Profil",
    experience: "Doświadczenie",
    lead: "Działalność i organizacje",
    certificates: "Certyfikaty",
    also: "Również",
    activities: "Aktywności",
    highlights: "Wyróżnienia",
    projects: "Wybrane projekty",
    code: "Kod",
    skills: "Umiejętności",
    exploring: "Eksploruję",
    education: "Wykształcenie",
    focus: "Obszary",
    languages: "Języki",
    contact: "Kontakt",
    generated: "Wygenerowane z tych samych danych co wersja interaktywna.",
    updated: "Aktualizacja"
  }
};

const esc = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Row value by its position in a section's details ([label, value, glyph]). */
const detail = (section, index) => section?.details?.[index]?.[1] ?? "";

/** A tile of the About status screen by key: { value, sub }. */
const stat = (about, key) => about.status.find((tile) => tile.key === key) ?? { value: "", sub: "" };
const located = (about) => `${stat(about, "base").value}, ${stat(about, "base").sub}`;

function page(lang, today) {
  const t = L[lang];
  const c = contentFor(lang);
  const about = c.sectionMap.about;
  const education = c.sectionMap.education;
  const skills = c.sectionMap.skills;
  const home = c.home;
  const role = about.headline;
  const exploring = stat(about, "exploring").value.replace(/ · /g, ", ");
  const languages = detail(home, 0);
  const prefix = lang === "pl" ? "../../" : "../";
  const date = new Intl.DateTimeFormat(lang === "pl" ? "pl-PL" : "en-GB", { year: "numeric", month: "long", day: "numeric" }).format(today);

  const list = (items) => (items?.length ? `<ul class="cv-points">${items.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : "");

  const highlights = c.highlights
    .map(
      (item) => `<li class="cv-highlight">
          <p class="cv-highlight__title">${esc(item.title)}</p>
          <p class="cv-meta">${esc(item.where)}</p>
          <p>${esc(item.desc)}</p>
          ${list(item.points)}
        </li>`
    )
    .join("");

  /** One quest (job or activity): every role with its period, the org, points or the note. */
  const questMarkup = (quest) => {
    const roles = quest.roles
      .map(
        (role) => `<p class="cv-role-line"><span class="cv-entry__title">${esc(role.title)}</span><span class="cv-period">${esc(formatPeriod(role.from, role.to, lang))}</span></p>`
      )
      .join("");
    // Points on screen; on paper the lead group shows the one-line note instead (css/cv.css).
    const body = quest.points?.length ? `${list(quest.points)}<p class="cv-note">${esc(quest.note)}</p>` : `<p>${esc(quest.note)}</p>`;
    const stack = quest.stack?.length ? `<ul class="cv-tags" aria-label="Stack">${quest.stack.map((tech) => `<li>${esc(tech)}</li>`).join("")}</ul>` : "";
    return `<li class="cv-entry">
          ${roles}
          <p class="cv-meta">${esc(quest.org)}${quest.place ? ` · ${esc(quest.place)}` : ""}</p>
          ${body}
          ${stack}
        </li>`;
  };
  const work = c.quests.filter((quest) => quest.group === "work").map(questMarkup).join("");
  const lead = c.quests.filter((quest) => quest.group === "lead").map(questMarkup).join("");
  const school = c.schooling;
  const certificates = school.certificates
    .map(
      (cert) => `<li class="cv-entry">
          <p class="cv-role-line"><span class="cv-entry__title">${esc(cert.name)}</span><span class="cv-period">${esc(formatMonth(cert.date, lang))}</span></p>
          <p class="cv-meta">${esc(cert.issuer)}</p>
          <ul class="cv-tags" aria-label="Skills">${cert.skills.map((skill) => `<li>${esc(skill)}</li>`).join("")}</ul>
        </li>`
    )
    .join("");

  const projects = FEATURED_PROJECTS.map((name) => [name, c.projectNotes[name]])
    .filter(([, note]) => note)
    .map(([name, note]) => {
      const points = note.points?.length ? `<ul class="cv-points">${note.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : "";
      const media = (note.media || []).map(([label, href]) => `<a href="${esc(href)}" rel="noopener">${esc(label)}</a>`).join("");
      return `<li class="cv-project">
          <header class="cv-project__head">
            <h3>${esc(note.title)}</h3>
            <p class="cv-project__links"><a href="https://github.com/Pedritos22/${esc(name)}" rel="noopener">${esc(t.code)}<span class="visually-hidden">: ${esc(note.title)}</span></a>${media}</p>
          </header>
          <p>${esc(note.summary)}</p>
          ${points}
          <ul class="cv-tags" aria-label="Stack">${note.stack.map((tech) => `<li>${esc(tech)}</li>`).join("")}</ul>
        </li>`;
    })
    .join("");

  const skillRows = skills.skills
    .map((skill) => `<li><span class="cv-skill__name">${esc(skill.name)}</span><span class="cv-skill__desc">${esc(skill.desc)}</span></li>`)
    .join("");

  const contact = [
    ["Email", `mailto:${PROFILE.email}`, PROFILE.email],
    ["GitHub", PROFILE.github, PROFILE.githubLabel],
    ["LinkedIn", PROFILE.linkedin, PROFILE.linkedinLabel],
    ["Web", SITE, "pedritos22.github.io"]
  ]
    .map(([label, href, text]) => `<li><span class="cv-label">${esc(label)}</span><a href="${esc(href)}"${href.startsWith("http") ? ' rel="noopener"' : ""}>${esc(text)}</a></li>`)
    .join("");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `${SITE}${t.path}`,
    inLanguage: lang,
    mainEntity: { "@id": `${SITE}#person`, "@type": "Person", name: PROFILE.name, url: SITE }
  };

  return `<!DOCTYPE html>
<!-- Generated by tools/build-cv.mjs from js/content.js. Do not edit by hand. -->
<html lang="${t.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(t.title)}</title>
  <meta name="description" content="${esc(t.description)}" />
  <meta name="theme-color" content="#020713" />
  <meta name="color-scheme" content="dark light" />
  <meta name="author" content="${esc(PROFILE.name)}" />
  <link rel="canonical" href="${SITE}${t.path}" />
  <link rel="alternate" hreflang="en" href="${SITE}cv/" />
  <link rel="alternate" hreflang="pl" href="${SITE}cv/pl/" />
  <link rel="alternate" hreflang="x-default" href="${SITE}cv/" />
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="${SITE}${t.path}" />
  <meta property="og:title" content="${esc(t.title)}" />
  <meta property="og:description" content="${esc(t.description)}" />
  <meta property="og:locale" content="${t.locale}" />
  <meta property="og:image" content="${SITE}assets/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml" />
  <link rel="icon" href="${prefix}assets/favicon-32.png" type="image/png" sizes="32x32" />
  <link rel="apple-touch-icon" href="${prefix}assets/apple-touch-icon.png" />
  <link rel="manifest" href="${prefix}manifest.webmanifest" />
  <link rel="preload" href="${prefix}assets/fonts/anton-400-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="${prefix}assets/fonts/inter-400-900-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="${prefix}css/fonts.css" />
  <link rel="stylesheet" href="${prefix}css/base.css" />
  <link rel="stylesheet" href="${prefix}css/cv.css" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="cv-page">
  <a class="skip-link" href="#cv-main">${lang === "pl" ? "Przejdź do treści" : "Skip to content"}</a>
  <header class="cv-bar">
    <a class="cv-bar__back" href="${t.interactiveHref}"><span aria-hidden="true">←</span> ${esc(t.interactive)}</a>
    <nav class="cv-bar__tools" aria-label="CV">
      <a class="cv-btn" href="${t.otherHref}" hreflang="${t.otherLang}" lang="${t.otherLang}">${esc(t.other)}</a>
      <a class="cv-btn" href="${PDF_NAME}" download>${esc(t.pdf)}</a>
      <button class="cv-btn cv-btn--primary" type="button" data-print hidden>${esc(t.print)}</button>
    </nav>
  </header>

  <main class="cv" id="cv-main">
    <header class="cv-hero">
      <p class="cv-kicker">${esc(t.kicker)}</p>
      <h1 class="cv-name"><span>${esc(PROFILE.first)}</span> <span>${esc(PROFILE.last)}</span></h1>
      <p class="cv-role">${esc(role)}</p>
      <ul class="cv-facts" role="list">
        <li>${esc(located(about))}</li>
        <li><a href="mailto:${esc(PROFILE.email)}">${esc(PROFILE.email)}</a></li>
        <li><a href="${esc(PROFILE.github)}" rel="noopener">${esc(PROFILE.githubLabel)}</a></li>
        <li><a href="${esc(PROFILE.linkedin)}" rel="noopener">LinkedIn</a></li>
      </ul>
    </header>

    <section class="cv-section" aria-labelledby="cv-profile">
      <h2 id="cv-profile">${esc(t.profile)}</h2>
      <div class="cv-section__body">
        <p class="cv-lead">${esc(about.copy)}</p>
        <p class="cv-extra"><span class="cv-label">${esc(t.exploring)}</span> ${esc(exploring)}</p>
      </div>
    </section>

    <section class="cv-section" aria-labelledby="cv-experience">
      <h2 id="cv-experience">${esc(t.experience)}</h2>
      <ul class="cv-section__body cv-list" role="list">${work}</ul>
    </section>

    <section class="cv-section" aria-labelledby="cv-highlights">
      <h2 id="cv-highlights">${esc(t.highlights)}</h2>
      <ul class="cv-section__body cv-list" role="list">${highlights}</ul>
    </section>

    <section class="cv-section" aria-labelledby="cv-projects">
      <h2 id="cv-projects">${esc(t.projects)}</h2>
      <ul class="cv-section__body cv-list cv-list--projects" role="list">${projects}</ul>
    </section>

    <section class="cv-section" aria-labelledby="cv-lead">
      <h2 id="cv-lead">${esc(t.lead)}</h2>
      <ul class="cv-section__body cv-list cv-list--lead" role="list">${lead}</ul>
    </section>

    <section class="cv-section" aria-labelledby="cv-skills">
      <h2 id="cv-skills">${esc(t.skills)}</h2>
      <div class="cv-section__body">
        <ul class="cv-skills" role="list">${skillRows}</ul>
        <p><span class="cv-label">${esc(t.also)}</span> ${skills.also.map(esc).join(" · ")}</p>
      </div>
    </section>

    <section class="cv-section" aria-labelledby="cv-education">
      <h2 id="cv-education">${esc(t.education)}</h2>
      <ul class="cv-section__body cv-list" role="list">
        <li class="cv-entry">
          <p class="cv-role-line"><span class="cv-entry__title">${esc(school.university.name)}</span><span class="cv-period">${esc(formatPeriod(school.university.from, school.university.to, lang))}</span></p>
          <p class="cv-meta">${esc(school.university.program)} · ${esc(located(about))}</p>
          <p class="cv-extra"><span class="cv-label">${esc(t.focus)}</span> ${education.focus.map(esc).join(" · ")}</p>
          <p><span class="cv-label">${esc(t.activities)}</span> ${esc(school.university.activities)}</p>
        </li>
        <li class="cv-entry">
          <p class="cv-role-line"><span class="cv-entry__title">${esc(school.school.name)}</span><span class="cv-period">${esc(school.school.years)}</span></p>
          <p class="cv-meta">${esc(school.school.program)}</p>
          <p><span class="cv-label">${esc(t.activities)}</span> ${esc(school.school.activities)}</p>
        </li>
      </ul>
    </section>

    <section class="cv-section" aria-labelledby="cv-certificates">
      <h2 id="cv-certificates">${esc(t.certificates)}</h2>
      <ul class="cv-section__body cv-list" role="list">${certificates}</ul>
    </section>

    <section class="cv-section" aria-labelledby="cv-languages">
      <h2 id="cv-languages">${esc(t.languages)}</h2>
      <div class="cv-section__body"><p>${esc(languages)}</p></div>
    </section>

    <section class="cv-section cv-section--contact" aria-labelledby="cv-contact">
      <h2 id="cv-contact">${esc(t.contact)}</h2>
      <ul class="cv-section__body cv-contact" role="list">${contact}</ul>
    </section>
  </main>

  <footer class="cv-foot">
    <p><span class="cv-extra">${esc(t.generated)} </span>${esc(t.updated)}: <time datetime="${today.toISOString().slice(0, 10)}">${esc(date)}</time>.</p>
    <p><q>${esc(STRINGS["footer.quote"][lang] ?? PROFILE.quote)}</q> ${esc(PROFILE.quoteAuthor)}</p>
  </footer>
  <script>
    // Print is a progressive extra: shown only where it works.
    (function () {
      var button = document.querySelector("[data-print]");
      if (!button || typeof window.print !== "function") return;
      button.hidden = false;
      button.addEventListener("click", function () { window.print(); });
    })();
  </script>
</body>
</html>
`;
}

function sitemap(today) {
  const day = today.toISOString().slice(0, 10);
  const alt = (en, pl) => `
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${en}"/>
    <xhtml:link rel="alternate" hreflang="pl" href="${SITE}${pl}"/>`;
  const url = (loc, en, pl, priority) => `  <url>
    <loc>${SITE}${loc}</loc>
    <lastmod>${day}</lastmod>${alt(en, pl)}
    <priority>${priority}</priority>
  </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by tools/build-cv.mjs. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${url("", "?lang=en", "?lang=pl", "1.0")}
${url("cv/", "cv/", "cv/pl/", "0.9")}
${url("cv/pl/", "cv/", "cv/pl/", "0.8")}
</urlset>
`;
}

function llms() {
  const c = contentFor("en");
  const about = c.sectionMap.about;
  const skills = c.sectionMap.skills.skills.map((s) => `${s.name} (${s.desc.replace(/\.$/, "")})`).join("; ");
  const projects = FEATURED_PROJECTS.map((name) => [name, c.projectNotes[name]])
    .filter(([, note]) => note)
    .map(([name, note]) => `- [${note.title}](https://github.com/Pedritos22/${name}): ${note.summary} Stack: ${note.stack.join(", ")}.`)
    .join("\n");
  return `# ${PROFILE.name}

> ${about.copy}

${about.headline} · ${located(about)}. ${c.highlights.map((h) => `${h.title}: ${h.where}.`).join(" ")}

## Experience

${c.quests.map((q) => `- ${q.roles.map((r) => `${r.title} (${formatPeriod(r.from, r.to, "en")})`).join("; ")}, ${q.org}: ${q.note}`).join("\n")}

## Pages

- [CV (English)](${SITE}cv/): the whole profile on one static page
- [CV (Polski)](${SITE}cv/pl/): the same in Polish
- [Interactive portfolio](${SITE}): the same content as a game-like pause menu (needs JavaScript)

## Projects

${projects}

## Skills

${skills}

## Contact

- Email: ${PROFILE.email}
- GitHub: ${PROFILE.github}
- LinkedIn: ${PROFILE.linkedin}
`;
}

async function writeIfChanged(path, text, stale) {
  const full = join(ROOT, path);
  let current = null;
  try {
    current = await readFile(full, "utf8");
  } catch {}
  // Ignore the build date when comparing, so --check does not fail every day.
  const strip = (s) => s?.replace(/\d{4}-\d{2}-\d{2}/g, "").replace(/(Updated|Aktualizacja): <time[^>]*>[^<]*<\/time>/g, "");
  if (strip(current) === strip(text)) return;
  if (args.has("--check")) {
    stale.push(path);
    return;
  }
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, text);
  console.log(`wrote ${path}`);
}

async function printPdfs() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.warn("Playwright is not installed: skipping the PDFs (npm i -D playwright).");
    return;
  }
  const http = await import("node:http");
  const { extname } = await import("node:path");
  const types = { ".html": "text/html", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".js": "text/javascript" };
  const server = http.createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    for (const lang of ["en", "pl"]) {
      const pageHandle = await browser.newPage();
      await pageHandle.goto(`http://127.0.0.1:${port}/${L[lang].path}`, { waitUntil: "networkidle" });
      await pageHandle.evaluate(() => document.fonts.ready);
      await pageHandle.pdf({
        path: join(ROOT, L[lang].path, PDF_NAME),
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
        tagged: true,
        outline: true
      });
      await pageHandle.close();
      console.log(`wrote ${L[lang].path}${PDF_NAME}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

const today = new Date();
const stale = [];
for (const lang of ["en", "pl"]) await writeIfChanged(`${L[lang].path}index.html`, page(lang, today), stale);
await writeIfChanged("sitemap.xml", sitemap(today), stale);
await writeIfChanged("llms.txt", llms(), stale);

if (args.has("--check")) {
  if (stale.length) {
    console.error(`Out of date (run node tools/build-cv.mjs): ${stale.join(", ")}`);
    process.exit(1);
  }
  console.log("CV, sitemap and llms.txt are up to date.");
} else if (args.has("--pdf")) {
  await printPdfs();
}
