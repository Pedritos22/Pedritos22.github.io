// System console, the pure part: tokenizer, history expansion, completion and the command
// table. Every side effect goes through the injected `ctx` (built by js/terminal.js), so this
// file runs in node for the tests (tests/terminal.test.mjs). Output is plain text, never HTML.
//
// A command's run(args, ctx, meta) returns output lines:
//   { parts: [{ text, tone?, href? }], tone? }
// tone: "out" (default) | "dim" | "accent" | "ok" | "error" | "art". `href` makes a part a link.

export const MAX_HISTORY = 50;

export const GROUPS = Object.freeze([
  { id: "basics", label: "basics" },
  { id: "navigate", label: "navigate" },
  { id: "content", label: "content" },
  { id: "world", label: "world" },
  { id: "games", label: "games" }
]);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ------------------------------------------------------------------ lines */

/** One output line from a string. */
export const out = (text, tone = "out") => ({ parts: [{ text: String(text) }], tone });

/** One output line with a link at the end: `before` + <a href>label</a>. */
export const link = (before, label, href, tone = "out") => ({
  parts: [{ text: before }, { text: label, href }],
  tone
});

/** Plain text of a line (tests, copy). */
export const lineText = (line) => line.parts.map((part) => part.text).join("");

/* ---------------------------------------------------------------- parsing */

/** Split a command line into words. Quotes group words; an open quote runs to the end. */
export function tokenize(line) {
  const words = [];
  let word = "";
  let quote = null;
  let started = false;
  for (const ch of String(line)) {
    if (quote) {
      if (ch === quote) quote = null;
      else word += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) words.push(word);
      word = "";
      started = false;
      continue;
    }
    word += ch;
    started = true;
  }
  if (started) words.push(word);
  return words;
}

/** Bash-style `!!`: the previous command. `history` is oldest first. */
export function expandHistory(line, history = []) {
  if (!String(line).includes("!!")) return { line, expanded: false };
  const last = history[history.length - 1];
  if (!last) return { line, expanded: false, error: "!!: event not found" };
  return { line: line.split("!!").join(last), expanded: true };
}

/** Add a command to the history (no blanks, no immediate repeats, capped). */
export function pushHistory(history, line, max = MAX_HISTORY) {
  const value = String(line).trim();
  if (!value || history[history.length - 1] === value) return history.slice(-max);
  return [...history, value].slice(-max);
}

/* ------------------------------------------------------------- completion */

export function levenshtein(a, b) {
  const s = String(a).toLowerCase();
  const t = String(b).toLowerCase();
  if (s === t) return 0;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[t.length];
}

/** The closest name within two edits (and closer than the word is long), or null. */
export function suggest(word, names) {
  let best = null;
  let bestDistance = Infinity;
  for (const name of names) {
    const distance = levenshtein(word, name);
    if (distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return bestDistance <= 2 && bestDistance < String(word).length ? best : null;
}

/** Names starting with `prefix` (sorted) and their longest common prefix. */
export function complete(prefix, names) {
  const lower = String(prefix).toLowerCase();
  const matches = [...new Set(names)].filter((name) => name.toLowerCase().startsWith(lower)).sort();
  if (!matches.length) return { matches, common: prefix };
  let common = matches[0];
  for (const match of matches) {
    while (!match.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
  }
  return { matches, common: common.length >= prefix.length ? common : prefix };
}

/**
 * Tab on a whole line: completes the command name (first word) or the command's argument.
 * An empty prefix offers the listed commands only; a typed prefix also finds the hidden ones.
 */
export function completeLine(line, ctx) {
  const value = String(line);
  const endsWithSpace = /\s$/.test(value);
  const words = tokenize(value);

  if (words.length === 0 || (words.length === 1 && !endsWithSpace)) {
    const prefix = words[0] ?? "";
    const pool = prefix ? commandNames({ hidden: true }) : commandNames();
    const { matches, common } = complete(prefix, pool);
    return { line: matches.length === 1 ? `${matches[0]} ` : common, matches };
  }

  const command = findCommand(words[0]);
  const argIndex = endsWithSpace ? words.length - 1 : words.length - 2;
  const prefix = endsWithSpace ? "" : words[words.length - 1];
  const options = command?.complete?.(argIndex, ctx) ?? [];
  const { matches, common } = complete(prefix, options);
  const head = value.slice(0, value.length - prefix.length);
  return { line: matches.length === 1 ? `${head}${matches[0]} ` : `${head}${common}`, matches };
}

/* ---------------------------------------------------------------- helpers */

const pad2 = (n) => String(n).padStart(2, "0");
export const hhmm = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/** "Thu 12 Nov 2026, 15:42:07" */
export function formatDate(date) {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hhmm(date)}:${pad2(date.getSeconds())}`;
}

/** "42 s", "4 min", "1 h 12 min" */
export function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** A section by id, menu label or menu code: "skills", "~/skills/", "Skills", "03", "3". */
export function findSection(target, sections) {
  const key = String(target ?? "").trim().toLowerCase().replace(/^~\//, "").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!key) return null;
  return (
    sections.find((s) => s.id === key || String(s.menu ?? "").toLowerCase() === key) ??
    sections.find((s) => s.code && Number(s.code) === Number(key) && /^\d+$/.test(key)) ??
    null
  );
}

const sectionIds = (ctx) => ctx.sections.map((s) => s.id);
const pick = (list, random = Math.random) => list[Math.floor(random() * list.length) % list.length];

/** `rm -rf /` in any of its spellings: rm + an r and an f flag + / or /*. */
export function isRmRoot(words) {
  if (String(words[0]).toLowerCase() !== "rm") return false;
  const flags = words.slice(1).filter((w) => w.startsWith("-")).join("");
  const targets = words.slice(1).filter((w) => !w.startsWith("-"));
  return /r/i.test(flags) && /f/i.test(flags) && targets.some((t) => t === "/" || t === "/*");
}

/* --------------------------------------------------------------- commands */

function help(args, ctx, meta) {
  if (meta.name === "man" && !args.length) return [out("What manual page do you want?")];
  if (args.length) {
    const command = findCommand(args[0]);
    if (!command || command.hidden) return [out(`No manual entry for ${args[0]}`, "error")];
    return [out(command.usage, "accent"), out(command.desc)];
  }
  const lines = [out("Commands (Tab completes, ↑ ↓ browse history, Esc closes):", "dim")];
  // On a phone the groups stack: the label on one line, its commands under it.
  const narrow = (ctx.viewport?.().width ?? Infinity) < 640;
  GROUPS.forEach((group) => {
    const usages = COMMANDS.filter((c) => c.group === group.id && !c.hidden).map((c) => c.usage);
    if (narrow) lines.push(out(group.label, "accent"), out(`  ${usages.join("  ")}`));
    else lines.push(out(`  ${group.label.padEnd(10)}${usages.join("   ")}`));
  });
  lines.push(out("Some commands are not on this list.", "dim"));
  return lines;
}

const NEOFETCH_ART = [
  "    .-\"\"-.    ",
  "  .'  .--'    ",
  " /   /        ",
  "|   |         ",
  "|   |         ",
  " \\   \\        ",
  "  '.  '--.    ",
  "    '-..-'    "
];

function neofetch(args, ctx) {
  const moon = ctx.moon();
  const view = ctx.viewport();
  const info = [
    "guest@dark-hour",
    "---------------",
    `OS          Dark Hour 0.0 (pause menu)`,
    `Host        ${ctx.host || "pedritos22.github.io"}`,
    `Uptime      ${formatDuration(ctx.uptime())}`,
    `Shell       menu, ${ctx.sections.length - 1} items`,
    `Theme       ${ctx.isDarkHour() ? "Dark Hour" : "Night"}${ctx.isDepths() ? ", under water" : ""}`,
    `Clock       ${hhmm(ctx.now())} · ${ctx.timeOfDay()}`,
    `Moon        ${moon.name}, ${Math.round(moon.illumination * 100)} %`,
    `Music       ${ctx.isPlaying() ? "lo-fi, playing" : "lo-fi, off"}`,
    `Resolution  ${view.width}x${view.height} @${view.dpr}x`
  ];
  const rows = Math.max(NEOFETCH_ART.length, info.length);
  return Array.from({ length: rows }, (_, i) => ({
    parts: [
      { text: (NEOFETCH_ART[i] ?? "").padEnd(16), tone: "art" },
      { text: info[i] ?? "", tone: i === 0 ? "accent" : undefined }
    ],
    tone: "out"
  }));
}

function cd(args, ctx) {
  const raw = args[0] ?? "~";
  const target = raw.trim().toLowerCase().replace(/\/+$/, "");
  if (["", "~", "..", "/", "-", "home", "~/.."].includes(target)) {
    ctx.showHome();
    return [];
  }
  if (target === ".") return [];
  if (target === ".depths" || target === "~/.depths" || target === "./.depths") {
    if (!ctx.canDive()) return [out("cd: .depths: needs a wider screen (desktop only)", "error")];
    if (!ctx.isDepths()) ctx.dive();
    return [];
  }
  const section = findSection(target, ctx.sections);
  if (!section) return [out(`cd: no such file or directory: ${raw}`, "error")];
  if (section.id === "home") ctx.showHome();
  else ctx.showSection(section.id);
  return [];
}

function ls(args, ctx) {
  const all = args.some((a) => /^-[a-z]*a/i.test(a));
  const target = args.find((a) => !a.startsWith("-"));
  if (target) {
    const section = findSection(target, ctx.sections);
    if (!section) {
      if (/^(~\/)?\.depths\/?$/i.test(target)) return [out("save-file   colophon   engraving")];
      return [out(`ls: ${target}: No such file or directory`, "error")];
    }
    if (section.id === "skills") return [out(ctx.skills.map((s) => s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).join("   "))];
    if (section.id === "projects") return [out(ctx.projects.join("   "))];
    return [out(`${section.id}.txt`)];
  }
  const names = ctx.sections.filter((s) => s.id !== "home").map((s) => `${s.id}/`);
  if (all) names.unshift("./", "../", ".depths/");
  return [out(names.join("   "))];
}

function pwd(args, ctx) {
  const where = ctx.isDepths() ? "/.depths" : ctx.section() && ctx.section() !== "home" ? `/${ctx.section()}` : "";
  return [out(`/home/guest${where}`)];
}

const LINK_TARGETS = ["github", "linkedin", "email"];

function open(args, ctx) {
  if (!args.length) return [out("usage: open <section | github | linkedin | email>", "error")];
  const key = args[0].toLowerCase();
  const p = ctx.profile;
  const links = { github: p.github, linkedin: p.linkedin, email: `mailto:${p.email}`, mail: `mailto:${p.email}` };
  if (links[key]) {
    ctx.openUrl(links[key]);
    return [out(`Opening ${key === "mail" ? "email" : key}…`, "dim")];
  }
  return cd(args, ctx);
}

function cat(args, ctx) {
  if (!args.length) return [out("usage: cat <section>", "error")];
  const target = args[0];
  if (/^(~\/)?\.depths\/?$/i.test(target)) return [out(`cat: ${target}: Is a directory`, "error")];
  if (/^readme(\.md|\.txt)?$/i.test(target)) return [out("There is no README. There is a console, and you are in it.")];
  const section = findSection(target.replace(/\.txt$/i, ""), ctx.sections);
  if (!section) return [out(`cat: ${target}: No such file or directory`, "error")];
  return [out(section.title, "accent"), out(section.copy)];
}

function skills(args, ctx) {
  const lines = ctx.skills.map((skill, i) => out(`  ${String(ctx.roman?.[i] ?? i + 1).padEnd(6)}${skill.name.padEnd(18)}${skill.spell}`));
  if (ctx.fool) {
    lines.push(ctx.foolFound()
      ? out(`  ${"0".padEnd(6)}${ctx.fool.name.padEnd(18)}${ctx.fool.spell}`, "accent")
      : out(`  ${"?".padEnd(6)}${"?".padEnd(18)}one card is missing from the deck`, "dim"));
  }
  return lines;
}

function projects(args, ctx) {
  const user = ctx.profile.githubUser;
  return [
    out("Pinned repositories:", "dim"),
    ...ctx.projects.map((name) => link("  ", name, `https://github.com/${user}/${name}`)),
    out("The full board, live from GitHub: cd projects", "dim")
  ];
}

function contact(args, ctx) {
  const p = ctx.profile;
  return [
    link(`  ${"email".padEnd(10)}`, p.email, `mailto:${p.email}`),
    link(`  ${"github".padEnd(10)}`, p.githubLabel, p.github),
    link(`  ${"linkedin".padEnd(10)}`, p.linkedinLabel, p.linkedin)
  ];
}

function email(args, ctx) {
  const p = ctx.profile;
  ctx.copyEmail();
  return [link("  ", p.email, `mailto:${p.email}`), out("Copying it to the clipboard…", "dim")];
}

function darkhour(args, ctx) {
  const arg = (args[0] ?? "").toLowerCase();
  const want = arg === "on" ? true : arg === "off" ? false : arg ? null : !ctx.isDarkHour();
  if (want === null) return [out("usage: darkhour [on|off]", "error")];
  if (want === ctx.isDarkHour()) return [out(want ? "Already in the Dark Hour." : "The Dark Hour isn't on.", "dim")];
  ctx.setDarkHour(want);
  return [want ? out("The hidden hour begins.", "accent") : out("The hour passes. Lights back on.")];
}

function time(args, ctx) {
  if (!args.length) return [out(`${hhmm(ctx.now())} · ${ctx.timeOfDay()}${ctx.isVirtual() ? " (the clock is dialled)" : ""}`)];
  const arg = args[0].toLowerCase();
  if (arg === "now" || arg === "reset") {
    if (!ctx.isVirtual()) return [out("Already on the real clock.", "dim")];
    ctx.timeNow();
    return [out("Back to the real clock.")];
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(arg);
  const h = match ? Number(match[1]) : NaN;
  const m = match ? Number(match[2]) : NaN;
  if (!match || h > 23 || m > 59) return [out("time: use HH:MM (00:00 to 23:59), or time now", "error")];
  ctx.setTime(h, m);
  const lines = [out(`World clock set to ${pad2(h)}:${pad2(m)}.`)];
  if (h === 0) lines.push(out("That's the hidden hour.", "accent"));
  return lines;
}

function play(args, ctx) {
  if (ctx.isPlaying()) return [out("Already playing.", "dim")];
  ctx.play();
  return [out("♪ Lo-fi on. A new progression every day.")];
}

function stop(args, ctx) {
  if (!ctx.isPlaying()) return [out("Nothing is playing.", "dim")];
  ctx.stop();
  return [out("Lo-fi off.")];
}

function dive(args, ctx) {
  if (!ctx.canDive()) return [out("dive: needs a wider screen (desktop only)", "error")];
  if (ctx.isDepths()) return [out("Already down here.", "dim")];
  ctx.dive();
  return [out("Taking a deep breath…")];
}

function surface(args, ctx) {
  if (!ctx.isDepths()) return [out("Already at the surface.", "dim")];
  ctx.surface();
  return [out("Coming up for air.")];
}

function sudo(args, ctx) {
  if (!args.length) return [out("usage: sudo <command>", "error")];
  if (isRmRoot(args)) {
    ctx.shatterAll();
    return [
      out("[sudo] password for guest: ********", "dim"),
      out("removing /about  /education  /skills  /projects  /contact …"),
      out("Nothing left standing. Type reset to rewind.", "accent")
    ];
  }
  if (/^make me a sandwich$/i.test(args.join(" "))) return [out("Okay.")];
  return [out("guest is not in the sudoers file. This incident will be reported.", "error")];
}

function rm(args) {
  if (isRmRoot(["rm", ...args])) {
    return [out("rm: cannot remove '/': Permission denied", "error"), out("(sudo !! is right there, though.)", "dim")];
  }
  const target = args.filter((a) => !a.startsWith("-")).pop();
  if (!target) return [out("usage: rm [-rf] <file>", "error")];
  return [out(`rm: cannot remove '${target}': this is a portfolio, not a filesystem`, "error")];
}

function vim(args, ctx) {
  ctx.shell.mode = "vim";
  return [
    out("~", "dim"),
    out("~                VIM - Vi IMproved", "dim"),
    out("~", "dim"),
    out("~          type  :q<Enter>  to exit", "dim"),
    out("~", "dim")
  ];
}

function vimInput(line, ctx) {
  if (/^(:(q|q!|qa|qa!|wq|wq!|x|x!)|ZZ)$/.test(line)) {
    ctx.shell.mode = null;
    return [out("Freedom. Not everyone makes it out.", "ok")];
  }
  if (!line) return [];
  if (line.startsWith(":")) return [out(`E492: Not an editor command: ${line.slice(1)}`, "error")];
  return [out("Type  :q  and press Enter to exit Vim", "dim")];
}

function hello(args, ctx, meta) {
  const others = ctx.greetings.filter((g) => g.toLowerCase() !== meta.name);
  const reply = pick(others.length ? others : ctx.greetings, ctx.random);
  return [out(`${reply}!`), out("Pietro speaks Polish, English and Italian, and is learning Chinese.", "dim")];
}

function git(args, ctx) {
  const sub = (args[0] ?? "").toLowerCase();
  if (!sub) return [out("usage: git <status | log | blame | push>", "error")];
  if (sub === "status") {
    const broken = ctx.brokenCount();
    if (!broken) return [out("On branch main"), out("nothing to commit, working tree clean")];
    return [
      out("On branch main"),
      out("Changes not staged for commit:"),
      out(`  broken:   ${broken} glass ${broken === 1 ? "pane" : "panes"}`, "error"),
      out('  (use "reset" to restore them)', "dim")
    ];
  }
  if (sub === "log") return [out("commit d4rk0ur (HEAD -> main)", "accent"), out("    Build a pause menu that never existed.")];
  if (sub === "blame") return [out("It was the butterfly.")];
  if (sub === "push") return [out("Everything up-to-date")];
  if (sub === "commit") return [out("nothing to commit (try breaking something first)")];
  return [out(`git: '${args[0]}' is not a git command here. Try status, log, blame or push.`, "error")];
}

/**
 * The command table. `hidden` commands stay off `help` and off an empty Tab, but a typed
 * prefix completes them and "did you mean" can suggest them.
 */
export const COMMANDS = Object.freeze([
  // basics
  { name: "help", aliases: ["man"], group: "basics", usage: "help [command]", desc: "List the commands, or explain one.", run: help, complete: (i) => (i === 0 ? commandNames() : []) },
  { name: "clear", aliases: ["cls"], group: "basics", usage: "clear", desc: "Clear the screen (also Ctrl+L).", run: (a, ctx) => { ctx.clear(); return []; } },
  { name: "history", group: "basics", usage: "history", desc: "Show the commands you typed.", run: (a, ctx) => ctx.history.map((line, i) => out(`${String(i + 1).padStart(4)}  ${line}`)) },
  { name: "echo", group: "basics", usage: "echo <text>", desc: "Print the text back.", run: (a) => [out(a.join(" "))] },
  {
    name: "whoami", group: "basics", usage: "whoami", desc: "Who you are, and whose page this is.",
    run: (a, ctx) => [out("guest"), out(`The host is ${ctx.profile.name}: ${ctx.profile.field}, ${ctx.profile.school}, ${ctx.profile.location}.`, "dim")]
  },
  {
    name: "date", group: "basics", usage: "date", desc: "The world clock, and the time of day.",
    run: (a, ctx) => {
      const lines = [out(`${formatDate(ctx.now())} · ${ctx.timeOfDay()}`)];
      if (ctx.isVirtual()) lines.push(out("The world clock is dialled away from now. time now brings it back.", "dim"));
      return lines;
    }
  },
  {
    name: "moon", group: "basics", usage: "moon", desc: "Tonight's moon phase.",
    run: (a, ctx) => {
      const moon = ctx.moon();
      const days = Math.round(moon.daysToFull);
      const next = moon.index === 4 || days < 1 || days > 28 ? "Full tonight." : `Full moon in ${days} ${days === 1 ? "day" : "days"}.`;
      return [out(`${moon.name} · ${Math.round(moon.illumination * 100)} % lit`), out(next, "dim")];
    }
  },
  { name: "uptime", group: "basics", usage: "uptime", desc: "How long you have been here.", run: (a, ctx) => [out(`${hhmm(ctx.now())} up ${formatDuration(ctx.uptime())}, 1 user (you)`)] },
  { name: "ping", group: "basics", usage: "ping", desc: "Check the connection.", run: () => [out("pong from the moon: time=2564 ms (light needs 1.28 s each way)")] },
  { name: "exit", aliases: ["quit", "logout"], group: "basics", usage: "exit", desc: "Close the console (also Esc or ~).", run: (a, ctx) => { ctx.close(); return [out("logout", "dim")]; } },

  // navigate
  { name: "ls", aliases: ["dir"], group: "navigate", usage: "ls [-a]", desc: "List the sections.", run: ls, complete: (i, ctx) => (i === 0 ? ["-a", ...sectionIds(ctx).filter((id) => id !== "home")] : []) },
  { name: "cd", group: "navigate", usage: "cd <section>", desc: "Go to a section (cd alone goes home).", run: cd, complete: (i, ctx) => (i === 0 ? sectionIds(ctx) : []) },
  { name: "pwd", group: "navigate", usage: "pwd", desc: "Where you are.", run: pwd },
  { name: "open", group: "navigate", usage: "open <section|github|linkedin>", desc: "Open a section, or a profile in a new tab.", run: open, complete: (i, ctx) => (i === 0 ? [...sectionIds(ctx), ...LINK_TARGETS] : []) },

  // content
  { name: "cat", group: "content", usage: "cat <section>", desc: "Print a section's text.", run: cat, complete: (i, ctx) => (i === 0 ? sectionIds(ctx) : []) },
  { name: "skills", group: "content", usage: "skills", desc: "The deck: every card and its spell.", run: skills },
  { name: "projects", group: "content", usage: "projects", desc: "Pinned repositories, with links.", run: projects },
  { name: "contact", group: "content", usage: "contact", desc: "Email, GitHub and LinkedIn.", run: contact },
  { name: "email", group: "content", usage: "email", desc: "Copy the email address.", run: email },

  // world
  { name: "darkhour", group: "world", usage: "darkhour [on|off]", desc: "Open or close the hidden hour.", run: darkhour, complete: (i) => (i === 0 ? ["on", "off"] : []) },
  { name: "time", group: "world", usage: "time <HH:MM|now>", desc: "Move the world clock, or bring it back.", run: time, complete: (i) => (i === 0 ? ["now", "00:00"] : []) },
  { name: "play", aliases: ["music"], group: "world", usage: "play", desc: "Start the lo-fi.", run: play },
  { name: "stop", group: "world", usage: "stop", desc: "Stop the lo-fi.", run: stop },
  { name: "dive", group: "world", usage: "dive", desc: "Go under the water (desktop).", run: dive },
  { name: "surface", group: "world", usage: "surface", desc: "Come back up.", run: surface },
  { name: "reset", group: "world", usage: "reset", desc: "Repair the glass, send the name home, turn the lights on.", run: (a, ctx) => { ctx.reset(); return [out("Rewound. Everything is back where it was.")]; } },

  // games
  { name: "battle", group: "games", usage: "battle", desc: "Run a battle test against real bugs.", run: (a, ctx) => { ctx.battle(); return [out("Booting the battle test…", "dim")]; } },
  { name: "session", aliases: ["rhythm"], group: "games", usage: "session", desc: "Play along with the lo-fi.", run: (a, ctx) => { ctx.nightSession(); return [out("Starting the Night Session…", "dim")]; } },
  { name: "objection", group: "games", usage: "objection", desc: "Someone has something to say.", run: (a, ctx) => { ctx.objection(); return [out("OBJECTION!", "accent")]; } },
  { name: "hints", group: "games", usage: "hints", desc: "Open the side requests.", run: (a, ctx) => { ctx.hints(); return [out("Opening the side requests…", "dim")]; } },

  // hidden
  { name: "sudo", hidden: true, usage: "sudo <command>", desc: "", run: sudo, complete: (i) => (i === 0 ? ["rm"] : []) },
  { name: "rm", hidden: true, usage: "rm", desc: "", run: rm },
  { name: "vim", aliases: ["vi"], hidden: true, usage: "vim", desc: "", run: vim },
  { name: "nano", hidden: true, usage: "nano", desc: "", run: () => [out("nano: not today. Try vim, if you're brave.", "dim")] },
  { name: "emacs", hidden: true, usage: "emacs", desc: "", run: () => [out("emacs: a fine operating system. Try vim.", "dim")] },
  { name: "neofetch", hidden: true, usage: "neofetch", desc: "", run: neofetch },
  { name: "coffee", hidden: true, usage: "coffee", desc: "", run: () => [out("coffee: command not found. Did you mean estathe?", "error")] },
  { name: "estathe", aliases: ["estathé", "tea"], hidden: true, usage: "estathe", desc: "", run: () => [out("Pouring an Estathé. Always Estathé.")] },
  { name: "hello", aliases: ["hi", "hey", "hej", "cześć", "czesc", "ciao", "hola", "你好"], hidden: true, usage: "hello", desc: "", run: hello },
  { name: "git", hidden: true, usage: "git", desc: "", run: git, complete: (i) => (i === 0 ? ["status", "log", "blame", "push"] : []) },
  { name: "konami", hidden: true, usage: "konami", desc: "", run: () => [out("↑ ↑ ↓ ↓ ← → ← → B A", "accent"), out("Not in here. Try it on the page.", "dim")] },
  { name: "mahjong", hidden: true, usage: "mahjong", desc: "", run: () => [out("Mahjong. Nothing else comes close.")] },
  { name: "xyzzy", hidden: true, usage: "xyzzy", desc: "", run: () => [out("Nothing happens.")] }
]);

const BY_NAME = new Map();
COMMANDS.forEach((command) => {
  BY_NAME.set(command.name, command);
  (command.aliases ?? []).forEach((alias) => BY_NAME.set(alias, command));
});

export function findCommand(name) {
  return BY_NAME.get(String(name ?? "").toLowerCase()) ?? null;
}

/** Command names: listed ones, or every name and alias with { hidden: true }. */
export function commandNames({ hidden = false } = {}) {
  if (!hidden) return COMMANDS.filter((c) => !c.hidden).map((c) => c.name);
  return [...BY_NAME.keys()];
}

function notFound(word) {
  const lines = [out(`command not found: ${word}`, "error")];
  const guess = suggest(word, commandNames({ hidden: true }));
  if (guess) lines.push(out(`Did you mean ${guess}?`, "dim"));
  lines.push(out("Type help for the list.", "dim"));
  return lines;
}

/** Run one (already history-expanded) command line. Returns the output lines. */
export function execute(rawLine, ctx) {
  const line = String(rawLine ?? "").trim();
  if (ctx.shell?.mode === "vim") return vimInput(line, ctx);
  if (!line) return [];
  const words = tokenize(line);
  if (!words.length) return [];
  const name = words[0].toLowerCase();
  const command = findCommand(name);
  if (!command) return notFound(words[0]);
  return command.run(words.slice(1), ctx, { name, line }) ?? [];
}
