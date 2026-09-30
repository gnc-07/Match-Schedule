// Opens the site in each of the three browser engines that nearly every visitor uses, and checks that it loads and works
// the same way in all of them:
//   chromium  Chrome, Edge, Opera, Brave and Samsung Internet are all built on it
//   firefox   Firefox (its own engine, Gecko)
//   webkit    Safari on Mac, and every browser on an iPhone or iPad (Apple requires WebKit there, even for Chrome)
// Installed copies of Google Chrome and Microsoft Edge can be added by name: node tests/browsers.mjs chrome edge
//
// In each browser, at 390px (a phone, with touch), 1280px (a laptop) and 1920px (a monitor), in English and Portuguese:
// the list draws, nothing runs off the side of the screen, the right layout is chosen, the fonts load, controls are
// large enough, and the page reports no script errors or Content-Security-Policy violations. Then, at phone and laptop
// width, it uses the site the way a visitor would: theme button, Settings (text size, high contrast, language), league
// chips, dates, team search, stars, sources, match details (and Escape and Back), the F1 race weekend, the league tables,
// the Calendar menu and the keyboard. On a monitor, Match details beside the list must close without the list moving.
// The sample data in mock-data.mjs stands in for ESPN, Jolpica-F1 and Wikidata.
// A picture of each view is saved in screenshots/browsers/ to compare the browsers by eye.
//
// Run: node tests/browsers.mjs                  (chromium, firefox and webkit; a browser that is not installed is skipped)
//      node tests/browsers.mjs firefox webkit   (only those; a browser named here that is not installed is a failure)
// It exits with 0 when every check passed, 1 when one failed, and 3 when everything passed but a browser was skipped.
// Firefox and WebKit are Playwright's test builds: install them once with  npx playwright install firefox webkit
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { BASE, ROOT, chromePath, startServer } from "./server.mjs";
import { F1_WEEKEND, MATCH, mockRoutes, showMatch } from "./mock-data.mjs";

// The Chromium the other tests use (CHROME_PATH or a system copy), else Playwright's own
function localChromium() {
  try { return chromePath(); } catch { return undefined; }
}
const root = process.getuid?.() === 0 ? ["--no-sandbox"] : [];   // Chromium refuses to run as root without this
const ENGINES = {
  chromium: { type: chromium, name: "Chromium (Chrome, Edge, Opera, Brave)", launch: () => ({ executablePath: localChromium(), args: root }) },
  firefox: { type: firefox, name: "Firefox", launch: () => ({}) },
  webkit: { type: webkit, name: "WebKit (Safari, iPhone, iPad)", launch: () => ({}) },
  chrome: { type: chromium, name: "Google Chrome (installed)", launch: () => ({ channel: "chrome", args: root }) },
  edge: { type: chromium, name: "Microsoft Edge (installed)", launch: () => ({ channel: "msedge", args: root }) },
};
const asked = process.argv.slice(2);
const unknown = asked.filter(a => !ENGINES[a]);
if (unknown.length) {
  console.log(`Unknown browser: ${unknown.join(", ")}. Choose from: ${Object.keys(ENGINES).join(", ")}`);
  process.exit(2);
}
const picked = asked.length ? asked : ["chromium", "firefox", "webkit"];

const out = path.join(ROOT, "screenshots", "browsers");
mkdirSync(out, { recursive: true });
const WIDE = { 390: "", 1280: "side", 1920: "full" };   // the layout wideMode() in index.html picks at each width

// One browser window (a "context": its own storage, like a private window) at one width and language, with the
// sample data answering every outside request, and a record of script errors and blocked requests.
async function openPage(browser, engine, width, lang) {
  const phone = width < 600;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    hasTouch: phone,
    isMobile: phone && engine !== "firefox",   // Firefox has no phone mode in Playwright
    locale: lang === "pt" ? "pt-BR" : "en-CA",
    timezoneId: "America/Edmonton",
    colorScheme: "light",
    reducedMotion: "reduce",                    // check the settled page, not a panel halfway through arriving
  });
  await mockRoutes(context);
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", e => errors.push("script error: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console error: " + m.text()); });
  await page.goto(`${BASE}?lang=${lang}`, { waitUntil: "load" });
  await page.waitForSelector("#list .day");
  return { context, page, errors };
}

const must = (ok, message) => { if (!ok) throw new Error(message); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const count = (page, sel) => page.locator(sel).count();
const attr = (page, name) => page.evaluate(n => document.documentElement.getAttribute(n), name);

// Checks for every view: [name, check]
const viewChecks = [
  ["the list draws", async (page, { lang }) => {
    must(await count(page, "#list .match") > 0, "no matches in the list");
    must(!/Loading|Carregando/.test(await page.textContent("#stamp")), "the Updated line still says Loading");
    const want = lang === "pt" ? "pt-BR" : "en";
    must(await attr(page, "lang") === want, `page language is ${await attr(page, "lang")}, expected ${want}`);
  }],
  ["fits the screen", async page => {
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    must(scroll <= inner + 1, `the page is ${scroll}px wide in a ${inner}px window, so it scrolls sideways`);
  }],
  ["layout for this width", async (page, { width }) => {
    const got = (await attr(page, "data-wide")) || "";
    must(got === WIDE[width], `layout "${got || "single column"}", expected "${WIDE[width] || "single column"}"`);
  }],
  ["fonts load", async page => {
    const missing = await page.evaluate(async () => {
      await document.fonts.ready;
      return ['800 20px "Big Shoulders Display"', '400 16px "Instrument Sans"', '700 16px "Instrument Sans"']
        .filter(f => ![...document.fonts].some(ff => ff.status === "loaded" && f.includes(ff.family.replace(/"/g, ""))));
    });
    must(!missing.length, `font not loaded: ${missing.join(", ")}`);
  }],
  ["controls large enough", async page => {
    // 44px for buttons and fields, and 32px for the small inline icons the project rules allow (stars, the search clear
    // button). A few controls were already smaller than 44px when this test was written, in every browser alike; they are
    // listed here at their size then, so a browser that draws them smaller still is caught:
    //   the date range buttons 38px, the team search box 42px, the "Sources" toggles on each match 32px
    const small = await page.evaluate(() => {
      const LOWER = [["#range button", 38], ["#q", 42], [".srcs > summary", 32], [".star, .clear-q", 32]];
      const out = [];
      for (const el of document.querySelectorAll("button, summary, a.btn, select, input[type=search], input[type=date]")) {
        if (!el.checkVisibility?.()) continue;
        const h = el.getBoundingClientRect().height;
        const min = (LOWER.find(([sel]) => el.matches(sel)) || [, 44])[1];
        const name = el.id ? "#" + el.id : el.dataset.r ? `date button "${el.textContent.trim()}"` : el.className || el.tagName.toLowerCase();
        if (h && h < min - 1) out.push(`${name} ${Math.round(h)}px (needs ${min}px)`);
      }
      return [...new Set(out)];
    });
    must(!small.length, `controls shorter than required: ${small.slice(0, 6).join(", ")}${small.length > 6 ? ` and ${small.length - 6} more` : ""}`);
  }],
  ["search engines and the Data sources link", async (page, { lang }) => {
    // one canonical address, for the language shown, and a title in that language (search engines read both after the
    // script has run); the source names joined in the page's language and leading to "How it works"
    const [title, canon] = await page.evaluate(() => [document.title,
      [...document.querySelectorAll('link[rel="canonical"]')].map(l => l.href)]);
    must(canon.length === 1, `${canon.length} canonical links, expected 1`);
    must(lang === "pt" ? canon[0].endsWith("/?lang=pt") : canon[0].endsWith("/"), `canonical link ${canon[0]} is not the ${lang} page`);
    must(lang === "pt" ? title.includes("agenda de futebol") : title.includes("soccer and F1 schedule"), `title "${title}" is not in ${lang}`);
    const src = await page.textContent("#srclink");
    must(!(lang === "pt" && / and /.test(src)), `English "and" in the Portuguese source names: ${src}`);
    const before = page.url();
    await page.click("#srclink");
    must(page.url() === before, "the source names link changed the address (a Back step for Match details)");
    must(await page.evaluate(() => document.activeElement?.id) === "how-h", "the source names link did not move focus to How it works");
    await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });   // back as it was, for the picture taken next
  }],
];

// on phones the filters are folded away behind "Show filters": the steps that use them unfold them first
const unfold = async page => { if (!(await page.isVisible("#filters"))) await page.click("#sideshow"); };

// Things a visitor does, run at phone and laptop width in English: [name, steps]
const uid = MATCH.uid;
const actChecks = [
  ["theme button", async page => {
    const dark = () => page.evaluate(() => document.documentElement.classList.contains("is-dark"));
    const before = await dark();
    await page.click("#themebtn");
    must(await dark() !== before, "the theme did not change");
    await page.click("#themebtn");
    must(await dark() === before, "the theme did not change back");
  }],
  ["Settings: text size and high contrast", async page => {
    await page.click("#setmenu > summary");
    must(await page.locator("#setmenu").evaluate(d => d.open), "Settings did not open");
    await page.click('#setmenu input[name=size][value="large"]', { force: true });
    must(await attr(page, "data-size") === "large", "Large text was not applied");
    const zoom = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).zoom) || 1);
    must(Math.abs(zoom - 1.15) < 0.01, `Large text zoom is ${zoom}, expected 1.15 (the browser may not support CSS zoom)`);
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    must(scroll <= inner + 1, `with Large text the page scrolls sideways (${scroll}px in ${inner}px)`);
    await page.click('#setmenu input[name=size][value="normal"]', { force: true });
    await page.click("#hcbox", { force: true });
    must(await attr(page, "data-contrast") === "high", "High contrast was not applied");
    await page.click("#hcbox", { force: true });
    must(await attr(page, "data-contrast") !== "high", "High contrast did not switch off");
    await page.click("#setdone");
    must(!(await page.locator("#setmenu").evaluate(d => d.open)), "Close did not close Settings");
  }],
  ["Settings: language", async page => {
    await page.click("#setmenu > summary");
    await page.selectOption("#langsel", "pt");
    must(await attr(page, "lang") === "pt-BR", "choosing Português did not switch the page to Portuguese");
    must((await page.title()).includes("agenda de futebol"), "choosing Português did not translate the page title");
    must(await page.evaluate(() => document.querySelector('link[rel="canonical"]').href.endsWith("?lang=pt")),
      "choosing Português did not point the canonical link at the Portuguese page");
    await page.selectOption("#langsel", "en");
    must(await attr(page, "lang") === "en", "choosing English did not switch back");
    await page.click("#setdone");
  }],
  ["live scores find their fixtures", async page => {
    // ESPN's names for teams whose fixture names share no plain word with them: each needs an alias in js/live.js,
    // or its live scores never reach the list (Hamburg's did not, until "hamburger" was added)
    const pairs = [["Hamburger SV", "Hamburg SV"], ["1. FC Köln", "FC Cologne"], ["FC Bayern München", "Bayern Munich"],
      ["CA Mineiro", "Atlético-MG"], ["CA Paranaense", "Athletico-PR"], ["Wolverhampton Wanderers FC", "Wolves"]];
    const missed = await page.evaluate(ps => ps.filter(([ours, espn]) => !overlap(tokens(ours), tokens(espn))).map(p => p.join(" / ")), pairs);
    must(!missed.length, `live scores cannot match: ${missed.join(", ")}`);
  }],
  ["filters fold on phones", async page => {
    if (page.viewportSize().width > 640) return;   // laptops and monitors have the sidebar instead
    must(await page.isHidden("#filters"), "the filters are not folded away when the page opens");
    must(await page.isVisible("#sidesum"), "no summary of what is shown beside Show filters");
    await page.click("#sideshow");
    must(await page.isVisible("#chip-F1"), "Show filters did not unfold the filters");
    must(await page.getAttribute("#sideshow", "aria-expanded") === "true", "Show filters does not say it is expanded");
    must((await page.textContent("#sideshow")).trim() === "Hide filters", "the button does not read Hide filters once they are shown");
    await page.click("#sideshow");
    await page.waitForSelector("#filters", { state: "hidden", timeout: 3000 });
    must(await page.getAttribute("#sideshow", "aria-expanded") === "false", "Hide filters does not say it is collapsed");
  }],
  ["league chip", async page => {
    await unfold(page);
    const f1 = () => count(page, '#list [data-uid^="f1|"]');
    const before = await f1(), pressed = await page.getAttribute("#chip-F1", "aria-pressed");
    await page.click("#chip-F1");
    must(await page.getAttribute("#chip-F1", "aria-pressed") !== pressed, "the F1 chip did not switch");
    must(await f1() !== before, "switching the F1 chip did not change the list");
    await page.click("#chip-F1");
    must(await f1() === before, "switching the F1 chip back did not restore the list");
  }],
  ["date range", async page => {
    await unfold(page);
    await page.click('#range [data-r="week"]');
    must(await page.getAttribute('#range [data-r="week"]', "aria-pressed") === "true", "Next 7 days was not selected");
    await page.click('#range [data-r="custom"]');
    must(await page.isVisible("#daterange"), "Custom did not show the From and To dates");
    must(await page.getAttribute("#from", "type") === "date", "the From box is not a date field");
    await page.click('#range [data-r="all"]');
    must(await page.isHidden("#daterange"), "All did not hide the dates");
  }],
  ["team search", async page => {
    await unfold(page);
    const team = MATCH.home;
    await page.fill("#q", team);
    await wait(400);
    const texts = await page.locator("#list .match").allTextContents();
    must(texts.length > 0, `searching for ${team} found nothing`);
    must(texts.every(t => t.toLowerCase().includes(team.toLowerCase().split(" ")[0])), `searching for ${team} left other teams' matches`);
    await page.click("#clearq");
    must(await page.inputValue("#q") === "", "the clear button did not empty the search");
  }],
  ["star a team", async page => {
    const star = page.locator('#list .star[aria-pressed="false"]').first();
    const team = await star.getAttribute("data-team");
    await star.click();
    const sel = `#list .star[data-team="${team.replace(/"/g, '\\"')}"]`;
    must(await page.locator(sel).first().getAttribute("aria-pressed") === "true", "the star did not switch on");
    must((await page.evaluate(() => localStorage.getItem("mp.favs")) || "").includes(team), "the star was not saved");
    await page.locator(sel).first().click();
  }],
  ["Your teams", async page => {
    const open = () => page.evaluate(() => document.getElementById("mddlg").open);
    must(await page.isVisible("#myteams-h"), "no Follow your teams invitation on a first visit");
    await page.click("#myteams-find");
    must(await page.evaluate(() => document.activeElement?.id) === "q", "Find my team did not go to the team search");
    // starred, the invitation becomes Your teams, with that team's next match
    const team = MATCH.home, star = () => page.locator(`#list .match .star[data-team="${team.replace(/"/g, '\\"')}"]`).first();
    await showMatch(page, uid);
    await star().click();
    await page.waitForSelector("#list .myteams-row");
    must(await page.evaluate(t => [...document.querySelectorAll(".myteams-row")].some(a => {
      const r = DATA.find(x => x.uid === a.dataset.uid);
      return r && (r.home === t || r.away === t);
    }), team), `Your teams does not list a match of ${team}`);
    // a row opens Match details; closed, focus goes back to that row
    const row = page.locator("#list .myteams-row").first(), rowUid = await row.getAttribute("data-uid");
    await row.click();
    await page.waitForFunction(() => document.getElementById("mddlg").open);
    must(new URL(page.url()).searchParams.get("match") === rowUid, "the Your teams row did not open its match");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("mddlg").open);
    must(await page.evaluate(() => document.activeElement?.classList.contains("myteams-row")), "focus did not return to the Your teams row");
    await star().click();                                    // as it was: nothing starred
    await page.waitForSelector("#myteams-no");
    // Not now hides the invitation, and it stays hidden on the next visit
    await page.click("#myteams-no");
    await page.waitForSelector("#myteams-h", { state: "detached" });
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("#list .day");
    must(!(await page.isVisible("#myteams-h")), "Not now did not keep the invitation hidden on the next visit");
  }],
  ["Nations League button and cards", async page => {
    const pt = await page.evaluate(() => LANG === "pt");
    const chip = await page.locator("#chip-UNL").textContent();
    must(chip.includes(pt ? "Liga das Nações" : "Nations League"), `the Nations League button reads "${chip.trim()}"`);
    if (!(await page.evaluate(() => DATA.some(r => r.code === "UNL")))) return;   // outside the Nations League's dates
    const meta = await page.locator("#list .match .m-meta", { hasText: pt ? "Liga das Nações da UEFA" : "UEFA Nations League" }).first().textContent();
    must(pt ? /Grupo A\d, Rodada \d/.test(meta) : /Group A\d, Matchday \d/.test(meta), `a Nations League card reads "${meta.trim()}"`);
  }],
  ["sources unfold", async page => {
    const d = page.locator("#list .srcs").first();
    await d.locator("summary").click();
    must(await d.evaluate(e => e.open), "the sources did not open");
  }],
  ["match details, Escape and Back", async page => {
    const open = () => page.evaluate(() => document.getElementById("mddlg").open);
    await showMatch(page, uid);
    await page.click(`.md-open[data-uid="${uid}"]`);
    await page.waitForSelector("#md-lu table, #md-lu li, #md-lu p", { state: "attached" });
    must(await open(), "Match details did not open");
    must(new URL(page.url()).searchParams.get("match") === uid, "the address does not name the match");
    await page.waitForSelector("#md-map .tiles");
    await page.keyboard.press("Escape");
    await wait(300);
    must(!(await open()), "Escape did not close Match details");
    must(!new URL(page.url()).searchParams.get("match"), "the address still names the match after Escape");
    await page.click(`.md-open[data-uid="${uid}"]`);
    await page.waitForFunction(() => document.getElementById("mddlg").open);
    await page.goBack();
    await page.waitForFunction(() => !document.getElementById("mddlg").open);
  }],
  ["F1 race weekend", async page => {
    await page.click(`.md-open[data-uid="${F1_WEEKEND}"]`);
    await page.waitForSelector("#wk-champ table");
    await page.waitForSelector("#wk-res .pod li.p1");
    must(await count(page, "#wk-venue svg") > 0, "the track diagram was not drawn");
    // a starred driver's rows are highlighted (class "mine", as in the league tables), and nothing else gets that class
    const drv = await page.getAttribute("#wk-res .star[data-drv]", "data-drv");
    await page.click(`#wk-res .star[data-drv="${drv}"]`);
    must(await page.evaluate(d => [...document.querySelectorAll(`#wk-res .star[data-drv="${d}"]`)].every(s => s.closest("tr, li")?.classList.contains("mine")), drv),
      "starring a driver did not highlight their row");
    must(!(await count(page, "#mddlg .myteams")), "a race weekend row has the Your teams card's class");
    await page.click(`#wk-res .star[data-drv="${drv}"]`);   // as it was
    await page.click("#mddlg [data-close]");
    await page.waitForFunction(() => !document.getElementById("mddlg").open);
  }],
  ["league tables", async page => {
    await page.click("#tablesbtn");
    await page.waitForSelector("#ltbody table");
    must(await count(page, "#ltbody tbody tr") >= 10, "the league table has too few rows");
    await page.click('#ltchips [data-code="UNL"]');
    await page.waitForSelector("#lt-g-A1");
    const groups = await page.$$eval("#ltbody caption", c => c.map(x => x.textContent));
    must(groups.join() === "Group A1,Group A2,Group A3,Group A4", `the Nations League shows the tables ${groups.join(", ")}`);
    await page.click('#ltchips [data-code="F1"]');
    await page.waitForSelector("#ltbody .f1t");
    await page.click("#ltdlg [data-close]");
    await page.waitForFunction(() => !document.getElementById("ltdlg").open);
  }],
  ["Calendar menu", async page => {
    await page.click("#calmenu > summary");
    must(await page.locator("#calmenu").evaluate(d => d.open), "Calendar did not open");
    must(/^https?:\/\/.+soccer\.ics$/.test((await page.textContent("#calurl")).trim()), "the calendar link is not a full address");
    await page.keyboard.press("Escape");
    must(!(await page.locator("#calmenu").evaluate(d => d.open)), "Escape did not close Calendar");
  }],
  ["keyboard", async page => {
    // Tab from the top of a freshly loaded page to the theme button, check it shows a focus ring, and use it with Enter
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("#list .day");
    let id = "";
    for (let i = 0; i < 6 && id !== "themebtn"; i++) {
      await page.keyboard.press("Tab");
      id = await page.evaluate(() => document.activeElement?.id || "");
    }
    must(id === "themebtn", "Tab did not reach the theme button (in Safari, buttons need Option+Tab unless the setting is on)");
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement);
      return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none"; });
    must(ring, "the focused button shows no focus ring");
    const before = await page.evaluate(() => document.documentElement.classList.contains("is-dark"));
    await page.keyboard.press("Enter");
    must(await page.evaluate(() => document.documentElement.classList.contains("is-dark")) !== before, "Enter did not press the theme button");
  }],
];

// On a monitor, where Match details opens beside the list. At 1650px the list is much narrower beside the panel than
// without it (at 1920px the two barely differ), so the matches above the window change height when it closes: the
// match whose details were shown must stay where it was on screen, not slide up by all they lost (browsers do not
// keep it in place themselves here, since the page's own padding changes too). The right-hand column gives way to the
// panel and comes back.
const besideChecks = [
  ["match details beside the list close in place", async page => {
    await page.setViewportSize({ width: 1650, height: 1000 });
    await page.waitForFunction(() => document.documentElement.dataset.wide === "full");
    const pick = await page.evaluate(() => {
      const a = [...document.querySelectorAll("#list .match .md-open")][14];
      a.closest(".match").scrollIntoView({ block: "center" });
      return a.dataset.uid;
    });
    const card = `#list .match:has(.md-open[data-uid="${pick}"])`;
    const top = () => page.locator(card).evaluate(c => Math.round(c.getBoundingClientRect().top));
    await page.click(`#list .match .md-open[data-uid="${pick}"]`);
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-pane"));
    await wait(300);
    const rail = () => page.evaluate(() => [document.getElementById("rail").offsetWidth > 0, document.documentElement.hasAttribute("data-rail-out")]);
    const [railShown, railOut] = await rail();
    must(!railShown && !railOut, "the right-hand column is still on screen beside Match details");
    const shown = await top();
    await page.click("#mddlg [data-close]");
    await page.waitForFunction(() => !document.getElementById("mddlg").open && !location.search.includes("match="));
    await wait(300);
    const after = await top();
    must((await rail())[0], "the right-hand column did not come back when Match details closed");
    must(Math.abs(after - shown) <= 2, `the match moved from ${shown}px to ${after}px from the top of the window when Match details closed`);
  }],
];

const results = [];   // [browser, what, error or ""]
const note = (engine, what, err) => {
  results.push([engine, what, err]);
  console.log(`${err ? "FAIL" : "PASS"}  ${engine.padEnd(8)} ${what}${err ? "\n      " + err : ""}`);
};
const pageProblems = async (page, errors) => {
  const csp = await page.evaluate(() => window.__csp || []);
  return [...errors, ...csp.map(v => "blocked by the Content-Security-Policy: " + v)];
};

const server = await startServer();
const skipped = [];
try {
  for (const engine of picked) {
    const E = ENGINES[engine];
    let browser;
    try {
      browser = await E.type.launch({ headless: true, ...E.launch() });
    } catch (e) {
      const why = e.message.split("\n").find(l => l.trim()) || e.message;
      if (asked.includes(engine)) note(engine, "start the browser", `could not start: ${why}`);
      else { skipped.push(engine); console.log(`SKIP  ${engine.padEnd(8)} not installed (npx playwright install ${engine})`); }
      continue;
    }
    console.log(`----  ${engine.padEnd(8)} ${E.name} ${browser.version()}`);
    try {
      for (const width of [390, 1280, 1920]) for (const lang of ["en", "pt"]) {
        const view = `${String(width).padStart(4)}px ${lang}`;
        let opened;
        try {
          opened = await openPage(browser, engine, width, lang);
        } catch (e) {
          note(engine, `${view}  open the page`, e.message.split("\n")[0]);
          continue;
        }
        const { context, page, errors } = opened;
        for (const [name, check] of viewChecks) {
          try { await check(page, { width, lang }); note(engine, `${view}  ${name}`, ""); }
          catch (e) { note(engine, `${view}  ${name}`, e.message.split("\n")[0]); }
        }
        await page.screenshot({ path: path.join(out, `${engine}-${width}-${lang}.png`) });
        if (lang === "en" && width < 1920) {
          for (const [name, steps] of actChecks) {
            try { await steps(page); note(engine, `${view}  ${name}`, ""); }
            catch (e) {
              note(engine, `${view}  ${name}`, e.message.split("\n")[0]);
              await page.screenshot({ path: path.join(out, `${engine}-${width}-FAILED-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
              // start the next step from a fresh page, so one failure does not cause the rest
              await page.goto(`${BASE}?lang=${lang}`, { waitUntil: "load" }).catch(() => {});
              await page.waitForSelector("#list .day").catch(() => {});
            }
          }
        }
        if (lang === "en" && width === 1920)
          for (const [name, steps] of besideChecks) {
            try { await steps(page); note(engine, `${view}  ${name}`, ""); }
            catch (e) {
              note(engine, `${view}  ${name}`, e.message.split("\n")[0]);
              await page.screenshot({ path: path.join(out, `${engine}-${width}-FAILED-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
            }
          }
        const problems = await pageProblems(page, errors);
        note(engine, `${view}  no script errors or blocked requests`, problems.slice(0, 5).join("\n      "));
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
}

const failed = results.filter(r => r[2]);
console.log("");
for (const engine of picked.filter(e => !skipped.includes(e))) {
  const mine = results.filter(r => r[0] === engine), bad = mine.filter(r => r[2]).length;
  console.log(`${engine.padEnd(8)} ${mine.length - bad} of ${mine.length} checks passed`);
}
if (skipped.length) console.log(`Skipped (not installed): ${skipped.join(", ")}. Install with: npx playwright install ${skipped.join(" ")}`);
console.log(`Pictures saved in ${out}`);
process.exit(failed.length ? 1 : skipped.length ? 3 : 0);   // 3: passed, but not in every browser (run.mjs shows it as PART)
