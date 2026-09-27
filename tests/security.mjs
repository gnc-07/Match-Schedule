// Feeds the page hostile data, the way a broken or tampered feed might, and checks that none of it runs:
// script-like team names and venues stay text, javascript: links never become clickable, odd map
// coordinates give no map, and the browser reports no Content-Security-Policy violations.
// Covers the fixture list, the match details panel and the League tables window, and then the same with ESPN
// not answering, so the backups are used: OpenLigaDB (Bundesliga) and the tables saved in fixtures.json.
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
// F1 race weekends whose track outline (width) and circuit position (latitude) carry markup instead of numbers
const race = (rnd, circuit) => ({ comp: "Formula 1", code: "F1", round: rnd, home: "", away: "", date: soon.slice(0, 10), utc: soon,
  venue: EVIL, uid: `f1|2026|${rnd}|R`, kind: "f1", sess: "R", gp: EVIL, wk: `f1|2026|${rnd}`, sprint: false, circuit });
const badWidth = race("98", { name: EVIL, lat: 45.5, lon: 9.3,
  layout: { path: "M0 0L100 100L0 100Z", w: '100" onload="window.__xss=6', h: 100, length: EVIL, firstgp: EVIL } });
const badLat = race("99", { name: EVIL, lat: '45" onmouseover="window.__xss=7', lon: 9.3,
  layout: { path: "M0 0L100 100L0 100Z", w: 100, h: 100, length: 5793, firstgp: EVIL } });
// Records with a wrong type where the list expects text or a list: each would stop the whole list from drawing
// (or, for a list used as a source, draw an empty source line)
const wrong = (extra, i) => ({ comp: "Premier League", code: "EPL", round: "Matchday 7", home: "Wrongtype FC " + i, away: "Chelsea",
  date: soon.slice(0, 10), utc: soon, uid: "wrong-" + i, ...extra });
const malformed = [wrong({ round: 7 }, 1), wrong({ gp: 7 }, 2), wrong({ check: { status: "confirmed", sources: "x" } }, 3),
  wrong({ check: { status: "confirmed", sources: [null] } }, 4), wrong({ check: { status: "confirmed", sources: [[]] } }, 5),
  { ...race("97", { name: "Monza" }), sess: 5 }, { ...race("96", { name: "Monza" }), top: "Almeida" }];
// a Bundesliga match on now, for the OpenLigaDB backup; and saved tables with markup and wrong types in them
const kick = new Date(Date.now() - 30 * 60e3).toISOString().replace(/\.\d+Z$/, "+00:00");
const bunLive = { comp: "Bundesliga", code: "BUN", round: "Matchday 5", home: "Borussia Dortmund", away: "FC Bayern München",
  date: kick.slice(0, 10), utc: kick, uid: "test-backup" };
const tables = { EPL: [{ team: "Arsenal" + EVIL, rank: EVIL, p: 3, w: 3, d: 0, l: 0, gd: EVIL, pts: 9 }, { team: 7 }, null, "x"] };
// two ordinary matches whose stadiums are looked up on Wikidata while it fails, answers, or knows no such place
const mapMatch = (uid, venue) => ({ comp: "Premier League", code: "EPL", round: "Matchday 7", home: "Mapland FC " + uid,
  away: "Chelsea", date: soon.slice(0, 10), utc: soon, uid, venue });
const fixtures = { ...data, generated: EVIL, sources: { EPL: EVIL }, tables,
  matches: [bad, badWidth, badLat, bunLive, ...malformed, mapMatch("test-map", "Mapland Arena, Testville"),
    mapMatch("test-map-none", "Nowhere Ground, Testville"), ...data.matches] };
// OpenLigaDB's answers: the match on now (a scorer with markup) and malformed entries that must be skipped quietly
const oldbMatch = { matchID: 424242, matchDateTimeUTC: kick.replace("+00:00", "Z"), matchIsFinished: false,
  team1: { teamName: "Borussia Dortmund" + EVIL, shortName: EVIL }, team2: { teamName: "FC Bayern München", shortName: "Bayern" },
  matchResults: [{ resultTypeID: 2, pointsTeam1: EVIL, pointsTeam2: 0 }],
  goals: [{ goalID: 1, scoreTeam1: 1, scoreTeam2: 0, matchMinute: 12, goalGetterName: EVIL, isPenalty: false, isOwnGoal: false },
    { goalID: 2, scoreTeam1: 1, scoreTeam2: 1, matchMinute: EVIL, goalGetterName: "Kane", isPenalty: true, isOwnGoal: false }] };
const oldbBoard = [oldbMatch, { matchID: EVIL, team1: {}, team2: {} }, null, { matchID: 5, matchDateTimeUTC: EVIL, goals: EVIL }];
const oldbTable = [{ teamName: "Borussia Dortmund" + EVIL, matches: 4, won: 4, draw: 0, lost: 0, goalDiff: EVIL, points: EVIL }, { teamName: 3 }];
let espnDown = false;
let wikidata = "hostile";   // how Wikidata answers: "hostile" (markup for coordinates), "http-error", "api-error", "ok", "none"

const server = await startServer();
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
  args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });
const problems = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", e => { console.log("FAIL  page error: " + e.message); problems.push(e.message); });
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
    if (u.includes("espn.com") && espnDown) return req.respond({ status: 503, body: "" });
    if (u.includes("api.openligadb.de/getmatchdata/424242")) return json(oldbMatch);
    if (u.includes("api.openligadb.de/getmatchdata/bl1")) return json(oldbBoard);
    if (u.includes("api.openligadb.de/getbltable")) return json(oldbTable);
    if (u.includes("espn.com") && u.includes("/standings")) return json({ children: [{ standings: { entries: [
      { team: { displayName: "Arsenal" + EVIL }, stats: [{ name: "rank", value: EVIL }, { name: "points", value: EVIL }] }] } }] });
    if (u.includes("espn.com")) return json({ events: [] });
    if (u.includes("wikidata.org") && wikidata === "http-error") return req.respond({ status: 503, contentType: "application/json",
      headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "unavailable" } }) });
    if (u.includes("wikidata.org") && wikidata === "api-error") return json({ error: { code: "maxlag", info: "Waiting for a database server" } });
    if (u.includes("wikidata.org") && wikidata === "none") return json({ search: [] });
    if (u.includes("wikidata.org") && wikidata === "ok") return json(u.includes("wbsearchentities") ? { search: [{ id: "Q7" }] } : { entities: { Q7: {
      descriptions: { en: { value: "football stadium" } }, claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 51.555, longitude: -0.108 } } } }] } } } });
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
      if ([...document.querySelectorAll("details.srcs li")].some(li => !li.textContent.trim())) out.push("empty source entry");
      return out.concat(window.__csp.map(v => "CSP violation: " + v));
    });
    console.log(`${found.length ? "FAIL" : "PASS"}  ${where}`);
    for (const f of found) { console.log("      " + f); problems.push(f); }
  };

  await page.goto(`${BASE}?lang=en`, { waitUntil: "networkidle0" });
  await page.waitForSelector("details.srcs");
  await page.evaluate(() => document.querySelectorAll("details.srcs").forEach(d => { d.open = true; }));
  await check("fixture list");
  // Portuguese (T.round rewrites the round) and a search (every name is compared as text): the list must still draw
  await page.goto(`${BASE}?lang=pt`, { waitUntil: "networkidle0" });
  await page.type("#q", "a");
  await page.waitForFunction(() => document.querySelectorAll("#list .match").length > 0);
  await check("fixture list, Portuguese, with a search");
  await page.goto(`${BASE}?lang=en&match=test-hostile`, { waitUntil: "networkidle0" });
  // the panel must really be showing the hostile match (as text), or the check below would prove nothing
  await page.waitForFunction(() => {
    const body = document.querySelector("#mdbody"), text = sel => body?.querySelector(sel)?.textContent || "";
    return document.querySelector("#mddlg")?.open && text("#md-head").includes("Arsenal") && text("#md-head").includes("Chelsea")
      && text("#md-venue").includes("Stadium");
  });
  await page.waitForFunction(() => !document.querySelector("#md-map") || !/Finding|Procurando/.test(document.querySelector("#md-map").textContent));
  await check("match details");
  for (const wk of ["98", "99"]) {
    await page.goto(`${BASE}?lang=en&match=${encodeURIComponent("f1|2026|" + wk)}`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("#mddlg")?.open && document.querySelector("#wk-venue:not([hidden])"));
    await check("F1 race weekend (round " + wk + ")");
  }
  await page.goto(`${BASE}?lang=en`, { waitUntil: "networkidle0" });
  await page.click("#tablesbtn");
  await page.waitForSelector("#ltbody table");
  await check("league tables");
  // the hostile values must be on screen as plain text, each in its own cell, or the check above would pass
  // just as well if they had never been drawn at all
  const cells = await page.evaluate(() => {
    const row = document.querySelector("#ltbody tbody tr"), text = sel => row?.querySelector(sel)?.textContent || "";
    return { position: text(".pos-c"), team: text(".tm-c"), points: text(".pts") };
  });
  for (const [cell, text] of Object.entries(cells)) {
    const ok = text.includes(EVIL);
    console.log(`${ok ? "PASS" : "FAIL"}  league tables: hostile ${cell} shown as text`);
    if (!ok) problems.push(`league tables: the ${cell} cell does not show the hostile value as text`);
  }

  // ESPN not answering: the backups take over, and their answers get the same treatment
  espnDown = true;
  const shows = (what, ok) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
    if (!ok) problems.push(what);
  };
  await page.goto(`${BASE}?lang=en`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !document.querySelector("#livebox").hidden, { timeout: 15000 }).catch(() => {});
  const live = await page.evaluate(() => ({ list: document.querySelector("#livelist")?.textContent || "",
    note: document.querySelector("#livenote")?.textContent || "" }));
  shows("ESPN down: the Bundesliga score comes from OpenLigaDB, marked LIVE (it has no match clock)",
    live.list.includes("1–1") && live.list.includes("LIVE") && live.note.includes("OpenLigaDB"));
  await check("ESPN down: live scores from OpenLigaDB");
  await page.goto(`${BASE}?lang=en&match=test-backup`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector("#md-src")?.textContent.includes("OpenLigaDB"), { timeout: 15000 }).catch(() => {});
  const md = await page.evaluate(() => ({ ev: document.querySelector("#md-ev")?.textContent || "",
    src: document.querySelector("#md-src")?.textContent || "", lineups: !document.querySelector("#md-lu")?.hidden }));
  shows("ESPN down: match details list OpenLigaDB's goals, the hostile scorer as text", md.ev.includes(EVIL) && md.src.includes("OpenLigaDB"));
  shows("ESPN down: no line-ups box (OpenLigaDB has none)", !md.lineups);
  await check("ESPN down: match details from OpenLigaDB");
  await page.goto(`${BASE}?lang=en`, { waitUntil: "networkidle0" });
  for (const code of ["BUN", "EPL"]) {
    const from = code === "BUN" ? "OpenLigaDB" : "worked out";
    await page.evaluate(c => openTables(c), code);
    // the window keeps the last table on screen until the new one is ready: wait for this league's source line
    await page.waitForFunction(f => document.querySelector("#ltbody .lt-key")?.textContent.includes(f), { timeout: 15000 }, from).catch(() => {});
    const t = await page.evaluate(() => ({ team: document.querySelector("#ltbody tbody .tm-c")?.textContent || "",
      rows: document.querySelectorAll("#ltbody tbody tr").length, key: document.querySelector("#ltbody .lt-key")?.textContent || "" }));
    shows(`ESPN down: ${code} table from the backup (${from}), wrong rows left out, hostile name as text`,
      t.team.includes(EVIL) && t.rows === 1 && t.key.includes(from));
    await check(`ESPN down: ${code} table`);
    await page.keyboard.press("Escape");
  }
  espnDown = false;

  // The published page lists a fingerprint of each of its scripts in its security policy (publish_site.py), in place
  // of 'unsafe-inline': the page's own scripts run (the list above drew), and a script that is not listed must not
  const policy = await page.evaluate(async () => {
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
    const src = (csp.match(/(?:^|;)\s*script-src ([^;]*)/) || [])[1] || "";
    window.__csp = [];
    const s = document.createElement("script");
    s.textContent = "window.__xss = 8";
    document.body.append(s);
    await new Promise(r => setTimeout(r, 300)); // the browser reports a refusal a moment later
    return { src, ran: window.__xss === 8, blocked: window.__csp.some(v => v.startsWith("script-src")) };
  });
  shows("published page: script-src lists only script fingerprints (no 'unsafe-inline', no 'self')",
    /^('sha256-[A-Za-z0-9+/]+=*'\s*)+$/.test(policy.src.trim()));
  shows("published page: a script that is not in the policy is refused", !policy.ran && policy.blocked);
  await page.evaluate(() => { window.__csp = []; });

  // index.html as edited (styles.css and the js/ files loaded one by one, as python3 -m http.server shows it) must
  // work too: this catches a file that uses, while it loads, something only a later file defines
  await page.goto(`${BASE}source.html?lang=en`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelectorAll("#list .match").length > 0, { timeout: 15000 }).catch(() => {});
  shows("page as edited (source.html): the list draws from the separate files",
    await page.evaluate(() => document.querySelectorAll("#list .match").length > 0
      && !!document.querySelector('link[rel="stylesheet"][href="styles.css"]') && document.querySelectorAll("script[src]").length > 1));
  await check("page as edited (source.html)");

  // Wikidata failing must never be remembered as "this stadium has no location" (issue #36): the map comes back as
  // soon as Wikidata answers again. A real "no such place" is still remembered, so the page does not ask on every visit.
  const saved = name => page.evaluate(n => localStorage.getItem("mp.geo." + n), name);
  const openMap = async uid => {
    await page.goto(`${BASE}?lang=en&match=${uid}`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => {
      const m = document.querySelector("#md-map");
      return m && !/Finding|Procurando/.test(m.textContent);
    }, { timeout: 15000 }).catch(() => {});
    return page.evaluate(() => !!document.querySelector("#md-map .tiles"));
  };
  for (const [mode, what] of [["http-error", "an HTTP error"], ["api-error", "its own error answer, with status 200"]]) {
    wikidata = mode;
    const map = await openMap("test-map"), kept = await saved("mapland arena");
    shows(`Wikidata fails (${what}): no map, and nothing remembered`, !map && kept === null);
  }
  wikidata = "ok";
  shows("Wikidata answers again: the map appears", await openMap("test-map"));
  wikidata = "none";
  await openMap("test-map-none");
  shows("Wikidata knows no such place: that is remembered", (await saved("nowhere ground")) === "{}");
  wikidata = "hostile";
  await check("stadium map while Wikidata fails and recovers");
} finally {
  await browser.close();
  server.kill();
}
console.log(`\nsecurity: ${problems.length ? problems.length + " problem(s) found" : "no problems found"}.`);
process.exit(problems.length ? 1 : 0);
