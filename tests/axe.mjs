// Runs axe-core (WCAG 2.2 AA plus best practices) over every combination the
// project rules require: light and dark theme, English and Portuguese,
// 390px and 1280px wide, with the menus closed, Settings open and Calendar open.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { BASE, chromePath, startServer } from "./server.mjs";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const themes = ["light", "dark"];
const langs = ["en", "pt"];
const widths = [390, 1280];
const states = ["closed", "setmenu", "calmenu"];

const server = await startServer();
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true });
let failures = 0, runs = 0;

try {
  for (const theme of themes) for (const lang of langs) for (const width of widths) for (const state of states) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    // Save the theme the same way the Settings menu does, before the page loads.
    await page.evaluateOnNewDocument(t => { try { localStorage.setItem("mp.theme", JSON.stringify(t)); } catch {} }, theme);
    await page.goto(`${BASE}?lang=${lang}`, { waitUntil: "networkidle0" });
    if (state !== "closed") await page.evaluate(id => { document.getElementById(id).open = true; }, state);
    await page.evaluate(AXE);
    const result = await page.evaluate(tags => axe.run(document, { runOnly: { type: "tag", values: tags } }), TAGS);
    const label = `${theme.padEnd(5)} ${lang} ${String(width).padStart(4)}px ${state.padEnd(7)}`;
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
