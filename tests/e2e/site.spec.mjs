// The interactive site: loads clean, deep links, history, language, the CV and accessibility.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Collect console errors, page errors and failed same-origin requests for a test. */
function watch(page) {
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.hostname === "127.0.0.1") problems.push(`HTTP ${response.status()} ${url.pathname}`);
  });
  return problems;
}

const ready = (page) => page.waitForFunction(() => document.documentElement.classList.contains("is-complete"));

test.describe("interactive site", () => {
  test("loads with no errors @layout", async ({ page, isMobile }) => {
    const problems = watch(page);
    await page.goto("./?nointro");
    await ready(page);
    await expect(page.locator("h1")).toContainText("Pietro");
    // Desktop: one card that swaps content. Mobile: a stack with one card per section.
    await expect(page.locator(isMobile ? "#title-home" : "#card-title")).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("the intro surfaces from the deep and hands over to the page", async ({ page }) => {
    const problems = watch(page);
    await page.goto("./?intro");
    await expect(page.locator(".intro")).toHaveCount(1);
    await expect(page.locator(".intro-depth__value")).not.toHaveText("400", { timeout: 2000 });
    await expect(page.locator(".intro")).toHaveCount(0, { timeout: 6000 });
    await expect(page.locator("html")).not.toHaveClass(/intro-(playing|deep|pending)/);
    await expect(page.locator("#card-title, #title-home").first()).toBeAttached();
    expect(problems).toEqual([]);
  });

  test("any key skips the intro", async ({ page }) => {
    await page.goto("./?intro");
    await expect(page.locator(".intro")).toHaveCount(1);
    await page.keyboard.press("Space");
    await expect(page.locator(".intro")).toHaveCount(0, { timeout: 2000 });
    await expect(page.locator("html")).toHaveClass(/is-ready/);
  });

  test("a deep link lands on its chapter without the intro @layout", async ({ page }) => {
    await page.goto("./#projects");
    await expect(page.locator(".intro")).toHaveCount(0);
    await expect(page).toHaveTitle(/Projects/);
    await expect.poll(() => page.evaluate(() => {
      const el = document.getElementById("projects");
      return Math.abs(el.getBoundingClientRect().top) < 4;
    })).toBe(true);
  });

  test("the Experience chapter lists the current job first @layout", async ({ page, isMobile }) => {
    await page.goto("./#experience");
    await ready(page);
    if (isMobile) {
      await expect(page.locator("#experience .quest").first()).toContainText("Smart4Aviation");
    } else {
      await expect(page.locator("#experience .chrono-detail")).toContainText("Hackathon");
      await expect(page.locator('#experience .chrono-item[data-quest="smart4aviation"]')).toHaveClass(/is-current/);
    }
  });

  test("the menu cuts to a chapter, the URL follows and Back returns", async ({ page }) => {
    await page.goto("./?nointro");
    await ready(page);
    await page.locator('.menu-item[data-section="skills"]').click();
    await expect(page).toHaveURL(/#skills$/);
    await expect(page.locator("#skills .arcana-slot")).toHaveCount(8);
    await expect.poll(() => page.evaluate(() => Math.abs(document.getElementById("skills").getBoundingClientRect().top) < 4)).toBe(true);
    await page.locator('.story-rail [data-goto="contact"]').click();
    await expect(page).toHaveURL(/#contact$/);
    await page.goBack();
    await expect(page).toHaveURL(/#skills$/);
    await expect.poll(() => page.evaluate(() => Math.abs(document.getElementById("skills").getBoundingClientRect().top) < 4)).toBe(true);
    await page.locator(".story-rail__top").click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("turning every skill card deals card 0", async ({ page, isMobile }) => {
    test.skip(isMobile, "same deck on phones; one layout is enough");
    await page.goto("./#skills");
    await ready(page);
    const cards = page.locator("#skills .arcana-slot .skill");
    for (let i = 0; i < 8; i++) await cards.nth(i).click();
    await expect(page.locator("#skills .fool-stage")).toBeVisible({ timeout: 3000 });
  });

  test("the skip link moves focus without leaving the chapter", async ({ page }) => {
    await page.goto("./#skills");
    await ready(page);
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/#skills$/);
    await expect(page.locator("#skills-title")).toBeFocused();
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(4);
  });

  test("the language switch translates the page and is remembered", async ({ page }) => {
    await page.goto("./?nointro");
    await ready(page);
    await page.locator(".lang-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");
    await expect(page.locator('.menu-item[data-section="skills"] .menu-text')).toHaveText("Umiejętności");
    await expect(page.locator("#about-title")).toHaveText("O mnie");
    await expect(page.locator(".cv-link")).toHaveAttribute("href", "cv/pl/");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");
    await expect(page.locator(".status-line")).toContainText("Kraków");
  });

  test("?plain sends visitors to the one-page CV", async ({ page }) => {
    await page.goto("./?plain");
    await expect(page).toHaveURL(/\/cv\/$/);
    await expect(page.locator("h1")).toContainText("Molendys");
  });

  test("phones get the same chapters in the same order @mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout only");
    await page.goto("./?nointro");
    await ready(page);
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll(".story > .chapter")).map((el) => el.id));
    expect(ids).toEqual(["about", "experience", "hacknation", "projects", "skills", "education", "contact"]);
    await expect(page.locator(".depths")).toBeAttached();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator(".story-rail__top")).toBeVisible();
  });

  for (const id of ["about", "experience", "projects", "skills", "contact"]) {
    test(`the ${id} chapter is accessible`, async ({ page }) => {
      await page.goto(`./#${id}`);
      await ready(page);
      await page.waitForTimeout(900);
      const results = await new AxeBuilder({ page }).include(`#${id}`).disableRules(["color-contrast"]).analyze();
      const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }

  test("the scrubbed chronograph shows the past halfway through its chapter", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop only");
    await page.goto("./?nointro");
    await ready(page);
    await page.evaluate(() => {
      const el = document.getElementById("experience");
      const top = el.getBoundingClientRect().top + scrollY;
      window.scrollTo({ top: top + (el.offsetHeight - innerHeight) * 0.3, behavior: "instant" });
    });
    await expect(page.locator('#experience .chrono-item[data-quest="hacknation-2026"]')).toHaveClass(/is-future/);
  });

  test("has no serious accessibility violations on the welcome card", async ({ page }) => {
    await page.goto("./?nointro");
    await ready(page);
    await page.waitForTimeout(1200); // let the entrance settle
    const results = await new AxeBuilder({ page })
      .include(".shell")
      .include(".hud")
      .disableRules(["color-contrast"]) // text sits on a live shader; checked by hand per DESIGN.md §11
      .analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

test.describe("the descent", () => {
  test("scrolling down goes through every chapter to the Depths @layout", async ({ page, isMobile }) => {
    const problems = watch(page);
    await page.goto("./?nointro");
    await ready(page);
    if (isMobile) {
      await expect(page.locator(".story > .chapter")).toHaveCount(7);
      return;
    }
    const html = page.locator("html");
    await page.evaluate(() => document.querySelector("#experience").scrollIntoView({ behavior: "instant" }));
    await expect(html).toHaveAttribute("data-story", "");
    await expect(page.locator('.story-rail [data-goto="experience"]')).toHaveClass(/is-active/);
    await expect(page).toHaveURL(/#experience$/);
    // Halfway through the pinned quest log the clock is somewhere in the past.
    await page.evaluate(() => {
      const el = document.querySelector("#experience");
      const top = el.getBoundingClientRect().top + scrollY;
      window.scrollTo({ top: top + (el.offsetHeight - innerHeight) * 0.4, behavior: "instant" });
    });
    await expect(page.locator(".quests-year")).toHaveText(/^20\d\d$/);
    // The bottom is the Depths.
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await expect(html).toHaveAttribute("data-depths", "");
    await expect(page.locator("#depths-title")).toBeVisible();
    // Back to the surface.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(html).not.toHaveAttribute("data-story", "");
    expect(problems).toEqual([]);
  });

  test("the wheel over the card scrolls the page down", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop only");
    for (const hash of [""]) {
      await page.goto(`./?nointro${hash}`);
      await ready(page);
      const card = await page.locator(".card-stage .content-card").boundingBox();
      await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
      for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 120);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    }
  });

  test("the menu folds into the rail as the title screen leaves", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop only");
    await page.goto("./?nointro");
    await ready(page);
    await page.waitForFunction(() => document.documentElement.classList.contains("menu-ready"));
    const vh = await page.evaluate(() => innerHeight);
    const at = async (hero) => {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(hero * vh));
      await page.waitForTimeout(120);
    };
    await at(0.1);
    await expect(page.locator(".menu")).toBeVisible();
    await expect(page.locator(".story-rail")).toBeHidden();
    // Just after the fold starts each rail label sits on its menu item.
    await at(0.26);
    const offsets = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".story-rail__link"))
        .filter((link) => link.dataset.goto !== "depths")
        .map((link) => {
          const n = link.querySelector(".story-rail__name").getBoundingClientRect();
          const m = document.querySelector(`.menu-item[data-section="${link.dataset.goto}"] .menu-text`).getBoundingClientRect();
          return Math.max(Math.abs(n.left - m.left), Math.abs(n.top - m.top));
        })
    );
    expect(Math.max(...offsets)).toBeLessThan(24);
    await at(1);
    await expect(page.locator("html")).toHaveAttribute("data-folded", "");
    await expect(page.locator(".story-rail")).toBeVisible();
  });

  test("phones never scroll sideways @mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout only");
    await page.goto("./?nointro");
    await ready(page);
    for (const f of [0, 0.3, 0.6, 1]) {
      await page.evaluate((k) => window.scrollTo(0, document.documentElement.scrollHeight * k), f);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
  });

  test("the metrics count to the real numbers", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop only");
    await page.goto("./?nointro");
    await ready(page);
    await page.evaluate(() => {
      const el = document.querySelector("#hacknation");
      const top = el.getBoundingClientRect().top + scrollY;
      window.scrollTo({ top: top + el.offsetHeight - innerHeight, behavior: "instant" });
    });
    await expect(page.locator(".metric__value").first()).toHaveText("0.9981");
  });

  test("the descent is accessible", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop only");
    await page.goto("./?nointro");
    await ready(page);
    const results = await new AxeBuilder({ page }).include(".story").include(".story-rail").disableRules(["color-contrast"]).analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

test.describe("CV page", () => {
  for (const [path, lang] of [["cv/", "en"], ["cv/pl/", "pl"]]) {
    test(`${path} is complete, clean and accessible @layout`, async ({ page }) => {
      const problems = watch(page);
      await page.goto(`./${path}`);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("h1")).toContainText("Pietro");
      await expect(page.locator(".cv-project")).toHaveCount(5);
      await expect(page.locator('a[href^="mailto:"]').first()).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id} (${v.impact})`)).toEqual([]);
      expect(problems).toEqual([]);
    });
  }
});
