/* ---------- league tables (ESPN standings, fetched when the window opens) ---------- */
const TABLES = new Map(); // league code -> {at, rows}; for "F1": {at, d, c} (drivers' and teams' standings)
const LT_CODES = [...TABLE_CODES, "F1"]; // the Tables window also has the Formula 1 championship
let ltCode = null,
  ltF1 = "d"; // ltF1: the F1 table shown, "d" drivers or "c" teams
function paintChips() {
  const box = document.getElementById("ltchips");
  box.innerHTML = ordered()
    .filter(l => LT_CODES.includes(l.code))
    .map(
      l =>
        '<button type="button" class="chip" data-code="' +
        l.code +
        '" aria-pressed="' +
        (l.code === ltCode) +
        '" style="--c:var(' +
        l.c +
        ')">' +
        crestHTML(l) +
        "<span>" +
        esc(leagueName(l)) +
        "</span></button>",
    )
    .join("");
}
document.getElementById("ltchips").addEventListener("click", e => {
  const b = e.target.closest(".chip");
  if (!b) return;
  if (b.dataset.code === ltCode) return;
  ltCode = b.dataset.code;
  paintChips();
  document.querySelector('#ltchips [data-code="' + ltCode + '"]').focus();
  loadTable().then(() => swapIn(document.getElementById("ltbody"))); // the new league's table fades in
});
// from the header's Tables button, or a match's league-table button (the table opens over the match; Close goes back to it).
// group: a Nations League match's group ("A1"), whose table is brought into view
function openTables(code, group) {
  ltCode = code || ltCode || (ordered().find(l => LT_CODES.includes(l.code) && on.has(l.code)) || { code: "EPL" }).code;
  paintChips();
  stay(ltdlg); // opened again while closing
  undim(ltdlg);
  if (!ltdlg.open) ltdlg.showModal();
  ltdlg.querySelector("[data-close]").focus();
  loadTable().then(() => group && document.getElementById("lt-g-" + group)?.scrollIntoView({ block: "start" }));
  LT_CODES.forEach(c => fetchTable(c).catch(() => {})); // download the other leagues now, so switching is instant
}
document.getElementById("tablesbtn").onclick = () => openTables();
const TABLE_REQ = new Map(); // league code -> download in progress, so one league is never fetched twice at once
function fetchTable(code) {
  const have = TABLES.get(code);
  if (have && !have.partial && Date.now() - have.at <= 5 * 60e3) return Promise.resolve();
  if (TABLE_REQ.has(code)) return TABLE_REQ.get(code);
  const req = (code === "F1" ? f1Table() : espnTable(code).catch(err => backupTable(code, err)))
    .then(t => {
      t.at = Date.now();
      TABLES.set(code, t);
    })
    .finally(() => TABLE_REQ.delete(code));
  TABLE_REQ.set(code, req);
  return req;
}
async function espnTable(code) {
  const res = await fetch("https://site.api.espn.com/apis/v2/sports/soccer/" + ESPN[code] + "/standings", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(res.status);
  const js = await res.json();
  if (code === "UNL") {
    // League A's four group tables (ESPN lists every group of every league, A1 to D2)
    const groups = (js.children || [])
      .map(c => ({ g: (/^Group (A[1-4])$/.exec(c.name || "") || [])[1], rows: espnRows(c) }))
      .filter(x => x.g && x.rows.length);
    if (!groups.length) throw new Error("no League A groups");
    return { groups };
  }
  return { rows: espnRows((js.children || [])[0] || js) };
}
// one ESPN standings table, its rows in table order
function espnRows(g) {
  const rows = ((g.standings || {}).entries || []).map(e => {
    const s = {};
    (e.stats || []).forEach(x => (s[x.name || x.type] = x.value));
    return {
      team: (e.team && (e.team.displayName || e.team.name)) || "",
      rank: s.rank,
      p: s.gamesPlayed,
      w: s.wins,
      d: s.ties,
      l: s.losses,
      gd: s.pointDifferential,
      pts: s.points,
    };
  });
  rows.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || b.pts - a.pts || b.gd - a.gd);
  return rows;
}
// ESPN not answering: the Bundesliga asks OpenLigaDB; any league then falls back to the table the site's own
// rebuild works out from the season's results (the "tables" in fixtures.json, four times a day).
async function backupTable(code, err) {
  if (code === "BUN")
    try {
      return await oldbTable();
    } catch {}
  const saved = META && META.tables && META.tables[code];
  const n = v => (Number.isInteger(v) ? v : null);
  const rows = (Array.isArray(saved) ? saved : [])
    .filter(x => x && typeof x.team === "string")
    .map((x, i) => ({
      team: x.team,
      rank: n(x.rank) ?? i + 1,
      p: n(x.p),
      w: n(x.w),
      d: n(x.d),
      l: n(x.l),
      gd: n(x.gd),
      pts: n(x.pts),
    }));
  if (!rows.length) throw err;
  return { rows, src: "calc", partial: true };
}
async function f1Table() {
  // Jolpica-F1, one request after the other (see jol above)
  // Each table stands on its own: undefined means it could not be loaded (the other one is still shown),
  // null that there are no standings yet. Only when both fail does the window show the error.
  const get = async what => {
    try {
      return (await jol("current/" + what + "/?limit=100")).MRData.StandingsTable.StandingsLists[0] || null;
    } catch {
      return undefined;
    }
  };
  const d = await get("driverstandings"),
    c = await get("constructorstandings");
  if (d === undefined && c === undefined) throw new Error("F1 standings could not be loaded");
  return { d, c, partial: d === undefined || c === undefined }; // partial: asked for again the next time the window opens
}
async function loadTable() {
  const code = ltCode,
    body = document.getElementById("ltbody");
  const have = TABLES.get(code);
  if (!have || have.partial || Date.now() - have.at > 5 * 60e3) {
    if (body.querySelector(".lt-wrap"))
      body.setAttribute("aria-busy", "true"); // keep the shown table until the new one is ready
    else body.innerHTML = '<p class="md-note">' + esc(T.ltLoading) + "</p>";
    try {
      await fetchTable(code);
    } catch (err) {
      if (ltCode === code) {
        body.removeAttribute("aria-busy");
        body.innerHTML = '<p class="md-note">' + esc(T.ltError) + "</p>";
      }
      return;
    }
  }
  if (ltCode === code) {
    body.removeAttribute("aria-busy");
    paintTable();
  }
}
function paintTable() {
  if (ltCode === "F1") return paintF1Table();
  const t = TABLES.get(ltCode);
  if (!t) return;
  const lg = LEAGUES.find(l => l.code === ltCode),
    mine = [...favs].map(tokens);
  const C = T.ltCols,
    A = T.ltAbbr;
  const col = (k, cls) =>
    '<th scope="col"' +
    (cls ? ' class="' + cls + '"' : "") +
    '><span aria-hidden="true">' +
    esc(A[k]) +
    '</span><span class="sr">' +
    esc(C[k]) +
    "</span></th>";
  const body = rows =>
    rows
      .map((x, i) => {
        const fav = mine.some(f => overlap(f, tokens(x.team)));
        const gd = x.gd > 0 ? "+" + x.gd : String(x.gd ?? "");
        return (
          "<tr" +
          (fav ? ' class="mine"' : "") +
          '><td class="pos-c">' +
          esc(x.rank ?? i + 1) +
          '</td><th scope="row" class="tm-c">' +
          esc(teamName(x.team)) +
          (fav ? ICON.star + '<span class="sr"> (' + esc(T.starred) + ")</span>" : "") +
          "</th>" +
          "<td>" +
          esc(x.p ?? "") +
          '</td><td class="wdl">' +
          esc(x.w ?? "") +
          '</td><td class="wdl">' +
          esc(x.d ?? "") +
          '</td><td class="wdl">' +
          esc(x.l ?? "") +
          "</td><td>" +
          esc(gd) +
          '</td><td class="pts">' +
          esc(x.pts ?? "") +
          "</td></tr>"
        );
      })
      .join("");
  // one table; the Nations League has one per group, each with an id so a match's group can be brought into view
  const table = (caption, rows, id) =>
    '<div class="lt-wrap"' +
    (id ? ' id="' + id + '"' : "") +
    '><table class="lt"><caption>' +
    esc(caption) +
    "</caption><thead><tr>" +
    '<th scope="col" class="pos-c"><span aria-hidden="true">#</span><span class="sr">' +
    esc(C.pos) +
    '</span></th><th scope="col" class="tm-c">' +
    esc(C.team) +
    "</th>" +
    col("p") +
    col("w", "wdl") +
    col("d", "wdl") +
    col("l", "wdl") +
    col("gd") +
    col("pts") +
    "</tr></thead><tbody>" +
    body(rows) +
    "</tbody></table></div>";
  document.getElementById("ltbody").innerHTML =
    (t.groups
      ? t.groups.map(x => table(T.ltGroup(x.g), x.rows, "lt-g-" + x.g)).join("")
      : table(compName(lg.name), t.rows)) +
    '<p class="lt-key">' +
    esc(T.ltKey) +
    " " +
    esc(
      t.src === "oldb"
        ? T.ltSourceAlt
        : t.src === "calc"
          ? T.ltSourceCalc(String((META && META.sources && META.sources[ltCode]) || "?"))
          : T.ltSource,
    ) +
    "</p>";
}
function paintF1Table() {
  const t = TABLES.get("F1");
  if (!t) return;
  const drivers = ltF1 === "d",
    L = drivers ? t.d : t.c,
    body = document.getElementById("ltbody");
  const seg =
    '<div class="seg lt-seg" role="group" aria-label="' +
    esc(T.f1Champ) +
    '">' +
    '<button type="button" data-lt="d" aria-pressed="' +
    drivers +
    '">' +
    esc(T.f1Drivers) +
    '</button><button type="button" data-lt="c" aria-pressed="' +
    !drivers +
    '">' +
    esc(T.f1Teams) +
    "</button></div>";
  if (!L) {
    body.innerHTML = seg + '<p class="md-note">' + esc(L === undefined ? T.ltError : T.f1LtNone) + "</p>";
    return;
  }
  const name = (id, long, short, sub, fav) =>
    '<th scope="row" class="tm-c"><span class="drv"><span class="tbar" style="--tc:var(' +
    (TEAM_C[id] || "--line") +
    ')" aria-hidden="true"></span><span><b>' +
    (short ? '<span class="nl">' + esc(long) + '</span><span class="ns">' + esc(short) + "</span>" : esc(long)) +
    "</b>" +
    (fav ? ICON.star + '<span class="sr"> (' + esc(T.starred) + ")</span>" : "") +
    (sub ? "<small>" + esc(sub) + "</small>" : "") +
    "</span></span></th>";
  const rows = drivers
    ? L.DriverStandings.map(x => {
        // Jolpica lists every team the driver raced for this season, in no set order: after a move, all of them and a plain bar
        const d = x.Driver,
          teams = x.Constructors || [],
          team = teams.length === 1 ? teams[0] : { name: teams.map(t => t.name).join(" / ") },
          fav = f1favs.has(d.driverId);
        return (
          "<tr" +
          (fav ? ' class="mine"' : "") +
          '><td class="pos-c">' +
          esc(x.positionText || x.position) +
          "</td>" +
          name(team.constructorId, f1Name(d), d.givenName.charAt(0) + ". " + d.familyName, team.name, fav) +
          "<td>" +
          esc(x.wins ?? "") +
          '</td><td class="pts">' +
          esc(x.points) +
          "</td></tr>"
        );
      })
    : L.ConstructorStandings.map(
        x =>
          '<tr><td class="pos-c">' +
          esc(x.positionText || x.position) +
          "</td>" +
          name(x.Constructor.constructorId, x.Constructor.name) +
          "<td>" +
          esc(x.wins ?? "") +
          '</td><td class="pts">' +
          esc(x.points) +
          "</td></tr>",
      );
  body.innerHTML =
    seg +
    '<div class="lt-wrap"><table class="lt f1t"><caption>' +
    esc(drivers ? T.f1LtD : T.f1LtC) +
    "</caption><thead><tr>" +
    th(T.f1Rank, T.f1PosFull, "pos-c") +
    th(drivers ? T.f1Driver : T.f1Team, "", "tm-c") +
    th(T.f1WinsAbbr, T.f1Wins) +
    th(T.f1Pts, T.f1PtsFull) +
    "</tr></thead><tbody>" +
    rows.join("") +
    "</tbody></table></div>" +
    '<p class="lt-key">' +
    esc(T.f1LtKey(L.season, L.round)) +
    " " +
    esc(T.f1LtSource) +
    "</p>";
}
document.getElementById("ltbody").addEventListener("click", e => {
  const b = e.target.closest("[data-lt]");
  if (!b) return;
  ltF1 = b.dataset.lt;
  paintF1Table();
  document.querySelector('#ltbody [data-lt="' + ltF1 + '"]').focus();
  swapBelow(document.getElementById("ltbody"), ".lt-seg"); // the table fades in below the switch
});
