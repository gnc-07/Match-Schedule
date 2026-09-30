// Rebuilds flags/flags.json from flag-icons (MIT), for the national team flags beside team names.
// Each square flag is drawn at 72x72 (18px on screen, sharp on phone screens and at Extra large text) and saved as
// WebP, one line per flag: "code": ["English name", "base64 WebP"]. publish_site.py unpacks them into flags/<code>.webp.
// Detailed flags shrink the most (Serbia's SVG is 177 KB; its 72px WebP under 2 KB).
// Run: npm pack flag-icons && tar xzf flag-icons-*.tgz && node flags/make.mjs package
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromePath } from "../tests/server.mjs";

const pkg = process.argv[2];
if (!pkg) throw new Error("Give the folder of the unpacked flag-icons package: node flags/make.mjs package");
const { version } = JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8"));
// countries, plus the four home nations and Kosovo, which play as national teams; not unions or regions (EU, ASEAN, Catalonia)
const HOME = new Set(["gb-eng", "gb-sct", "gb-wls", "gb-nir", "xk"]);
const countries = JSON.parse(readFileSync(path.join(pkg, "country.json"), "utf8"))
  .filter(c => c.iso || HOME.has(c.code)).sort((a, b) => a.code.localeCompare(b.code));
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
  args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });
const page = await browser.newPage();
await page.setViewport({ width: 72, height: 72 });
const lines = [];
for (const c of countries) {
  const svg = readFileSync(path.join(pkg, "flags", "1x1", c.code + ".svg"));
  await page.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${svg.toString("base64")}" width="72" height="72" style="display:block"></body>`);
  await page.evaluate(() => document.images[0].decode());
  const webp = await page.screenshot({ type: "webp", quality: 90, clip: { x: 0, y: 0, width: 72, height: 72 } });
  lines.push(JSON.stringify(c.code) + ":" + JSON.stringify([c.name, Buffer.from(webp).toString("base64")]));
}
await browser.close();
writeFileSync(new URL("flags.json", import.meta.url),
  `{"source":${JSON.stringify(`flag-icons ${version} (MIT, see LICENSE), square flags drawn at 72x72 as WebP by flags/make.mjs`)},\n"flags":{\n${lines.join(",\n")}\n}}\n`);
console.log(`${lines.length} flags written to flags/flags.json`);
