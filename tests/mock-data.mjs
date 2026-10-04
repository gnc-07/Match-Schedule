// Sample answers for the outside services the page calls (ESPN, Wikidata, OpenStreetMap), so the tests
// give the same result every time and work offline. The names and numbers are made up; the shapes follow
// what those services return. Used by axe.mjs, browsers.mjs, screenshots.mjs and others, never by the published site.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./server.mjs";

const data = JSON.parse(readFileSync(path.join(ROOT, "fixtures.json"), "utf8"));
// the sample match: the first Premier League match with a confirmed time
export const MATCH = data.matches.find(m => m.code === "EPL" && m.utc);
// Sample Formula 1 sessions, timed around "now" so they sit near the top of the list: one weekend just
// finished (pole and podium known), and a sprint weekend still to come (one time verified, one conflicting).
const hrs = h => new Date(Date.now() + h * 3600e3).toISOString().replace(/\.\d+Z$/, "+00:00");
const f1 = (wk, sess, h, extra = {}) => ({ comp: "Formula 1", code: "F1", round: wk, home: "", away: "", date: hrs(h).slice(0, 10), utc: hrs(h),
  venue: wk === "18" ? "Marina Bay Street Circuit, Marina Bay" : "Circuit of the Americas, Austin", uid: `f1|2026|${wk}|${sess}`,
  kind: "f1", sess, gp: wk === "18" ? "Singapore Grand Prix" : "United States Grand Prix", wk: `f1|2026|${wk}`, ...extra });
const agree = { status: "confirmed", basis: "2 independent sources agree", sources: [{ source: "Jolpica-F1", url: "https://api.jolpi.ca/ergast/f1/2026/19/races/" }, { source: "OpenF1", url: "https://api.openf1.org/v1/sessions" }] };
export const F1 = [
  f1("18", "Q", -30, { top: ["Almeida"] }), f1("18", "R", -20, { top: ["Brandt", "Almeida", "Costa"], sprint: false,
    circuit: { name: "Marina Bay Street Circuit", locality: "Marina Bay", country: "Singapore", lat: 1.2914, lon: 103.864,
      layout: {"path":"M978 245L1000 416L993 434L964 477L953 480L877 476L769 463L755 451L750 438L747 414L425 395L390 382L284 290L268 291L256 299L244 338L185 632L181 639L170 644L160 642L143 620L137 607L100 576L69 545L63 525L70 500L68 495L46 487L18 469L7 459L0 438L0 427L132 193L146 181L160 178L188 196L252 263L258 266L263 265L327 150L333 141L339 139L536 251L566 262L586 266L840 281L850 279L874 266L881 253L882 242L873 176L841 92L839 79L842 24L849 10L858 1L865 0L872 2L894 27L910 35L950 40L957 56L963 139Z","w":1000,"h":644,"length":4928,"firstgp":2008} } }),   // as build_schedule.py writes it from f1-circuits
  f1("19", "FP1", 26), f1("19", "SQ", 30), f1("19", "S", 50),
  f1("19", "Q", 54, { check: { ...agree, status: "conflicting", reported: [hrs(54), hrs(54.5)] } }),
  f1("19", "R", 74, { sprint: true, check: agree }),
];
// Sample Libertadores matches, as build_schedule.py writes them from ESPN and Wikipedia: a semi-final soon (both
// sources agree, so verified) and a group match yesterday with its result, so the tests see both kinds of round.
const libAgree = { status: "confirmed", basis: "2 independent sources agree", sources: [{ source: "ESPN", url: "https://www.espn.com/soccer/match/_/gameId/900101" },
  { source: "Wikipedia", url: "https://en.wikipedia.org/wiki/2026_Copa_Libertadores_final_stages" }] };
const lib = (id, h, home, away, round, venue, extra = {}) => ({ comp: "CONMEBOL Libertadores", code: "LIB", round, home, away,
  date: hrs(h).slice(0, 10), utc: hrs(h), venue, uid: `lib|${id}`, check: libAgree, ...extra });
export const LIB = [
  lib("900102", -20, "Estudiantes de La Plata", "Independiente del Valle", "Group C", "Estadio Jorge Luis Hirschi, La Plata", { result: { home: 2, away: 1 } }),
  lib("900101", 30, "Fluminense FC", "SE Palmeiras", "Semi-finals, 1st leg", "Estádio do Maracanã, Rio de Janeiro"),
];
// Jolpica-F1 answers for the finished weekend (round 18): made-up drivers, real team ids (for the team colours).
export const F1_WEEKEND = "f1|2026|18";
const TEAMS = [["mclaren", "McLaren"], ["ferrari", "Ferrari"], ["red_bull", "Red Bull"], ["mercedes", "Mercedes"], ["aston_martin", "Aston Martin"],
  ["alpine", "Alpine F1 Team"], ["williams", "Williams"], ["rb", "RB F1 Team"], ["haas", "Haas F1 Team"], ["audi", "Audi"], ["cadillac", "Cadillac F1 Team"]];
const GIVEN = ["Ana", "Bruno", "Carla", "Diego", "Elena", "Felipe", "Gina", "Hugo", "Iris", "João", "Kai", "Lara", "Mateo", "Nina", "Omar", "Paula", "Rafael", "Sofia", "Tomás", "Vera", "Wes", "Yara"];
const FAMILY = ["Almeida", "Brandt", "Costa", "Duarte", "Eriksen", "Ferreira", "Garcia", "Hoffmann", "Ivanova", "Jensen", "Kowalski", "Lima", "Moreau", "Novak", "Okafor", "Pereira", "Quinn", "Rossi", "Santos", "Tanaka", "Ueda", "Vargas"];
const DRIVERS = GIVEN.map((g, i) => ({ d: { driverId: FAMILY[i].toLowerCase(), code: FAMILY[i].slice(0, 3).toUpperCase(), givenName: g, familyName: FAMILY[i] },
  c: { constructorId: TEAMS[i >> 1][0], name: TEAMS[i >> 1][1] } }));
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const jolRace = (key, rows) => ({ MRData: { RaceTable: { Races: [{ season: "2026", round: "18", [key]: rows }] } } });
const f1Quali = jolRace("QualifyingResults", DRIVERS.map((x, i) => ({ position: String(i + 1), Driver: x.d, Constructor: x.c,
  Q1: `1:3${4 + (i >> 3)}.${String(100 + i * 37).slice(-3)}`, ...(i < 16 ? { Q2: `1:33.${String(200 + i * 29).slice(-3)}` } : {}), ...(i < 10 ? { Q3: `1:32.${String(300 + i * 41).slice(-3)}` } : {}) })));
const order = [1, 0, 2, 4, 3, 5, 7, 6, 9, 8, 10, 12, 11, 13, 15, 14, 17, 16, 19, 18, 20, 21];
const f1Race = jolRace("Results", order.map((k, i) => {
  const x = DRIVERS[k], out = i >= 20, lapped = i >= 16 && !out;
  return { position: String(i + 1), positionText: out ? "R" : String(i + 1), points: String(POINTS[i] || 0), Driver: x.d, Constructor: x.c,
    grid: String(k + 1), laps: out ? String(30 + i) : lapped ? "61" : "62", status: out ? "Retired" : lapped ? (i % 2 ? "Lapped" : "+1 Lap") : "Finished",   // both forms Jolpica uses
    ...(out || lapped ? {} : { Time: { time: i === 0 ? "1:40:12.345" : `+${(i * 2.31).toFixed(3)}` } }),
    ...(i === 3 ? { FastestLap: { rank: "1" } } : {}) };
}));
const f1Drivers = { MRData: { StandingsTable: { StandingsLists: [{ season: "2026", round: "18", DriverStandings: DRIVERS.map((x, i) =>
  ({ position: String(i + 1), positionText: String(i + 1), points: String(400 - i * 17), wins: String(Math.max(0, 6 - i)), Driver: x.d,
    Constructors: i === 13 ? [x.c, DRIVERS[0].c] : [x.c] })) }] } } };   // driver 14 changed teams mid-season
const f1Teams = { MRData: { StandingsTable: { StandingsLists: [{ season: "2026", round: "18", ConstructorStandings: TEAMS.map(([id, name], i) =>
  ({ position: String(i + 1), positionText: String(i + 1), points: String(700 - i * 60), wins: String(Math.max(0, 8 - 2 * i)), Constructor: { constructorId: id, name } })) }] } } };
const EPL_TEAMS = [...new Set(data.matches.filter(m => m.code === "EPL").flatMap(m => [m.home, m.away]))].slice(0, 20);
const short = n => n.replace(/\b(FC|AFC)\b/g, "").trim();

const board = {
  events: [{
    id: "900001", date: MATCH.utc.replace("+00:00", "Z"),
    competitions: [{
      status: { displayClock: "67'", type: { state: "in", shortDetail: "67'" } },
      competitors: [
        { homeAway: "home", score: "2", team: { id: "1", displayName: short(MATCH.home) } },
        { homeAway: "away", score: "1", team: { id: "2", displayName: short(MATCH.away) } }],
    }],
  }],
};

const P = (id, name, jersey, pos, starter = true) =>
  ({ starter, jersey: String(jersey), athlete: { id, displayName: name }, position: { abbreviation: pos } });
const ev = (type, min, team, ...who) => ({ id: type + min + who.join(), type: { text: type }, clock: { displayValue: min },
  team: { id: team }, participants: who.map(id => ({ athlete: { id, displayName: NAMES[id] } })) });
const NAMES = {
  h1: "Tomás Varga", h2: "Kieran Holt", h3: "Luca Brandt", h4: "Samuel Osei", h5: "Rui Matos", h6: "Declan Frey",
  h7: "Mateo Ibarra", h8: "Oliver Nash", h9: "Jonas Keller", h10: "Arlo Penn", h11: "Yusuf Demir", h12: "Theo Marsh", h13: "Nico Albers",
  a1: "Bruno Leal", a2: "Callum Reid", a3: "Ethan Ward", a4: "Pieter de Ruiter", a5: "Marco Sala", a6: "Finn Adair",
  a7: "Hugo Baptiste", a8: "Isaac Bell", a9: "Kofi Mensah", a10: "Lewis Dunn", a11: "Rafael Cunha", a12: "Sam Price", a13: "Owen Tate",
};
const roster = (side, formation, pos) => ({
  homeAway: side, formation, team: { id: side === "home" ? "1" : "2" },
  coach: [{ displayName: side === "home" ? "Martin Albright" : "Daniel Farrow" }],
  roster: Object.keys(NAMES).filter(k => k[0] === side[0]).map((id, i) => P(id, NAMES[id], i + 1, pos[i], i < 11)),
});
const POS = ["G", "D", "D", "D", "D", "M", "M", "M", "F", "F", "F", "M", "F"];
const summary = {
  header: { competitions: [board.events[0].competitions[0]] },
  rosters: [roster("home", "4-3-3", POS), roster("away", "4-2-3-1", POS)],
  keyEvents: [
    ev("Kickoff", "1'", "1"),
    ev("Penalty - Scored", "12'", "1", "h9"),
    ev("Yellow Card", "28'", "2", "a4"),
    ev("Goal - Header", "34'", "2", "a9"),
    ev("Halftime", "45'+2'", "1"),
    ev("Yellow Card", "51'", "1", "h7"),
    ev("Substitution", "58'", "1", "h12", "h10"),
    ev("Goal", "63'", "1", "h11"),
    ev("Red Card", "65'", "2", "a4"),
    ev("Substitution", "66'", "2", "a12", "a11"),
  ],
  gameInfo: { venue: { fullName: "Emirates Stadium", address: { city: "London", country: "England" } }, attendance: 60183,
    officials: [{ displayName: "Graham Lowe" }] },
};

const standings = {
  children: [{ standings: { entries: EPL_TEAMS.map((t, i) => {
    const w = 6 - Math.floor(i / 4), d = i % 3, l = Math.max(0, 6 - w - d), gd = 12 - i;
    return { team: { displayName: short(t) }, stats: [
      { name: "rank", value: i + 1 }, { name: "gamesPlayed", value: w + d + l }, { name: "wins", value: w },
      { name: "ties", value: d }, { name: "losses", value: l }, { name: "pointDifferential", value: gd }, { name: "points", value: w * 3 + d }] };
  }) } }],
};
// The Nations League's standings: one table per group, as ESPN sends them (League A, plus a League B group the page
// must leave out). Made-up points.
const GROUPS = { A1: ["Belgium", "France", "Italy", "Türkiye"], A2: ["Germany", "Greece", "Netherlands", "Serbia"],
  A3: ["Croatia", "Czechia", "England", "Spain"], A4: ["Denmark", "Norway", "Portugal", "Wales"], B1: ["Scotland", "Slovenia", "Switzerland", "North Macedonia"] };
const unlStandings = { children: Object.entries(GROUPS).map(([g, teams]) => ({ name: "Group " + g, standings: { entries: teams.map((t, i) => ({
  team: { displayName: t }, stats: [{ name: "rank", value: i + 1 }, { name: "gamesPlayed", value: 2 }, { name: "wins", value: 2 - Math.min(i, 2) },
    { name: "ties", value: 0 }, { name: "losses", value: Math.min(i, 2) }, { name: "pointDifferential", value: 3 - 2 * i }, { name: "points", value: 3 * (2 - Math.min(i, 2)) }] })) } })) };

// The Libertadores' eight group tables, plus a qualifying table the page must leave out. Made-up points.
const LIB_GROUPS = "ABCDEFGH".split("").map((g, k) => [g, ["Fluminense", "Palmeiras", "Estudiantes de La Plata", "Independiente del Valle",
  "Boca Juniors", "River Plate", "Peñarol", "Nacional", "Olimpia", "Libertad", "Barcelona SC", "Emelec", "Colo-Colo", "Universidad de Chile",
  "Sporting Cristal", "Alianza Lima", "Bolívar", "The Strongest", "Atlético Nacional", "Millonarios", "Cerro Porteño", "Guaraní",
  "Liga de Quito", "Aucas", "Racing Club", "Independiente", "Caracas", "Deportivo Táchira", "San Lorenzo", "Talleres", "Always Ready", "Universitario"]
  .slice(k * 4, k * 4 + 4)]);
const libStandings = { children: [...LIB_GROUPS, ["Qualifying", ["Team One", "Team Two"]]].map(([g, teams]) => ({ name: g.length === 1 ? "Group " + g : g,
  standings: { entries: teams.map((t, i) => ({ team: { displayName: t }, stats: [{ name: "rank", value: i + 1 }, { name: "gamesPlayed", value: 6 },
    { name: "wins", value: 4 - i }, { name: "ties", value: i % 2 }, { name: "losses", value: 2 + i - (i % 2) - 0 }, { name: "pointDifferential", value: 6 - 3 * i },
    { name: "points", value: 3 * (4 - i) + (i % 2) }] })) } })) };

const wdSearch = { search: [{ id: "Q1" }] };
const wdEntities = { entities: { Q1: { descriptions: { en: { value: "football stadium in London" } },
  claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 51.555, longitude: -0.108611 } } } }] } } } };

// The list the test server hands out: the real matches, with the sample F1 weekends in place of any real sessions of
// the same weekends (fixtures.json gains real rounds over the season; two sessions with one uid would show twice), and
// the sample Libertadores matches in place of the real ones (whose number changes over the season).
const SAMPLE_WK = new Set(F1.map(m => m.wk));
// Two league matches after the sample one, as the league cross-check writes them (build_schedule.py, cross_check()):
// one whose sources agree (verified) and one whose sources disagree (the feed's time stays, with the warning). Neither
// is provisional, as cross_check() never checks a placeholder (fixtures.json from the openfootball backup can flag one).
const LEAGUE_TIMED = data.matches.filter(m => m.code === "EPL" && m.utc && !m.result && m.uid !== MATCH.uid).slice(0, 2);
export const [LEAGUE_OK, LEAGUE_DIFFER] = LEAGUE_TIMED.map(m => m.uid);
const leagueChecks = {
  [LEAGUE_OK]: { status: "confirmed", basis: "3 independent sources agree",
    sources: [{ source: "football-data.org" }, { source: "openfootball", url: "https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json" },
      { source: "ESPN", url: "https://www.espn.com/soccer/match/_/gameId/900201" }] },
  [LEAGUE_DIFFER]: { status: "conflicting", sources: [{ source: "football-data.org" }, { source: "ESPN", url: "https://www.espn.com/soccer/match/_/gameId/900202" }],
    reported: [LEAGUE_TIMED[1]?.utc, LEAGUE_TIMED[1] && new Date(Date.parse(LEAGUE_TIMED[1].utc) + 9e6).toISOString().replace(/\.\d+Z$/, "+00:00")] },
};
// the verified match also has a CazéTV stream (cazetv.py), so its card shows both buttons
const WATCH = { url: "https://www.youtube.com/watch?v=aBcDeFgHiJk", kind: "live" };
const MATCHES = [...data.matches.filter(m => !SAMPLE_WK.has(m.wk) && m.code !== "LIB").map(m => leagueChecks[m.uid] ? { ...m, provisional: false, check: leagueChecks[m.uid], ...(m.uid === LEAGUE_OK ? { watch: WATCH } : {}) } : m), ...F1, ...LIB]
  .sort((a, b) => (a.utc || a.date + "T99") < (b.utc || b.date + "T99") ? -1 : 1);   // in time order, as build_schedule.py writes it
const dupes = MATCHES.map(m => m.uid).filter((u, i, all) => all.indexOf(u) !== i);
if (dupes.length) throw new Error(`Sample data has more than one match with the same uid: ${[...new Set(dupes)].map(String).join(", ")}`);

// Presses "Show more" until the sample match's card is in the list, as a visitor would. The list shows about 40
// matches at first, and in an international break the Nations League and friendlies can push the first Premier
// League match past them. Works with Playwright and Puppeteer pages alike.
export async function showMatch(page, uid = MATCH.uid) {
  const shown = () => page.evaluate(u => !!document.querySelector(`.md-open[data-uid="${CSS.escape(u)}"]`), uid);
  for (let i = 0; i < 5 && !(await shown()); i++) {
    await page.evaluate(() => document.getElementById("more")?.click());
    await new Promise(r => setTimeout(r, 700));   // the new days rise into place
  }
  if (!(await shown())) throw new Error(`the sample match ${uid} is not in the list, even after "Show more"`);
  // in view, so it is drawn: the browser skips laying out days far from the window (content-visibility in styles.css),
  // and a click aimed at a day not yet drawn can land where the match was guessed to be rather than where it is
  await page.evaluate(u => document.querySelector(`.md-open[data-uid="${CSS.escape(u)}"]`).scrollIntoView({ block: "center" }), uid);
  await new Promise(r => setTimeout(r, 100));
}

// team badges as build_schedule.py writes them: crests (ESPN team numbers) for the sample match's clubs, and flags for
// two national teams, on top of whatever the last build saved
const BADGES = { ...(data.badges || {}), [MATCH.home]: { crest: "359" }, [MATCH.away]: { crest: "360" },
  Argentina: { flag: "ar" }, Bolivia: { flag: "bo" } };

// where to watch, as build_schedule.py publishes it from broadcasters.json
export const BROADCASTERS = { EPL: { CA: ["Fubo"], BR: ["ESPN"] }, LIGA: { CA: ["TSN", "RDS"] }, F1: { BR: ["Globo"] } };

// The sample answer for one outside request, or null to let it through (the test server's own files).
// Only the sample match's league has a match on the scoreboard.
export function answerFor(u) {
  if (new URL(u).pathname.endsWith("/fixtures.json"))
    return { status: 200, contentType: "application/json", body: JSON.stringify({ ...data, f1stale: true, matches: MATCHES, badges: BADGES, broadcasters: BROADCASTERS }) };
  // club crests from ESPN's picture server: a plain grey shield stands in for each (never mistaken for a real crest)
  if (u.includes("a.espncdn.com/combiner/i?img=/i/teamlogos/")) return { status: 200, contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 3 35 8v12c0 9-6 15-15 17C11 35 5 29 5 20V8z" fill="#8a93a6"/></svg>' };
  const json = body => ({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  if (u.includes("api.jolpi.ca")) {
    if (u.includes("/qualifying/")) return json(f1Quali);
    if (u.includes("/results/")) return json(f1Race);
    if (u.includes("/driverstandings/")) return json(f1Drivers);
    if (u.includes("/constructorstandings/")) return json(f1Teams);
    return json({ MRData: { RaceTable: { Races: [] } } });
  }
  if (u.includes("espn.com")) {
    if (u.includes("/uefa.nations/standings")) return json(unlStandings);
    if (u.includes("/conmebol.libertadores/standings")) return json(libStandings);
    if (u.includes("/standings")) return json(standings);
    if (u.includes("/summary")) return json(summary);
    if (u.includes("/eng.1/scoreboard")) return json(board);
    return json({ events: [] });
  }
  if (u.includes("wikidata.org")) return json(u.includes("wbsearchentities") ? wdSearch : wdEntities);
  // map tiles: a plain light-green square stands in for each OpenStreetMap tile
  if (u.includes("tile.openstreetmap.org")) return { status: 200, contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dfe8d8" stroke="#c9d6c0"/><path d="M0 128h256M128 0v256" stroke="#fff" stroke-width="6"/></svg>' };
  return null;
}

// Answers each outside request with sample data (Puppeteer: axe.mjs, layout.mjs, screenshots.mjs and the others).
export async function mockNetwork(page) {
  await page.setRequestInterception(true);
  page.on("request", req => {
    const a = answerFor(req.url());
    return a ? req.respond(a) : req.continue();
  });
}

// The same for Playwright (browsers.mjs), for every page opened in one browser context.
export async function mockRoutes(context) {
  await context.route("**/*", route => {
    const a = answerFor(route.request().url());
    return a ? route.fulfill(a) : route.continue();
  });
}
