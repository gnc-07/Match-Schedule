/* ---------- Formula 1 race weekend: schedule, results, championship, circuit (the same panel as match details) ---------- */
// Results and standings come from Jolpica-F1, fetched by the visitor's browser when the panel opens
// (it allows any website to read it). One request at a time: Jolpica allows 4 a second.
const JOL = "https://api.jolpi.ca/ergast/f1/";
const TEAM_C = {
  mclaren: "--t-mcl",
  ferrari: "--t-fer",
  red_bull: "--t-rbr",
  mercedes: "--t-mer",
  aston_martin: "--t-amr",
  alpine: "--t-alp",
  williams: "--t-wil",
  rb: "--t-rb",
  haas: "--t-haa",
  audi: "--t-aud",
  sauber: "--t-aud",
  cadillac: "--t-cad",
};
const f1favs = new Set(store.get("f1favs", []));
let WK = null; // the weekend being shown: {wk, root, list, res, pick, standD, standC, tab, all, timer, state}
async function jol(path) {
  const res = await fetch(JOL + path, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function openWeekend(wk, root) {
  document.getElementById("md-h").textContent = T.f1WkTitle;
  const list = DATA.filter(x => x.wk === wk).sort((a, b) => (a.when || 0) - (b.when || 0));
  if (!list.length) {
    root.innerHTML = '<div class="md"><p class="md-card md-note">' + esc(T.mdGone) + "</p></div>";
    return;
  }
  WK = {
    wk,
    root,
    list,
    res: {},
    pick: null,
    standD: null,
    standC: null,
    tab: "d",
    all: false,
    timer: 0,
    state: "loading",
    venue: false,
  };
  root.innerHTML =
    '<article class="md"><section class="md-card md-top" id="wk-top"></section><section class="md-card" id="wk-sched"></section>' +
    '<section class="md-card flush" id="wk-res"></section><section class="md-card flush" id="wk-champ" hidden></section>' +
    '<section class="md-card venue" id="wk-venue" hidden></section><p class="md-src" id="wk-src"></p></article>';
  root.onclick = weekendClick;
  paintWeekend();
  loadWeekend();
}
function stopWeekend() {
  if (WK) {
    clearTimeout(WK.timer);
    WK.root.onclick = null;
    WK = null;
  }
}
async function loadWeekend() {
  const w = WK;
  if (!w) return;
  const [season, round] = w.wk.split("|").slice(1),
    now = Date.now();
  const started = s => {
    const r = w.list.find(x => x.sess === s);
    return r && r.when && now > r.when.getTime();
  };
  try {
    for (const [s, path, key] of [
      ["S", "sprint", "SprintResults"],
      ["Q", "qualifying", "QualifyingResults"],
      ["R", "results", "Results"],
    ]) {
      if (!started(s)) continue;
      if (WK !== w) return; // the panel was closed or switched: stop asking
      const race = (await jol(season + "/" + round + "/" + path + "/?limit=100")).MRData.RaceTable.Races[0];
      if (race && (race[key] || []).length) w.res[s] = race[key];
    }
    if (WK !== w) return;
    w.standD = (await jol(season + "/driverstandings/?limit=100")).MRData.StandingsTable.StandingsLists[0] || null;
    w.standC = (await jol(season + "/constructorstandings/?limit=100")).MRData.StandingsTable.StandingsLists[0] || null;
    w.state = "ok";
  } catch (err) {
    w.state = "error";
  }
  if (WK !== w) return;
  if (!w.res[w.pick]) w.pick = ["R", "Q", "S"].find(s => w.res[s]) || null; // the latest session with results
  paintWeekend();
  // during a weekend's sessions, and for a few hours after each, results can still arrive: look again every 5 minutes
  if (w.list.some(r => r.when && now > r.when.getTime() - 15 * 60e3 && now < r.when.getTime() + 4 * 3600e3))
    w.timer = setTimeout(loadWeekend, 5 * 60e3);
}

const f1Name = d => d.givenName + " " + d.familyName;
// a column heading: the short form on screen, the full word for screen readers (when there is one)
const th = (txt, full, cls) =>
  '<th scope="col"' +
  (cls ? ' class="' + cls + '"' : "") +
  ">" +
  (full ? '<span aria-hidden="true">' + esc(txt) + '</span><span class="sr">' + esc(full) + "</span>" : esc(txt)) +
  "</th>";
function f1Lead(r) {
  // who led a finished session: pole for qualifying, winner for races
  const rows = WK && WK.res[r.sess];
  const name = rows ? f1Name(rows[0].Driver) : r.top && r.top[0];
  return name ? (r.sess === "Q" ? T.f1Pole : T.f1Winner) + ": " + name : "";
}
function f1State(r, next) {
  const now = Date.now();
  if (r.when && now >= r.when.getTime() && now < r.when.getTime() + F1_MIN[r.sess] * 60e3) return "on";
  if ((WK && WK.res[r.sess]) || r.top) return "done";
  return r === next ? "next" : "";
}
function paintWeekend() {
  const w = WK;
  if (!w) return;
  document.getElementById("md-h").textContent = T.f1WkTitle;
  paintWkTop();
  paintWkSched();
  paintWkRes();
  paintWkChamp();
  const race = w.list.find(x => x.sess === "R"),
    c = race && race.circuit,
    v = w.root.querySelector("#wk-venue");
  if (c && !w.venue) {
    w.venue = true;
    const L = c.layout,
      draw = L && /^M[\d LZ]+$/.test(L.path || "") && L.w > 0 && L.h > 0,
      facts = []; // a track outline from build_schedule.py (checked: it goes into the page)
    if (draw && L.length) facts.push("<dt>" + esc(T.f1Length) + "</dt><dd>" + esc(T.f1Km(L.length)) + "</dd>");
    if (draw && L.firstgp) facts.push("<dt>" + esc(T.f1FirstGp) + "</dt><dd>" + esc(L.firstgp) + "</dd>");
    v.innerHTML =
      "<h3>" +
      esc(T.f1Circuit) +
      "</h3><p>" +
      esc(c.name) +
      "</p>" +
      (c.locality ? '<p class="md-note">' + esc([c.locality, c.country].filter(Boolean).join(", ")) + "</p>" : "") +
      (facts.length ? "<dl>" + facts.join("") + "</dl>" : "") +
      (draw
        ? trackSVG(c)
        : '<div class="map" id="wk-map" data-name="' + esc(c.name) + '" data-full="' + esc(c.name) + '"></div>');
    v.hidden = false;
    if (!draw) paintMap(v.querySelector("#wk-map"), c.lat != null ? { lat: c.lat, lon: c.lon } : null, 14); // no outline: a map (found by name without coordinates, or a "find it" link)
  }
  const L = c && c.layout,
    drawn = L && /^M[\d LZ]+$/.test(L.path || "") && L.w > 0 && L.h > 0; // the credit names whichever project drew the track shown
  w.root.querySelector("#wk-src").textContent =
    T.f1Src + (drawn ? " " + (L.src === "julesr0y" ? T.f1TrackAlt : T.f1Track) : "");
}
// The track outline (north up from f1-circuits; f1-circuits-svg drawings may be turned), with a dot where the
// outline starts: on the start/finish line.
function trackSVG(c) {
  const L = c.layout,
    n = L.path.match(/\d+/g),
    pad = 40,
    w = +L.w,
    h = +L.h,
    lat = +c.lat,
    lon = +c.lon; // numbers only: they go into the page
  const map =
    c.lat != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? '<a href="https://www.openstreetmap.org/?mlat=' +
        lat +
        "&amp;mlon=" +
        lon +
        "#map=15/" +
        lat +
        "/" +
        lon +
        '" target="_blank" rel="noopener">' +
        esc(T.f1MapLink) +
        "</a>"
      : "";
  return (
    '<figure class="track"><svg viewBox="' +
    -pad +
    " " +
    -pad +
    " " +
    (w + 2 * pad) +
    " " +
    (h + 2 * pad) +
    '" role="img" aria-label="' +
    esc(T.f1Layout(c.name)) +
    '">' +
    '<path d="' +
    L.path +
    '"/><circle cx="' +
    n[0] +
    '" cy="' +
    n[1] +
    '" r="20"/></svg>' +
    '<figcaption><span class="sf"><i aria-hidden="true"></i>' +
    esc(T.f1StartFinish) +
    "</span>" +
    map +
    "</figcaption></figure>"
  );
}
function paintWkTop() {
  const w = WK,
    S = T.f1Sess,
    now = Date.now(),
    first = w.list[0],
    race = w.list.find(x => x.sess === "R") || w.list[w.list.length - 1];
  const day = (r, o) =>
    new Intl.DateTimeFormat(T.locale, Object.assign({ timeZone: r.when ? TZ : "UTC" }, o)).format(
      r.when || new Date(r.date + "T12:00:00Z"),
    );
  const o = { weekday: "short", month: "short", day: "numeric" },
    a = day(first, o),
    b = day(race, o),
    dates = a === b ? a : T.f1Dates(a, b);
  const on = w.list.find(r => f1State(r) === "on"),
    next = w.list.find(r => r.when && r.when.getTime() > now),
    win = w.res.R && w.res.R[0];
  let board = "";
  if (on)
    board =
      '<div class="f1b"><span class="lbl">' +
      esc(T.f1OnNow) +
      '</span><span class="big">' +
      esc(S[on.sess]) +
      "</span></div>";
  else if (win)
    board =
      '<div class="f1b"><span class="lbl">' +
      esc(T.f1Winner) +
      '</span><span class="big">' +
      esc(f1Name(win.Driver)) +
      '</span><span class="sub">' +
      esc(win.Constructor.name) +
      "</span></div>";
  else if (next)
    board =
      '<div class="f1b"><span class="lbl">' +
      esc(T.f1Next) +
      '</span><span class="big">' +
      esc(S[next.sess] + " · " + day(next, { weekday: "short" }) + " " + fmtT.format(next.when)) +
      " <small>" +
      esc(zoneOf(next.when)) +
      "</small></span></div>";
  const meta = [esc(T.f1Round(race.round))];
  if (race.sprint) meta.push(esc(T.f1SprintWk));
  const top = w.root.querySelector("#wk-top");
  top.style.setProperty("--c", colorOf("F1"));
  top.innerHTML =
    '<p class="md-comp"><b><i aria-hidden="true"></i>' +
    esc(T.f1) +
    "</b><span>" +
    meta.join("</span><span>") +
    "</span></p>" +
    '<h3 class="f1-gp">' +
    esc(gpName(race.gp)) +
    '</h3><p class="md-when">' +
    esc((race.venue ? race.venue + " · " : "") + dates) +
    "</p>" +
    board +
    '<div class="md-actions"><button type="button" class="btn" id="wk-share">' +
    ICON.share +
    "<span>" +
    esc(T.share) +
    '</span></button></div><p class="toast" id="md-toast" role="status"></p>';
}
function paintWkSched() {
  const w = WK,
    S = T.f1Sess,
    now = Date.now(),
    next = w.list.find(r => r.when && r.when.getTime() > now);
  w.root.querySelector("#wk-sched").innerHTML =
    "<h3>" +
    esc(T.f1Schedule) +
    '</h3><ol class="ss">' +
    w.list
      .map(r => {
        const st = f1State(r, next),
          lead = st === "done" ? f1Lead(r) : "";
        const pill =
          st === "on"
            ? '<span class="pill live"><span class="dot-live" aria-hidden="true"></span>' + esc(T.pOn) + "</span>"
            : st === "done"
              ? '<span class="pill ft">' + esc(T.pDone) + "</span>"
              : st === "next"
                ? '<span class="pill next">' + esc(T.f1NextPill) + "</span>"
                : "";
        const d = r.when ? new Intl.DateTimeFormat(T.locale, { weekday: "short", timeZone: TZ }).format(r.when) : "";
        const t = r.when ? '<time datetime="' + esc(r.utc) + '">' + fmtT.format(r.when) + "</time>" : esc(T.tbcSmall);
        return (
          "<li" +
          (r.sess === "R" ? ' class="race"' : "") +
          '><span class="when"><span class="d">' +
          esc(d) +
          "</span> " +
          t +
          "</span>" +
          '<span class="what"><b>' +
          esc(S[r.sess]) +
          "</b>" +
          (lead ? "<small>" + esc(lead) + "</small>" : "") +
          "</span>" +
          pill +
          "</li>"
        );
      })
      .join("") +
    "</ol>";
}
function drvCell(d, team, extra) {
  const fav = f1favs.has(d.driverId),
    name = f1Name(d);
  return (
    '<td class="tm-c"><span class="drv"><span class="tbar" style="--tc:var(' +
    (TEAM_C[team.constructorId] || "--line") +
    ')" aria-hidden="true"></span><span>' +
    '<b><span class="nl">' +
    esc(name) +
    '</span><span class="ns">' +
    esc(d.givenName.charAt(0) + ". " + d.familyName) +
    "</span></b>" +
    '<button type="button" class="star" data-drv="' +
    esc(d.driverId) +
    '" aria-pressed="' +
    fav +
    '" aria-label="' +
    esc((fav ? T.unstar : T.star) + " " + name) +
    '">' +
    (fav ? ICON.star : ICON.starO) +
    "</button>" +
    "<small>" +
    esc(team.name) +
    "</small>" +
    (extra || "") +
    "</span></span></td>"
  );
}
function paintWkRes() {
  const w = WK,
    box = w.root.querySelector("#wk-res"),
    S = T.f1Sess,
    have = w.list.map(r => r.sess).filter(s => w.res[s]);
  let h = '<div class="f1-rh"><h3>' + esc(T.f1Results) + "</h3>";
  if (have.length > 1)
    h +=
      '<div class="seg" role="group" aria-label="' +
      esc(T.f1Results) +
      '">' +
      have
        .map(
          s =>
            '<button type="button" data-s="' + s + '" aria-pressed="' + (s === w.pick) + '">' + esc(S[s]) + "</button>",
        )
        .join("") +
      "</div>";
  h += "</div>";
  const rows = w.res[w.pick];
  if (!rows) {
    box.innerHTML =
      h +
      '<p class="md-note f1-pad">' +
      esc(w.state === "loading" ? T.f1Loading : w.state === "error" ? T.f1Error : T.f1NoResults) +
      "</p>";
    return;
  }
  if (have.length === 1) h = h.replace("</h3>", '</h3><span class="f1-one">' + esc(S[w.pick]) + "</span>");
  const mine = r => (f1favs.has(r.Driver.driverId) ? ' class="mine"' : "");
  let t =
    '<div class="lt-scroll"><table class="lt f1t"><caption class="sr">' +
    esc(T.f1Results + ": " + S[w.pick]) +
    "</caption><thead><tr>" +
    th(T.f1Pos, T.f1PosFull, "pos-c") +
    th(T.f1Driver, "", "tm-c");
  if (w.pick === "Q") {
    t += th(T.f1Time) + "</tr></thead><tbody>";
    let seg = 3;
    for (const r of rows) {
      const s = r.Q3 ? 3 : r.Q2 ? 2 : 1;
      if (s < seg && rows.some(x => x.Q2)) {
        t += '<tr class="sep"><td colspan="3">' + esc(T.f1OutQ(s)) + "</td></tr>";
      }
      seg = s;
      t +=
        "<tr" +
        mine(r) +
        '><td class="pos-c">' +
        esc(r.position) +
        "</td>" +
        drvCell(r.Driver, r.Constructor) +
        '<td class="tt">' +
        esc(r.Q3 || r.Q2 || r.Q1 || "–") +
        "</td></tr>";
    }
    t += "</tbody></table></div>";
    box.innerHTML = h + (w.res.R ? "" : '<p class="md-note f1-pad">' + esc(T.f1GridNote) + "</p>") + t;
    return;
  }
  // a race or sprint: podium, then everyone
  const p = rows.slice(0, 3);
  const pod =
    p.length === 3
      ? '<ol class="pod" aria-label="' +
        esc(T.f1Podium) +
        '">' +
        [p[1], p[0], p[2]]
          .map(
            r =>
              '<li class="p' +
              esc(r.position) +
              '"><span class="n">' +
              esc(r.position) +
              '</span><span class="fn">' +
              esc(r.Driver.givenName) +
              '</span><span class="ln">' +
              esc(r.Driver.familyName) +
              "</span><small>" +
              esc(r.Constructor.name) +
              '</small><span class="tt">' +
              esc(r.Time ? r.Time.time : "") +
              "</span></li>",
          )
          .join("") +
        "</ol>"
      : "";
  t +=
    '<th scope="col" class="chg-c"><span class="sr">' +
    esc(T.f1Grid) +
    "</span></th>" +
    th(T.f1Time) +
    th(T.f1Pts, T.f1PtsFull, "pts-c") +
    "</tr></thead><tbody>";
  for (const r of rows) {
    const num = /^\d+$/.test(r.positionText),
      pos = +r.position,
      grid = +r.grid,
      ch = num && grid > 0 ? grid - pos : 0;
    const chg = ch
      ? '<span class="chg ' +
        (ch > 0 ? "up" : "dn") +
        '" role="img" aria-label="' +
        esc(ch > 0 ? T.f1Up(ch) : T.f1Down(-ch)) +
        '">' +
        (ch > 0 ? "▲" : "▼") +
        Math.abs(ch) +
        "</span>"
      : '<span class="chg" aria-hidden="true">–</span>';
    const lapped = /^\+(\d+) Laps?$/.exec(r.status || ""); // older results say "+1 Lap"; current ones just "Lapped"
    const time = r.Time
      ? esc(r.Time.time)
      : lapped
        ? esc(T.f1Lapped(+lapped[1]))
        : r.status === "Lapped"
          ? esc(T.f1LappedAny)
          : r.positionText === "D"
            ? '<span class="dnf">' + esc(T.f1Dsq) + "</span>"
            : '<span class="dnf">' + esc(T.f1Out) + "</span><small>" + esc(T.f1Lap(r.laps)) + "</small>";
    const fl =
      r.FastestLap && r.FastestLap.rank === "1" ? '<span class="fl">' + ICON.clock + esc(T.f1FastLap) + "</span>" : "";
    t +=
      "<tr" +
      mine(r) +
      '><td class="pos-c">' +
      (num ? esc(r.positionText) : "–") +
      "</td>" +
      drvCell(r.Driver, r.Constructor, (ch ? '<span class="chg-in">' + chg + "</span>" : "") + fl) +
      '<td class="chg-c">' +
      chg +
      '</td><td class="tt">' +
      time +
      (+r.points ? '<small class="pts-in">' + esc(T.f1PtsIn(r.points)) + "</small>" : "") +
      '</td><td class="pts pts-c">' +
      (+r.points ? esc(r.points) : "") +
      "</td></tr>";
  }
  t += '</tbody></table></div><p class="lt-key">' + esc(T.f1Key) + "</p>";
  box.innerHTML = h + pod + t;
}
function paintWkChamp() {
  const w = WK,
    box = w.root.querySelector("#wk-champ"),
    L = w.tab === "d" ? w.standD : w.standC;
  if (!w.standD && !w.standC) {
    box.hidden = true;
    return;
  }
  let h =
    '<div class="f1-rh"><h3>' +
    esc(T.f1Champ) +
    '</h3><div class="seg" role="group" aria-label="' +
    esc(T.f1Champ) +
    '">' +
    '<button type="button" data-tab="d" aria-pressed="' +
    (w.tab === "d") +
    '">' +
    esc(T.f1Drivers) +
    '</button><button type="button" data-tab="c" aria-pressed="' +
    (w.tab === "c") +
    '">' +
    esc(T.f1Teams) +
    "</button></div></div>";
  if (!L) {
    box.innerHTML = h;
    box.hidden = false;
    return;
  }
  h +=
    '<p class="md-note f1-pad">' +
    esc(T.f1After(L.round)) +
    '</p><table class="lt f1t"><caption class="sr">' +
    esc(T.f1Champ + ": " + (w.tab === "d" ? T.f1Drivers : T.f1Teams)) +
    "</caption><thead><tr>" +
    th(T.f1Pos, T.f1PosFull, "pos-c") +
    th(w.tab === "d" ? T.f1Driver : T.f1Team, "", "tm-c") +
    th(T.f1Pts, T.f1PtsFull) +
    "</tr></thead><tbody>";
  if (w.tab === "d") {
    const all = L.DriverStandings;
    let gap = false; // beyond the top 10, only starred drivers, after a thin divider
    all.forEach((x, i) => {
      const fav = f1favs.has(x.Driver.driverId);
      if (i >= 10 && !w.all && !fav) return;
      if (i >= 10 && !w.all && !gap) {
        gap = true;
        h += '<tr class="gap-row"><td colspan="3"></td></tr>';
      }
      h +=
        "<tr" +
        (fav ? ' class="mine"' : "") +
        '><td class="pos-c">' +
        esc(x.positionText || x.position) +
        "</td>" +
        drvCell(x.Driver, (x.Constructors || [])[0] || { name: "" }) +
        '<td class="pts">' +
        esc(x.points) +
        "</td></tr>";
    });
    h +=
      "</tbody></table>" +
      (all.length > 10
        ? '<p class="f1-pad f1-more"><button type="button" class="btn" id="wk-all">' +
          esc(w.all ? T.f1ShowTop : T.f1ShowAll(all.length)) +
          "</button></p>"
        : "");
  } else {
    h +=
      L.ConstructorStandings.map(
        x =>
          '<tr><td class="pos-c">' +
          esc(x.positionText || x.position) +
          '</td><td class="tm-c"><span class="drv"><span class="tbar" style="--tc:var(' +
          (TEAM_C[x.Constructor.constructorId] || "--line") +
          ')" aria-hidden="true"></span><b>' +
          esc(x.Constructor.name) +
          '</b></span></td><td class="pts">' +
          esc(x.points) +
          "</td></tr>",
      ).join("") + "</tbody></table>";
  }
  box.innerHTML = h;
  box.hidden = false;
}
function weekendClick(e) {
  const w = WK;
  if (!w) return;
  const b = e.target.closest("button");
  if (!b) return;
  const refocus = sel => {
    const x = w.root.querySelector(sel);
    if (x) x.focus();
  };
  if (b.dataset.s) {
    w.pick = b.dataset.s;
    paintWkRes();
    refocus('[data-s="' + w.pick + '"]');
    swapBelow(w.root.querySelector("#wk-res"), ".f1-rh"); // what the switch shows fades in below it
  } else if (b.dataset.tab) {
    w.tab = b.dataset.tab;
    paintWkChamp();
    swapBelow(w.root.querySelector("#wk-champ"), ".f1-rh");
    refocus('[data-tab="' + w.tab + '"]');
  } else if (b.id === "wk-all") {
    w.all = !w.all;
    paintWkChamp();
    refocus("#wk-all");
  } else if (b.id === "wk-share") shareWeekend();
  else if (b.dataset.drv) {
    const id = b.dataset.drv,
      inRes = !!b.closest("#wk-res");
    f1favs.has(id) ? f1favs.delete(id) : f1favs.add(id);
    store.set("f1favs", [...f1favs]);
    paintWkRes();
    paintWkChamp();
    refocus((inRes ? "#wk-res" : "#wk-champ") + ' .star[data-drv="' + CSS.escape(id) + '"]'); // keep keyboard focus on the same star
    // a star just switched on bounces, as a team's star does in the list
    if (f1favs.has(id)) {
      const x = w.root.querySelector((inRes ? "#wk-res" : "#wk-champ") + ' .star[data-drv="' + CSS.escape(id) + '"]');
      if (x) x.classList.add("pop");
    }
  }
}
function shareWeekend() {
  const race = WK.list.find(x => x.sess === "R") || WK.list[0];
  return shareLink(shareURL({ uid: WK.wk }), gpName(race.gp));
}

function openMatch(uid, root) {
  stopMatch();
  stopWeekend();
  if (uid.startsWith("f1|")) return openWeekend(uid, root);
  document.getElementById("md-h").textContent = T.mdTitle;
  const r = DATA.find(x => x.uid === uid);
  if (!r) {
    root.innerHTML = '<div class="md"><p class="md-card md-note">' + esc(T.mdGone) + "</p></div>";
    return;
  }
  MD = { r, root, S: null, status: "loading", timer: 0, venueKey: null, seen: null };
  root.innerHTML =
    '<article class="md"><section class="md-card md-top"><div id="md-head"></div><div id="md-act"></div></section>' +
    '<p class="md-state" id="md-state"></p><section class="md-card" id="md-ev" hidden></section><section class="md-card" id="md-lu" hidden></section>' +
    '<section class="md-card venue" id="md-venue" hidden></section><p class="md-src" id="md-src"></p></article>';
  paintActions();
  paintMatch();
  loadMatch();
}
function paintActions() {
  // calendar, share and CazéTV buttons: drawn once, so a live refresh never moves keyboard focus
  const m = MD;
  if (!m) return;
  m.root.querySelector("#md-act").innerHTML = mdActions(m.r);
  m.root.querySelector("#md-ics").onclick = () => downloadICS(m.r);
  m.root.querySelector("#md-share").onclick = () => shareMatch(m.r);
  const tb = m.root.querySelector("#md-table");
  if (tb) tb.onclick = () => openTables(m.r.code);
}
function stopMatch() {
  if (MD) {
    clearTimeout(MD.timer);
    MD = null;
  }
}
function paintMatch() {
  const m = MD;
  if (!m) return;
  const $ = id => m.root.querySelector("#" + id);
  $("md-head").innerHTML = mdHead(m);
  const ev = mdEvents(m),
    lu = mdLineups(m),
    ve = mdVenue(m);
  $("md-ev").innerHTML = ev;
  $("md-ev").hidden = !ev;
  $("md-lu").innerHTML = lu;
  $("md-lu").hidden = !lu;
  const vk = ve && LANG + ve;
  if (vk !== m.venueKey) {
    m.venueKey = vk;
    $("md-venue").innerHTML = ve;
    $("md-venue").hidden = !ve;
    const box = $("md-map");
    if (box) paintMap(box);
  }
  $("md-state").textContent =
    m.status === "loading" ? T.mdLoading : m.status === "none" ? T.mdNoData : m.status === "error" ? T.mdError : "";
  $("md-state").hidden = !$("md-state").textContent;
  $("md-src").textContent = m.S ? (m.S.src === "oldb" ? T.mdSrcAlt : T.mdSrc) : "";
}
async function loadMatch() {
  const m = MD;
  if (!m) return;
  if (document.hidden) {
    m.timer = setTimeout(loadMatch, 30000);
    return;
  }
  try {
    const ev = await findEvent(m.r);
    if (!ev) {
      m.status = "none";
    } else {
      m.S = await summary(ev);
      m.status = "ok";
    }
  } catch (err) {
    m.status = m.S ? "ok" : "error";
  }
  if (MD !== m) return;
  announce(m);
  paintMatch();
  const soon = m.r.when && m.r.when - Date.now() < 90 * 60e3;
  if (m.status === "error" || (m.S && (m.S.state === "in" || (m.S.state === "pre" && soon))))
    m.timer = setTimeout(loadMatch, 30000);
}
// screen readers hear new goals and cards as they happen (not the ones already there when the page opened)
function announce(m) {
  if (!m.S) return;
  const ids = new Set(m.S.events.map(e => e.id));
  if (m.seen) {
    const fresh = m.S.events.filter(e => !m.seen.has(e.id) && e.kind !== "half" && e.kind !== "sub");
    if (fresh.length)
      document.getElementById("md-news").textContent = fresh
        .map(e => T.newEvent(T.ev[e.kind], e.min, e.who[0] || ""))
        .join(". ");
  }
  m.seen = ids;
}

// one match as a calendar file (a copy: it does not update like the subscription does)
function downloadICS(r) {
  const pad = n => String(n).padStart(2, "0");
  const f = d =>
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    "00Z";
  const e = s =>
    String(s)
      .replace(/\\/g, "\\\\")
      .replace(/([,;])/g, "\\$1")
      .replace(/\r\n|\r|\n/g, "\\n");
  let title = teamName(r.home) + T.vs + teamName(r.away) + " (" + compName(r.comp) + ")";
  if (!r.when) title = "[" + T.pTbc + "] " + title;
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Matchday Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + r.uid.replace(/[^\w.-]+/g, "-") + "@matchday-planner",
    "DTSTAMP:" + f(new Date()),
  ];
  if (r.when) L.push("DTSTART:" + f(r.when), "DTEND:" + f(new Date(r.when.getTime() + 115 * 60e3)));
  else
    L.push(
      "DTSTART;VALUE=DATE:" + r.date.replace(/-/g, ""),
      "DTEND;VALUE=DATE:" + addDays(r.date, 1).replace(/-/g, ""),
    );
  L.push("SUMMARY:" + e(title));
  if (r.venue) L.push("LOCATION:" + e(r.venue));
  L.push(
    "DESCRIPTION:" +
      e([compName(r.comp), r.round ? T.round(r.round) : ""].filter(Boolean).join(" · ") + "\n" + shareURL(r)),
    "URL:" + shareURL(r),
  );
  if (r.when) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + e(title), "TRIGGER:-PT30M", "END:VALARM");
  L.push("END:VEVENT", "END:VCALENDAR");
  const enc = new TextEncoder(),
    fold = line => {
      // lines over 75 bytes continue on the next line after a space
      const out = [];
      let cur = "";
      for (const ch of line) {
        if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
          out.push(cur);
          cur = "";
        }
        cur += ch;
      }
      out.push(cur);
      return out.join("\r\n ");
    };
  const blob = new Blob([L.map(fold).join("\r\n") + "\r\n"], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download =
    (r.home + "-" + r.away)
      .normalize("NFD")
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() + ".ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
const shareMatch = r => shareLink(shareURL(r), teamName(r.home) + T.vs + teamName(r.away));
// the phone's own Share sheet where there is one; otherwise the link is copied (or shown, if copying is not allowed)
async function shareLink(url, text) {
  const t = document.getElementById("md-toast");
  if (navigator.share) {
    try {
      await navigator.share({ title: text, text, url });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    t.textContent = T.linkCopied;
  } catch {
    t.textContent = url;
  }
}

// The details open as a panel over the list, or on monitors beside it (not modal, so the list stays usable).
// The address changes too, so Back closes it and the link can be shared.
const mddlg = document.getElementById("mddlg"),
  ltdlg = document.getElementById("ltdlg");
let pushed = false,
  trigger = null;
function showPanel(uid) {
  openMatch(uid, document.getElementById("mdbody"));
  // the match shown is brought to the middle of the window (beside the list, it glides there)
  openDialog(() => {
    const c = shownCard();
    if (c) c.scrollIntoView({ block: "center" });
  });
  mddlg.querySelector("[data-close]").focus();
}
// the card of the match in the address (?match=)
const shownCard = () => {
  const a = [...listEl.querySelectorAll(".md-open")].find(x => x.dataset.uid === matchParam());
  return a && a.closest(".match");
};
function openDialog(then) {
  const r = document.documentElement;
  stay(mddlg); // opened again while closing
  undim(mddlg);
  r.removeAttribute("data-pane-out");
  const beside = r.dataset.wide === "full",
    show = () => {
      if (!mddlg.open) {
        if (beside) {
          r.setAttribute("data-pane", ""); // placed beside the list before it opens, so moving focus into it scrolls nothing
          mddlg.show();
        } else mddlg.showModal();
      }
      r.toggleAttribute("data-pane", mddlg.open && !mddlg.matches(":modal"));
      markCurrent();
      if (then) then();
    };
  // beside the list, the page makes room for the panel and the match shown comes to the middle: the list and the
  // sidebar glide there instead of jumping, following that match
  if (beside) glide(pageParts(), show, shownCard());
  else show();
}
// a panel closing sinks and fades over its fading page (beside the list: slides back out to the right, and the page
// glides back), then closes
function shut(d) {
  if (!d.open || d.leaving) return;
  const r = document.documentElement,
    modal = d.matches(":modal");
  if (modal)
    move(d, [{ opacity: 1 }, { opacity: 0 }], {
      duration: DUR("m"),
      fill: "forwards",
      pseudoElement: "::backdrop",
      id: "undim",
      ...SOFT(),
    });
  else {
    // beside the list, the opening played backwards: the page glides back while the panel slides out, the panel
    // keeping its place meanwhile (data-pane-out)
    r.setAttribute("data-pane-out", "");
    glide(
      pageParts(),
      () => {
        r.removeAttribute("data-pane");
        markCurrent();
      },
      shownCard(),
    );
  }
  leave(
    d,
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: modal ? "translateY(12px)" : "translateX(24px)" },
    ],
    () => {
      undim(d);
      d.close();
      r.removeAttribute("data-pane-out");
    },
    "m",
  );
}
// the card whose details are shown beside the list is outlined, and screen readers hear "current" on its button
function markCurrent() {
  const u = document.documentElement.hasAttribute("data-pane") ? matchParam() : null;
  document.querySelectorAll("#list .md-open").forEach(a => {
    if (a.dataset.uid === u) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
}
["pointerover", "focusin", "touchstart"].forEach(t =>
  listEl.addEventListener(
    t,
    e => {
      const a = e.target.closest(".md-open");
      if (a) warmMatch(a.dataset.uid);
    },
    { passive: true },
  ),
);
listEl.addEventListener("click", e => {
  const a = e.target.closest(".md-open");
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  trigger = a.dataset.uid;
  // with the details already open beside the list, switching matches replaces the address, so Back still closes the panel
  const switching = mddlg.open && !mddlg.leaving;
  if (mddlg.open) history.replaceState({ match: a.dataset.uid }, "", a.getAttribute("href"));
  else {
    // coming Back to the list (Close or Escape go Back) leaves the page where it is, instead of jumping to where it
    // was before the details opened: the list's own history entry is told not to restore its scroll (the new entry,
    // for the details, keeps the usual behaviour)
    history.scrollRestoration = "manual";
    history.pushState({ match: a.dataset.uid }, "", a.getAttribute("href"));
    history.scrollRestoration = "auto";
    pushed = true;
  }
  showPanel(a.dataset.uid);
  if (switching) swapIn(document.getElementById("mdbody")); // another match beside the list: its details fade in
});
mddlg.addEventListener("close", () => {
  if (mddlg.open) return; // reopened straight away because the window changed width (applyWide)
  document.documentElement.removeAttribute("data-pane");
  markCurrent();
  stopMatch();
  stopWeekend();
  if (matchParam()) {
    if (pushed) {
      pushed = false;
      history.back();
    } else {
      const u = new URL(location.href);
      u.searchParams.delete("match");
      history.replaceState(null, "", u);
    } // opened from a shared link
  }
  const b = trigger && [...listEl.querySelectorAll(".md-open")].find(x => x.dataset.uid === trigger);
  if (b) b.focus();
});
addEventListener("popstate", () => {
  const uid = matchParam();
  // back on the list: once the browser has left the scroll alone (it decides just after this event), the list's entry
  // restores its scroll again as usual, for example after a reload
  if (!uid) setTimeout(() => (history.scrollRestoration = "auto"));
  if (uid) {
    if (DATA.length) showPanel(uid);
  } else if (mddlg.open) {
    pushed = false;
    shut(mddlg);
  }
});
[mddlg, ltdlg].forEach(d => {
  d.querySelector("[data-close]").onclick = () => shut(d);
  d.addEventListener("click", e => {
    if (e.target === d && d.matches(":modal")) shut(d);
  }); // a click on the dimmed background closes it
  d.addEventListener("cancel", e => {
    e.preventDefault(); // Escape: close with the same animation
    shut(d);
  });
});
// Escape closes the details beside the list too (only a panel over the page closes by itself). Checked before the
// menus' own Escape handler runs, so closing Settings or Calendar leaves the details open.
document.addEventListener(
  "keydown",
  e => {
    if (e.key !== "Escape" || !mddlg.open || mddlg.matches(":modal") || ltdlg.open || MENUS.some(m => m.open)) return;
    if (e.target.matches && e.target.matches("input,select") && !mddlg.contains(e.target)) return; // Escape in the search box clears the search
    shut(mddlg);
  },
  true,
);
