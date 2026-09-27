// Plays each animation in Chromium and, when FIREFOX_PATH is set, in Firefox (Gecko), and checks that:
//   - every animation changes only what the browser can move without redrawing the page (opacity and transform),
//     apart from the short colour transitions on buttons;
//   - every duration is one of the two shared speeds (--dur-s, --dur-m) or the goal pulse (3 x --dur-m);
//   - with animations switched off, nothing moves, and switching them off stops what is moving;
//   - nothing animates an element that is hidden (for example the sun or moon that is about to disappear);
// and it prints the slowest frame after each click, with animations on and off, with the processor slowed down 4 times
// the way Lighthouse tests phones (Chromium only; FULLSPEED=1 for normal speed). Those timings vary from run to run,
// so they are for reading, not a pass or fail.
// It also saves a picture of each animation paused halfway, in screenshots/motion-check/, to compare the browsers.
// Run: node tests/motion-check.mjs      (FIREFOX_PATH=/path/to/firefox node tests/motion-check.mjs for both)
import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { BASE, ROOT, chromePath, startServer } from "./server.mjs";
import { F1_WEEKEND, MATCH, mockNetwork } from "./mock-data.mjs";

const out = path.join(ROOT, "screenshots", "motion-check");
mkdirSync(out, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const uid = MATCH.uid;
const OK_PROPS = new Set(["opacity", "transform", "offset", "easing", "composite", "computedOffset"]);

// name, width, what starts the animation
const cases = [
  ["panel", 1280, p => p.click(`.md-open[data-uid="${uid}"]`)],
  ["panel-beside", 1920, p => p.click(`.md-open[data-uid="${uid}"]`)],
  ["settings", 1280, p => p.click("#setmenu summary")],
  ["sheet-phone", 390, p => p.click("#setmenu summary")],
  ["sources", 1280, async p => { await p.evaluate(() => document.querySelector("#list .srcs").scrollIntoView({ block: "center" })); await p.click("#list .srcs summary"); }],
  ["star", 1280, async p => { await p.evaluate(() => document.querySelector('#list .star[aria-pressed="false"]').scrollIntoView({ block: "center" })); await p.click('#list .star[aria-pressed="false"]'); }],
  ["theme", 1280, async p => { await p.click("#themebtn");
    await p.waitForFunction(() => document.documentElement.classList.contains("is-dark")); }],   // the cross-fade first takes a picture of the page
  ["filters", 1280, p => p.click("#chip-F1")],
  // closing: each moves out first, then goes
  ["panel-close", 1280, async p => { await p.click(`.md-open[data-uid="${uid}"]`); await wait(600); await p.click("#mddlg [data-close]"); }],
  ["beside-close", 1920, async p => { await p.click(`.md-open[data-uid="${uid}"]`); await wait(600); await p.keyboard.press("Escape"); }],
  ["tables-close", 1280, async p => { await p.click("#tablesbtn"); await wait(600); await p.keyboard.press("Escape"); }],
  ["settings-close", 1280, async p => { await p.click("#setmenu summary"); await wait(400); await p.click("#setmenu summary"); }],
  ["sheet-close", 390, async p => { await p.click("#setmenu summary"); await wait(600); await p.keyboard.press("Escape"); }],
  ["sources-close", 1280, async p => { await p.evaluate(() => document.querySelector("#list .srcs").scrollIntoView({ block: "center" }));
    await p.click("#list .srcs summary"); await wait(400); await p.click("#list .srcs summary"); }],
  // the filter sidebar (laptops): hidden, then shown again
  ["sidebar-hide", 1280, p => p.click("#sidehide")],
  ["sidebar-show", 1280, async p => { await p.click("#sidehide"); await wait(900); await p.click("#sideshow"); }],
  // small filter controls coming (the Custom dates, Clear filters) and going
  ["controls", 1280, p => p.click('#range [data-r="custom"]')],
  ["controls-go", 1280, async p => { await p.click('#range [data-r="custom"]'); await wait(600); await p.click('#range [data-r="all"]'); }],
  // new content in the same place, and the days added by "Show more"
  ["table-switch", 1280, async p => { await p.click("#tablesbtn"); await wait(900); await p.click('#ltchips [data-code="LIGA"]'); await wait(20); }],
  ["weekend-switch", 1280, async p => { await p.click(`.md-open[data-uid="${F1_WEEKEND}"]`); await wait(900); await p.click('#wk-res [data-s="Q"]'); }],
  ["driver-star", 1280, async p => { await p.click(`.md-open[data-uid="${F1_WEEKEND}"]`); await wait(900); await p.click('#wk-res .star[aria-pressed="false"]'); }],
  ["show-more", 1280, async p => { await p.evaluate(() => document.getElementById("more").scrollIntoView({ block: "center" })); await p.click("#more"); }],
  // Settings that change the whole page cross-fade like the theme
  ["contrast", 1280, async p => { await p.click("#setmenu summary"); await wait(400); await p.click("#hcbox");
    await p.waitForFunction(() => document.documentElement.dataset.contrast === "high"); }],   // the cross-fade first takes a picture of the page
  ["goal", 1920, async p => {
    await p.evaluate(u => { const r = DATA.find(x => x.uid === u); LIVE.set(keyOf(r), { id: "1", state: "in", clock: "67'", detail: "", hs: "2", as: "1" }); render();
      document.querySelector(`.score[data-uid="${CSS.escape(u)}"]`).scrollIntoView({ block: "center" }); }, uid);
    await wait(300);
    await p.evaluate(u => { const r = DATA.find(x => x.uid === u); LIVE.get(keyOf(r)).hs = "3"; render(); }, uid);
  }],
];

const problems = [];
const ONLY = process.argv.slice(2);   // optional: names of the cases to run, e.g. theme goal
// Opens the page ready for one case: light theme, nothing starred, animations on or off
async function open(browser, width, motion) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  await page.evaluateOnNewDocument(m => { try { localStorage.setItem("mp.theme", '"light"'); localStorage.setItem("mp.favs", "[]");
    localStorage.setItem("mp.side", '"open"'); localStorage.setItem("mp.contrast", '"normal"'); localStorage.setItem("mp.range", '"all"');
    localStorage.setItem("mp.motion", JSON.stringify(m)); } catch {} }, motion);
  await mockNetwork(page);
  await page.goto(BASE + "?lang=en", { waitUntil: "networkidle0" });
  await wait(300);
  return page;
}
// The slowest frame from the click until everything has settled (2 seconds). With the processor slowed down, the
// click's own work (building the list or the panel) takes a while too, so the same click with animations off is
// measured as well: the difference is what the animations cost.
async function slowest(browser, label, width, act, motion) {
  const page = await open(browser, width, motion);
  if (label === "chromium" && !process.env.FULLSPEED) await page.emulateCPUThrottling(4);
  await page.evaluate(() => { window.__gaps = []; let last = performance.now();
    const tick = t => { window.__gaps.push(t - last); last = t; if (t - window.__gaps.t0 < 2000) requestAnimationFrame(tick); };
    window.__gaps.t0 = last; requestAnimationFrame(tick); });
  await act(page);
  await wait(2200);
  const gaps = await page.evaluate(() => window.__gaps.slice(1));
  await page.close();
  return Math.round(Math.max(0, ...gaps));
}
async function run(label, launch) {
  const server = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch(launch);
  } catch (e) {
    server.kill();   // otherwise the server keeps the command running
    throw e;
  }
  try {
    for (const [name, width, act] of cases.filter(c => !ONLY.length || ONLY.includes(c[0]))) {
      const on = await slowest(browser, label, width, act, "on"), off = await slowest(browser, label, width, act, "off");
      console.log(`${label.padEnd(8)} ${name.padEnd(12)} slowest frame: ${on} ms with animations, ${off} ms without`);
      // with animations switched off, nothing may move at all
      const still = await open(browser, width, "off");
      await act(still);
      await wait(40);
      const moving = await still.evaluate(() => document.getAnimations().filter(a => a.playState === "running").length);
      await still.close();
      if (moving) problems.push(`${label} ${name}: ${moving} animation(s) ran with animations switched off`);
      const page = await open(browser, width, "on");
      await act(page);
      await wait(40);
      // what is animating: every animation's properties and length (the live dot's pulse was there before)
      const anims = await page.evaluate(() => {
        const speeds = ["--dur-s", "--dur-m"].map(n => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) * 1000);
        return { speeds, list: document.getAnimations().filter(a => a.playState === "running" && a.animationName !== "pulse").map(a => ({
          what: a.animationName || a.transitionProperty || "script",
          on: String(a.effect?.target?.id || a.effect?.target?.className?.baseVal || a.effect?.target?.className || a.effect?.target?.tagName || "") + (a.effect?.pseudoElement || ""),
          ms: Math.round(a.effect.getComputedTiming().duration),
          hidden: !!a.effect?.target && !a.effect.pseudoElement && getComputedStyle(a.effect.target).display === "none",
          props: [...new Set(a.effect.getKeyframes().flatMap(Object.keys))].filter(p => !["offset", "easing", "composite", "computedOffset"].includes(p)),
        })) };
      });
      // pause everything partway through for the picture (the goal glow earlier, while it is brightest)
      await page.evaluate(() => document.getAnimations().forEach(a => { const t = a.effect.getComputedTiming();
        a.pause(); a.currentTime = (t.delay || 0) + t.duration * (a.animationName === "glow-wave" ? 0.3 : 0.5); }));
      await page.screenshot({ path: path.join(out, `${name}-${label}.png`) });
      await page.close();
      if (!anims.list.length) problems.push(`${label} ${name}: no animation ran`);
      const seen = new Set();
      for (const a of anims.list) {
        const inner = /^-ua-|^-moz-|view-transition/.test(a.what);   // the browser's own steps inside a View Transition
        const bad = inner ? [] : a.props.filter(p => !OK_PROPS.has(p) && !/color$/i.test(p));
        const [s, m] = anims.speeds, okLen = inner || [s, m, 3 * m].some(x => Math.abs(a.ms - x) < 2);
        const line = `           ${a.what.padEnd(34)} ${a.on.slice(0, 40).padEnd(40)} ${String(a.ms).padStart(4)} ms  ${a.props.join(", ")}`;
        if (!seen.has(line)) console.log(line);
        seen.add(line);
        if (bad.length) problems.push(`${label} ${name}: ${a.what} animates ${bad.join(", ")}`);
        if (a.hidden) problems.push(`${label} ${name}: ${a.what} runs on ${a.on}, which is hidden`);
        if (!okLen) problems.push(`${label} ${name}: ${a.what} lasts ${a.ms} ms, not one of the shared speeds`);
      }
    }
    // switching animations off in the middle of one stops it at once (the list rising after a filter change)
    const page = await open(browser, 1280, "on");
    await page.click("#chip-F1");
    const left = await page.evaluate(() => { document.getElementById("mvbox").click();
      return document.getAnimations().filter(a => a.playState === "running").length; });
    await page.close();
    console.log(`${label.padEnd(8)} switch-off   ${left} animation(s) still running after Animations was unticked`);
    if (left) problems.push(`${label}: ${left} animation(s) kept running after Animations was switched off`);
    // the same during the theme cross-fade: it stops, and the new theme stays
    const theme = await open(browser, 1280, "on");
    await theme.click("#themebtn");
    // the cross-fade first takes a picture of the page, then switches the theme: untick once it is under way
    await theme.waitForFunction(() => document.documentElement.classList.contains("is-dark"));
    await theme.evaluate(() => document.getElementById("mvbox").click());
    await wait(60);
    const [stillFading, dark] = await theme.evaluate(() => [document.getAnimations().filter(a => a.playState === "running").length,
      document.documentElement.classList.contains("is-dark")]);
    await theme.close();
    console.log(`${label.padEnd(8)} switch-off   theme cross-fade: ${stillFading} animation(s) running after unticking, dark theme kept: ${dark}`);
    if (stillFading || !dark) problems.push(`${label}: unticking Animations during the theme cross-fade left ${stillFading} running (dark theme kept: ${dark})`);
  } finally {
    await browser.close();
    server.kill();
  }
}

const noSandbox = process.getuid?.() === 0 ? ["--no-sandbox"] : [];   // Chromium refuses to run as root without this
await run("chromium", { executablePath: chromePath(), headless: true, args: noSandbox });
if (process.env.FIREFOX_PATH) await run("firefox", { browser: "firefox", executablePath: process.env.FIREFOX_PATH, headless: true });
else console.log("Firefox skipped: set FIREFOX_PATH to check it too.");
console.log(problems.length ? "Problems:\n" + problems.join("\n") : "No problems found.");
console.log(`Pictures saved in ${out}`);
process.exit(problems.length ? 1 : 0);
