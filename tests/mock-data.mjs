// Sample answers for the outside services the page calls (ESPN, Wikidata, OpenStreetMap), so the tests
// give the same result every time and work offline. The names and numbers are made up; the shapes follow
// what those services return. Used by axe.mjs and screenshots.mjs, never by the published site.
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
    circuit: { name: "Marina Bay Street Circuit", locality: "Marina Bay", country: "Singapore", lat: 1.2914, lon: 103.864 } }),
  f1("19", "FP1", 26), f1("19", "SQ", 30), f1("19", "S", 50),
  f1("19", "Q", 54, { check: { ...agree, status: "conflicting", reported: [hrs(54), hrs(54.5)] } }),
  f1("19", "R", 74, { sprint: true, check: agree }),
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
  ({ position: String(i + 1), positionText: String(i + 1), points: String(400 - i * 17), wins: String(Math.max(0, 6 - i)), Driver: x.d, Constructors: [x.c] })) }] } } };
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

const wdSearch = { search: [{ id: "Q1" }] };
const wdEntities = { entities: { Q1: { descriptions: { en: { value: "football stadium in London" } },
  claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 51.555, longitude: -0.108611 } } } }] } } } };

// Answers each outside request with sample data (only the sample match's league has a match on the scoreboard).
export async function mockNetwork(page) {
  await page.setRequestInterception(true);
  page.on("request", req => {
    const u = req.url();
    if (new URL(u).pathname.endsWith("/fixtures.json"))
      return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...data, f1stale: true, matches: [...data.matches, ...F1].sort((a, b) => (a.utc || a.date + "T99") < (b.utc || b.date + "T99") ? -1 : 1) }) });   // in time order, as build_schedule.py writes it
    const json = body => req.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (u.includes("api.jolpi.ca")) {
      if (u.includes("/qualifying/")) return json(f1Quali);
      if (u.includes("/results/")) return json(f1Race);
      if (u.includes("/driverstandings/")) return json(f1Drivers);
      if (u.includes("/constructorstandings/")) return json(f1Teams);
      return json({ MRData: { RaceTable: { Races: [] } } });
    }
    if (u.includes("espn.com")) {
      if (u.includes("/standings")) return json(standings);
      if (u.includes("/summary")) return json(summary);
      if (u.includes("/eng.1/scoreboard")) return json(board);
      return json({ events: [] });
    }
    if (u.includes("wikidata.org")) return json(u.includes("wbsearchentities") ? wdSearch : wdEntities);
    // map tiles: a plain light-green square stands in for each OpenStreetMap tile
    if (u.includes("tile.openstreetmap.org")) return req.respond({ status: 200, contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dfe8d8" stroke="#c9d6c0"/><path d="M0 128h256M128 0v256" stroke="#fff" stroke-width="6"/></svg>' });
    return req.continue();
  });
}
