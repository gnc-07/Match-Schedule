// Runs axe-core (WCAG 2.2 AA plus best practices) over every combination the
// project rules require: light and dark theme, English and Portuguese,
// 390px, 1280px (laptop: filters in a sidebar) and 1920px wide (monitor: a right-hand column, and match details beside the list),
// with the menus closed, the filter sidebar hidden (1280px and 1920px only), Settings open, Calendar open, the League tables window (a league and the F1 championship),
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
const states = ["closed", "sidebar-hidden", "setmenu", "calmenu", "tables", "tables-f1", "details", "high", "high-details", "f1", "high-f1"];
const query = { details: `&match=${encodeURIComponent(MATCH.uid)}`, "high-details": `&match=${encodeURIComponent(MATCH.uid)}`,
  f1: `&match=${encodeURIComponent(F1_WEEKEND)}`, "high-f1": `&match=${encodeURIComponent(F1_WEEKEND)}` };

const server = await startServer();
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
  args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });   // Chromium refuses to run as root without this
let failures = 0, runs = 0;

try {
  for (const theme of themes) for (const lang of langs) for (const width of widths) for (const state of states) {
    if (state === "sidebar-hidden" && width < 1100) continue;   // phones have no sidebar
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    // Save the theme the same way the Settings menu does, before the page loads.
    await page.evaluateOnNewDocument((t, high, side) => { try { localStorage.setItem("mp.theme", JSON.stringify(t));
      if (high) localStorage.setItem("mp.contrast", JSON.stringify("high")); localStorage.setItem("mp.side", JSON.stringify(side)); } catch {} },
      theme, state.startsWith("high"), state === "sidebar-hidden" ? "closed" : "open");
    await mockNetwork(page);
    await page.goto(`${BASE}?lang=${lang}${query[state] || ""}`, { waitUntil: "networkidle0" });
    if (state === "setmenu" || state === "calmenu") await page.evaluate(id => { document.getElementById(id).open = true; }, state);
    if (state.startsWith("tables")) { await page.click("#tablesbtn"); await page.waitForSelector("#ltbody table"); }
    if (state === "tables-f1") { await page.click('#ltchips [data-code="F1"]'); await page.waitForSelector("#ltbody .f1t"); }
    if (state.endsWith("details")) await page.waitForSelector("#md-map .tiles");
    if (state === "f1" || state === "high-f1") await page.waitForSelector("#wk-champ table");
    if (state === "high-f1") { await page.click('#wk-res [data-s="Q"]'); await page.waitForSelector("#wk-res tr.sep"); }   // the qualifying table too
    await page.evaluate(AXE);
    const result = await page.evaluate(tags => axe.run(document, { runOnly: { type: "tag", values: tags } }), TAGS);
    const label = `${theme.padEnd(5)} ${lang} ${String(width).padStart(4)}px ${state.padEnd(14)}`;
    runs++;
    if (result.violations.length === 0) {
      console.log(`PASS  ${label}`);
    } else {
      failures++;
      console.log(`FAIL  ${label}`);
      for (const v of result.violations) {
        console.log(`      [${v.impact}] ${v.id}: ${v.help}`);
        for (const n of v.nodes.slice(0, 5)) console.log(`        at ${n.target.join(" ")}`);
        if (v.nodes.length > 5) console.log(`        ...and ${v.nodes.length - 5} more`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(`\naxe: ${runs - failures} of ${runs} combinations passed.`);
process.exit(failures ? 1 : 0);
