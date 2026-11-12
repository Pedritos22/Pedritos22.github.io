import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMANDS, GROUPS, tokenize, expandHistory, pushHistory, levenshtein, suggest, complete, completeLine,
  findCommand, findSection, commandNames, execute, isRmRoot, lineText, formatDuration, MAX_HISTORY
} from "../js/terminal-logic.js";

// A stand-in for the browser context js/terminal.js builds (content.js needs a browser).
function makeCtx(overrides = {}) {
  const calls = [];
  const spy = (name) => (...args) => calls.push([name, ...args]);
  const ctx = {
    calls,
    profile: {
      name: "Pietro Molendys", location: "Cracow, Poland", field: "Computer Science",
      school: "Cracow University of Technology", email: "someone@example.com",
      github: "https://github.com/pedritos22", githubUser: "pedritos22", githubLabel: "github.com/pedritos22",
      linkedin: "https://linkedin.com/in/x", linkedinLabel: "linkedin.com/in/x"
    },
    sections: [
      { id: "home", menu: "Home", code: "00", title: "Press start.", copy: "Welcome." },
      { id: "about", menu: "About", code: "01", title: "Hi.", copy: "About me." },
      { id: "skills", menu: "Skills", code: "03", title: "Pick a card.", copy: "My loadout." },
      { id: "projects", menu: "Projects", code: "04", title: "Things.", copy: "Repos." }
    ],
    skills: [{ name: "Java", spell: "@Override" }, { name: "Linux / Bash", spell: "sudo !!" }],
    fool: { name: "The Fool", spell: "go run ." },
    roman: ["I", "II"],
    projects: ["OpenGuitar", "Mindly"],
    greetings: ["Cześć", "Hello", "Ciao"],
    history: [],
    shell: { mode: null },
    host: "localhost",
    random: () => 0,
    now: () => new Date(2026, 10, 12, 15, 42, 7),
    moon: () => ({ name: "Waxing Gibbous", illumination: 0.78, daysToFull: 3.6, index: 3 }),
    timeOfDay: () => "After School",
    viewport: () => ({ width: 1440, height: 900, dpr: 2 }),
    uptime: () => 125000,
    section: () => "home",
    isVirtual: () => false,
    isDarkHour: () => false,
    isDepths: () => false,
    isPlaying: () => false,
    canDive: () => true,
    foolFound: () => false,
    brokenCount: () => 0,
    showSection: spy("showSection"),
    showHome: spy("showHome"),
    setDarkHour: spy("setDarkHour"),
    setTime: spy("setTime"),
    timeNow: spy("timeNow"),
    play: spy("play"),
    stop: spy("stop"),
    dive: spy("dive"),
    surface: spy("surface"),
    reset: spy("reset"),
    battle: spy("battle"),
    nightSession: spy("nightSession"),
    objection: spy("objection"),
    hints: spy("hints"),
    copyEmail: spy("copyEmail"),
    openUrl: spy("openUrl"),
    shatterAll: spy("shatterAll"),
    clear: spy("clear"),
    close: spy("close"),
    ...overrides
  };
  return ctx;
}

const text = (lines) => lines.map(lineText).join("\n");

test("tokenize splits on whitespace and keeps quoted words together", () => {
  assert.deepEqual(tokenize("  cd   skills "), ["cd", "skills"]);
  assert.deepEqual(tokenize('echo "hello world" \'and you\''), ["echo", "hello world", "and you"]);
  assert.deepEqual(tokenize('echo ""'), ["echo", ""]);
  assert.deepEqual(tokenize('echo "open quote runs on'), ["echo", "open quote runs on"]);
  assert.deepEqual(tokenize(""), []);
});

test("!! expands to the previous command, and fails without one", () => {
  assert.deepEqual(expandHistory("sudo !!", ["ls", "rm -rf /"]), { line: "sudo rm -rf /", expanded: true });
  assert.equal(expandHistory("ls", ["cd"]).expanded, false);
  assert.equal(expandHistory("sudo !!", []).error, "!!: event not found");
});

test("history skips blanks and repeats and keeps the newest entries", () => {
  let history = [];
  history = pushHistory(history, "ls");
  history = pushHistory(history, "ls");
  history = pushHistory(history, "   ");
  history = pushHistory(history, "cd skills");
  assert.deepEqual(history, ["ls", "cd skills"]);
  const long = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => `echo ${i}`).reduce((h, line) => pushHistory(h, line), []);
  assert.equal(long.length, MAX_HISTORY);
  assert.equal(long.at(-1), `echo ${MAX_HISTORY + 9}`);
});

test("levenshtein and suggest find close command names", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("Help", "help"), 0);
  assert.equal(suggest("hlep", commandNames({ hidden: true })), "help");
  assert.equal(suggest("neofech", commandNames({ hidden: true })), "neofetch");
  assert.equal(suggest("x", commandNames({ hidden: true })), null);
  assert.equal(suggest("qwertyuiop", commandNames({ hidden: true })), null);
});

test("complete returns sorted matches and their common prefix", () => {
  assert.deepEqual(complete("s", ["stop", "skills", "session", "surface"]), {
    matches: ["session", "skills", "stop", "surface"],
    common: "s"
  });
  assert.deepEqual(complete("da", ["darkhour", "date"]), { matches: ["darkhour", "date"], common: "da" });
  assert.deepEqual(complete("zz", ["a"]), { matches: [], common: "zz" });
});

test("Tab completes command names and their arguments", () => {
  const ctx = makeCtx();
  assert.equal(completeLine("neof", ctx).line, "neofetch ");
  assert.equal(completeLine("cd sk", ctx).line, "cd skills ");
  assert.equal(completeLine("darkhour o", ctx).line, "darkhour o");
  assert.deepEqual(completeLine("darkhour o", ctx).matches, ["off", "on"]);
  // An empty Tab lists only the commands that help lists.
  const listed = completeLine("", ctx).matches;
  assert.ok(listed.includes("help"));
  assert.ok(!listed.includes("sudo"));
});

test("every command has a usage line, a group or the hidden flag, and help lists the visible ones", () => {
  const ctx = makeCtx();
  const helpText = text(execute("help", ctx));
  const groups = new Set(GROUPS.map((g) => g.id));
  for (const command of COMMANDS) {
    assert.ok(command.usage, command.name);
    if (command.hidden) continue;
    assert.ok(groups.has(command.group), command.name);
    assert.ok(command.desc, command.name);
    assert.ok(helpText.includes(command.usage), `help lists ${command.name}`);
  }
  assert.ok(!helpText.includes("neofetch"));
});

test("help stacks its groups on a narrow screen", () => {
  const lines = execute("help", makeCtx({ viewport: () => ({ width: 390, height: 844, dpr: 3 }) }));
  const labels = lines.filter((line) => line.tone === "accent").map(lineText);
  assert.deepEqual(labels, GROUPS.map((g) => g.label));
});

test("names and aliases are unique", () => {
  const seen = new Set();
  for (const command of COMMANDS) {
    for (const name of [command.name, ...(command.aliases ?? [])]) {
      assert.ok(!seen.has(name), name);
      seen.add(name);
      assert.equal(findCommand(name.toUpperCase()), command);
    }
  }
});

test("unknown commands say so and suggest a close one", () => {
  const lines = execute("hlep", makeCtx());
  assert.equal(lines[0].tone, "error");
  assert.match(text(lines), /command not found: hlep/);
  assert.match(text(lines), /Did you mean help\?/);
});

test("cd moves between sections, home and the depths", () => {
  const ctx = makeCtx();
  execute("cd skills", ctx);
  execute("cd ~/about/", ctx);
  execute("cd 04", ctx);
  execute("cd", ctx);
  execute("cd ..", ctx);
  execute("cd .depths", ctx);
  assert.deepEqual(ctx.calls, [
    ["showSection", "skills"], ["showSection", "about"], ["showSection", "projects"],
    ["showHome"], ["showHome"], ["dive"]
  ]);
  assert.match(text(execute("cd nowhere", ctx)), /no such file or directory: nowhere/);
  assert.match(text(execute("cd .depths", makeCtx({ canDive: () => false }))), /desktop only/);
});

test("findSection matches ids, labels and menu codes", () => {
  const { sections } = makeCtx();
  assert.equal(findSection("Skills", sections)?.id, "skills");
  assert.equal(findSection("3", sections)?.id, "skills");
  assert.equal(findSection("./about", sections)?.id, "about");
  assert.equal(findSection("", sections), null);
});

test("world commands call the context and validate their input", () => {
  const ctx = makeCtx();
  execute("darkhour", ctx);
  execute("time 00:15", ctx);
  assert.deepEqual(ctx.calls, [["setDarkHour", true], ["setTime", 0, 15]]);
  assert.match(text(execute("time 00:15", makeCtx())), /hidden hour/);
  assert.match(text(execute("time 25:00", ctx)), /use HH:MM/);
  assert.match(text(execute("darkhour maybe", ctx)), /usage/);
  assert.match(text(execute("darkhour off", ctx)), /isn't on/);
  assert.match(text(execute("time now", ctx)), /Already on the real clock/);
});

test("rm -rf / is denied, sudo !! of it shatters everything", () => {
  assert.ok(isRmRoot(["rm", "-rf", "/"]));
  assert.ok(isRmRoot(["rm", "-r", "-f", "/*"]));
  assert.ok(isRmRoot(["RM", "-fr", "/"]));
  assert.ok(!isRmRoot(["rm", "-r", "/"]));
  assert.ok(!isRmRoot(["rm", "-rf", "about"]));

  const ctx = makeCtx();
  assert.match(text(execute("rm -rf /", ctx)), /Permission denied/);
  const { line } = expandHistory("sudo !!", ["rm -rf /"]);
  execute(line, ctx);
  assert.deepEqual(ctx.calls, [["shatterAll"]]);
  assert.match(text(execute("sudo ls", ctx)), /not in the sudoers file/);
});

test("vim traps you until :q", () => {
  const ctx = makeCtx();
  execute("vim", ctx);
  assert.equal(ctx.shell.mode, "vim");
  assert.match(text(execute("help", ctx)), /:q/);
  assert.match(text(execute(":wat", ctx)), /E492/);
  assert.equal(ctx.shell.mode, "vim");
  assert.match(text(execute(":q", ctx)), /Freedom/);
  assert.equal(ctx.shell.mode, null);
});

test("git status reports broken panes", () => {
  assert.match(text(execute("git status", makeCtx())), /working tree clean/);
  assert.match(text(execute("git status", makeCtx({ brokenCount: () => 2 }))), /2 glass panes/);
});

test("content commands print links from the profile", () => {
  const lines = execute("contact", makeCtx());
  assert.equal(lines.length, 3);
  assert.equal(lines[0].parts[1].href, "mailto:someone@example.com");
  const repos = execute("projects", makeCtx());
  assert.ok(repos.some((l) => l.parts.some((p) => p.href === "https://github.com/pedritos22/Mindly")));
});

test("the missing card shows up in skills once it is found", () => {
  assert.match(text(execute("skills", makeCtx())), /one card is missing/);
  assert.match(text(execute("skills", makeCtx({ foolFound: () => true }))), /The Fool/);
});

test("formatDuration reads naturally", () => {
  assert.equal(formatDuration(42000), "42 s");
  assert.equal(formatDuration(125000), "2 min");
  assert.equal(formatDuration(4320000), "1 h 12 min");
});

test("every command runs without throwing on no arguments", () => {
  for (const command of COMMANDS) {
    const ctx = makeCtx();
    const lines = execute(command.name, ctx);
    assert.ok(Array.isArray(lines), command.name);
    lines.forEach((line) => assert.ok(Array.isArray(line.parts), command.name));
  }
});
