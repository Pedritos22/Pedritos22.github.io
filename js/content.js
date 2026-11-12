// All copy and section data: the single source of truth for what the site says.
// Owner: menu/panel workstream (B).
//
// Every fact here comes from the owner. Do not add dates, grades, ranks or achievements
// that are not listed. Plain strings are escaped when rendered; nothing here is HTML.
import { renderProjects } from "./projects.js";

export const PROFILE = {
  name: "Pietro Molendys",
  first: "Pietro",
  last: "Molendys",
  initials: "PM",
  location: "Cracow, Poland",
  field: "Computer Science",
  school: "Cracow University of Technology",
  email: "molendyspietro@gmail.com",
  github: "https://github.com/pedritos22",
  githubUser: "pedritos22",
  githubLabel: "github.com/pedritos22",
  linkedin: "https://linkedin.com/in/pietro-molendys-b1324231b",
  linkedinLabel: "linkedin.com/in/pietro-molendys-b1324231b",
  quote: "Nothing in life is to be feared. It is only to be understood.",
  quoteAuthor: "Maria Skłodowska-Curie",
  year: "2026"
};

/**
 * Public repository names to pin first in the Projects section (exact GitHub repo names).
 * The board reads the public API, so private repositories never appear; keep their names
 * out of this file too (it is public).
 */
export const FEATURED_PROJECTS = ["OpenGuitar", "City_Bus", "algo-animator", "Mindly", "LajkonikGO"];

/** Public repositories left off the board (the profile README repo, a one-off task). */
export const HIDDEN_PROJECTS = ["Pedritos22", "zadanieS4A"];

/*
 * Section shape (every key except id/title is optional):
 *   id       slug, also used for #section-<id> on mobile
 *   menu     menu label        code   two-digit menu number
 *   label    kicker text       stamp  big watermark word on the card
 *   title    card heading      copy   lead paragraph
 *   kind     card layout: "facts" | "profile" | "archive" | "arcana" | "custom" | "contact"
 *   details  [label, value, glyph?, cycle?] rows
 *   render   (container) => void, custom content hook (Projects)
 */

export const HOME = {
  id: "home",
  menu: "Home",
  code: "00",
  label: "Profile 00",
  stamp: "Welcome",
  title: "Press start.",
  copy:
    "This is my corner of the internet, built like a pause menu. Almost everything reacts: click it, drag it, hold it, even break it. The hints button up top lists the secrets.",
  kind: "facts",
  // [label, value, glyph, cycle?]: `cycle` is a decorative chip that rotates through words.
  details: [
    [
      "Languages",
      "Polish, English and Italian. Learning Chinese.",
      "speech",
      ["Cześć", "Hello", "Ciao", "Hola", "你好"]
    ],
    ["Board game", "Mahjong. Nothing else comes close.", "tile"],
    ["Fuel", "Estathé. Always Estathé.", "drink"]
  ],
  /** Quick-start tiles under the fun facts (desktop): [section id, caption]. */
  start: [
    ["about", "The short version"],
    ["skills", "Eight cards and a battle test"],
    ["projects", "Live from GitHub"],
    ["contact", "Email, GitHub, LinkedIn"]
  ]
};

/** Menu order. `code` is the small number shown next to each menu item. */
export const SECTIONS = [
  {
    id: "about",
    menu: "About",
    code: "01",
    label: "Profile 01",
    stamp: "About",
    title: "Hi, I'm Pietro.",
    copy:
      "I'm a creative person with a passion for software development, and I love finding new ways to express myself. I enjoy building things, learning new skills and meeting new people.",
    kind: "profile",
    details: [
      ["Name", "Pietro Molendys", "badge"],
      ["Location", "Cracow, Poland", "pin"],
      ["Favourite colour", "Blue / Navy", "swatch"]
    ]
  },
  {
    id: "education",
    menu: "Education",
    code: "02",
    label: "Archive 02",
    stamp: "Education",
    title: "Cracow University of Technology.",
    copy:
      "I study Computer Science with a focus on strong fundamentals: algorithms, data structures, systems thinking and disciplined software development practice.",
    kind: "archive",
    details: [
      ["School", "Cracow University of Technology", "institution"],
      ["Program", "Computer Science", "code"],
      ["Location", "Cracow, Poland", "pin"]
    ],
    // Focus areas, exactly as listed in the copy and the original "Focus" row.
    focus: ["Algorithms", "Data structures", "Systems thinking", "Software development", "Programming fundamentals"]
  },
  {
    id: "skills",
    menu: "Skills",
    code: "03",
    label: "Loadout 03",
    stamp: "Skills",
    title: "Pick a card.",
    copy:
      "My loadout. Flip a card to see what I've done with it, then put the whole deck to the test against real bugs.",
    kind: "arcana",
    // Card action: opens the Debug Battle (js/battle.js listens for [data-battle]).
    action: ["Run a battle test", "battle"],
    // name: card title and battle command (battle-logic.js matches bugs on it)
    // mark: technology mark (js/marks.js)   desc: back of the card (keep it under ~50
    // characters: the back is small)        spell: one line of code, typed out on the back
    // and cast in the Debug Battle (up to ~11 characters fit on one line of a small card)
    skills: [
      { name: "Java", mark: "java", desc: "OOP and data structures. Built a rhythm game in it.", spell: "@Override" },
      { name: "Python", mark: "python", desc: "FastAPI backends, automation and quick scripts.", spell: "import antigravity" },
      { name: "Dart / Flutter", mark: "flutter", desc: "Mobile apps: Mindly and LajkonikGO.", spell: "flutter run" },
      { name: "SQL", mark: "sql", desc: "PostgreSQL schemas, queries and migrations.", spell: "DROP TABLE bugs;" },
      { name: "Algorithms", mark: "algorithms", desc: "Complexity, problem solving and visualised sorts.", spell: "O(n log n)" },
      { name: "Git", mark: "git", desc: "Branches, rebases and a history that reads well.", spell: "git bisect" },
      { name: "Docker", mark: "docker", desc: "API, Postgres and Redis up in one command.", spell: "compose up" },
      { name: "Linux / Bash", mark: "bash", desc: "Processes, signals, IPC and shell scripts.", spell: "sudo !!" }
    ],
    // Card 0: dealt once every card above has been turned over (js/arcana.js).
    fool: { name: "The Fool", mark: "go", desc: "Next up: deeper into Java, and picking up Go.", spell: "go run ." }
  },
  {
    id: "projects",
    menu: "Projects",
    code: "04",
    label: "Requests 04",
    stamp: "Projects",
    title: "Things I've built.",
    copy: "A live feed of my public repositories on GitHub.",
    kind: "custom",
    render: (container) => renderProjects(container)
  },
  {
    id: "contact",
    menu: "Contact",
    code: "05",
    label: "Network 05",
    stamp: "Contact",
    title: "Let's connect.",
    copy:
      "The best way to reach me is by email. You can also find my projects on GitHub and my professional profile on LinkedIn.",
    kind: "contact",
    links: [
      { id: "email", label: "Email", value: PROFILE.email, href: `mailto:${PROFILE.email}`, glyph: "mail", copy: true },
      { id: "github", label: "GitHub", value: PROFILE.githubLabel, href: PROFILE.github, glyph: "branch", external: true },
      { id: "linkedin", label: "LinkedIn", value: PROFILE.linkedinLabel, href: PROFILE.linkedin, glyph: "network", external: true }
    ],
    actions: [
      ["Send an email", `mailto:${PROFILE.email}`, "primary"],
      ["GitHub", PROFILE.github, "secondary"],
      ["LinkedIn", PROFILE.linkedin, "secondary"]
    ]
  }
];

export const SECTION_MAP = Object.fromEntries([HOME, ...SECTIONS].map((section) => [section.id, section]));

/** Roman numerals for the arcana cards (I to XII is plenty; card 0 is the Fool's). */
export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
