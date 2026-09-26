// Records short videos of the site's animations with the sample data, each played at normal speed and then four
// times slower, for showing the owner before anything is published (and for the Before and after section of a pull
// request). Videos go to screenshots/motion/ (git-ignored). Needs an ffmpeg with the H.264 encoder:
//   FFMPEG=/path/to/ffmpeg node tests/motion-videos.mjs          (or just ffmpeg on the PATH)
// The grey dot is a stand-in mouse pointer and the label in the corner says the speed; neither is part of the site.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { BASE, ROOT, chromePath, startServer } from "./server.mjs";
import { MATCH, mockNetwork } from "./mock-data.mjs";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const out = path.join(ROOT, "screenshots", "motion");
mkdirSync(out, { recursive: true });
const server = await startServer();
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
  args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });   // Chromium refuses to run as root without this
const errors = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
const uid = MATCH.uid;

// the stand-in pointer and the speed label, kept in the top layer (as popovers) so they show above open panels
async function overlay(page) {
  await page.evaluate(() => {
    const mk = (id, css) => { const d = document.createElement("div"); d.id = id; d.popover = "manual"; d.style.cssText = "margin:0;border:0;pointer-events:none;" + css; document.body.append(d); d.showPopover(); return d; };
    const dot = mk("rec-dot", "position:fixed;inset:auto;left:-40px;top:-40px;width:22px;height:22px;border-radius:50%;background:rgba(90,90,90,.45);box-shadow:0 0 0 2px #fff;transform:translate(-50%,-50%);padding:0");
    mk("rec-cap", "position:fixed;inset:auto 12px 12px auto;padding:6px 10px;border-radius:8px;font:600 14px system-ui,sans-serif;background:#111;color:#fff;opacity:.85");
    document.addEventListener("mousemove", e => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; }, true);
    document.addEventListener("mousedown", () => dot.animate([{ scale: 1 }, { scale: .6 }, { scale: 1 }], 250), true);
  });
}
const raise = page => page.evaluate(() => ["rec-dot", "rec-cap"].forEach(id => { const d = document.getElementById(id); d.hidePopover(); d.showPopover(); }));
const caption = (page, t) => page.evaluate(t => { document.getElementById("rec-cap").textContent = t; }, t);
async function click(page, sel) {
  const el = await page.waitForSelector(sel, { visible: true });
  await el.scrollIntoView();
  const box = await el.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await wait(150);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await raise(page);
}
async function key(page, k) { await page.keyboard.press(k); await raise(page); }
// a simulated goal: the sample match is shown as live with the given score (the real site learns this from ESPN)
const score = (page, hs, as) => page.evaluate((u, hs, as) => {
  const r = DATA.find(x => x.uid === u);
  LIVE.set(keyOf(r), { id: "900001", state: "in", clock: "67'", detail: "", hs, as });
  render();
}, uid, hs, as);

// name, width, height, steps (run at normal speed, then again 4 times slower unless once is set)
const scenes = [
  ["01-match-details", 1280, 800, async p => {
    await click(p, `.md-open[data-uid="${uid}"]`); await wait(1200); await key(p, "Escape"); await wait(800);
  }],
  ["02-details-beside-list", 1920, 1000, async p => {
    await click(p, `.md-open[data-uid="${uid}"]`); await wait(1400);
    await click(p, `#list .match:not(.sess) .md-open:not([data-uid="${uid}"])`); await wait(1000);
    await key(p, "Escape"); await wait(800);
  }],
  ["03-settings-and-calendar", 1280, 800, async p => {
    await click(p, "#setmenu summary"); await wait(1100); await key(p, "Escape"); await wait(500);
    await click(p, "#calmenu summary"); await wait(900); await click(p, "#calmenu .calpanel details summary"); await wait(1100);
    await key(p, "Escape"); await wait(700);
  }],
  ["04-phone-sheets", 390, 844, async p => {
    await click(p, "#setmenu summary"); await wait(1200); await p.mouse.click(195, 40); await raise(p); await wait(600);
    await click(p, "#tablesbtn"); await wait(1200); await key(p, "Escape"); await wait(700);
  }],
  ["05-sources-and-star", 1280, 800, async p => {
    await p.evaluate(() => document.querySelector("#list .srcs").scrollIntoView({ block: "center" }));
    await click(p, "#list .srcs summary"); await wait(1100); await click(p, "#list .srcs summary"); await wait(600);
    await click(p, '#list .star[aria-pressed="false"]'); await wait(1000);
    await click(p, '#list .star[aria-pressed="true"]'); await wait(700);
  }],
  ["06-theme-switch", 1280, 800, async p => {
    await click(p, "#themebtn"); await wait(1300); await click(p, "#themebtn"); await wait(1100);
  }],
  ["07-filters", 1280, 800, async p => {
    await p.mouse.move(400, 300, { steps: 5 });
    await click(p, "#chip-EPL"); await wait(900); await click(p, "#chip-EPL"); await wait(900);
    await click(p, '#range [data-r="weekend"]'); await wait(900); await click(p, '#range [data-r="all"]'); await wait(900);
  }],
  ["08-goal", 1920, 1000, async p => {
    await score(p, "2", "1"); await wait(400);
    await p.evaluate(u => document.querySelector(`.score[data-uid="${CSS.escape(u)}"]`).scrollIntoView({ block: "center" }), uid);
    await wait(900); await score(p, "3", "1"); await wait(2600);
  }],
  ["09-animations-off", 1280, 800, async p => {
    await caption(p, "Settings: Animations switched off");
    await click(p, "#setmenu summary"); await wait(700); await click(p, "#mvbox"); await wait(900); await key(p, "Escape"); await wait(500);
    await click(p, `.md-open[data-uid="${uid}"]`); await wait(1100); await key(p, "Escape"); await wait(500);
    await click(p, "#themebtn"); await wait(900); await click(p, "#chip-EPL"); await wait(900); await click(p, "#chip-EPL"); await wait(900);
    await click(p, "#setmenu summary"); await wait(500); await click(p, "#mvbox"); await wait(700); await key(p, "Escape"); await wait(500);
  }, true],
];

try {
  for (const [name, width, height, steps, once] of scenes) {
    const page = await browser.newPage();
    page.on("pageerror", e => errors.push(`${name}: ${e.message}`));
    await page.setViewport({ width, height });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem("mp.theme", JSON.stringify("light"));
      localStorage.setItem("mp.favs", "[]"); localStorage.removeItem("mp.motion"); } catch {} });
    await mockNetwork(page);
    await page.goto(BASE + "?lang=en", { waitUntil: "networkidle0" });
    await overlay(page);
    const cdp = await page.createCDPSession();
    await cdp.send("Animation.enable");
    const webm = path.join(out, name + ".webm");
    const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG });
    await wait(500);
    await caption(page, "Normal speed");
    await steps(page);
    if (!once) {
      await page.goto(BASE + "?lang=en", { waitUntil: "networkidle0" });   // the same steps from the same start
      await overlay(page);
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.25 });
      await caption(page, "4 times slower");
      await wait(400);
      await steps(page);
    }
    await wait(300);
    await rec.stop();
    await page.close();
    // H.264 MP4 plays everywhere (phones, GitHub, the Claude app); even width and height are required by the encoder
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", webm, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264",
      "-pix_fmt", "yuv420p", "-crf", "26", "-movflags", "+faststart", path.join(out, name + ".mp4")]);
    rmSync(webm);
    console.log("recorded", name);
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(errors.length ? "Page errors:\n" + errors.join("\n") : "No page errors.");
console.log(`Videos saved in ${out}`);
