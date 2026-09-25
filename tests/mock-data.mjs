// Sample answers for the outside services the page calls (ESPN, Wikidata, OpenStreetMap), so the tests
// give the same result every time and work offline. The names and numbers are made up; the shapes follow
// what those services return. Used by axe.mjs and screenshots.mjs, never by the published site.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./server.mjs";

const data = JSON.parse(readFileSync(path.join(ROOT, "fixtures.json"), "utf8"));
// the sample match: the first Premier League match with a confirmed time
export const MATCH = data.matches.find(m => m.code === "EPL" && m.utc);
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
    const json = body => req.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
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
