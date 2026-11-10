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

/** Repository names to pin first in the Projects section (exact GitHub repo names). */
export const FEATURED_PROJECTS = [];

/*
 * Section shape (every key except id/title is optional):
 *   id       slug, also used for #section-<id> on mobile
 *   menu     menu label        code   two-digit menu number
 *   label    kicker text       stamp  big watermark word on the card
 *   title    card heading      copy   lead paragraph
 *   kind     card layout: "facts" | "profile" | "archive" | "arcana" | "custom" | "contact"
 *   details  [label, value, glyph?] rows
 *   render   (container) => void, custom content hook (Projects)
 */

export const HOME = {
  id: "home",
  menu: "Home",
  code: "00",
  label: "Profile 00",
  stamp: "Welcome",
  title: "Welcome to my page!",
  copy: "Glad to have you here! Feel free to explore, fiddle around and get to know me better.",
  kind: "facts",
  details: [
    ["Fun fact 01", "I speak at least three languages fluently.", "speech"],
    ["Fun fact 02", "My favourite board game is Mahjong.", "tile"],
    ["Fun fact 03", "My favourite drink is Estathé.", "drink"]
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
    title: "Technical toolkit.",
    copy:
      "The skills below are the ones I'm most comfortable with, but I'm always learning new things and expanding my skill set. Check out my GitHub to see some of my projects.",
    kind: "arcana",
    skills: [
      ["Java", "Object-oriented programming, data structures and scalable systems"],
      ["Python", "Data analysis, automation and scripting"],
      ["Algorithms", "Problem solving, complexity analysis and CS fundamentals"],
      ["Docker", "Containerization, deployment and environment management"],
      ["Git", "Version control, collaboration and code management"],
      ["SQL", "Database design, querying and data manipulation"]
    ]
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

/** Roman numerals for the arcana cards (I to XII is plenty). */
export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
