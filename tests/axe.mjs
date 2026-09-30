// Runs axe-core (WCAG 2.2 AA plus best practices) over every combination the
// project rules require: light and dark theme, English and Portuguese,
// 390px, 1280px (laptop: filters in a sidebar) and 1920px wide (monitor: a right-hand column, and match details beside the list),
// with the menus closed (the Follow your teams invitation showing), the filters unfolded (390px only), teams starred (Your teams), the filter sidebar hidden (1280px and 1920px only), Settings open, Calendar open, the League tables window (a league, the Nations League groups and the F1 championship),
// the match details panel and the F1 race weekend panel (race results; qualifying in high contrast), plus high contrast (list and match details), using sample data (mock-data.mjs) in place of ESPN, Jolpica-F1, Wikidata and OpenStreetMap.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { BASE, chromePath, startServer } from "./server.mjs";
import { F1_WEEKEND, MATCH, mockNetwork } from "./mock-data.mjs";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const themes = ["light", "dark"];
const langs = ["en", "pt"];
const widths = [390, 1280, 1920];
const states = ["closed", "filters-open", "starred", "sidebar-hidden", "setmenu", "calmenu", "tables", "tables-unl", "tables-f1", "details", "high", "high-details", "f1", "high-f1"];
const query = { details: `&match=${encodeURIComponent(MATCH.uid)}`, "high-details": `&match=${encodeURIComponent(MATCH.uid)}`,
  f1: `&match=${encodeURIComponent(F1_WEEKEND)}`, "high-f1": `&match=${encodeURIComponent(F1_WEEKEND)}` };

const server = await startServer();
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
  args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });   // Chromium refuses to run as root without this
// Several views are checked at the same time, each in its own private window (AXE_WORKERS, default 6), which takes about a quarter
// of the time of one after another; each view still has its own storage settings and waits until it has settled.
const WORKERS = Math.max(1, Number(process.env.AXE_WORKERS) || 6);
const views = [];
for (const theme of themes) for (const lang of langs) for (const width of widths) for (const state of states)
  if (!(state === "sidebar-hidden" && width < 1100) && !(state === "filters-open" && width > 640))   // phones have no sidebar,
    views.push([theme, lang, width, state]);                                                         // and fold their filters away

// Each view in its own private window: views checked at the same time must not share saved settings (theme, contrast).
// The window is closed however the check ends, so a view that fails partway does not leave it open.
async function checkView(view) {
  const context = await browser.createBrowserContext();
  try {
    return await inspect(await context.newPage(), view);
  } finally {
    // closing can fail on a busy computer (Puppeteer loses track of the tab), which says nothing about the page
    await context.close().catch(() => {});
  }
}

async function inspect(page, [theme, lang, width, state]) {
  await page.setViewport({ width, height: 900 });
  // Check the settled page: with the device asking for less motion, panels appear at once instead of fading in,
  // so colour contrast is not measured halfway through an animation.
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  // Save the theme the same way the Settings menu does, before the page loads (contrast and the sidebar too).
  await page.evaluateOnNewDocument((t, high, side, favs) => { try { localStorage.setItem("mp.theme", JSON.stringify(t)); localStorage.setItem("mp.favs", JSON.stringify(favs));
    localStorage.setItem("mp.contrast", JSON.stringify(high ? "high" : "normal")); localStorage.setItem("mp.side", JSON.stringify(side)); } catch {} },
    theme, state.startsWith("high"), state === "sidebar-hidden" ? "closed" : "open", state === "starred" ? [MATCH.home, MATCH.away] : []);
  await mockNetwork(page);
  await page.goto(`${BASE}?lang=${lang}${query[state] || ""}`, { waitUntil: "networkidle0" });
  if (state === "filters-open") await page.click("#sideshow");
  if (state === "setmenu" || state === "calmenu") await page.evaluate(id => { document.getElementById(id).open = true; }, state);
  if (state.startsWith("tables")) { await page.click("#tablesbtn"); await page.waitForSelector("#ltbody table"); }
  if (state === "tables-unl") { await page.click('#ltchips [data-code="UNL"]'); await page.waitForSelector("#lt-g-A4"); }
  if (state === "tables-f1") { await page.click('#ltchips [data-code="F1"]'); await page.waitForSelector("#ltbody .f1t"); }
  if (state.endsWith("details")) await page.waitForSelector("#md-map .tiles");
  if (state === "f1" || state === "high-f1") await page.waitForSelector("#wk-champ table");
  let podium = null;
  if (state === "f1" || state === "high-f1") {
    // The winner's card must stand out from the panel behind it: its edge or its fill needs 3:1 contrast
    // (WCAG 1.4.11). axe cannot check this, because neither is text.
    await page.waitForSelector("#wk-res .pod li.p1");
    podium = await page.evaluate(() => {
      const rgb = c => c.match(/[\d.]+/g).slice(0, 4).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const li = document.querySelector("#wk-res .pod li.p1");
      let back = li.parentElement;
      while (back && (rgb(getComputedStyle(back).backgroundColor)[3] ?? 1) === 0) back = back.parentElement;
      const ratio = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      const s = getComputedStyle(li), b = lum(rgb(getComputedStyle(back || document.body).backgroundColor));
      return Math.max(ratio(lum(rgb(s.borderTopColor)), b), ratio(lum(rgb(s.backgroundColor)), b));
    });
  }
  if (state === "high-f1") { await page.click('#wk-res [data-s="Q"]'); await page.waitForSelector("#wk-res tr.sep"); }   // the qualifying table too
  await page.evaluate(AXE);
  const result = await page.evaluate(tags => axe.run(document, { runOnly: { type: "tag", values: tags } }), TAGS);
  const label = `${theme.padEnd(5)} ${lang} ${String(width).padStart(4)}px ${state.padEnd(14)}`;
  if (podium !== null && podium < 3) {
    result.violations.push({ impact: "serious", id: "podium-winner-edge", nodes: [{ target: ["#wk-res .pod li.p1"] }],
      help: `Winner's card (edge or fill) has only ${podium.toFixed(2)}:1 contrast with the panel behind it; needs 3:1` });
  }
  const lines = [`${result.violations.length ? "FAIL" : "PASS"}  ${label}`];
  for (const v of result.violations) {
    lines.push(`      [${v.impact}] ${v.id}: ${v.help}`);
    for (const n of v.nodes.slice(0, 5)) lines.push(`        at ${n.target.join(" ")}`);
    if (v.nodes.length > 5) lines.push(`        ...and ${v.nodes.length - 5} more`);
  }
  return { ok: !result.violations.length, text: lines.join("\n") };
}

let failures = 0, runs = 0;
try {
  let next = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (next < views.length) {
      const view = views[next++];
      let r;
      try { r = await checkView(view); }
      catch (e) { r = { ok: false, text: `FAIL  ${view.join(" ")}\n      could not check: ${e.message.split("\n")[0]}` }; }
      runs++;
      if (!r.ok) failures++;
      console.log(r.text);
    }
  }));
} finally {
  await browser.close();
  server.kill();
}

console.log(`\naxe: ${runs - failures} of ${runs} combinations passed.`);
process.exit(failures ? 1 : 0);
