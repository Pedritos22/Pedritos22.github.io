// Language: English (default) and Polish.
// Owner: menu/panel workstream (B).
//
// Content (js/content.js) writes translatable strings inline as { en, pl } and is resolved
// with localize(). Interface strings live in UI below and are read with t(key, vars).
// Static markup in index.html is tagged with data-i18n attributes and refreshed by
// applyStatic(): data-i18n (textContent), data-i18n-html (trusted markup from UI), and
// data-i18n-attr="aria-label:key; data-tip:key".
//
// The language comes from ?lang=, then localStorage (p3:lang), then the browser, and is
// mirrored on <html lang>. setLang() persists it and calls every onLang() listener; each
// module that renders text listens and re-renders. Content (content.js) subscribes first,
// at import time, so it is fresh before anything re-renders. No imports and no DOM at the
// top level: the CV generator (tools/build-cv.mjs) imports this through content.js in node.

export const LANGS = ["en", "pl"];
export const LANG_NAMES = { en: "English", pl: "Polski" };
const KEY = "p3:lang";
const hasWindow = typeof window !== "undefined";

function detect() {
  if (!hasWindow) return "en";
  try {
    const param = new URLSearchParams(window.location.search).get("lang");
    if (LANGS.includes(param)) return param;
    const stored = window.localStorage.getItem(KEY);
    if (LANGS.includes(stored)) return stored;
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  const preferred = (navigator.languages?.length ? navigator.languages : [navigator.language || "en"]).map((l) => String(l).toLowerCase());
  return preferred.some((l) => l.startsWith("pl")) ? "pl" : "en";
}

let lang = detect();
const listeners = new Set();

export const getLang = () => lang;

/** Locale for Intl formatters. */
export const locale = () => (lang === "pl" ? "pl-PL" : "en-GB");

/** Resolve a { en, pl } leaf (or any nested structure of them) for `to`. */
export function localize(value, to = lang) {
  if (Array.isArray(value)) return value.map((item) => localize(item, to));
  if (value && typeof value === "object" && !(typeof value === "function")) {
    const keys = Object.keys(value);
    // A leaf: { en, pl } with strings, or with whole lists (bullet points) per language.
    if (keys.length && keys.every((k) => LANGS.includes(k)) && (typeof value.en === "string" || Array.isArray(value.en))) {
      return localize(value[to] ?? value.en, to);
    }
    const out = {};
    for (const k of keys) out[k] = localize(value[k], to);
    return out;
  }
  return value;
}

/** Register a callback for language changes (content.js re-resolves itself first). */
export function onLang(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  if (hasWindow) {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // The choice still holds for this visit.
    }
    document.documentElement.lang = next;
    const url = new URL(window.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.set("lang", next);
      history.replaceState(history.state, "", url);
    }
  }
  listeners.forEach((handler) => handler(next));
}

/* ------------------------------------------------------------ UI strings */

const UI = {
  // Language switch
  "lang.switch": { en: "Polski", pl: "English" },
  "lang.switchAria": { en: "PL: przełącz na polski", pl: "EN: switch to English" },
  "lang.tip": { en: "PL", pl: "EN" },
  "lang.code": { en: "pl", pl: "en" }, // the language the switch's own label is written in
  "skip.main": { en: "Skip to content", pl: "Przejdź do treści" },
  // Quick view (CV page)
  "cv.tip": { en: "CV / quick view", pl: "CV / szybki widok" },
  "cv.aria": { en: "Open the CV: the whole profile on one calm page", pl: "Otwórz CV: cały profil na jednej spokojnej stronie" },
  // HUD
  "hud.status": { en: "Status and tools", pl: "Status i narzędzia" },
  "hud.tools": { en: "Site tools", pl: "Narzędzia strony" },
  "hud.lofi": { en: "Lo-fi music", pl: "Muzyka lo-fi" },
  "hud.lofiTip": { en: "Lo-fi", pl: "Lo-fi" },
  "hud.hints": { en: "Hints", pl: "Podpowiedzi" },
  "hud.reset": { en: "Reset easter eggs", pl: "Zresetuj sekrety" },
  "hud.resetTip": { en: "Reset", pl: "Reset" },
  "hud.volume": { en: "Lo-fi volume", pl: "Głośność lo-fi" },
  "hud.volumeTip": { en: "Volume", pl: "Głośność" },
  "hud.volumeValue": { en: "Volume {v}%", pl: "Głośność {v}%" },
  "hud.sfx": { en: "Mute sound effects", pl: "Wycisz efekty dźwiękowe" },
  "hud.sfxTip": { en: "Sound FX", pl: "Efekty" },
  "hud.calendar": { en: "Date and time", pl: "Data i godzina" },
  "hud.moon": { en: "Moon phase", pl: "Faza księżyca" },
  "hud.moonAria": { en: "Moon phase: {name}. {caption}.", pl: "Faza księżyca: {name}. {caption}." },
  "hud.fullMoon": { en: "Full Moon", pl: "Pełnia" },
  "hud.newMoon": { en: "New Moon", pl: "Nów" },
  "hud.tonight": { en: "tonight", pl: "dziś" },
  "hud.inDays": { en: "in {n} {unit}", pl: "za {n} {unit}" },
  // Identity column
  "id.location": { en: "Cracow, Poland", pl: "Kraków, Polska" },
  "id.field": { en: "Computer Science", pl: "Informatyka" },
  "id.nameAria": { en: "Pietro Molendys, back to the welcome card", pl: "Pietro Molendys, powrót do karty powitalnej" },
  "id.menu": { en: "Profile sections", pl: "Sekcje profilu" },
  "id.scroll": { en: "Scroll", pl: "Przewiń" },
  "card.region": { en: "Profile card", pl: "Karta profilu" },
  "card.stack": { en: "All profile sections", pl: "Wszystkie sekcje profilu" },
  // Footer
  "footer.quote": { en: "Nothing in life is to be feared. It is only to be understood.", pl: "Niczego w życiu nie należy się bać, należy to tylko zrozumieć." },
  // Card UI
  "card.copy": { en: "Copy", pl: "Kopiuj" },
  "card.copied": { en: "Copied", pl: "Skopiowano" },
  "card.copyFailed": { en: "Copy failed", pl: "Nie skopiowano" },
  "card.copyAria": { en: "Copy {what} address", pl: "Skopiuj adres: {what}" },
  "card.newTab": { en: " (opens in a new tab)", pl: " (otwiera się w nowej karcie)" },
  "card.focusAreas": { en: "Focus areas", pl: "Obszary" },
  "card.startHere": { en: "Start here", pl: "Zacznij tutaj" },
  "card.quickStart": { en: "Quick start", pl: "Szybki start" },
  "card.highlight": { en: "Latest", pl: "Najnowsze" },
  "quest.current": { en: "Now", pl: "Teraz" },
  "chrono.work": { en: "Work", pl: "Praca" },
  "chrono.uni": { en: "University", pl: "Uczelnia" },
  "chrono.events": { en: "Events", pl: "Wydarzenia" },
  "chrono.now": { en: "Now", pl: "Teraz" },
  "chrono.future": { en: "Not yet", pl: "Jeszcze nie" },
  "chrono.aria": { en: "Timeline of work and activities", pl: "Oś czasu pracy i działalności" },
  "chrono.detail": { en: "Selected entry", pl: "Wybrany wpis" },
  "quest.earlier": { en: "Earlier", pl: "Wcześniej" },
  "card.scrollable": { en: "{section}, scrollable", pl: "{section}, przewijane" },
  // Projects
  "proj.loading": { en: "Loading projects from GitHub…", pl: "Wczytuję projekty z GitHuba…" },
  "proj.noDesc": { en: "No description yet.", pl: "Jeszcze bez opisu." },
  "proj.featured": { en: "Featured", pl: "Wyróżniony" },
  "proj.live": { en: "Live", pl: "Demo" },
  "proj.liveOf": { en: " site of {name}", pl: " projektu {name}" },
  "proj.star": { en: "star", pl: "gwiazdka" },
  "proj.stars": { en: "stars", pl: "gwiazdki" },
  "proj.updated": { en: "Updated {when}", pl: "Aktualizacja {when}" },
  "proj.justNow": { en: "Updated just now", pl: "Aktualizacja przed chwilą" },
  "proj.showing": { en: "Showing <b>{shown}</b> of <b>{total}</b>", pl: "Widać <b>{shown}</b> z <b>{total}</b>" },
  "proj.all": { en: "All repositories", pl: "Wszystkie repozytoria" },
  "proj.offline": { en: "Offline copy", pl: "Kopia offline" },
  "proj.viewGithub": { en: "View my GitHub", pl: "Zobacz mój GitHub" },
  "proj.emptyMark": { en: "Empty", pl: "Pusto" },
  "proj.emptyTitle": { en: "The board is empty", pl: "Tablica jest pusta" },
  "proj.emptyText": { en: "No public projects yet. New requests are on their way.", pl: "Na razie brak publicznych projektów. Nowe są w drodze." },
  "proj.restMark": { en: "Resting", pl: "Przerwa" },
  "proj.restTitle": { en: "The board is resting", pl: "Tablica odpoczywa" },
  "proj.restMinutes": {
    en: "GitHub's rate limit kicked in. The live feed returns in about {m} min, but every project is one click away.",
    pl: "GitHub włączył limit zapytań. Feed wróci za około {m} min, a każdy projekt jest o jedno kliknięcie stąd."
  },
  "proj.restSoon": {
    en: "GitHub's rate limit kicked in. The live feed returns soon, but every project is one click away.",
    pl: "GitHub włączył limit zapytań. Feed niedługo wróci, a każdy projekt jest o jedno kliknięcie stąd."
  },
  "proj.lostMark": { en: "No signal", pl: "Brak sygnału" },
  "proj.lostTitle": { en: "Signal lost", pl: "Utracono sygnał" },
  "proj.lostText": {
    en: "GitHub isn't answering right now. The projects are still there, waiting on my profile.",
    pl: "GitHub teraz nie odpowiada. Projekty wciąż czekają na moim profilu."
  },
  // Intro
  "intro.skip": { en: "Press any key", pl: "Naciśnij dowolny klawisz" },
  "intro.surfacing": { en: "Surfacing", pl: "Wynurzanie" },
  "intro.surface": { en: "Surface", pl: "Powierzchnia" },
  "intro.depth": { en: "Depth", pl: "Głębokość" },
  // Depths
  "depths.time": { en: "Time here", pl: "Czas tutaj" },
  "depths.panes": { en: "Panes broken", pl: "Zbite szyby" },
  "depths.panesN": { en: "{n} this visit", pl: "{n} podczas tej wizyty" },
  "depths.none": { en: "None yet", pl: "Jeszcze żadna" },
  "depths.weak": { en: "Weak spots found", pl: "Znalezione słabe punkty" },
  "depths.card0": { en: "Card 0", pl: "Karta 0" },
  "depths.found": { en: "Found", pl: "Znaleziona" },
  "depths.inDeck": { en: "Still in the deck", pl: "Wciąż w talii" },
  "depths.typed": { en: "Commands typed", pl: "Wpisane komendy" },
  "depths.noneTyped": { en: "None. Press ~", pl: "Brak. Naciśnij ~" },
  "depths.surface": { en: "Surface", pl: "Wypłyń" },
  // Hints dialog
  "hints.kicker": { en: "Side requests", pl: "Zadania poboczne" },
  "hints.title": { en: "Requests", pl: "Zadania" },
  "hints.lede": { en: "Nothing here is required. All of it is fun.", pl: "Nic z tego nie jest obowiązkowe. Wszystko jest dla zabawy." },
  "hints.close": { en: "Close", pl: "Zamknij" },
  "hints.play": { en: "Play now", pl: "Zagraj" },
  "hints.open": { en: "Open now", pl: "Otwórz" },
  "hints.dive": { en: "Dive now", pl: "Zanurkuj" },
  "hint.1.t": { en: "Order in the court", pl: "Proszę o spokój" },
  "hint.1.p": { en: "Click the name seven times in quick succession. Someone will have something to say.", pl: "Kliknij imię siedem razy pod rząd. Ktoś będzie miał coś do powiedzenia." },
  "hint.2.t": { en: "Pick me up", pl: "Podnieś mnie" },
  "hint.2.p": { en: "Press and hold the name until it lifts, then drag it anywhere. Double-click it or press Esc to send it home.", pl: "Przytrzymaj imię, aż się uniesie, i przeciągnij je w dowolne miejsce. Dwuklik albo Esc odsyła je na miejsce." },
  "hint.3.t": { en: "Handle with care", pl: "Ostrożnie, szkło" },
  "hint.3.p": { en: "The glass panels are fragile. Click one rapidly and the cracks spread. Keep going and it gives.", pl: "Szklane panele są kruche. Klikaj szybko, a pęknięcia się rozejdą. Nie przestawaj, a szyba puści." },
  "hint.4.t": { en: "Night music", pl: "Nocna muzyka" },
  "hint.4.p": { en: "The equalizer button plays lo-fi generated live in your browser, with a new progression every day.", pl: "Przycisk z equalizerem gra lo-fi generowane na żywo w przeglądarce, z nową progresją każdego dnia." },
  "hint.5.t": { en: "Rewind", pl: "Przewiń wstecz" },
  "hint.5.p": { en: 'The <span class="hint-key">&#8634;</span> button repairs every broken pane, sends the name home and turns the lights back on.', pl: 'Przycisk <span class="hint-key">&#8634;</span> naprawia każdą szybę, odsyła imię na miejsce i z powrotem zapala światła.' },
  "hint.6.t": { en: "Catch and release", pl: "Złap i wypuść" },
  "hint.6.p": { en: "One of the butterflies drifting past can be caught. Be patient, then be quick.", pl: "Jednego z przelatujących motyli da się złapać. Najpierw cierpliwość, potem refleks." },
  "hint.7.t": { en: "Between days", pl: "Między dniami" },
  "hint.7.p": { en: "There is an hour hidden between one day and the next. Midnight isn't the only way in. Knock on the clock three times.", pl: "Między jednym dniem a drugim ukrywa się godzina. Północ to nie jedyne wejście. Zapukaj w zegar trzy razy." },
  "hint.8.t": { en: "Turn back the clock", pl: "Cofnij zegar" },
  "hint.8.p": { en: 'Grab the big moon clock and turn it. The face moves the hours, the outer rings move the days and the moon with them. The <span class="hint-key">&#8634;</span> button brings you back to now.', pl: 'Chwyć duży księżycowy zegar i obróć go. Tarcza przesuwa godziny, zewnętrzne pierścienie dni, a z nimi księżyc. Przycisk <span class="hint-key">&#8634;</span> wraca do teraz.' },
  "hint.9.t": { en: "Debug session", pl: "Sesja debugowania" },
  "hint.9.p": { en: "The Skills chapter can run a battle test against real-world bugs. Every bug is weak to one skill. In the Dark Hour, bugs crawl out on their own.", pl: "Rozdział Umiejętności uruchamia test bojowy z prawdziwymi bugami. Każdy bug ma słabość do jednej umiejętności. W Dark Hour bugi wypełzają same." },
  "hint.10.t": { en: "Night session", pl: "Nocna sesja" },
  "hint.10.p": { en: 'Hold the equalizer button to play along with the lo-fi: kick, snare and melody on <span class="hint-key">D</span> <span class="hint-key">F</span> <span class="hint-key">J</span> <span class="hint-key">K</span>.', pl: 'Przytrzymaj przycisk z equalizerem i graj do lo-fi: stopa, werbel i melodia na <span class="hint-key">D</span> <span class="hint-key">F</span> <span class="hint-key">J</span> <span class="hint-key">K</span>.' },
  "hint.11.t": { en: "Full deck", pl: "Pełna talia" },
  "hint.11.p": { en: "Turn over every card in the Skills chapter. The deck isn't complete.", pl: "Odwróć każdą kartę w rozdziale Umiejętności. Talia nie jest kompletna." },
  "hint.12.t": { en: "Talk to the machine", pl: "Porozmawiaj z maszyną" },
  "hint.12.p": { en: 'There is a console behind the page. Press <span class="hint-key">~</span> to open it, then type <span class="hint-key">help</span>. Not every command is on the list.', pl: 'Za stroną kryje się konsola. Naciśnij <span class="hint-key">~</span>, a potem wpisz <span class="hint-key">help</span>. Nie każda komenda jest na liście.' },
  "hint.13.t": { en: "Deep end", pl: "Na głęboką wodę" },
  "hint.13.p": { en: "Below the menu the page keeps going down into the water, one chapter deeper at a time. Scroll all the way to the bottom.", pl: "Pod menu strona schodzi pod wodę, rozdział po rozdziale coraz głębiej. Przewiń na sam dół." },
  // Document title
  "title.base": { en: "Pietro Molendys · Portfolio", pl: "Pietro Molendys · Portfolio" },
  "title.section": { en: "{section} · Pietro Molendys", pl: "{section} · Pietro Molendys" }
};

/** Every interface string, for the tests (both languages present, same placeholders). */
export const STRINGS = UI;

/** Interface string for `key` with {var} substitution. Unknown keys return the key. */
export function t(key, vars = {}) {
  const entry = UI[key];
  const text = entry ? entry[lang] ?? entry.en : key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/** "2026-10" -> "Oct 2026" / "paź 2026" (`style` "long": "October 2026" / "październik 2026"). */
export function formatMonth(ym, to = lang, style = "short") {
  const [year, month] = String(ym).split("-").map(Number);
  if (!year || !month) return String(ym);
  const tag = to === "pl" ? "pl-PL" : "en-GB";
  const date = new Date(Date.UTC(year, month - 1, 1));
  if (to === "pl") {
    // Polish months stand alone in the nominative ("paź", "październik"), not "października".
    const name = new Intl.DateTimeFormat(tag, { month: style === "long" ? "long" : "short", timeZone: "UTC" })
      .formatToParts(date)
      .find((part) => part.type === "month")?.value;
    return `${style === "long" ? PL_MONTHS[month - 1] : name ?? month} ${year}`;
  }
  return new Intl.DateTimeFormat(tag, { month: style === "long" ? "long" : "short", year: "numeric", timeZone: "UTC" }).format(date);
}

const PL_MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

/** A role's period: "Oct 2026 – now", "May 2026" (one month), "Jul – Oct 2026" (same year). */
export function formatPeriod(from, until, to = lang) {
  const now = to === "pl" ? "obecnie" : "now";
  if (!until) return `${formatMonth(from, to)} – ${now}`;
  if (from === until) return formatMonth(from, to);
  const [fromYear] = from.split("-");
  const [untilYear] = until.split("-");
  if (fromYear === untilYear) {
    const start = formatMonth(from, to).replace(` ${fromYear}`, "");
    return `${start} – ${formatMonth(until, to)}`;
  }
  return `${formatMonth(from, to)} – ${formatMonth(until, to)}`;
}

/** Polish plural form picker: one / few (2-4, not 12-14) / many. */
export function plural(n, forms) {
  if (lang !== "pl") return n === 1 ? forms.one : forms.other ?? forms.many;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few;
  return forms.many;
}

/** Refresh every tagged node under `root` (index.html static copy). */
export function applyStatic(root = hasWindow ? document : null) {
  if (!root) return;
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml); // trusted: strings from UI above only
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    node.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":").map((part) => part.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    });
  });
}

export function init() {
  document.documentElement.lang = lang;
  applyStatic();
  onLang(() => applyStatic());
}
