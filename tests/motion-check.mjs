// Plays each animation in Chromium and, when FIREFOX_PATH is set, in Firefox (Gecko), and checks that:
//   - every animation changes only what the browser can move without redrawing the page (opacity and transform),
//     apart from the short colour transitions on buttons;
//   - every duration is one of the two shared speeds (--dur-s, --dur-m) or the goal pulse (3 x --dur-m);
//   - with animations switched off, nothing moves, and switching them off stops what is moving;
//   - nothing animates an element that is hidden (for example the sun or moon that is about to disappear);
//   - closing and gliding stay gentle, followed frame by frame (see "smooth" below): a closing starts softly (at most
//     a tenth of its fade, or 20px, in the first sixtieth of a second), the page never jumps while something closes,
//     and the list never glides more than 50px in a sixtieth of a second (a match on screen is followed, as a visitor
//     sees it; measured per sixtieth, not per frame, so frames a busy computer skips do not count as jumps);
//   - on monitors, Live now and the key, in one column, move and fade as one (moved by their column and by their own
//     animation too, one would go twice as far: it jumps ahead, then glides back);
//   - the menus, sources and "How to subscribe" play their opening again when opened a second time;
// and it prints the slowest frame after each click, with animations on and off, with the processor slowed down 4 times
// the way Lighthouse tests phones (Chromium only; FULLSPEED=1 for normal speed). Those timings vary from run to run,
// so they are for reading, not a pass or fail; TIMINGS=0 skips them (npm test does, which saves about a minute).
// It also saves a picture of each animation paused halfway, in screenshots/motion-check/, to compare the browsers.
// Run: node tests/motion-check.mjs      (FIREFOX_PATH=/path/to/firefox node tests/motion-check.mjs for both)
import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { BASE, ROOT, chromePath, startServer } from "./server.mjs";
import { F1_WEEKEND, MATCH, mockNetwork, showMatch } from "./mock-data.mjs";

const out = path.join(ROOT, "screenshots", "motion-check");
mkdirSync(out, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const uid = MATCH.uid;
const OK_PROPS = new Set(["opacity", "transform", "offset", "easing", "composite", "computedOffset"]);

// opened, closed, then opened again: only the second opening is recorded (Chromium styles nothing inside a closed
// <details>, so a CSS opening animation there can play the first time only)
const again = (show, hide) => async p => { await show(p); await wait(500); await hide(p); await wait(900);
  await p.evaluate(() => window.__seen?.clear()); await show(p); };
const srcs = async p => { await p.evaluate(() => document.querySelector("#list .srcs").scrollIntoView({ block: "center" })); await p.click("#list .srcs summary"); };
// name, width, what starts the animation, and (optional) an animation that must be among those that run
const cases = [
  ["panel", 1280, p => p.click(`.md-open[data-uid="${uid}"]`)],
  ["panel-beside", 1920, p => p.click(`.md-open[data-uid="${uid}"]`)],
  ["settings", 1280, p => p.click("#setmenu summary")],
  ["sheet-phone", 390, p => p.click("#setmenu summary")],
  ["phone-filters", 390, p => p.click("#sideshow")],
  ["follow-not-now", 1280, p => p.click("#myteams-no")],
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
  // opened a second time: each plays its opening again
  ["settings-again", 1280, again(p => p.click("#setmenu summary"), p => p.keyboard.press("Escape")), "drop"],
  ["calendar-again", 1280, again(p => p.click("#calmenu summary"), p => p.click("#calmenu summary")), "drop"],
  ["sheet-again", 390, again(p => p.click("#calmenu summary"), p => p.keyboard.press("Escape")), "sheet-up"],
  ["sources-again", 1280, again(srcs, srcs), "drop"],
  ["howto-again", 1280, async p => { await p.click("#calmenu summary"); await wait(400);
    await again(p => p.click("#calmenu .calpanel details summary"), p => p.click("#calmenu .calpanel details summary"))(p); }, "drop"],
  // the filter sidebar (laptops): hidden, then shown again
  ["sidebar-hide", 1280, p => p.click("#sidehide")],
  ["sidebar-show", 1280, async p => { await p.click("#sidehide"); await wait(900); await p.click("#sideshow"); }],
  // small filter controls coming (the Custom dates, Clear filters) and going
  ["controls", 1280, p => p.click('#range [data-r="custom"]')],
  ["controls-go", 1280, async p => { await p.click('#range [data-r="custom"]'); await wait(600); await p.click('#range [data-r="all"]'); }],
  // new content in the same place, and the days added by "Show more"
  ["table-switch", 1280, async p => { await p.click("#tablesbtn"); await wait(900); await p.click('#ltchips [data-code="LIGA"]'); await wait(20); }],
  ["weekend-switch", 1280, async p => { await showMatch(p, F1_WEEKEND); await p.click(`.md-open[data-uid="${F1_WEEKEND}"]`); await wait(900); await p.click('#wk-res [data-s="Q"]'); }],
  ["driver-star", 1280, async p => { await showMatch(p, F1_WEEKEND); await p.click(`.md-open[data-uid="${F1_WEEKEND}"]`); await wait(900); await p.click('#wk-res .star[aria-pressed="false"]'); }],
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

const COLUMN = ["#list", "#livebox", "#legend"],
  DURING = Date.parse(MATCH.utc) + 30 * 60e3,   // half an hour into the sample match: Live now shows it
  live = p => p.waitForFunction(() => !document.getElementById("livebox").hidden, { timeout: 15000 });
// name, width, what to follow, what to do first, what starts the movement (for the frame-by-frame "smooth" check)
const smooth = [
  ["beside-open", 1920, ["#list", "#mddlg"], async () => {}, p => p.click(`.md-open[data-uid="${uid}"]`)],
  ["beside-switch", 1920, ["#list"], async p => { await p.click(`.md-open[data-uid="${uid}"]`); await wait(900); },
    p => p.evaluate(u => { const all = [...document.querySelectorAll("#list .md-open")], i = all.findIndex(x => x.dataset.uid === u);
      (all.slice(i + 1).find(x => x.getBoundingClientRect().top < innerHeight - 60) || all[i + 1]).click(); }, uid)],
  ["beside-close", 1920, ["#list", "#mddlg"], async p => { await p.click(`.md-open[data-uid="${uid}"]`); await wait(900); }, p => p.keyboard.press("Escape"), "closing"],
  ["panel-close", 1280, ["#mddlg"], async p => { await p.click(`.md-open[data-uid="${uid}"]`); await wait(900); }, p => p.click("#mddlg [data-close]"), "closing"],
  ["tables-close", 1280, ["#ltdlg"], async p => { await p.click("#tablesbtn"); await wait(900); }, p => p.keyboard.press("Escape"), "closing"],
  ["sheet-close", 390, ["#setmenu .calpanel"], async p => { await p.click("#setmenu summary"); await wait(900); }, p => p.keyboard.press("Escape"), "closing"],
  ["menu-close", 1280, ["#setmenu .calpanel"], async p => { await p.click("#setmenu summary"); await wait(900); }, p => p.click("#setmenu summary"), "closing"],
  ["sidebar-hide", 1280, ["#list", "#filters"], async () => {}, p => p.click("#sidehide"), "closing"],
  ["phone-filters-open", 390, ["#list"], async () => {}, p => p.click("#sideshow")],
  ["phone-filters-close", 390, ["#list", "#filters"], async p => { await p.click("#sideshow"); await wait(900); }, p => p.click("#sideshow"), "closing"],
  ["sidebar-show", 1280, ["#list"], async p => { await p.click("#sidehide"); await wait(1200); }, p => p.click("#sideshow")],
  // monitors: Live now and the key share the right-hand column, so they move as one (see "together" below)
  ["wide-side-hide", 1920, COLUMN, live, p => p.click("#sidehide"), "closing"],
  ["wide-side-show", 1920, COLUMN, async p => { await live(p); await p.click("#sidehide"); await wait(1200); }, p => p.click("#sideshow")],
  ["wide-open", 1920, COLUMN, live, p => p.click(`.md-open[data-uid="${uid}"]`)],
  ["wide-close", 1920, COLUMN, async p => { await live(p); await p.click(`.md-open[data-uid="${uid}"]`); await wait(900); }, p => p.keyboard.press("Escape"), "closing"],
];
const problems = [];
const ONLY = process.argv.slice(2);   // optional: names of the cases to run, e.g. theme goal
// Opens the page ready for one case: light theme, nothing starred, animations on or off; at: a time for the page's
// clock (Date only: animations keep to performance.now), such as during the sample match, so Live now shows it
async function open(browser, width, motion, at) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  if (at) await page.evaluateOnNewDocument(at => { const D = Date, off = at - D.now();
    window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } }; }, at);
  await page.evaluateOnNewDocument(m => { try { localStorage.setItem("mp.theme", '"light"'); localStorage.setItem("mp.favs", "[]");
    localStorage.setItem("mp.side", '"open"'); localStorage.setItem("mp.contrast", '"normal"'); localStorage.setItem("mp.range", '"all"');
    localStorage.setItem("mp.motion", JSON.stringify(m)); localStorage.removeItem("mp.follow"); } catch {} }, motion);
  await mockNetwork(page);
  await page.goto(BASE + "?lang=en", { waitUntil: "networkidle0" });
  await showMatch(page, uid);
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
    for (const [name, width, act, expect] of cases.filter(c => !ONLY.length || ONLY.includes(c[0]))) {
      if (process.env.TIMINGS !== "0") {
        const on = await slowest(browser, label, width, act, "on"), off = await slowest(browser, label, width, act, "off");
        console.log(`${label.padEnd(8)} ${name.padEnd(12)} slowest frame: ${on} ms with animations, ${off} ms without`);
      } else console.log(`${label.padEnd(8)} ${name}`);
      // with animations switched off, nothing may move at all
      const still = await open(browser, width, "off");
      await act(still);
      await wait(40);
      const moving = await still.evaluate(() => document.getAnimations().filter(a => a.playState === "running").length);
      await still.close();
      if (moving) problems.push(`${label} ${name}: ${moving} animation(s) ran with animations switched off`);
      const page = await open(browser, width, "on");
      // Record every animation as it starts, on every frame from the click until things settle, rather than looking at
      // one moment: on a busy computer a 280 ms animation can begin and end between a look and the next.
      // What is recorded: each animation's properties and length (not the live dot's pulse, which was there before).
      await page.evaluate(() => {
        const seen = window.__seen = new Map();
        const tick = () => {
          for (const a of document.getAnimations()) {
            if (a.playState !== "running" || a.animationName === "pulse" || seen.has(a)) continue;
            seen.set(a, {
              what: a.animationName || a.transitionProperty || "script",
              on: String(a.effect?.target?.id || a.effect?.target?.className?.baseVal || a.effect?.target?.className || a.effect?.target?.tagName || "") + (a.effect?.pseudoElement || ""),
              ms: Math.round(a.effect.getComputedTiming().duration),
              hidden: !!a.effect?.target && !a.effect.pseudoElement && getComputedStyle(a.effect.target).display === "none",
              props: [...new Set(a.effect.getKeyframes().flatMap(Object.keys))].filter(p => !["offset", "easing", "composite", "computedOffset"].includes(p)),
            });
          }
          if (!window.__stop) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await act(page);
      // wait for the animation to begin (up to a second): the theme cross-fade starts a frame or two after the click
      await page.waitForFunction(() => window.__seen.size > 0, { timeout: 1000 }).catch(() => {});
      await wait(40);
      // pause everything partway through for the picture (the goal glow earlier, while it is brightest)
      await page.evaluate(() => document.getAnimations().forEach(a => { const t = a.effect.getComputedTiming();
        a.pause(); a.currentTime = (t.delay || 0) + t.duration * (a.animationName === "glow-wave" ? 0.3 : 0.5); }));
      await page.screenshot({ path: path.join(out, `${name}-${label}.png`) });
      await wait(600);   // anything that starts a little later (the recorder keeps watching), then stop
      const anims = await page.evaluate(() => { window.__stop = true;
        return { speeds: ["--dur-s", "--dur-m"].map(n => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) * 1000),
          list: [...window.__seen.values()] }; });
      await page.close();
      if (!anims.list.length) problems.push(`${label} ${name}: no animation ran`);
      else if (expect && !anims.list.some(a => a.what === expect)) problems.push(`${label} ${name}: ${expect} did not run`);
      const seen = new Set();
      for (const a of anims.list) {
        const inner = /^-ua-|^-moz-|view-transition/.test(a.what);   // the browser's own steps inside a View Transition
        const bad = inner ? [] : a.props.filter(p => !OK_PROPS.has(p) && !/color$/i.test(p));
        // a button's colour change that is undone half way (the pointer leaves it as a panel opens over it) runs back in
        // the time it had run, as the CSS rules say, so it may be shorter than the shared speed; never longer
        const [s, m] = anims.speeds, undone = /color$/i.test(a.what) && a.ms > 0 && a.ms < s,
          okLen = inner || undone || [s, m, 3 * m].some(x => Math.abs(a.ms - x) < 2);
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
    // untick once the cross-fade itself is under way (up to a second): on a busy computer it starts later than a fixed wait.
    // A browser with View Transitions that shows no cross-fade is a problem; one without them has none by design.
    const fading = await theme.waitForFunction(() => document.getAnimations().some(a => a.playState === "running" &&
      /view-transition/.test(a.effect?.pseudoElement || "")), { timeout: 1000 }).then(() => true, () => false);
    if (!fading && await theme.evaluate(() => "startViewTransition" in document))
      problems.push(`${label}: the theme cross-fade did not start within a second, so unticking during it was not tested`);
    await theme.evaluate(() => document.getElementById("mvbox").click());
    await wait(60);
    const [stillFading, dark] = await theme.evaluate(() =>
      [document.getAnimations().filter(a => a.playState === "running").length, document.documentElement.classList.contains("is-dark")]);
    await theme.close();
    console.log(`${label.padEnd(8)} switch-off   theme cross-fade: ${stillFading} animation(s) running after unticking, dark theme kept: ${dark}`);
    if (stillFading || !dark) problems.push(`${label}: unticking Animations during the theme cross-fade left ${stillFading} running (dark theme kept: ${dark})`);
    // smooth: each frame, where the things that move are and how visible they are
    for (const [name, width, sels, prep, act, closing] of smooth.filter(c => !ONLY.length || ONLY.includes(c[0]) || ONLY.includes("smooth"))) {
      const page = await open(browser, width, "on", sels.includes("#livebox") && DURING);
      await prep(page);
      await page.evaluate(sels => {
        window.__tr = [];
        const t0 = performance.now(), pin = [...document.querySelectorAll("#list .match")].find(m => m.getBoundingClientRect().bottom > 0);
        const tick = now => {   // now: the frame's own time, the clock the animations move by
          window.__tr.push({ t: now, y: scrollY, at: sels.map(s => { const e = document.querySelector(s), r = (s === "#list" ? pin : e).getBoundingClientRect();
            let o = e.checkVisibility() ? 1 : 0;   // how visible it is: its own opacity times every parent's, as a visitor sees it
            for (let x = e; o && x !== document.documentElement; x = x.parentElement) o *= +getComputedStyle(x).opacity;
            return [r.left, r.top, o]; }) });
          if (now - t0 < 900) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, sels);
      await act(page);
      await wait(1000);
      const tr = await page.evaluate(() => window.__tr);
      await page.close();
      const jumped = closing && tr.some((f, i) => i && f.y !== tr[i - 1].y);
      const lines = sels.map((s, k) => {
        let big = 0, first = null;
        for (let i = 1; i < tr.length; i++) {
          const a = tr[i - 1].at[k], c = tr[i].at[k];
          if (!a[2] || !c[2] || tr[i].y !== tr[i - 1].y) continue;   // invisible, or the page scrolled (checked apart)
          // per sixtieth of a second, so a frame a busy computer skips does not count as one big step
          const per = 1000 / 60 / Math.max(tr[i].t - tr[i - 1].t, 1000 / 60),
            d = Math.hypot(c[0] - a[0], c[1] - a[1]) * per, o = Math.abs(c[2] - a[2]) * per;
          if (first === null && (d > 0.5 || o > 0.005)) first = [d, o];
          big = Math.max(big, d);
        }
        if (closing && first && (first[0] > 20 || first[1] > 0.1))
          problems.push(`${label} smooth ${name}: ${s} starts closing with a jump (${first[0].toFixed(0)}px, opacity ${first[1].toFixed(2)} in the first frame)`);
        // the list is what is being read: it never glides more than 50px in a frame (a sheet leaving the screen may go faster)
        if (s === "#list" && big > 50) problems.push(`${label} smooth ${name}: ${s} moves ${big.toFixed(0)}px in one frame`);
        return `${s} biggest step ${big.toFixed(0)}px` + (first ? `, first ${first[0].toFixed(0)}px / opacity ${first[1].toFixed(2)}` : "");
      });
      if (jumped) problems.push(`${label} smooth ${name}: the page jumped while closing`);
      // together: Live now and the key sit in one column, so every frame they have moved as far as each other and are
      // as visible as each other (one moved or faded twice, by its own animation and its column's, lags or jumps)
      const lb = sels.indexOf("#livebox"), lg = sels.indexOf("#legend");
      if (lb >= 0 && lg >= 0) {
        let apart = 0, faded = 0;
        for (const f of tr) {
          const a = f.at[lb], b = f.at[lg], a0 = tr[0].at[lb], b0 = tr[0].at[lg];
          if (f.y !== tr[0].y || !a[2] || !b[2]) continue;   // scrolled, or gone (a hidden box has no place)
          apart = Math.max(apart, Math.hypot(a[0] - a0[0] - (b[0] - b0[0]), a[1] - a0[1] - (b[1] - b0[1])));
          faded = Math.max(faded, Math.abs(a[2] - b[2]));
        }
        if (apart > 2 || faded > 0.05)
          problems.push(`${label} smooth ${name}: Live now and the key come apart (${apart.toFixed(0)}px, opacity ${faded.toFixed(2)})`);
        lines.push(`apart ${apart.toFixed(0)}px / opacity ${faded.toFixed(2)}`);
      }
      console.log(`${label.padEnd(8)} smooth ${name.padEnd(13)} ${lines.join("; ")}${jumped ? "; the page jumped" : ""}`);
    }
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
