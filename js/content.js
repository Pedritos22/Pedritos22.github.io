// All copy and section data: the single source of truth for what the site says.
// Owner: menu/panel workstream (B). Values in `details` may contain trusted HTML (links).
import { renderProjects } from "./projects.js";

export const PROFILE = {
  name: "Pietro Molendys",
  first: "Pietro",
  last: "Molendys",
  location: "Cracow, Poland",
  field: "Computer Science",
  email: "molendyspietro@gmail.com",
  github: "https://github.com/pedritos22",
  githubUser: "pedritos22",
  linkedin: "https://linkedin.com/in/pietro-molendys-b1324231b",
  quote: "“Nothing in life is to be feared. It is only to be understood.” – Maria Skłodowska-Curie"
};

/** Repository names to pin first in the Projects section (exact GitHub repo names). */
export const FEATURED_PROJECTS = [];

export const HOME = {
  id: "home",
  label: "Profile 00",
  stamp: "Welcome",
  title: "Welcome to my page!",
  copy: "Glad to have you here. Feel free to explore it, fiddle around, and get to know me better!",
  details: [
    ["Fun-fact 1", "I can talk fluently in at least 3 languages."],
    ["Fun-fact 2", "My favourite board game is Mahjong."],
    ["Fun-fact 3", "My favourite beverage is Estathé."]
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
    title: "Hi, I am Pietro.",
    copy: "I am a creative individual with a passion for software development and I love to find ways to express myself. I enjoy building new things, learning new skills, as well as meeting new people.",
    details: [
      ["Name", "Pietro Molendys"],
      ["Location", "Cracow, Poland"],
      ["Favorite color", "Blue / Navy"]
    ]
  },
  {
    id: "education",
    menu: "Education",
    code: "02",
    label: "Archive 02",
    stamp: "Education",
    title: "Cracow University of Technology.",
    copy: "I study Computer Science with attention on strong fundamentals: algorithms, data structures, systems thinking, and disciplined software development practice.",
    details: [
      ["School", "Cracow University of Technology"],
      ["Program", "Computer Science"],
      ["Focus", "Algorithms, software development, programming fundamentals"]
    ]
  },
  {
    id: "skills",
    menu: "Skills",
    code: "03",
    label: "Loadout 03",
    stamp: "Skills",
    title: "Technical toolkit.",
    copy: "I encourage you to check my GitHub to see some of my projects. The skills listed below are the ones I am most comfortable with, but I am always learning new things and expanding my skillset.",
    skills: [
      ["Java", "Object-oriented programming, data structures, scalable systems"],
      ["Python", "Data analysis, automation, scripting"],
      ["Algorithms", "Problem solving, complexity thinking, and CS fundamentals."],
      ["Docker", "Containerization, deployment, and environment management"],
      ["Git", "Version control, collaboration, and code management"],
      ["SQL", "Database design, querying, and data manipulation"]
    ]
  },
  {
    id: "projects",
    menu: "Projects",
    code: "04",
    label: "Requests 04",
    stamp: "Projects",
    title: "Things I have built.",
    copy: "A live feed of my public repositories on GitHub, freshest first.",
    render: (container) => renderProjects(container)
  },
  {
    id: "contact",
    menu: "Contact",
    code: "05",
    label: "Network 05",
    stamp: "Contact",
    title: "Let's connect.",
    copy: "The best way to reach me is email. You can also find my projects on GitHub and professional profile on LinkedIn.",
    details: [
      ["Email", `<a href="mailto:${PROFILE.email}">${PROFILE.email}</a>`],
      ["LinkedIn", `<a href="${PROFILE.linkedin}">linkedin.com/in/pietro-molendys-b1324231b</a>`],
      ["GitHub", `<a href="${PROFILE.github}">github.com/pedritos22</a>`]
    ],
    actions: [
      ["Email", `mailto:${PROFILE.email}`, ""],
      ["GitHub", PROFILE.github, "secondary"],
      ["LinkedIn", PROFILE.linkedin, "secondary"]
    ]
  }
];

export const SECTION_MAP = Object.fromEntries([HOME, ...SECTIONS].map((section) => [section.id, section]));
