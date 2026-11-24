// All copy and section data: the single source of truth for what the site says, in English
// and Polish. Owner: menu/panel workstream (B).
//
// Every fact here comes from the owner: what they told us, their LinkedIn profile (pasted by
// them, November 2026), their GitHub profile and the READMEs of their own repositories
// (project notes). Do not add dates, grades, ranks, employers or achievements that are not
// listed. Plain strings are escaped when rendered; nothing here is HTML.
//
// Translatable strings are written inline as { en, pl } and resolved for the current
// language (js/i18n.js). The exported HOME / SECTIONS / SECTION_MAP / DEPTHS / PROJECT_NOTES
// are live bindings: they are re-resolved before any module re-renders on a language
// change. Ids, skill names (battle commands), marks and spells never change with the
// language. No DOM at the top level: tools/build-cv.mjs imports this file in node.
import { localize, onLang, getLang } from "./i18n.js";

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
  site: "https://pedritos22.github.io/",
  quote: "Nothing in life is to be feared. It is only to be understood.",
  quoteAuthor: "Maria Skłodowska-Curie",
  year: "2026"
};

/**
 * Public repository names to pin first in the Projects section (exact GitHub repo names).
 * The board reads the public API, so private repositories never appear; keep their names
 * out of this file too (it is public).
 */
export const FEATURED_PROJECTS = ["OpenGuitar", "LajkonikGO", "Mindly", "City_Bus", "algo-animator"];

/** Public repositories left off the board (the profile README repo, a one-off task). */
export const HIDDEN_PROJECTS = ["Pedritos22", "zadanieS4A"];

/*
 * Project notes: what each featured repository is, from its own README and code. They
 * replace the GitHub description on the board and fill the "Selected projects" of the CV.
 *   summary  one or two sentences          stack  technologies, as named in the repo
 *   points   CV bullet points (optional)    media  [label, url] extra links (optional)
 */
const PROJECT_NOTES_SRC = {
  OpenGuitar: {
    title: "OpenGuitar",
    summary: {
      en: "A Guitar Hero-style rhythm game for the desktop. Drop in any song and it builds the beatmap from the audio.",
      pl: "Gra rytmiczna w stylu Guitar Hero. Wrzucasz dowolny utwór, a gra sama buduje z niego beatmapę."
    },
    stack: ["Java 21", "JavaFX", "Maven", "TarsosDSP", "SQLite", "JUnit"],
    points: {
      en: [
        "Beatmaps generated from audio with onset detection (TarsosDSP), saved as JSON for instant replay",
        "Audio-synchronised hit detection, combo and S–E ranks, with game logic kept apart from the view layer",
        "Per-song statistics in SQLite; 108 automated tests"
      ],
      pl: [
        "Beatmapy generowane z dźwięku przez detekcję onsetów (TarsosDSP), zapisywane jako JSON",
        "Wykrywanie trafień zsynchronizowane z audio, combo i rangi S–E, logika gry oddzielona od widoku",
        "Statystyki utworów w SQLite; 108 testów automatycznych"
      ]
    }
  },
  LajkonikGO: {
    title: "LajkonikGO",
    summary: {
      en: "A mobile app for exploring Kraków: collect points on the map, plan multimodal routes, earn rewards.",
      pl: "Aplikacja do odkrywania Krakowa: punkty do zebrania na mapie, trasy multimodalne i nagrody."
    },
    stack: ["Flutter", "Dart", "FastAPI", "PostgreSQL / PostGIS", "Redis", "Alembic", "Docker Compose"],
    points: {
      en: [
        "Flutter client with a city map, point collection and route planning",
        "FastAPI backend with PostGIS, Redis and Alembic migrations, routing on GTFS-realtime transit data",
        "The whole stack starts with one Docker Compose command"
      ],
      pl: [
        "Klient we Flutterze: mapa miasta, zbieranie punktów i planowanie tras",
        "Backend w FastAPI z PostGIS, Redisem i migracjami Alembic, routing na danych GTFS-realtime",
        "Cały stack startuje jedną komendą Docker Compose"
      ]
    }
  },
  Mindly: {
    title: "Mindly",
    summary: {
      en: "An app about emotions: mood tracking, daily tasks and quotes, with AI-generated suggestions.",
      pl: "Aplikacja o emocjach: nastrój, codzienne zadania i cytaty, z podpowiedziami od modelu AI."
    },
    stack: ["Flutter", "Dart", "BLoC", "Firebase", "Hugging Face API"],
    points: {
      en: [
        "Flutter app with BLoC state management and Firebase Auth, Firestore and Cloud Messaging",
        "Task suggestions generated through the Hugging Face API, mood charts with fl_chart"
      ],
      pl: [
        "Aplikacja we Flutterze z BLoC oraz Firebase Auth, Firestore i Cloud Messaging",
        "Zadania generowane przez API Hugging Face, wykresy nastroju w fl_chart"
      ]
    }
  },
  City_Bus: {
    title: "City Bus",
    summary: {
      en: "Operating Systems coursework: a multi-process simulation of a suburban bus station, written in C.",
      pl: "Projekt z Systemów Operacyjnych: wieloprocesowa symulacja podmiejskiego dworca w C."
    },
    stack: ["C", "POSIX IPC", "Signals", "CMake"],
    points: {
      en: [
        "Separate processes for the dispatcher, ticket office, drivers and passengers, synchronised with IPC",
        "Capacity rules, VIP passengers, children with guardians and dispatcher signals; a written simulation report"
      ],
      pl: [
        "Osobne procesy dyspozytora, kasy, kierowców i pasażerów, synchronizowane przez IPC",
        "Limity miejsc, pasażerowie VIP, dzieci pod opieką i sygnały dyspozytora; raport z symulacji"
      ]
    }
  },
  "algo-animator": {
    title: "algo-animator",
    summary: {
      en: "An interactive visualiser of sorting algorithms in C and OpenGL, with a video about it on YouTube.",
      pl: "Interaktywna wizualizacja algorytmów sortowania w C i OpenGL, z filmem na YouTube."
    },
    stack: ["C", "OpenGL", "GLUT", "FreeType", "CMake"],
    media: [["YouTube", "https://youtu.be/KvOI88s-FsU"]]
  }
};

/*
 * Highlights: recent achievements, shown on the Welcome card (label, title, meta) and in the
 * CV (title, where, desc, points).
 */
const HIGHLIGHTS_SRC = [
  {
    id: "hacknation-2026",
    label: { en: "Latest", pl: "Najnowsze" },
    title: { en: "Finalist, HackNation 2026", pl: "Finalista HackNation 2026" },
    meta: { en: "odwolania2json · F1 0.998", pl: "odwolania2json · F1 0,998" },
    where: {
      en: "Public Procurement Office (UZP) challenge “odwolania2json” · Bydgoszcz, November 2026",
      pl: "Wyzwanie Urzędu Zamówień Publicznych (UZP) „odwolania2json” · Bydgoszcz, listopad 2026"
    },
    desc: {
      en: "Turning documents about appeals to the National Appeal Chamber (KIO) into structured data the public administration can use, with small Polish language models.",
      pl: "Zamiana dokumentów odwołań do Krajowej Izby Odwoławczej (KIO) w ustrukturyzowane dane dla administracji, przy użyciu małych polskich modeli językowych."
    },
    points: {
      en: [
        "Pipeline: Tesseract OCR (just 19 MB with Polish language data), the Basal 2.0 (1.5B) decision model, Bielik 3.0 (4.5B) and regular expressions",
        "F1 of 0.9981 on the test set: one of the highest scores and one of the fastest processing times of all teams",
        "Led the implementation and performance tuning of Bielik 3.0; helped implement Basal 2.0, which reached 100% accuracy in data extraction and document detection on the organisers' benchmark (1st of all teams) and about 95% on the blind benchmark",
        "Served the models as APIs for the pipeline, wrote the regex rules and added on-device OCR"
      ],
      pl: [
        "Pipeline: Tesseract OCR (tylko 19 MB z danymi dla polskiego), model decyzyjny Basal 2.0 (1,5B), Bielik 3.0 (4,5B) i wyrażenia regularne",
        "F1 0,9981 na zbiorze testowym: jeden z najwyższych wyników i jeden z najkrótszych czasów przetwarzania wśród wszystkich zespołów",
        "Prowadziłem implementację i optymalizację wydajności Bielika 3.0; pomagałem przy Basal 2.0, który osiągnął 100% trafności ekstrakcji danych i wykrywania dokumentów na benchmarku organizatorów (1. miejsce wśród wszystkich zespołów) i około 95% na ślepym benchmarku",
        "Wystawiłem modele jako API dla pipeline'u, napisałem reguły regex i dodałem OCR na urządzeniu"
      ]
    }
  }
];

/*
 * Quest log: work, the hackathon and what the owner runs at the university, shown on the
 * Experience card as a chronograph (js/chrono.js; `short` labels the bar) plus a list on
 * mobile, and in the CV (group: work | lead; the highlight group appears there as a
 * Highlight instead). `roles` are newest first; a role's
 * `to: null` means it is current. Months are "YYYY-MM" (formatPeriod() in i18n.js).
 */
const UNIVERSITY = { en: "Cracow University of Technology", pl: "Politechnika Krakowska" };
const QUESTS_SRC = [
  {
    id: "smart4aviation",
    group: "work",
    type: { en: "Work", pl: "Praca" },
    org: "Smart4Aviation",
    place: { en: "Kraków", pl: "Kraków" },
    roles: [
      { title: { en: "Junior Fullstack Developer (Java)", pl: "Junior Fullstack Developer (Java)" }, from: "2026-10", to: null },
      {
        title: { en: "Fullstack Developer Intern (Java)", pl: "Stażysta, Fullstack Developer (Java)" },
        from: "2026-07",
        to: "2026-10",
        note: { en: "Started at Smart4Aviation as a fullstack intern: Java, Spring and Hibernate.", pl: "Start w Smart4Aviation jako stażysta fullstack: Java, Spring i Hibernate." }
      }
    ],
    note: { en: "Fullstack development in Java with Spring and Hibernate.", pl: "Fullstack w Javie ze Springiem i Hibernate." },
    stack: ["Java", "Spring Framework", "Hibernate", "SQL", "Git"]
  },
  {
    id: "hacknation-2026",
    group: "highlight",
    type: { en: "Hackathon", pl: "Hackathon" },
    org: "HackNation 2026",
    place: { en: "Bydgoszcz", pl: "Bydgoszcz" },
    roles: [{ title: { en: "Finalist, UZP challenge “odwolania2json”", pl: "Finalista, wyzwanie UZP „odwolania2json”" }, from: "2026-11", to: "2026-11" }],
    note: {
      en: "OCR and small Polish language models turn appeal documents into JSON. F1 0.998, with the team from Tensor.",
      pl: "OCR i małe polskie modele językowe zamieniają odwołania w JSON. F1 0,998, z zespołem z Tensora."
    },
    stack: ["Tesseract OCR", "Bielik 3.0", "Basal 2.0", "Regex"]
  },
  {
    id: "kosciuszkon",
    group: "lead",
    type: { en: "Event", pl: "Wydarzenie" },
    org: "Kościuszkon",
    place: UNIVERSITY,
    roles: [
      { title: { en: "Technical organiser, Capture The Flag", pl: "Organizator techniczny, Capture The Flag" }, from: "2026-05", to: "2026-05" },
      {
        title: { en: "Organising team", pl: "Zespół organizacyjny" },
        from: "2025-05",
        to: "2025-05",
        note: { en: "Coordinated products, organised mentors and supported the participants.", pl: "Koordynowałem produkty, organizowałem mentorów i wspierałem uczestników." }
      }
    ],
    note: {
      en: "Created and hosted an original CTF next to the hackathon: the challenges, the infrastructure, live uptime.",
      pl: "Stworzyłem i poprowadziłem autorski CTF obok hackathonu: zadania, infrastruktura, monitoring na żywo."
    },
    points: {
      en: [
        "2026: designed and deployed a series of cybersecurity challenges for an original Capture The Flag competition",
        "Managed the deployment infrastructure, monitored uptime in real time, gave live technical support and ran the scoreboard",
        "2025: coordinated products, organised mentors and supported participants and team communication"
      ],
      pl: [
        "2026: zaprojektowałem i wdrożyłem serię zadań z cyberbezpieczeństwa do autorskiego konkursu Capture The Flag",
        "Zarządzałem infrastrukturą, monitorowałem dostępność na żywo, prowadziłem wsparcie techniczne i tablicę wyników",
        "2025: koordynowałem produkty, organizowałem mentorów i wspierałem uczestników oraz komunikację zespołów"
      ]
    }
  },
  {
    id: "student-council",
    group: "lead",
    type: { en: "Council", pl: "Samorząd" },
    org: { en: "Faculty Student Council, WIiT", pl: "Wydziałowa Rada Samorządu Studentów WIiT" },
    short: { en: "Student Council", pl: "Samorząd WIiT" },
    place: UNIVERSITY,
    roles: [
      { title: { en: "Member, Digitalization Committee", pl: "Członek Komisji ds. Cyfryzacji" }, from: "2025-10", to: null },
      {
        title: { en: "Member", pl: "Członek" },
        from: "2024-11",
        to: null,
        note: { en: "Organising and supporting the faculty's and the university's initiatives.", pl: "Organizacja i wsparcie inicjatyw wydziału i uczelni." }
      }
    ],
    note: {
      en: "University websites, apps for events and IT-focused events.",
      pl: "Strony uczelni, aplikacje na wydarzenia i wydarzenia IT."
    },
    points: {
      en: ["Manage university websites and help build applications for events", "Help organise IT-focused events at the faculty"],
      pl: ["Zarządzam stronami uczelni i pomagam tworzyć aplikacje na wydarzenia", "Pomagam organizować wydarzenia IT na wydziale"]
    }
  },
  {
    id: "tensor",
    group: "lead",
    type: { en: "Club", pl: "Koło naukowe" },
    org: { en: "Tensor, machine learning club", pl: "Tensor, koło naukowe ML" },
    short: { en: "Tensor", pl: "Tensor" },
    place: UNIVERSITY,
    roles: [{ title: { en: "Founder", pl: "Założyciel" }, from: "2025-05", to: null }],
    note: {
      en: "Machine learning from the ground up: neural networks built from scratch, with experienced supervisors.",
      pl: "Uczenie maszynowe od podstaw: sieci neuronowe pisane od zera, pod okiem doświadczonych opiekunów."
    },
    points: {
      en: ["Founded the club; we build neural networks from scratch to learn the foundations", "Several larger projects in preparation; the HackNation 2026 team came from Tensor"],
      pl: ["Założyłem koło; piszemy sieci neuronowe od zera, żeby poznać podstawy", "Kilka większych projektów w przygotowaniu; zespół z HackNation 2026 wyszedł z Tensora"]
    }
  },
  {
    id: "genpact",
    group: "work",
    type: { en: "Work", pl: "Praca" },
    org: "Genpact",
    place: { en: "Kraków", pl: "Kraków" },
    roles: [{ title: { en: "Content Moderation (full-time)", pl: "Moderacja treści (pełny etat)" }, from: "2024-08", to: "2024-10" }],
    note: {
      en: "Moderated content to internal rules and standards, and helped improve the platform.",
      pl: "Moderacja treści według wewnętrznych zasad i standardów oraz udział w ulepszaniu platformy."
    }
  },
  {
    id: "mat",
    group: "work",
    type: { en: "Teaching", pl: "Nauczanie" },
    org: "MAT – Myślenicka Akademia Talentów",
    short: { en: "MAT", pl: "MAT" },
    place: { en: "Myślenice", pl: "Myślenice" },
    roles: [{ title: { en: "Programming teacher, grades 6–\u20608 (freelance)", pl: "Nauczyciel programowania, klasy 6–\u20608 (zlecenie)" }, from: "2023-10", to: "2024-03" }],
    note: {
      en: "Python basics, algorithms like quicksort and Fibonacci, and first games in Pygame.",
      pl: "Podstawy Pythona, algorytmy jak quicksort i Fibonacci, pierwsze gry w Pygame."
    },
    points: {
      en: ["Introduced students to Python, logic and algorithms (quicksort, bubble sort, Fibonacci)", "Students built their own small games with Pygame"],
      pl: ["Wprowadzałem uczniów w Pythona, logikę i algorytmy (quicksort, sortowanie bąbelkowe, Fibonacci)", "Uczniowie budowali własne małe gry w Pygame"]
    }
  }
];

/** Education beyond the university card: school, certificate (CV and Education card). */
const SCHOOLING_SRC = {
  university: {
    name: { en: "Cracow University of Technology", pl: "Politechnika Krakowska" },
    program: { en: "Computer Science", pl: "Informatyka" },
    from: "2024-10",
    to: null,
    activities: {
      en: "Faculty Student Council (WRSS WIiT), founder of Tensor",
      pl: "Wydziałowa Rada Samorządu Studentów (WRSS WIiT), założyciel Tensora"
    }
  },
  school: {
    name: { en: "II LO im. Tytusa Chałubińskiego, Myślenice", pl: "II LO im. Tytusa Chałubińskiego w Myślenicach" },
    program: { en: "Mathematics and IT", pl: "Profil matematyczno-informatyczny" },
    years: "2020–2024",
    activities: { en: "Student Council", pl: "Samorząd Uczniowski" }
  },
  certificates: [
    {
      name: { en: "Erasmus+ Blended Intensive Programme: Mobile Programming and Technologies", pl: "Erasmus+ Blended Intensive Programme: Mobile Programming and Technologies" },
      issuer: "Université Marie et Louis Pasteur",
      date: "2026-01",
      skills: ["Flutter", "iOS", "Android", "Firebase"]
    }
  ]
};

/*
 * Section shape (every key except id/title is optional):
 *   id       slug, also the URL hash (#about) and #section-<id> on mobile
 *   menu     menu label        code   two-digit menu number
 *   label    kicker text       stamp  big watermark word on the card
 *   title    card heading      copy   lead paragraph
 *   kind     card layout: "facts" | "profile" | "archive" | "arcana" | "custom" | "contact"
 *   details  [label, value, glyph?, cycle?] rows
 *   render   (container) => void, custom content hook (Projects)
 */

const HOME_SRC = {
  id: "home",
  menu: { en: "Home", pl: "Start" },
  code: "00",
  label: { en: "Profile 00", pl: "Profil 00" },
  stamp: { en: "Welcome", pl: "Witaj" },
  title: { en: "Press start.", pl: "Naciśnij start." },
  copy: {
    en: "I'm Pietro: a Computer Science student and a junior fullstack developer (Java) at Smart4Aviation in Kraków. This page works like a pause menu and almost everything reacts. In a hurry? Hit CV up top.",
    pl: "Jestem Pietro: student informatyki i junior fullstack developer (Java) w Smart4Aviation w Krakowie. Ta strona działa jak menu pauzy i prawie wszystko na coś reaguje. Spieszysz się? Kliknij CV na górze."
  },
  kind: "facts",
  // [label, value, glyph, cycle?]: `cycle` is a decorative chip that rotates through words.
  details: [
    [
      { en: "Languages", pl: "Języki" },
      { en: "Polish, English and Italian. Learning Chinese.", pl: "Polski, angielski i włoski. Uczę się chińskiego." },
      "speech",
      ["Cześć", "Hello", "Ciao", "Hola", "你好"]
    ],
    [{ en: "Board game", pl: "Gra planszowa" }, { en: "Mahjong. Nothing else comes close.", pl: "Mahjong. Nic się nie zbliża." }, "tile"],
    [{ en: "Fuel", pl: "Paliwo" }, { en: "Estathé. Always Estathé.", pl: "Estathé. Zawsze Estathé." }, "drink"]
  ],
};

/** Menu order. `code` is the small number shown next to each menu item. */
const SECTIONS_SRC = [
  {
    id: "about",
    menu: { en: "About", pl: "O mnie" },
    code: "01",
    label: { en: "Profile 01", pl: "Profil 01" },
    stamp: { en: "About", pl: "O mnie" },
    title: { en: "Hi, I'm Pietro.", pl: "Cześć, jestem Pietro." },
    copy: {
      en: "I study Computer Science at Cracow University of Technology and build fullstack Java at Smart4Aviation. I care about understanding how things work: not just making them run, but knowing why they do.",
      pl: "Studiuję informatykę na Politechnice Krakowskiej i tworzę fullstack w Javie w Smart4Aviation. Zależy mi na rozumieniu, jak rzeczy działają: nie tylko żeby działały, ale dlaczego działają."
    },
    kind: "profile",
    // One line for the CV header and llms.txt.
    headline: { en: "Junior Fullstack Developer (Java), Smart4Aviation", pl: "Junior Fullstack Developer (Java), Smart4Aviation" },
    // The status screen: a crest and six tiles (label, value, small line, glyph). Facts only.
    status: [
      { key: "role", label: { en: "Role", pl: "Rola" }, value: "Junior Fullstack Developer", sub: { en: "Java · Smart4Aviation", pl: "Java · Smart4Aviation" }, glyph: "code" },
      { key: "base", label: { en: "Based in", pl: "Mieszkam" }, value: { en: "Kraków", pl: "Kraków" }, sub: { en: "Poland", pl: "Polska" }, glyph: "pin" },
      { key: "studies", label: { en: "Studies", pl: "Studiuję" }, value: { en: "Computer Science", pl: "Informatyka" }, sub: { en: "Cracow University of Technology", pl: "Politechnika Krakowska" }, glyph: "institution" },
      { key: "founded", label: { en: "Founded", pl: "Założyłem" }, value: "Tensor", sub: { en: "Machine learning club", pl: "Koło naukowe ML" }, glyph: "network" },
      { key: "speaks", label: { en: "Speaks", pl: "Mówię" }, value: "PL · EN · IT", sub: { en: "Learning Chinese", pl: "Uczę się chińskiego" }, glyph: "speech" },
      { key: "exploring", label: { en: "Exploring", pl: "Eksploruję" }, value: { en: "Audio · Web3 · ML", pl: "Audio · Web3 · ML" }, sub: { en: "Next up: Go", pl: "Następny: Go" }, glyph: "focus" }
    ]
  },
  {
    id: "experience",
    menu: { en: "Experience", pl: "Doświadczenie" },
    code: "02",
    label: { en: "Quest log 02", pl: "Dziennik 02" },
    stamp: { en: "Experience", pl: "Kariera" },
    title: { en: "Quest log.", pl: "Dziennik zadań." },
    copy: {
      en: "Where I work, where I compete and what I run at the university.",
      pl: "Gdzie pracuję, gdzie startuję i co prowadzę na uczelni."
    },
    kind: "quests"
  },
  {
    id: "projects",
    menu: { en: "Projects", pl: "Projekty" },
    code: "03",
    label: { en: "Requests 03", pl: "Zlecenia 03" },
    stamp: { en: "Projects", pl: "Projekty" },
    title: { en: "Things I've built.", pl: "Co zbudowałem." },
    copy: {
      en: "Featured work first, then a live feed of my public repositories on GitHub.",
      pl: "Najpierw wyróżnione projekty, potem bieżący feed moich publicznych repozytoriów na GitHubie."
    },
    kind: "custom",
    // Loaded on first use: the board (and its styles of data) stays off the critical path.
    render: (container) => import("./projects.js").then((module) => module.renderProjects(container))
  },
  {
    id: "skills",
    menu: { en: "Skills", pl: "Umiejętności" },
    code: "04",
    label: { en: "Loadout 04", pl: "Ekwipunek 04" },
    stamp: { en: "Skills", pl: "Talia" },
    title: { en: "Pick a card.", pl: "Wybierz kartę." },
    copy: {
      en: "My loadout. Flip a card to see what I've done with it, then put the whole deck to the test against real bugs.",
      pl: "Mój ekwipunek. Odwróć kartę, żeby zobaczyć, co z nią zrobiłem, a potem sprawdź całą talię w walce z prawdziwymi bugami."
    },
    kind: "arcana",
    // Card action: opens the Debug Battle (js/battle.js listens for [data-battle]).
    action: [{ en: "Run a battle test", pl: "Uruchom test bojowy" }, "battle"],
    // name: card title and battle command (battle-logic.js matches bugs on it, so it is never
    // translated)   mark: technology mark (js/marks.js)   desc: back of the card (keep it
    // under ~50 characters: the back is small)   spell: one line of code, typed out on the
    // back and cast in the Debug Battle (up to ~11 characters fit on one line of a small card)
    skills: [
      { name: "Java", mark: "java", desc: { en: "Spring and Hibernate at work. A rhythm game at home.", pl: "Spring i Hibernate w pracy, gra rytmiczna w domu." }, spell: "@Override" },
      { name: "Python", mark: "python", desc: { en: "FastAPI backends, scripts; taught it to grades 6–\u20608.", pl: "FastAPI, skrypty; uczyłem go klasy 6–\u20608." }, spell: "import antigravity" },
      { name: "Dart / Flutter", mark: "flutter", desc: { en: "Mindly, LajkonikGO and an Erasmus+ mobile course.", pl: "Mindly, LajkonikGO i kurs mobilny Erasmus+." }, spell: "flutter run" },
      { name: "SQL", mark: "sql", desc: { en: "PostgreSQL, migrations, and Hibernate at work.", pl: "PostgreSQL, migracje i Hibernate w pracy." }, spell: "DROP TABLE bugs;" },
      { name: "Algorithms", mark: "algorithms", desc: { en: "Complexity, problem solving and visualised sorts.", pl: "Złożoność, problemy i wizualizacje sortowań." }, spell: "O(n log n)" },
      { name: "Git", mark: "git", desc: { en: "Branches, rebases and a history that reads well.", pl: "Gałęzie, rebase i czytelna historia." }, spell: "git bisect" },
      { name: "Docker", mark: "docker", desc: { en: "API, Postgres and Redis up in one command.", pl: "API, Postgres i Redis jedną komendą." }, spell: "compose up" },
      { name: "Linux / Bash", mark: "bash", desc: { en: "Processes, signals, IPC and shell scripts.", pl: "Procesy, sygnały, IPC i skrypty powłoki." }, spell: "sudo !!" }
    ],
    // Also on the CV, next to the deck (from the owner's LinkedIn skills).
    also: ["Spring Framework", "Hibernate", "Firebase", { en: "Neural networks", pl: "Sieci neuronowe" }, { en: "Android and iOS basics", pl: "Podstawy Androida i iOS" }, { en: "CTF infrastructure", pl: "Infrastruktura CTF" }],
    // Card 0: dealt once every card above has been turned over (js/arcana.js).
    fool: { name: "The Fool", mark: "go", desc: { en: "Next up: deeper into Java, and picking up Go.", pl: "Dalej: głębiej w Javę i nauka Go." }, spell: "go run ." }
  },
  {
    id: "education",
    menu: { en: "Education", pl: "Edukacja" },
    code: "05",
    label: { en: "Archive 05", pl: "Archiwum 05" },
    stamp: { en: "Education", pl: "Edukacja" },
    title: { en: "Cracow University of Technology.", pl: "Politechnika Krakowska." },
    copy: {
      en: "I study Computer Science with a focus on strong fundamentals: algorithms, data structures, systems thinking and disciplined software development practice.",
      pl: "Studiuję informatykę z naciskiem na solidne podstawy: algorytmy, struktury danych, myślenie systemowe i zdyscyplinowaną praktykę wytwarzania oprogramowania."
    },
    kind: "archive",
    details: [
      [{ en: "Program", pl: "Kierunek" }, { en: "Computer Science, since October 2024", pl: "Informatyka, od października 2024" }, "code"],
      [{ en: "Erasmus+", pl: "Erasmus+" }, { en: "Mobile Programming and Technologies, January 2026", pl: "Mobile Programming and Technologies, styczeń 2026" }, "badge"],
      [{ en: "High school", pl: "Liceum" }, { en: "II LO Myślenice, maths and IT, 2020–\u20602024", pl: "II LO w Myślenicach, mat.-inf., 2020–\u20602024" }, "institution"]
    ],
    // Focus areas, exactly as listed in the copy and the original "Focus" row.
    focus: [
      { en: "Algorithms", pl: "Algorytmy" },
      { en: "Data structures", pl: "Struktury danych" },
      { en: "Systems thinking", pl: "Myślenie systemowe" },
      { en: "Software development", pl: "Wytwarzanie oprogramowania" },
      { en: "Programming fundamentals", pl: "Podstawy programowania" }
    ]
  },
  {
    id: "contact",
    menu: { en: "Contact", pl: "Kontakt" },
    code: "06",
    label: { en: "Network 06", pl: "Sieć 06" },
    stamp: { en: "Contact", pl: "Kontakt" },
    title: { en: "Let's connect.", pl: "Bądźmy w kontakcie." },
    copy: {
      en: "Email is the fastest way to reach me, in English, Polish or Italian. My code is on GitHub and my career on LinkedIn.",
      pl: "Najszybciej złapiesz mnie mailowo, po polsku, angielsku albo włosku. Kod jest na GitHubie, a kariera na LinkedInie."
    },
    kind: "contact",
    // The contact card: the address as the call to action, then channel tiles.
    reach: {
      cta: { en: "Write to me", pl: "Napisz do mnie" },
      tiles: [
        { id: "github", label: "GitHub", value: { en: "Code and projects", pl: "Kod i projekty" }, href: PROFILE.github, glyph: "branch", external: true },
        { id: "linkedin", label: "LinkedIn", value: { en: "Career and posts", pl: "Kariera i posty" }, href: PROFILE.linkedin, glyph: "network", external: true },
        { id: "cv", label: "CV", value: { en: "One page, PDF too", pl: "Jedna strona, też PDF" }, href: { en: "cv/", pl: "cv/pl/" }, glyph: "badge" }
      ],
      localTime: { en: "Local time in Kraków", pl: "Czas w Krakowie" }
    },
    links: [
      { id: "email", label: "Email", value: PROFILE.email, href: `mailto:${PROFILE.email}`, glyph: "mail", copy: true },
      { id: "github", label: "GitHub", value: PROFILE.githubLabel, href: PROFILE.github, glyph: "branch", external: true },
      { id: "linkedin", label: "LinkedIn", value: PROFILE.linkedinLabel, href: PROFILE.linkedin, glyph: "network", external: true }
    ],
    actions: [
      [{ en: "Send an email", pl: "Napisz maila" }, `mailto:${PROFILE.email}`, "primary"],
      [{ en: "Open the CV", pl: "Otwórz CV" }, { en: "cv/", pl: "cv/pl/" }, "secondary"],
      ["LinkedIn", PROFILE.linkedin, "secondary"]
    ]
  }
];

/**
 * The Depths: the hidden layer under the water (js/dive.js), reached by scrolling down past
 * the desktop page. The colophon only states how this site is built (it is all in the repo);
 * the save file is filled in live from this visit and the browser's storage.
 */
const DEPTHS_SRC = {
  kicker: { en: "Depth 07", pl: "Głębia 07" },
  stamp: { en: "Depths", pl: "Głębia" },
  title: { en: "You found the deep end.", pl: "Oto głęboka woda." },
  copy: {
    en: "This is where the machinery lives. Everything up there runs on what's down here.",
    pl: "Tu mieszka maszyneria. Wszystko na górze działa dzięki temu, co jest tutaj."
  },
  colophonTitle: { en: "How it's built", pl: "Jak to zbudowano" },
  colophon: [
    [{ en: "Framework", pl: "Framework" }, { en: "None, and no build step", pl: "Żaden, bez kroku budowania" }],
    [{ en: "Code", pl: "Kod" }, { en: "Plain ES modules, served as-is", pl: "Czyste moduły ES, serwowane bez zmian" }],
    [{ en: "Water", pl: "Woda" }, { en: "A WebGL shader at half resolution", pl: "Shader WebGL w połowie rozdzielczości" }],
    [{ en: "Motion", pl: "Ruch" }, { en: "GSAP and the Web Animations API", pl: "GSAP i Web Animations API" }],
    [{ en: "Music", pl: "Muzyka" }, { en: "Lo-fi generated live, new every day", pl: "Lo-fi generowane na żywo, codziennie inne" }],
    [{ en: "Sound", pl: "Dźwięk" }, { en: "Mostly synthesized in the browser", pl: "Głównie syntezowany w przeglądarce" }],
    [{ en: "Quality", pl: "Jakość" }, { en: "Unit and browser tests, Lighthouse on every push", pl: "Testy jednostkowe i przeglądarkowe, Lighthouse przy każdym pushu" }]
  ],
  saveTitle: { en: "Save file", pl: "Zapis gry" },
  engraving: { en: "Press ~ to talk to the machine.", pl: "Naciśnij ~ i porozmawiaj z maszyną." }
};

/**
 * The descent (js/story.js): the chapters below the pause menu on desktop, one depth each.
 * In the manifesto, *starred* words are lit in the accent colour. Pipeline and metrics are
 * the owner's HackNation 2026 numbers (LinkedIn); nothing here is estimated.
 */
const STORY_SRC = {
  cue: { en: "Scroll to dive", pl: "Przewiń, by zanurkować" },
  rail: { en: "Chapters", pl: "Rozdziały" },
  menu: { en: "Menu", pl: "Menu" },
  about: {
    kicker: { en: "Depth 01 · Who", pl: "Głębia 01 · Kto" },
    manifesto: {
      en: "I study Computer Science in Kraków and build *fullstack Java* at *Smart4Aviation.* I founded *Tensor,* a machine learning club. I want to know *why* things work, not just *that* they do.",
      pl: "Studiuję informatykę w Krakowie i tworzę *fullstack w Javie* w *Smart4Aviation.* Założyłem *Tensor,* koło uczenia maszynowego. Chcę wiedzieć, *dlaczego* rzeczy działają, a nie tylko *że* działają."
    }
  },
  experience: {
    kicker: { en: "Depth 02 · Quest log", pl: "Głębia 02 · Dziennik" },
    title: { en: "Three years on one line.", pl: "Trzy lata na jednej linii." },
    lead: { en: "Keep scrolling: the clock runs from my first class to today.", pl: "Przewijaj dalej: zegar biegnie od pierwszych zajęć do dziś." }
  },
  hackathon: {
    kicker: { en: "Depth 02 · Highlight", pl: "Głębia 02 · Wyróżnienie" },
    title: { en: "Finalist. HackNation 2026.", pl: "Finał. HackNation 2026." },
    lead: {
      en: "The Public Procurement Office's challenge “odwolania2json”: appeal documents in, structured data out, with models small enough to run anywhere.",
      pl: "Wyzwanie Urzędu Zamówień Publicznych „odwolania2json”: dokumenty odwołań na wejściu, ustrukturyzowane dane na wyjściu, z modelami tak małymi, że działają wszędzie."
    },
    role: {
      en: "My part: implementing and tuning Bielik 3.0, the Basal 2.0 decision model, serving the models as APIs, the regex rules and on-device OCR.",
      pl: "Moja część: implementacja i strojenie Bielika 3.0, model decyzyjny Basal 2.0, wystawienie modeli jako API, reguły regex i OCR na urządzeniu."
    },
    pipeline: [
      { name: "PDF", sub: { en: "Appeal documents (KIO)", pl: "Dokumenty odwołań (KIO)" } },
      { name: "Tesseract OCR", sub: { en: "19 MB with Polish data, on device", pl: "19 MB z danymi PL, lokalnie" } },
      { name: "Basal 2.0", sub: { en: "1.5B decision model: document detection", pl: "1,5B, model decyzyjny: wykrywanie dokumentów" } },
      { name: "Bielik 3.0", sub: { en: "4.5B: data extraction", pl: "4,5B: ekstrakcja danych" } },
      { name: "Regex", sub: { en: "Rule-based extraction", pl: "Ekstrakcja regułami" } },
      { name: "JSON", sub: { en: "Data the administration can use", pl: "Dane gotowe dla administracji" } }
    ],
    metrics: [
      { value: 0.9981, decimals: 4, label: { en: "F1 on the test set", pl: "F1 na zbiorze testowym" } },
      { value: 100, suffix: "%", label: { en: "Organisers' benchmark, 1st of all teams", pl: "Benchmark organizatorów, 1. miejsce" } },
      { value: 95, prefix: "~", suffix: "%", label: { en: "Blind benchmark on scraped data", pl: "Ślepy benchmark na danych z sieci" } },
      { value: 19, suffix: " MB", label: { en: "OCR model with Polish data", pl: "Model OCR z danymi PL" } }
    ]
  },
  projects: {
    kicker: { en: "Depth 03 · Built", pl: "Głębia 03 · Projekty" },
    all: { en: "All repositories", pl: "Wszystkie repozytoria" },
    code: { en: "Code", pl: "Kod" },
    more: { en: "More on GitHub", pl: "Więcej na GitHubie" },
    moreLead: { en: "The rest of my public repositories, live from GitHub.", pl: "Reszta moich publicznych repozytoriów, na żywo z GitHuba." }
  },
  skills: {
    kicker: { en: "Depth 04 · Loadout", pl: "Głębia 04 · Talia" }
  },
  education: {
    kicker: { en: "Depth 05 · Archive", pl: "Głębia 05 · Archiwum" },
    title: { en: "Where I learn.", pl: "Gdzie się uczę." }
  },
  contact: {
    kicker: { en: "Depth 06 · Signal", pl: "Głębia 06 · Kontakt" }
  }
};


/** Roman numerals for the arcana cards (I to XII is plenty; card 0 is the Fool's). */
export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/* ------------------------------------------------------- resolved exports */

export let HOME;
export let SECTIONS;
export let SECTION_MAP;
export let DEPTHS;
export let PROJECT_NOTES;
export let HIGHLIGHTS;
export let QUESTS;
export let SCHOOLING;
export let STORY;

/** Resolve every structure for `lang` (also used by the CV generator for each language). */
export function contentFor(lang) {
  const home = localize(HOME_SRC, lang);
  const sections = localize(SECTIONS_SRC, lang);
  // localize() copies objects; keep the custom render hooks.
  SECTIONS_SRC.forEach((source, i) => {
    if (source.render) sections[i].render = source.render;
  });
  return {
    home,
    sections,
    sectionMap: Object.fromEntries([home, ...sections].map((section) => [section.id, section])),
    depths: localize(DEPTHS_SRC, lang),
    projectNotes: localize(PROJECT_NOTES_SRC, lang),
    highlights: localize(HIGHLIGHTS_SRC, lang),
    quests: localize(QUESTS_SRC, lang),
    schooling: localize(SCHOOLING_SRC, lang),
    story: localize(STORY_SRC, lang)
  };
}

function resolve(lang) {
  const content = contentFor(lang);
  HOME = content.home;
  SECTIONS = content.sections;
  SECTION_MAP = content.sectionMap;
  DEPTHS = content.depths;
  PROJECT_NOTES = content.projectNotes;
  HIGHLIGHTS = content.highlights;
  QUESTS = content.quests;
  SCHOOLING = content.schooling;
  STORY = content.story;
}

resolve(getLang());
onLang(resolve);

/** Section id for a location hash ("#about", "#section-about"), or null. */
export function sectionFromHash(hash) {
  const id = String(hash || "").replace(/^#/, "").replace(/^section-/, "");
  return id && SECTION_MAP[id] ? id : null;
}
