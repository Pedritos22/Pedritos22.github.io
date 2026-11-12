# Design system: "Dark Hour" portfolio

The art direction, tokens, motion rules and architecture for this site. Anyone changing
the site (human or agent) works from this file. Tokens live in `css/base.css` and
`js/motion.js` and must stay in sync with the values here.

---

## 1. Vision

**A pause menu from a late-night JRPG that never existed.** Deep-sea blue, moonlight on
water, a city asleep, and a hidden hour between one day and the next. The page should
feel **kinetic, confident and crisp**: big slanted type, hard diagonal cuts, snappy
transitions with weight, and sound that lands on the frame of impact.

Quality bar: **every frame looks like a screenshot from a shipped game.** That includes
the frames in the middle of a transition. Nothing wobbly, blurry, misaligned or
placeholder-looking ever reaches the screen.

### Inspired by, never copied
The mood is inspired by the menus of Persona 3 Reload. **We never use the game's assets**:
no logos, characters, screenshots, music, sound effects, fonts or names of in-game
places or people. Everything is original: procedural, hand-written SVG, synthesized
audio, or the owner's own files. Generic motifs are fine (moon, clock, tarot-like cards,
butterflies, a tower on the skyline, water caustics, a calendar HUD); specific
copyrighted designs are not.

**Technology marks** (Python, Docker, Git, ...) are the one exception to "no logos": they
identify what a skill card stands for and live only in `js/marks.js` (Simple Icons paths,
CC0, or our own silhouettes), drawn in one colour from the card's tokens. A brand colour
appears only faintly on the back of a card, through `--brand`; the Dark Hour replaces it.

---

## 2. Color

Defined as CSS custom properties on `:root` in `css/base.css`. Always use tokens; never
hard-code a hex value in component CSS.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#020713` | deepest background, text shadows |
| `--abyss` | `#041026` | panel base |
| `--night` | `#061a3a` | panel gradient end, HUD plates |
| `--deep` | `#0b2f78` | strong panel tint, selected plates |
| `--blue` | `#0455ff` | electric blue: primary buttons, active plates |
| `--blue-soft` | `#4f9fff` | inactive menu text, secondary type |
| `--cyan` | `#46d8ff` | focus, highlights, kicker text, glints |
| `--ice` | `#bfe9ff` | glass, specular, hairlines |
| `--paper` | `#f7fbff` | primary text, selected menu text |
| `--hot` | `#ff6c8e` | **menu cursor and primary hover only** |
| `--red` | `#d9092d` | the diagonal slash, kicker diamonds, destructive moments |
| `--gold` | `#ffd34d` | moon glow, rank pips, rare highlights |

Text alphas: `--text-1` (paper), `--text-2` (78 %), `--text-3` (56 %), `--line` (16 %).

**Proportions per screen:** about 70 % blues, 20 % paper, 7 % cyan, 3 % hot/red/gold.
If pink or red covers more than a few percent of a frame, it is wrong.

Body text needs a contrast ratio of at least 4.5:1 against its plate. Do not set body
copy below `--text-2`.

### Dark Hour palette (`html[data-darkhour]`)
Between 00:00 and 00:59 local time (or via the secret trigger) the world turns sickly
green, the moon swells and goes yellow-green, city windows die and the tower rises.
Components switch automatically because `base.css` redefines the tokens:

| Token | Dark Hour value |
|---|---|
| `--blue` | `#13a35a` |
| `--blue-soft` | `#7fdc8f` |
| `--cyan` | `#c8ff6a` |
| `--deep` | `#0f3d24` |
| `--night` | `#06170e` |
| `--abyss` | `#030d08` |
| `--gold` | `#e9f59a` |
| `--hot` | `#ff4060` |
| `--red` | `#a3001f` |

Extra Dark Hour tokens: `--dh-sky: #0b2414`, `--dh-glow: #a8ff60`, `--dh-blood: #5a0012`.
Use them only inside `html[data-darkhour]` rules.

---

## 3. Typography

Fonts are self-hosted from `assets/fonts` (see `css/fonts.css`), latin and latin-ext.

| Role | Family | Use |
|---|---|---|
| Display | **Anton** | names, section titles, watermark words |
| Menu | **Bebas Neue** | main menu items |
| HUD / labels | **Barlow Condensed** 600/800, usually *italic* | HUD, kickers, numbers, tags, buttons |
| Body | **Inter** (variable 400–900) | paragraphs, list values |
| Code | system monospace (`--font-code`) | one-line code on the arcana cards, sprite labels |

Fluid type scale (major third, 1.25), as tokens `--fs-*` in `base.css`:

| Token | Size | Typical use |
|---|---|---|
| `--fs-xs` | 12 px | micro labels (always uppercase + tracking) |
| `--fs-sm` | 14 px | labels, HUD secondary |
| `--fs-md` | 16 px | body (min) |
| `--fs-lg` | 18–20 px | lead paragraph |
| `--fs-xl` | 25–31 px | card subtitles, skill names |
| `--fs-2xl` | 39–49 px | small display |
| `--fs-3xl` | 49–76 px | section titles |
| `--fs-4xl` | 61–119 px | menu items, nameplate |
| `--fs-mega` | 110–300 px | watermark words |

Rules:
- Uppercase labels are tracked: `letter-spacing: 0.16em` to `0.2em`. Display type: `0` to `-0.01em`.
- Line height: display `0.86`, labels `1.1`, body `1.65`.
- Max measure for paragraphs: `56ch`.
- Never fake bold or italic: use the loaded weights and styles only.
- Numbers in the HUD use `font-variant-numeric: tabular-nums`.

---

## 4. Space and geometry

**Spacing:** 4 px base. Tokens `--s-1` to `--s-9` = 4, 8, 12, 16, 24, 32, 48, 64, 96 px.
Paddings and gaps come from this scale only.

**Angles.** The composition uses two angles:
- `--tilt-major: -8deg`: the dominant diagonal (the red slash, transition wipes, menu cursor).
- `--tilt-minor: 4deg`: the counter angle (cards, HUD plates, the tarot cards' rest pose).

Half values (`-4deg`, `2deg`) are allowed for subtle offsets. **No other angles.**
Skews follow the same values.

**Shapes.** Hard edges only, cut with `clip-path: polygon()`. The only rounded shapes
are true circles (moon, emblem, pips). No `border-radius` on rectangles.

**Clip-path and focus.** `clip-path` also clips outlines. Any clipped focusable element
needs its focus indicator drawn **inside** the clip (an inset `box-shadow`, or a
pseudo-element) or on an unclipped wrapper. Always verify focus-visible on screen.

---

## 5. Layers

`z-index` tokens in `base.css`. Use these tokens instead of raw numbers.

| Token | Value | Layer |
|---|---|---|
| `--z-bg` | 0 | WebGL background canvas |
| `--z-skyline` | 1 | procedural city skyline |
| `--z-fx` | 2 | butterflies, particles |
| `--z-grain` | 3 | scanlines / grain / slash overlays |
| `--z-shell` | 10 | main layout (menu, panel, emblem) |
| `--z-hud` | 30 | HUD, top tools |
| `--z-drag` | 40 | dragged nameplate |
| `--z-console` | 50 | system console (drops from the top, not modal) |
| `--z-overlay` | 60 | objection burst |
| `--z-shards` | 70 | flying glass shards |
| `--z-toast` | 75 | toasts |
| `--z-modal` | 80 | dialogs |
| `--z-intro` | 100 | intro sequence |

---

## 6. Motion

Motion is the soul of this site. It must feel **fast, weighted and intentional**.

### Tokens
| Name | CSS | GSAP (`js/motion.js`) | Use |
|---|---|---|---|
| micro | `--dur-1: 120ms` | `DUR.micro` | hover, press feedback |
| ui | `--dur-2: 240ms` | `DUR.ui` | small UI changes, menu cursor |
| panel | `--dur-3: 420ms` | `DUR.panel` | section transitions, dialogs |
| scene | `--dur-4: 700ms` | `DUR.scene` | hero entrances, intro beats |

| Easing | CSS | GSAP | Use |
|---|---|---|---|
| snap | `--ease-snap: cubic-bezier(0.86, 0, 0.07, 1)` | `EASE.snap` | wipes, slams, anything that cuts across the screen |
| out | `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` | `EASE.out` | entrances |
| in | `--ease-in: cubic-bezier(0.7, 0, 0.84, 0)` | `EASE.in` | exits |
| spring | `--ease-spring` (`linear()` spring) | `EASE.spring` | cursor, settling, playful overshoot |

### Choreography rules
1. **Enter fast, exit faster.** An exit takes about 60 % of the matching entrance.
2. **Cascade at 30–40 ms** (`STAGGER`). A full cascade lasts at most about 400 ms.
3. **Everything is interruptible.** Use GSAP timelines with `overwrite: "auto"`, and kill
   the previous timeline when a new section is chosen. Rapid clicking must never break layout.
   **Exception: the section transition** (wipe train, content cascade, sigil draw-in, slash and
   sweep, Projects cascade) runs on the Web Animations API through `animate()` / `enterFrom()`
   in `js/motion.js` (`CSS_EASE` mirrors the tokens). Transform and opacity then animate on the
   compositor, so the content swap on the covered frame cannot stall them (this was the jank in
   Firefox). Track the returned animations and `cancel()` them to interrupt. Moves use the
   individual `translate` / `scale` properties, so they stack under an element's own transform.
4. **Animate only `transform`, `opacity`, `clip-path`** (and `filter` sparingly, never on
   large areas every frame). Never animate layout properties.
5. **Idle motion is subtle:** loops of 4 s or longer, amplitude of 4 px or 1.5° at most.
6. **Hover feedback starts within 120 ms.** No hover effect without a matching
   focus-visible effect.
7. **Sound lands on impact.** Play SFX on the frame the visual hits (a wipe's whoosh at
   the wipe start, the confirm when the cursor lands), not on pointerdown.
8. **One hero per moment.** During a section transition the panel is the star, and
   background effects must not compete (no butterfly bursts mid-wipe).

### Reduced motion (`prefers-reduced-motion: reduce`)
- No translation, rotation or scale of more than a few px. Crossfades of 200 ms or less.
- The shader renders one static frame, there are no particles or butterflies, and the
  intro becomes a 400 ms fade.
- Easter eggs still work, with simplified visuals (shatter becomes a fade-out with
  cracks; objection is a static card).
- Check: `import { prefersReducedMotion, onReducedMotionChange } from "./core.js"`.

---

## 7. Procedural content

Shared generators live in `js/proc/` (tests: `node --test tests/proc.test.mjs`).
- `rng.js`: `createRng(seed)` with `next/range/int/pick/weighted/gaussian/shuffle/fork`,
  plus `hashString` and `seedFromDate`.
- `noise.js`: `createNoise(seed)` with `noise2/noise3/fbm2/fbm3/curl2`.
- `voronoi.js`: `impactSites`, `voronoiCells`, `cellEdges`, `toClipPath`, `toSvgPath`, `insetPolygon`.

Rules:
- Stable visuals use seeded RNG: sigils are seeded by skill name; skyline, butterfly
  patterns and the music progression by `daySeed(label)` from `core.js`. Never use
  `Math.random` for them.
- Ephemeral FX (shards, sparks, particles) may use `Math.random`.
- Generate once, then cache (memoize by seed, render to an offscreen canvas or SVG string).
- `?seed=foo` overrides the daily seed for QA.

---

## 8. Performance budget

- One full-screen WebGL canvas at most. Render at ≤ 0.5× resolution with DPR capped at
  1.5, and keep shader cost ≤ 4 ms/frame on an integrated GPU.
- Every `requestAnimationFrame` loop pauses while `document.hidden` (use `rafLoop` from
  `core.js`) and when its layer is offscreen or disabled.
- No `backdrop-filter` on elements that animate. No `box-shadow` animation on large elements.
- No layout thrash: read the layout once, then write; never read layout inside a loop
  that writes styles.
- Lighthouse targets of ≥ 95 for Performance, Accessibility, Best Practices and SEO.
  CLS ≈ 0.
- `?nofx` turns off heavy effects (for QA and old devices). Also auto-disable them when
  WebGL is unavailable.

---

## 9. Accessibility

- Full keyboard parity. The menu uses arrow keys only while focus is inside the menu.
  Enter and Space activate exactly once. Focus is always visible.
- Dialogs use `<dialog>` with `showModal()`.
- Decorative layers are `aria-hidden="true"` and `pointer-events: none`, unless they are
  an interactive easter egg.
- Section changes are announced once (an `aria-live="polite"` region on the card title).
- Never convey information by color or motion alone.

---

## 10. Architecture

No build step. ES modules served as-is (local preview: `python3 -m http.server`).

```
index.html            markup + mount points; loads vendor/gsap/*.min.js (defer), then js/main.js (module)
css/fonts.css         @font-face (generated)
css/base.css          tokens, reset, body, global layers, reduced-motion
css/layout.css        shell grid, columns, footer, responsive layout
css/menu.css          nameplate, menu, cursor
css/panel.css         content card, details, arcana cards, actions, transitions
css/hud.css           HUD (date/moon/time) + audio/tool controls
css/overlays.css      objection, hints dialog, toasts, intro, name drag states
css/glass.css         cracks + shards
css/effects.css       background canvas, skyline, butterflies, emblem, Dark Hour scenery
css/projects.css      projects section
css/battle.css        Debug Battle dialog, sprites, crawler
css/rhythm.css        Night Session dialog and highway
css/dive.css          the dive: rest positions above / below the water, the Depths layer
css/terminal.css      system console
js/main.js            imports and init()s every module, each wrapped in try/catch
js/core.js            event bus (EVT), state, flags, media queries, moonPhase, daySeed, rafLoop
js/motion.js          gsap + SplitText + CustomEase, DUR, EASE, STAGGER; WAAPI helpers (CSS_EASE, animate, enterFrom)
js/content.js         all copy and section data (single source of truth)
js/sections.js        card rendering + section transitions (+ mobile stack)
js/menu.js            menu state, cursor, keyboard navigation
js/sigils.js          procedural arcana sigils (SVG); { hub: true } puts a medallion in the centre
js/arcana.js          Skills cards: markup, deal from the deck, holo sheen, typed spells, card 0 (The Fool)
js/marks.js           technology marks for the cards and battle commands (the only brand marks)
js/hud.js             HUD + tool buttons + audio controls UI
js/intro.js           intro sequence
js/hints.js           hints dialog
js/shatter.js         glass fracture engine (cracks, Voronoi shards)
js/name-drag.js       hold-to-drag nameplate
js/objection.js       objection overlay
js/darkhour.js        Dark Hour state + triggers
js/background.js      WebGL water / light background
js/skyline.js         procedural city + tower
js/butterflies.js     procedural butterflies
js/emblem.js          clock/moon emblem on the right
js/timedial.js        time dial: drag the emblem (or use it as a slider) to move the world clock
js/time-math.js       pure time helpers: dial maths, shift formatting, window/twilight/daylight curves
js/sfx.js             sound effects API
js/lofi.js            generative lo-fi engine API
js/projects.js        GitHub projects section
js/battle.js          Debug Battle dialog (Skills card button, Dark Hour crawler)
js/battle-logic.js    battle rules: bugs, weak spots, damage, ranks (pure, tested)
js/fx/bug-art.js      bug sprites: one silhouette per bug, cel shading, every expression (pure, tested)
js/rhythm.js          Night Session rhythm game (hold the lo-fi button, or hint 10)
js/rhythm-logic.js    rhythm chart, judging and scoring (pure, tested)
js/dive.js            the dive: scroll past the desktop page to go under the water (the Depths)
js/terminal.js        system console UI (~ opens it) and its browser context
js/terminal-logic.js  console tokenizer, history, completion and the command table (pure, tested)
js/toast.js           toasts: one slanted plate in the lower left, aria-live
js/extras.js          secrets left out of the hints: Konami code, away tab title, DevTools greeting
js/proc/*             seeded RNG, noise, Voronoi
js/fx/*               atmosphere helpers: water shader, moon/dial/city/butterfly art, slash, palette (tokens for canvas/GLSL), pointer
js/glyphs.js          small line icons used in card rows
404.html + css/404.css  standalone not-found page (absolute paths; served by GitHub Pages for any missing URL)
assets/favicon-away.svg the sleeping moon shown in the tab while the visitor is away (js/extras.js)
assets/og-image.png   social preview, rendered from the live page (1200x630)
```

QA-only URL flags (harmless in production): `?moonphase=0..1` (emblem), `?moon=0..1` and
`?hudtime=HH:MM` (HUD), `?fxbench` (shader timing hooks), `?perfprobe` or `?perfprobe=<rounds>`
(clicks through every section and logs frame times per transition: p50 / p95 / max, frames
over 25 and 50 ms; `js/perfprobe.js`, loaded only with the flag).

### Contracts
- **Events:** `EVT` in `core.js`. Payloads are documented there.
- **Shared state:** `state.introDone`, `state.section`, `state.darkhour`, `state.depths`,
  `state.console`. Use `afterIntro(fn)` to run entrance animations.
- **SFX API** (`sfx.js`): `sfx.hover() click() confirm() back() whoosh() crack(stage) glass() objection() dialog(open) tick() bell() toast()`,
  battle: `sfx.hit(kind) hurt() finisher()` (`kind`: normal, crit, weak, resist),
  plus `sfx.setMuted(bool)`, `sfx.isMuted()` and `sfx.unlock()`.
- **Lo-fi API** (`lofi.js`): `lofi.start() stop() toggle() isPlaying() setVolume(0..1) getVolume() getAnalyser()`
  (`getAnalyser()` returns an `AnalyserNode` while playing, otherwise `null`), and
  `onPlan(handler)`: the engine plans every bar one bar ahead and tells listeners
  `{ bar, barStart, sixteenth, bpm, events: [{ type, step, time, midi, velocity }] }` on the
  AudioContext clock (the rhythm game charts from it). Returns an unsubscribe function.
- **Shatter API** (`shatter.js`): `makeFracturable(root)`, `shatter(element, {x, y})`,
  `resetAllFractures()`.
- **Sections:** `content.js` exports `SECTIONS` (ordered) and `HOME`. A section may define
  `render(container)` for custom content (Projects uses it). `sections.js` exports
  `showSection(name)`, `showHome()` and `getSectionNames()`.
- **Scene pause:** an opaque full-screen overlay calls `pauseScene(true)` / `pauseScene(false)`
  (`core.js`); every `rafLoop` skips its frames meanwhile, except loops started with
  `rafLoop(tick, { always: true })` (the overlay's own).
- **World clock:** read the time with `now()` from `core.js`, never `new Date()`, for anything
  the visitor sees (HUD, hands, moon phase, city windows, twilight, the Dark Hour). The time dial
  moves it with `setVirtualTime(date | null, { transient })`, which emits `EVT.TIME`
  `{date, virtual, transient}`; side effects (the Dark Hour) wait for a non-transient event.
  `timeShift()` is the offset in ms. `emblem.js` exports `turnDial(zone, deg)` and
  `dialGeometry()` for the dial; `timedial.js` exports `returnToNow()`.
  `.panel-wrap` and `.card-stage` are `pointer-events: none` on desktop so the uncovered parts
  of the emblem can be grabbed; the card turns them back on.
- **Debug Battle:** any `[data-battle]` button opens it (`battle.js` exports `openBattle({ first, from })`
  and `spawnCrawler()`). Attacks are the skills of the `arcana` section in `content.js` (each casts its
  `spell`); each bug in `battle-logic.js` names its weak and resisted skill, and a bug only appears when
  its weak skill is in the loadout. Every skill is the weak spot of exactly one bug and resisted by exactly
  one (tested). Discovered affinities persist in `localStorage` (`p3:battle:known`). Sprites carry every
  expression; `data-face` on `.battle__sprite` (`idle | hurt | dizzy | down`) picks one, and
  `data-clones` (0..3) reveals the Fork Bomb's copies.
- **Skills cards:** `content.js` skills are `{ name, mark, desc, spell }` (desc under ~50 characters,
  spell up to ~11 so it fits one line); `fool` is card 0, dealt once every card has been turned over in
  a visit. Finding it shows a `0` chip by the battle button for good (`localStorage` `p3:arcana:fool`).
- **Dark Hour:** `darkhour.js` exports `setDarkHour(active)`. It sets
  `html[data-darkhour]`, `state.darkhour` and emits `EVT.DARKHOUR`.
- **Toasts:** `toast.js` exports `toast(text, { kicker, sound })`. One at a time; a new one
  replaces the one on screen.
- **System console:** `terminal.js` exports `openConsole({ from })`, `closeConsole()`,
  `toggleConsole()` and `isConsoleOpen()`; it sets `state.console` and emits `EVT.CONSOLE`
  `{open}`. The `~` key (`event.code` Backquote) opens it after the intro, and so does any
  `[data-console]` button. Commands live in `terminal-logic.js` as `{ name, aliases, group,
  usage, desc, run(args, ctx), complete?, hidden? }`; `run` returns lines and reaches the page
  only through `ctx`, so the table is tested in node (`tests/terminal.test.mjs`). `hidden`
  commands stay off `help`. History persists in `localStorage` (`p3:console:history`).
  Commands that open a modal close the console first.
- **The dive:** `dive.js` exports `dive()`, `surface()` and `canDive()` (desktop, after the
  intro, no dialog). It sets `html[data-depths]` and `state.depths`, makes `.shell` inert, and
  emits `EVT.DIVE` `{depth, preview}`: `preview: true` while the wheel pulls (depth 0..0.08,
  or 1..0.92 on the way up), `false` on a commit (0 or 1). Rest positions for both states live
  in `css/dive.css`; a transition animates from wherever things are to the new rest, so it can
  be interrupted. The shader reads it as `uDepth` (no extra noise evaluations). Any
  `[data-dive]` button dives; `EVT.RESET` and a section change surface.
- **God mode:** `battle.js` exports `armGodMode()` (the Konami code in `extras.js`): the next
  run takes no damage and ends on rank ∞.

---

## 11. Review rubric

Run this before calling anything done. Review it on screenshots at 1440×900, 1280×720 and
390×844, and on 50 ms filmstrips of every transition.

1. **Alignment:** optical left edges line up and baselines sit on a rhythm. Nothing is 1–3 px off.
2. **Spacing:** every gap comes from the scale. Similar things have equal gaps.
3. **Angles:** every diagonal is −8°, 4° or a half value.
4. **Contrast:** body text is ≥ 4.5:1 and labels are legible on every background frame (the shader moves).
5. **Edges:** no blurry text from fractional transforms at rest. No jagged clip-paths at rest.
6. **Motion:** no frame in a filmstrip looks broken. No content pops in without a transition.
   No layout jumps. Interrupting a transition mid-way recovers cleanly.
7. **States:** hover, focus-visible, active, disabled, loading, empty and error all exist and look designed.
8. **Mobile:** no horizontal scroll, tap targets ≥ 44 px, nothing hidden behind the HUD.
9. **Dark Hour:** every component reads well in the green palette.
10. **Reduced motion:** the page is calm but still beautiful.
11. **Console:** zero errors, zero 404s.
