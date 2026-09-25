// Runs Lighthouse on mobile and desktop, in English and Portuguese, and checks
// that Performance, Accessibility, Best Practices and SEO are all 90 or more.
// Full HTML reports are saved in lighthouse-reports/ (not committed).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import * as chromeLauncher from "chrome-launcher";
import { BASE, ROOT, chromePath, startServer } from "./server.mjs";

const MIN = 90;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const outDir = path.join(ROOT, "lighthouse-reports");
mkdirSync(outDir, { recursive: true });

const server = await startServer();
const chrome = await chromeLauncher.launch({ chromePath: chromePath(), chromeFlags: ["--headless=new", ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])] });   // Chromium refuses to run as root without --no-sandbox
let failed = false;

try {
  for (const form of ["mobile", "desktop"]) for (const lang of ["en", "pt"]) {
    const config = form === "desktop" ? desktopConfig : undefined;
    const { lhr, report } = await lighthouse(`${BASE}?lang=${lang}`,
      { port: chrome.port, output: "html", logLevel: "error", onlyCategories: CATEGORIES }, config);
    const file = path.join(outDir, `${form}-${lang}.html`);
    writeFileSync(file, report);
    const scores = CATEGORIES.map(c => {
      const s = Math.round(lhr.categories[c].score * 100);
      if (s < MIN) failed = true;
      return `${lhr.categories[c].title} ${s}${s < MIN ? " (below " + MIN + ")" : ""}`;
    });
    console.log(`${form.padEnd(7)} ${lang}: ${scores.join(", ")}`);
  }
} finally {
  await chrome.kill();
  server.kill();
}

console.log(`\nReports saved in lighthouse-reports/. ${failed ? "Some scores are below " + MIN + "." : "All scores are " + MIN + " or more."}`);
process.exit(failed ? 1 : 0);
