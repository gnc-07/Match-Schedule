/* ---------- match details: line-ups, goals, cards and substitutions, stadium (a panel over the list) ---------- */
const TABLE_CODES = ["EPL", "LIGA", "BUN", "BRA"]; // leagues that have a table (not friendlies)
const matchParam = () => new URLSearchParams(location.search).get("match");
const matchHref = r => "?match=" + encodeURIComponent(r.uid);
const shareURL = r => {
  const u = new URL(location.pathname, location.href);
  u.searchParams.set("match", r.uid);
  if (LANG === "pt") u.searchParams.set("lang", "pt");
  return u.href;
};
const EVID = new Map(); // our match key -> ESPN event (or null when ESPN does not list it)
let MD = null; // the match being shown: {r, root, S, status, timer, venueKey, seen}

const SUMS = new Map(); // ESPN event id -> match summary download
function summary(ev) {
  const oldb = /^oldb-(\d+)$/.exec(ev.id); // found through the backup source (ESPN was not answering)
  if (oldb) return reuse(SUMS, ev.id, 20e3, () => oldbSummary(oldb[1]));
  return reuse(SUMS, ev.id, 20e3, () =>
    fetch(ESPN_API + ev.slug + "/summary?event=" + encodeURIComponent(ev.id), { cache: "no-store" })
      .then(res => {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(parseSummary),
  );
}
// Start loading a match's details as soon as the visitor points at, touches or tabs to its button, so they are ready on click.
function warmMatch(uid) {
  const r = DATA.find(x => x.uid === uid);
  if (!r || !ESPN[r.code]) return;
  findEvent(r)
    .then(ev => {
      if (ev) return summary(ev);
    })
    .catch(() => {});
}
async function findEvent(r) {
  const slug = ESPN[r.code];
  if (!slug) return null;
  const k = keyOf(r),
    L = LIVE.get(k) || FINAL.get(k);
  if (L && L.id) return { slug, id: L.id };
  if (EVID.has(k)) return EVID.get(k);
  const ev = (await board(slug, etDay(r.when || new Date(r.date + "T18:00:00Z")))).find(e => sameMatch(r, e));
  const out = ev ? { slug, id: ev.id } : null;
  if (!ev || !ev.src) EVID.set(k, out); // one found through the backup is not kept: ESPN is tried again next time
  return out;
}
function kindOf(e) {
  const t = String((e.type && (e.type.text || e.type.type)) || "").toLowerCase();
  if (t.includes("own goal")) return "og";
  if (t.includes("penalty") && /miss|saved/.test(t)) return "penMiss";
  if (t.includes("penalty") && /scored|goal/.test(t)) return "pen";
  if (t.includes("goal") || e.scoringPlay) return "goal";
  if (t.includes("yellow")) return "yellow";
  if (/\bred\b/.test(t)) return "red";
  if (t.includes("substitution")) return "sub";
  if (/half ?time/.test(t)) return "half";
  return "";
}
// ESPN's match summary, reduced to what the page shows
function parseSummary(js) {
  const comp = ((js.header || {}).competitions || [])[0] || {},
    st = comp.status || {},
    ty = st.type || {};
  const side = {},
    sideOf = {};
  for (const c of comp.competitors || []) {
    side[c.homeAway] = c;
    sideOf[(c.team && c.team.id) || c.id] = c.homeAway;
  }
  const rosters = {};
  for (const t of js.rosters || []) {
    const h = t.homeAway || sideOf[t.team && t.team.id];
    if (h) rosters[h] = t;
  }
  const booked = new Set(),
    events = [];
  for (const e of js.keyEvents || []) {
    let kind = kindOf(e);
    if (!kind) continue;
    const ps = (e.participants || []).map(p => p.athlete || {}).filter(a => a.displayName || a.id);
    const who = ps.map(a => a.displayName || "");
    const pid = ps[0] && (ps[0].id || ps[0].displayName);
    if (kind === "yellow" && pid) booked.add(pid);
    if (kind === "red" && pid && booked.has(pid)) kind = "second";
    events.push({
      id: e.id || kind + (e.clock && e.clock.value) + who.join(),
      kind,
      min: (e.clock && e.clock.displayValue) || "",
      side: sideOf[e.team && e.team.id],
      team: (e.team && e.team.displayName) || "",
      who,
      ids: ps.map(a => a.id || a.displayName),
    });
  }
  const gi = js.gameInfo || {},
    v = gi.venue || {},
    ad = v.address || {};
  return {
    state: ty.state,
    clock: ty.state === "in" ? (ty.shortDetail === "HT" ? "HT" : st.displayClock || ty.shortDetail || "") : "",
    detail: ty.shortDetail || "",
    hs: side.home && side.home.score,
    as: side.away && side.away.score,
    rosters,
    events,
    venue: v.fullName ? { name: v.fullName, city: [ad.city, ad.country].filter(Boolean).join(", ") } : null,
    attendance: gi.attendance || null,
    referee: ((gi.officials || [])[0] || {}).displayName || "",
  };
}

// small pieces of the page
const EV_ICON = {
  goal: "ball",
  pen: "ball",
  og: "og",
  penMiss: "miss",
  yellow: "yellow",
  second: "second",
  red: "red",
  subOn: "subOn",
  subOff: "subOff",
  sub: "sub",
};
function mark(kind, min) {
  const cls = kind === "subOn" ? " on" : kind === "subOff" ? " off" : "";
  const extra = kind === "pen" ? " " + T.penShort : kind === "og" ? " " + T.ogShort : "";
  return (
    '<span class="mk' +
    cls +
    '">' +
    ICON[EV_ICON[kind]] +
    '<span class="sr">' +
    esc(T.ev[kind]) +
    " </span>" +
    esc(min + extra) +
    "</span>"
  );
}
function mdHead(m) {
  const r = m.r,
    S = m.S,
    L = liveOf(r);
  const st =
    S && S.state && S.state !== "pre"
      ? { state: S.state, clock: S.clock, detail: S.detail, hs: S.hs, as: S.as }
      : L && L.state !== "pre"
        ? L
        : null;
  // row 1: home team, score (or kick-off time), away team, all on one line; row 2: the LIVE or FT label under the score
  let mid,
    tag = "";
  if (st) {
    mid =
      '<span class="md-sc" role="img" aria-label="' +
      esc(T.score(st.hs, st.as)) +
      '">' +
      esc(st.hs) +
      "–" +
      esc(st.as) +
      "</span>";
    tag =
      st.state === "in"
        ? '<span class="pill live"><span class="dot-live" aria-hidden="true"></span>' +
          esc(T.pLive) +
          " " +
          esc(st.clock) +
          "</span>"
        : '<span class="pill ft">' + esc(st.detail === "FT" || !st.detail ? T.ft : st.detail) + "</span>";
  } else
    mid = r.when
      ? '<span class="md-kick"><time datetime="' +
        esc(r.utc) +
        '">' +
        fmtT.format(r.when) +
        "</time> <small>" +
        zoneOf(r.when) +
        "</small></span>"
      : '<span class="pill tbc">' + esc(T.pTbc) + "</span>";
  const dd = new Date(r.day + "T12:00:00Z"),
    long = fmtDayLong.format(dd);
  const when =
    long.charAt(0).toUpperCase() +
    long.slice(1) +
    (r.when && st ? " · " + T.mdKick + " " + fmtT.format(r.when) + " " + zoneOf(r.when) : "");
  return (
    '<p class="md-comp" style="--c:' +
    colorOf(r.code) +
    '"><b><i aria-hidden="true"></i>' +
    esc(compName(r.comp)) +
    "</b>" +
    (r.round ? "<span>" + esc(T.round(r.round)) + "</span>" : "") +
    "</p>" +
    '<h3 class="sr">' +
    esc(teamName(r.home) + T.vs + teamName(r.away)) +
    "</h3>" +
    '<div class="md-board"><p class="tm">' +
    esc(teamName(r.home)) +
    '</p><div class="md-mid">' +
    mid +
    '</div><p class="tm">' +
    esc(teamName(r.away)) +
    "</p>" +
    (tag ? '<div class="md-tag">' + tag + "</div>" : "") +
    "</div>" +
    '<p class="md-when">' +
    esc(when) +
    "</p>"
  );
}
function mdActions(r) {
  const L = liveOf(r);
  return (
    '<div class="md-actions"><button type="button" class="btn" id="md-ics">' +
    ICON.calAdd +
    "<span>" +
    esc(T.addCal) +
    "</span></button>" +
    '<button type="button" class="btn" id="md-share">' +
    ICON.share +
    "<span>" +
    esc(T.share) +
    "</span></button>" +
    (TABLE_CODES.includes(r.code)
      ? '<button type="button" class="btn" id="md-table">' +
        ICON.table +
        "<span>" +
        esc(T.mdTable(LEAGUES.find(l => l.code === r.code).name)) +
        "</span></button>"
      : "") +
    "</div>" +
    watchHTML(r, L) +
    '<p class="toast" id="md-toast" role="status"></p><p class="hint">' +
    esc(T.addCalNote) +
    "</p>"
  );
}
function mdEvents(m) {
  const S = m.S;
  if (!S || (!S.events.length && S.state === "pre")) return "";
  const nm = side => (side === "home" ? teamName(m.r.home) : side === "away" ? teamName(m.r.away) : "");
  const rows = S.events
    .map(e => {
      if (e.kind === "half") return '<li class="sep">' + esc(T.ev.half) + "</li>";
      const team = e.side ? nm(e.side) : e.team;
      const who = e.kind === "sub" && e.who.length > 1 ? T.subFor(e.who[0], e.who[1]) : e.who[0] || "";
      return (
        '<li><span class="min">' +
        esc(e.min) +
        "</span>" +
        ICON[EV_ICON[e.kind]] +
        '<span><span class="what">' +
        esc(T.ev[e.kind]) +
        "</span>" +
        '<span class="who">' +
        esc(who) +
        (team ? ' <span class="tm-n">· ' + esc(team) + "</span>" : "") +
        "</span></span></li>"
      );
    })
    .join("");
  return (
    "<h3>" +
    esc(T.mdEvents) +
    "</h3>" +
    (rows ? '<ol class="tl">' + rows + "</ol>" : '<p class="md-note">' + esc(T.mdNoEvents) + "</p>")
  );
}
function mdLineups(m) {
  const S = m.S;
  if (!S || S.src === "oldb") return ""; // the backup source has no line-ups at all, so no "they appear later" note
  const marks = new Map(); // player -> goals, cards, substitutions with minutes
  const add = (id, kind, min) => {
    if (!id) return;
    if (!marks.has(id)) marks.set(id, []);
    marks.get(id).push(mark(kind, min));
  };
  for (const e of S.events) {
    if (e.kind === "sub") {
      add(e.ids[0], "subOn", e.min);
      add(e.ids[1], "subOff", e.min);
    } else if (e.kind !== "half") add(e.ids[0], e.kind, e.min);
  }
  const team = (sideName, t) => {
    if (!t || !(t.roster || []).length) return "";
    const coachObj = Array.isArray(t.coach) ? t.coach[0] : t.coach;
    const coach =
      coachObj && (coachObj.displayName || [coachObj.firstName, coachObj.lastName].filter(Boolean).join(" "));
    const li = p => {
      const a = p.athlete || {},
        id = a.id || a.displayName;
      return (
        '<li><span class="no">' +
        esc(p.jersey || "") +
        '</span><span class="pn">' +
        esc(a.displayName || "") +
        "</span>" +
        (p.position && p.position.abbreviation ? '<span class="pos">' + esc(p.position.abbreviation) + "</span>" : "") +
        (marks.get(id) || []).join("") +
        "</li>"
      );
    };
    const starters = t.roster.filter(p => p.starter),
      bench = t.roster.filter(p => !p.starter);
    return (
      "<div><h4>" +
      esc(sideName) +
      (t.formation ? " <small>" + esc(t.formation) + "</small>" : "") +
      "</h4>" +
      (coach ? '<p class="coach">' + esc(T.mdCoach) + " " + esc(coach) + "</p>" : "") +
      "<h5>" +
      esc(T.mdStarting) +
      "</h5><ul>" +
      starters.map(li).join("") +
      "</ul>" +
      (bench.length ? "<h5>" + esc(T.mdSubs) + "</h5><ul>" + bench.map(li).join("") + "</ul>" : "") +
      "</div>"
    );
  };
  const h = team(teamName(m.r.home), S.rosters.home),
    a = team(teamName(m.r.away), S.rosters.away);
  const key =
    '<p class="key"><b>' +
    esc(T.keyLabel) +
    "</b>" +
    ["goal", "og", "penMiss", "yellow", "second", "red", "subOn", "subOff"]
      .map(
        k =>
          '<span class="' +
          (k === "subOn" ? "mk on" : k === "subOff" ? "mk off" : "") +
          '">' +
          ICON[EV_ICON[k]] +
          esc(T.ev[k]) +
          "</span>",
      )
      .join("") +
    "</p>";
  return (
    "<h3>" +
    esc(T.mdLineups) +
    "</h3>" +
    (h || a ? key + '<div class="lu">' + h + a + "</div>" : '<p class="md-note">' + esc(T.mdNoLineups) + "</p>")
  );
}
function mdVenue(m) {
  const v =
    (m.S && m.S.venue) ||
    (m.r.venue ? { name: m.r.venue.split(",")[0], city: m.r.venue.split(",").slice(1).join(",").trim() } : null);
  if (!v) return "";
  const full = [v.name, v.city].filter(Boolean).join(", ");
  const facts = [];
  if (m.S && m.S.attendance)
    facts.push("<dt>" + esc(T.mdAttendance) + "</dt><dd>" + Number(m.S.attendance).toLocaleString(T.locale) + "</dd>");
  if (m.S && m.S.referee) facts.push("<dt>" + esc(T.mdReferee) + "</dt><dd>" + esc(m.S.referee) + "</dd>");
  return (
    "<h3>" +
    esc(T.mdVenue) +
    "</h3><p>" +
    esc(full) +
    "</p>" +
    (facts.length ? "<dl>" + facts.join("") + "</dl>" : "") +
    '<div class="map" id="md-map" data-name="' +
    esc(v.name) +
    '" data-full="' +
    esc(full) +
    '"><p class="md-note">' +
    esc(T.mdMapWait) +
    "</p></div>"
  );
}
// stadium coordinates from Wikidata (free, no key), remembered in this browser
async function coords(name) {
  const k = "geo." + name.toLowerCase(),
    c = store.get(k, null);
  if (c) return c.lat != null ? c : null;
  const W = "https://www.wikidata.org/w/api.php?format=json&origin=*&";
  // An answer that is not a real result (an HTTP error, or Wikidata's own {"error": ...}, which can come with
  // status 200) throws, so it is never saved as "no location": paintMap shows the link, and the next visit asks again.
  const ask = async query => {
    const res = await fetch(W + query);
    if (!res.ok) throw new Error(res.status);
    const js = await res.json();
    if (!js || typeof js !== "object" || js.error) throw new Error("Wikidata did not answer");
    return js;
  };
  const found = await ask("action=wbsearchentities&type=item&limit=5&language=en&search=" + encodeURIComponent(name));
  if (!Array.isArray(found.search)) throw new Error("Wikidata did not answer");
  const ids = found.search.map(x => x.id);
  if (!ids.length) {
    store.set(k, {}); // Wikidata answered and knows no such place
    return null;
  }
  const got = await ask("action=wbgetentities&props=claims|descriptions&languages=en&ids=" + ids.join("|"));
  if (!got.entities || typeof got.entities !== "object") throw new Error("Wikidata did not answer");
  const ents = got.entities;
  const withXY = ids.map(id => ents[id]).filter(e => e && e.claims && e.claims.P625);
  const best =
    withXY.find(e =>
      /stadium|arena|ground|park|venue|estadio|estádio|stadion/i.test(((e.descriptions || {}).en || {}).value || ""),
    ) || withXY[0];
  const p = best && best.claims.P625[0].mainsnak.datavalue.value;
  const out = p ? { lat: +p.latitude.toFixed(5), lon: +p.longitude.toFixed(5) } : {};
  store.set(k, out);
  return out.lat != null ? out : null;
}
// The map is a few plain OpenStreetMap tile images with a pin on top: no map program to download,
// so it opens instantly and costs only the tiles that fit the box, fetched only once the visitor scrolls to them.
const TILE = 256,
  ZOOM = 16;
async function paintMap(box, known, z = ZOOM) {
  // known: {lat,lon} when the source already gives them (F1 circuits)
  let c = known || null;
  if (!c)
    try {
      c = await coords(box.dataset.name);
    } catch {}
  if (!box.isConnected) return;
  if (c) c = { lat: +c.lat, lon: +c.lon };
  if (c && !(Math.abs(c.lat) <= 85 && Math.abs(c.lon) <= 180)) c = null; // not two sensible numbers: show the "find it" link instead
  if (!c) {
    box.innerHTML =
      '<p class="md-note">' +
      esc(T.mdMapNone) +
      ' <a href="https://www.openstreetmap.org/search?query=' +
      encodeURIComponent(box.dataset.full) +
      '" target="_blank" rel="noopener">' +
      esc(T.mdMapFind) +
      "</a></p>";
    return;
  }
  const n = 2 ** z,
    rad = (c.lat * Math.PI) / 180;
  const fx = ((c.lon + 180) / 360) * n,
    fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n; // the stadium, in tiles
  const W = box.clientWidth || 600,
    H = 240,
    cx = W / 2,
    cy = H / 2;
  const x0 = Math.floor(fx - cx / TILE),
    x1 = Math.floor(fx + cx / TILE),
    y0 = Math.floor(fy - cy / TILE),
    y1 = Math.floor(fy + cy / TILE);
  let tiles = "";
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      tiles +=
        '<img alt="" loading="lazy" decoding="async" width="256" height="256" style="left:' +
        Math.round(cx + (x - fx) * TILE) +
        "px;top:" +
        Math.round(cy + (y - fy) * TILE) +
        'px" src="https://tile.openstreetmap.org/' +
        z +
        "/" +
        x +
        "/" +
        y +
        '.png">';
  box.innerHTML =
    '<div class="tiles" role="img" aria-label="' +
    esc(T.mdMapTitle(box.dataset.full)) +
    '">' +
    tiles +
    ICON.pinMap +
    "</div>" +
    '<p class="map-foot"><a href="https://www.openstreetmap.org/?mlat=' +
    c.lat +
    "&amp;mlon=" +
    c.lon +
    "#map=" +
    (z + 1) +
    "/" +
    c.lat +
    "/" +
    c.lon +
    '" target="_blank" rel="noopener">' +
    esc(T.mdMapLarger) +
    "</a>" +
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">' +
    esc(T.mdMapCredit) +
    "</a></p>";
}
