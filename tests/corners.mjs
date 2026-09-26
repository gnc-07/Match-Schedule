// Checks that rounded shapes sitting close inside another rounded shape have parallel corners: the inner corner is
// the outer one less the border and the gap between them (a 10px box with a 1px border and 4px padding holds 5px corners),
// so the space between the two curves stays even. Covers the list, Settings, Calendar, the League tables window
// (a league and F1), match details and the F1 race weekend, at 390px, 1280px and 1920px, with and without high contrast.
// Shapes further in than the outer corner's curve, and fully round shapes inside fully round ones, are left alone.
import puppeteer from "puppeteer-core";
import { BASE, chromePath, startServer } from "./server.mjs";
import { F1_WEEKEND, MATCH, mockNetwork } from "./mock-data.mjs";

const states = { list: "", setmenu: "", calmenu: "", tables: "", "tables-f1": "",
  details: `&match=${encodeURIComponent(MATCH.uid)}`, f1: `&match=${encodeURIComponent(F1_WEEKEND)}` };
const server = await startServer();
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
  args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });   // Chromium refuses to run as root without this
const found = new Map();
let runs = 0;

try {
  for (const width of [390, 1280, 1920]) for (const [state, q] of Object.entries(states)) for (const high of [false, true]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    await page.evaluateOnNewDocument(h => { try { localStorage.setItem("mp.favs", JSON.stringify(["Arsenal FC"]));
      if (h) localStorage.setItem("mp.contrast", JSON.stringify("high")); } catch {} }, high);
    await mockNetwork(page);
    await page.goto(`${BASE}?lang=en${q}`, { waitUntil: "networkidle0" });
    if (state === "setmenu" || state === "calmenu") await page.evaluate(id => { document.getElementById(id).open = true; }, state);
    if (state.startsWith("tables")) { await page.click("#tablesbtn"); await page.waitForSelector("#ltbody table"); }
    if (state === "tables-f1") { await page.click('#ltchips [data-code="F1"]'); await page.waitForSelector("#ltbody .f1t"); }
    if (state === "f1") await page.waitForSelector("#wk-champ table");
    const bad = await page.evaluate(() => {
      const out = [], px = v => parseFloat(v) || 0;
      const alpha = c => { const m = c.match(/[\d.]+/g); return !m ? 0 : m.length > 3 ? +m[3] : 1; };
      const sides = ["Top", "Right", "Bottom", "Left"], corners = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"];
      const edged = s => alpha(s.backgroundColor) > 0 || s.backgroundImage !== "none" || s.boxShadow !== "none" ||
        sides.some(k => px(s[`border${k}Width`]) > 0 && alpha(s[`border${k}Color`]) > 0);
      // a pill's 999px corner is really half its height
      const rad = (s, c, b) => Math.min(px(s[`border${c}Radius`].split(" ")[0]), b.width / 2, b.height / 2);
      const round = (s, b) => corners.every(c => rad(s, c, b) >= Math.min(b.width, b.height) / 2 - 0.5);
      const name = e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + [...e.classList].map(c => "." + c).join("");
      for (const e of document.querySelectorAll("body *")) {
        if (!e.checkVisibility()) continue;
        const s = getComputedStyle(e), r = e.getBoundingClientRect();
        if (!edged(s) || r.width < 4 || r.height < 4) continue;
        let a = e.parentElement, sa, ra;
        for (; a && a !== document.documentElement; a = a.parentElement) {
          sa = getComputedStyle(a); ra = a.getBoundingClientRect();
          if (corners.some(c => rad(sa, c, ra) > 0) && (edged(sa) || sa.overflow !== "visible")) break;
        }
        if (!a || a === document.documentElement || (round(s, r) && round(sa, ra))) continue;
        const b = Object.fromEntries(sides.map(k => [k, px(sa[`border${k}Width`])]));
        const gaps = { TopLeft: [r.left - ra.left - b.Left, r.top - ra.top - b.Top], TopRight: [ra.right - b.Right - r.right, r.top - ra.top - b.Top],
          BottomLeft: [r.left - ra.left - b.Left, ra.bottom - b.Bottom - r.bottom], BottomRight: [ra.right - b.Right - r.right, ra.bottom - b.Bottom - r.bottom] };
        for (const [c, [gx, gy]] of Object.entries(gaps)) {
          if (gx < -0.5 || gy < -0.5) continue;
          const inner = rad(sa, c, ra) - Math.max(b[c.startsWith("Top") ? "Top" : "Bottom"], b[c.endsWith("Left") ? "Left" : "Right"]);
          const g = Math.max(gx, gy);
          if (g >= inner) continue;                                   // too far in to share the corner's curve
          if (sa.overflow !== "visible" && g < 0.5) continue;         // the parent's clip rounds it
          const want = inner - g, have = rad(s, c, r);
          if (Math.abs(have - want) > 0.75)
            out.push(`${name(a)} > ${name(e)}, ${c}: ${have}px, want ${+want.toFixed(1)}px (outer ${rad(sa, c, ra)}px, gap ${+g.toFixed(1)}px)`);
        }
      }
      return out;
    });
    runs++;
    for (const f of bad) if (!found.has(f)) found.set(f, `${width}px ${state}${high ? " high contrast" : ""}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
for (const [f, where] of found) console.log(`FAIL  ${f}  [${where}]`);
console.log(found.size ? `corners: ${found.size} corner(s) not parallel.` : `corners: all nested corners parallel in ${runs} views.`);
process.exit(found.size ? 1 : 0);
