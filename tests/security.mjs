// Feeds the page hostile data, the way a broken or tampered feed might, and checks that none of it runs:
// script-like team names and venues stay text, javascript: links never become clickable, odd map
// coordinates give no map, and the browser reports no Content-Security-Policy violations.
// Covers the fixture list, the match details panel and the League tables window.
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { BASE, ROOT, chromePath, startServer } from "./server.mjs";

const EVIL = '"><img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
const data = JSON.parse(readFileSync(path.join(ROOT, "fixtures.json"), "utf8"));
const soon = new Date(Date.now() + 3 * 3600e3).toISOString().replace(/\.\d+Z$/, "+00:00");
const bad = { comp: "Premier League", code: "EPL", round: EVIL, home: "Arsenal" + EVIL, away: "Chelsea", date: soon.slice(0, 10), utc: soon,
  venue: "Stadium" + EVIL + ", London", note: EVIL, uid: "test-hostile",
  watch: { url: "javascript:window.__xss=3", title: EVIL, kind: "stream" },
  check: { status: "confirmed", basis: "official source", sources: [
    { source: EVIL, url: "javascript:window.__xss=4", official: true, comment: EVIL },
    { source: "Data link", url: "data:text/html,<script>window.__xss=5</script>" }] } };
const fixtures = { ...data, generated: EVIL, sources: { EPL: EVIL }, matches: [bad, ...data.matches] };

const server = await startServer();
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
  args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });
const problems = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
  });
  await page.setRequestInterception(true);
  page.on("request", req => {
    const u = req.url();
    const json = body => req.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (new URL(u).pathname.endsWith("/fixtures.json")) return json(fixtures);
    if (u.includes("espn.com") && u.includes("/standings")) return json({ children: [{ standings: { entries: [
      { team: { displayName: "Arsenal" + EVIL }, stats: [{ name: "rank", value: EVIL }, { name: "points", value: EVIL }] }] } }] });
    if (u.includes("espn.com")) return json({ events: [] });
    if (u.includes("wikidata.org")) return json(u.includes("wbsearchentities") ? { search: [{ id: "Q1" }] } : { entities: { Q1: {
      claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: EVIL, longitude: 1 } } } }] } } } });
    if (u.startsWith(BASE)) return req.continue();
    return req.abort();                     // nothing else leaves the machine
  });

  const check = async where => {
    const found = await page.evaluate(() => {
      const out = [];
      if (window.__xss) out.push("injected script ran (" + window.__xss + ")");
      for (const el of document.querySelectorAll("*"))
        for (const a of el.attributes) if (/^on/i.test(a.name)) out.push("event-handler attribute " + a.name + " on <" + el.tagName.toLowerCase() + ">");
      for (const a of document.querySelectorAll("a[href]"))
        if (!/^(https?|webcal):|^\?|^#|^soccer\.ics$/.test(a.getAttribute("href"))) out.push("unsafe link " + a.getAttribute("href").slice(0, 60));
      for (const s of document.querySelectorAll("script")) if (s.textContent.includes("__xss")) out.push("script element from data");
      if (document.querySelector('#md-map img[src*="NaN"]')) out.push("map drawn from bad coordinates");
      return out.concat(window.__csp.map(v => "CSP violation: " + v));
    });
    console.log(`${found.length ? "FAIL" : "PASS"}  ${where}`);
    for (const f of found) { console.log("      " + f); problems.push(f); }
  };

  await page.goto(`${BASE}?lang=en`, { waitUntil: "networkidle0" });
  await page.waitForSelector("details.srcs");
  await page.evaluate(() => document.querySelectorAll("details.srcs").forEach(d => { d.open = true; }));
  await check("fixture list");
  await page.goto(`${BASE}?lang=en&match=test-hostile`, { waitUntil: "networkidle0" });
  // the panel must really be showing the hostile match (as text), or the check below would prove nothing
  await page.waitForFunction(() => {
    const body = document.querySelector("#mdbody"), text = sel => body?.querySelector(sel)?.textContent || "";
    return document.querySelector("#mddlg")?.open && text("#md-head").includes("Arsenal") && text("#md-head").includes("Chelsea")
      && text("#md-venue").includes("Stadium");
  });
  await page.waitForFunction(() => !document.querySelector("#md-map") || !/Finding|Procurando/.test(document.querySelector("#md-map").textContent));
  await check("match details");
  await page.goto(`${BASE}?lang=en`, { waitUntil: "networkidle0" });
  await page.click("#tablesbtn");
  await page.waitForSelector("#ltbody table");
  await check("league tables");
} finally {
  await browser.close();
  server.kill();
}
console.log(`\nsecurity: ${problems.length ? problems.length + " problem(s) found" : "no problems found"}.`);
process.exit(problems.length ? 1 : 0);
