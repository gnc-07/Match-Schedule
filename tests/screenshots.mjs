// Takes preview pictures of the site with sample data, so design options can be compared before anything
// is published. Pictures go to screenshots/ (not committed). Run: node tests/screenshots.mjs
import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { BASE, ROOT, chromePath, startServer } from "./server.mjs";
import { F1_WEEKEND, MATCH, mockNetwork } from "./mock-data.mjs";

const out = path.join(ROOT, "screenshots");
mkdirSync(out, { recursive: true });
const server = await startServer();
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
  args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });   // Chromium refuses to run as root without this
const errors = [];
const uid = encodeURIComponent(MATCH.uid), wk = encodeURIComponent(F1_WEEKEND);

// name, width, address, what to do once the page is ready, theme, text size
const shots = [
  ["list-desktop", 1280, "?lang=en", null, "light"],
  ["list-phone", 390, "?lang=en", null, "light"],
  ["details-desktop", 1280, `?match=${uid}`, null, "light"],
  ["details-phone", 390, `?match=${uid}`, null, "light"],
  ["details-desktop-dark-pt", 1280, `?lang=pt&match=${uid}`, null, "dark"],
  ["details-then-table", 1280, `?match=${uid}`, p => p.click("#md-table"), "light"],
  ["tables-desktop", 1280, "?lang=en", p => p.click("#tablesbtn"), "light"],
  ["tables-phone", 390, "?lang=en", p => p.click("#tablesbtn"), "light"],
  ["tables-f1-desktop", 1280, "?lang=en", async p => { await p.click("#tablesbtn"); await p.click('#ltchips [data-code="F1"]'); }, "light"],
  ["tables-f1-phone", 390, "?lang=en", async p => { await p.click("#tablesbtn"); await p.click('#ltchips [data-code="F1"]'); }, "light"],
  ["tables-f1-teams-dark-pt", 1280, "?lang=pt", async p => { await p.click("#tablesbtn"); await p.click('#ltchips [data-code="F1"]');
    await p.waitForSelector('#ltbody [data-lt="c"]'); await p.click('#ltbody [data-lt="c"]'); }, "dark"],
  ["settings-textsize", 1280, "?lang=en", p => p.evaluate(() => { document.getElementById("setmenu").open = true; }), "light"],
  ["list-xl-text-phone", 390, "?lang=en", null, "light", "xl"],
  ["f1-desktop", 1280, `?match=${wk}`, null, "light"],
  ["f1-phone", 390, `?match=${wk}`, null, "light"],
  ["f1-desktop-dark-pt", 1280, `?lang=pt&match=${wk}`, null, "dark"],
  ["f1-xl-text-phone", 390, `?match=${wk}`, null, "light", "xl"],
  ["theme-button-desktop-light", 1280, "?lang=en", null, "light"],
  ["theme-button-desktop-dark", 1280, "?lang=en", null, "dark"],
  ["theme-button-phone-light", 390, "?lang=en", null, "light"],
  ["theme-button-phone-dark-pt", 390, "?lang=pt", null, "dark"],
  ["theme-button-phone-xl-text", 390, "?lang=en", null, "light", "xl"],
  ["theme-button-after-click", 1280, "?lang=en", p => p.click("#themebtn"), "light"],
  ["theme-button-focus", 1280, "?lang=en", async p => { await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); }, "light"],
];

try {
  for (const [name, width, query, act, theme, size] of shots) {
    const page = await browser.newPage();
    page.on("pageerror", e => errors.push(`${name}: ${e.message}`));
    await page.setViewport({ width, height: 900 });
    await page.evaluateOnNewDocument((t, s) => { try { localStorage.setItem("mp.theme", JSON.stringify(t));
      localStorage.setItem("mp.favs", JSON.stringify(["Arsenal FC"])); localStorage.setItem("mp.f1favs", JSON.stringify(["lima"])); if (s) localStorage.setItem("mp.size", JSON.stringify(s)); else localStorage.removeItem("mp.size"); } catch {} }, theme, size);
    await mockNetwork(page);
    await page.goto(BASE + query, { waitUntil: "networkidle0" });
    if (act) { await act(page); await new Promise(r => setTimeout(r, 600)); }
    await new Promise(r => setTimeout(r, 400));
    if (name.startsWith("f1-")) await page.waitForSelector("#wk-champ table");
    if ((name.startsWith("details-") && !name.includes("table")) || name.startsWith("f1-")) {
      // the panel scrolls on its own; take it in two views, top and further down
      await page.screenshot({ path: path.join(out, name + "-1.png") });
      await page.evaluate(() => { document.querySelector("#mddlg").scrollTop = 900; });
      await page.screenshot({ path: path.join(out, name + "-2.png") });
      await page.evaluate(() => { const d = document.querySelector("#mddlg"); d.scrollTop = d.scrollHeight; });
      await page.screenshot({ path: path.join(out, name + "-3.png") });
    } else {
      await page.screenshot({ path: path.join(out, name + ".png") });
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(errors.length ? "Page errors:\n" + errors.join("\n") : "No page errors.");
console.log(`Pictures saved in ${out}`);
