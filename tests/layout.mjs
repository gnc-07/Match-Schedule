// Checks that on wide screens the boxes that stay in place while the page scrolls (the filter sidebar, the bar shown
// while it is hidden, and the right-hand column) never cover the footer. Browsers hold a sticky box inside its parent,
// not its grid row, so these boxes must sit in .mid, which ends with the list. Scrolls to the end of the page at
// 1280px and 1920px, with the filters shown and hidden, normal and Large text, and with match details open beside the list.
import puppeteer from "puppeteer-core";
import { BASE, chromePath, startServer } from "./server.mjs";
import { MATCH, mockNetwork } from "./mock-data.mjs";

const server = await startServer();
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
  args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });   // Chromium refuses to run as root without this
const found = [];
let runs = 0;

try {
  for (const width of [1280, 1920]) for (const side of ["open", "closed"]) for (const size of ["normal", "large"])
  for (const q of ["", `&match=${encodeURIComponent(MATCH.uid)}`]) for (const height of [700, 1000]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    // every setting is written: the pages share one storage, so a choice would otherwise carry into the next view
    await page.evaluateOnNewDocument((s, z) => { try { localStorage.setItem("mp.side", JSON.stringify(s));
      localStorage.setItem("mp.size", JSON.stringify(z)); } catch {} }, side, size);
    await mockNetwork(page);
    await page.goto(`${BASE}?lang=en${q}`, { waitUntil: "networkidle0" });
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await new Promise(r => setTimeout(r, 150));
    const bad = await page.evaluate(() => {
      const f = document.querySelector("footer").getBoundingClientRect(), out = [];
      for (const id of ["filters", "side-bar", "rail"]) {
        const e = document.getElementById(id);
        if (!e.checkVisibility()) continue;
        const b = e.getBoundingClientRect();
        const cover = Math.min(b.bottom, f.bottom) - Math.max(b.top, f.top);
        if (b.width && b.height && cover > 0.5 && b.right > f.left && b.left < f.right) out.push(`#${id} covers the footer by ${Math.round(cover)}px`);
      }
      return out;
    });
    runs++;
    for (const b of bad) found.push(`${b}  [${width}x${height} filters ${side}, ${size} text${q ? ", match details" : ""}]`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
for (const f of found) console.log(`FAIL  ${f}`);
console.log(found.length ? `layout: ${found.length} view(s) with a box over the footer.` : `layout: nothing covers the footer in ${runs} views.`);
process.exit(found.length ? 1 : 0);
