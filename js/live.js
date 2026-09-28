/* ---------- live scores (ESPN public scoreboard, fetched by the visitor's browser) ---------- */
const ESPN = { EPL: "eng.1", LIGA: "esp.1", BUN: "ger.1", BRA: "bra.1", INTL: "fifa.friendly", UNL: "uefa.nations" };
const ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/soccer/";
const LIVE = new Map(); // our match key -> {id, state, clock, detail, hs, as}
const FINAL = new Map(); // finished matches: kept so the final score stays on the card for a day
const TRIED = new Set(); // matches more than 3 hours old that were already looked up once
let LIVE_EXTRA = []; // live league events we could not match to a listed fixture
const keyOf = r => (r.kind ? r.uid : r.code + "|" + r.home + "|" + r.away + "|" + r.date); // F1 sessions have no teams: their own id
// ESPN first; else the final score from the league feed (build_schedule.py adds "result" for recent matches)
const liveOf = r =>
  LIVE.get(keyOf(r)) ||
  FINAL.get(keyOf(r)) ||
  (r.result
    ? { state: "post", detail: "FT", clock: "", hs: String(r.result.home), as: String(r.result.away) }
    : undefined);
const STOP = new Set([
  "fc",
  "cf",
  "afc",
  "sc",
  "ac",
  "cd",
  "rc",
  "ud",
  "sd",
  "ca",
  "ec",
  "se",
  "cr",
  "fbpa",
  "club",
  "clube",
  "de",
  "del",
  "la",
  "le",
  "the",
  "and",
  "futbol",
  "football",
  "sport",
  "sporting",
  "esporte",
  "regatas",
  "balompie",
  "calcio",
  "sad",
  "national",
  "team",
]);
const ALIAS = {
  mineiro: "atleticomg",
  paranaense: "athleticopr",
  munchen: "munich",
  koln: "cologne",
  wolverhampton: "wolves",
};
function tokens(name) {
  const s = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const out = new Set();
  s.replace(/([a-z]+)-([a-z]+)/g, (m, a, b) => {
    out.add(a + b);
    return m;
  }); // "Atlético-MG" -> "atleticomg"
  for (const t of s.replace(/[^a-z0-9]+/g, " ").split(" "))
    if (t.length > 2 && !STOP.has(t)) {
      out.add(t);
      if (ALIAS[t]) out.add(ALIAS[t]);
    }
  return out;
}
const overlap = (a, b) => {
  for (const t of a) if (b.has(t)) return true;
  return false;
};
function sameMatch(r, ev) {
  if (!(overlap(tokens(r.home), ev.ht) && overlap(tokens(r.away), ev.at))) return false;
  if (r.when) return Math.abs(r.when - ev.date) <= 3 * 3600e3;
  return Math.abs(new Date(r.date + "T12:00:00Z") - ev.date) <= 36 * 3600e3;
}
function candidates() {
  // matches that could be on right now, or finished today without a known score
  const now = Date.now(),
    today = dayKey.format(new Date());
  return DATA.filter(r => {
    const k = keyOf(r);
    if (!ESPN[r.code] || FINAL.has(k) || r.result) return false;
    if ((LIVE.get(k) || {}).state === "in") return true;
    if (!r.when) return r.day === today;
    const t = r.when.getTime();
    return (now >= t - 15 * 60e3 && now <= t + 3 * 3600e3) || (now <= t + 24 * 3600e3 && now > t && !TRIED.has(k)); // older ones: look up once
  });
}
// one league's matches on one day (US Eastern date, as ESPN groups them)
// A download still on its way is always reused; a finished one for 25 seconds (scoreboards) or 20 (match summaries).
// A failed one is forgotten, so the next request tries again.
function reuse(cache, k, ms, start) {
  const have = cache.get(k);
  if (have && Date.now() - have.at < ms) return have.req;
  const entry = { at: Infinity, req: start() }; // "at" is set when the download finishes
  cache.set(k, entry);
  entry.req.then(
    () => {
      entry.at = Date.now();
    },
    () => {
      if (cache.get(k) === entry) cache.delete(k);
    },
  );
  return entry.req;
}
const BOARDS = new Map(); // "slug|day" -> scoreboard download
// When ESPN does not answer, a league with a backup source uses that instead (see OpenLigaDB below).
function board(slug, day) {
  return reuse(BOARDS, slug + "|" + day, 25e3, () =>
    boardFetch(slug, day).catch(err => {
      if (!BACKUP_BOARD[slug]) throw err;
      return BACKUP_BOARD[slug]();
    }),
  );
}
async function boardFetch(slug, day) {
  const res = await fetch(ESPN_API + slug + "/scoreboard?dates=" + day, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status);
  const js = await res.json(),
    out = [];
  for (const e of js.events || []) {
    const c = (e.competitions || [])[0];
    if (!c) continue;
    const h = c.competitors.find(x => x.homeAway === "home"),
      a = c.competitors.find(x => x.homeAway === "away");
    if (!h || !a) continue;
    const st = c.status || e.status || {},
      ty = st.type || {};
    const nm = x => (x.team && (x.team.displayName || x.team.name)) || "";
    out.push({
      slug,
      id: e.id,
      date: new Date(e.date),
      state: ty.state,
      clock: st.displayClock || ty.shortDetail || "",
      detail: ty.shortDetail || "",
      hn: nm(h),
      an: nm(a),
      hs: h.score ?? "0",
      as: a.score ?? "0",
      ht: new Set([...tokens(nm(h)), ...tokens((h.team && h.team.shortDisplayName) || "")]),
      at: new Set([...tokens(nm(a)), ...tokens((a.team && a.team.shortDisplayName) || "")]),
    });
  }
  return out;
}
/* ---------- backup for the Bundesliga: OpenLigaDB (free, no key, allows any website to ask) ---------- */
// Used only when ESPN does not answer. Its scores are entered by volunteers, it has no match clock,
// and its match events are goals only. Everything from it goes through the same checks as ESPN's answers.
const OLDB = "https://api.openligadb.de/";
const BACKUP_BOARD = { "ger.1": oldbBoard };
async function oldbGet(path) {
  const res = await fetch(OLDB + path, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}
function oldbBoard() {
  // the matchday on now (OpenLigaDB groups matches by matchday, not date), shared by every day asked for
  return reuse(BOARDS, "oldb", 25e3, async () => {
    const js = await oldbGet("getmatchdata/bl1");
    return (Array.isArray(js) ? js : []).map(oldbEvent).filter(Boolean);
  });
}
const whole = v => (Number.isInteger(v) && v >= 0 ? v : null); // a count or score from OpenLigaDB, else null
// the score so far: the final result once finished, else the latest goal, else the result field
function oldbScore(m) {
  const scored = (Array.isArray(m.goals) ? m.goals : []).filter(
    g => g && whole(g.scoreTeam1) !== null && whole(g.scoreTeam2) !== null,
  );
  const last = scored.reduce(
    (a, g) => (!a || g.scoreTeam1 + g.scoreTeam2 >= a.scoreTeam1 + a.scoreTeam2 ? g : a),
    null,
  );
  const end = (Array.isArray(m.matchResults) ? m.matchResults : []).find(
    x => x && x.resultTypeID === 2 && whole(x.pointsTeam1) !== null && whole(x.pointsTeam2) !== null,
  );
  if (end && (m.matchIsFinished === true || !last)) return [end.pointsTeam1, end.pointsTeam2];
  return last ? [last.scoreTeam1, last.scoreTeam2] : [0, 0];
}
function oldbEvent(m) {
  if (!m || typeof m !== "object") return null;
  const t1 = m.team1 || {},
    t2 = m.team2 || {},
    date = toDate(m.matchDateTimeUTC),
    id = whole(m.matchID);
  if (!date || id === null || typeof t1.teamName !== "string" || typeof t2.teamName !== "string") return null;
  const done = m.matchIsFinished === true,
    started = Date.now() >= date.getTime();
  if (!done && started && Date.now() > date.getTime() + 3 * 3600e3) return null; // not marked finished: score unsure
  const [hs, as] = oldbScore(m);
  const short = t => (typeof t.shortName === "string" ? t.shortName : "");
  return {
    slug: "ger.1",
    src: "oldb",
    id: "oldb-" + id,
    date,
    state: done ? "post" : started ? "in" : "pre",
    clock: "",
    detail: done ? "FT" : "",
    hn: t1.teamName,
    an: t2.teamName,
    hs: String(hs),
    as: String(as),
    ht: new Set([...tokens(t1.teamName), ...tokens(short(t1))]),
    at: new Set([...tokens(t2.teamName), ...tokens(short(t2))]),
  };
}
// one match, in the shape parseSummary() gives for ESPN's: the score and the goals (no line-ups or cards)
async function oldbSummary(id) {
  const m = await oldbGet("getmatchdata/" + encodeURIComponent(id));
  const ev = oldbEvent(m);
  if (!ev) throw new Error("OpenLigaDB match not usable");
  let h = 0,
    a = 0;
  const events = [];
  const scored = (Array.isArray(m.goals) ? m.goals : [])
    .filter(g => g && whole(g.scoreTeam1) !== null && whole(g.scoreTeam2) !== null)
    .sort((x, y) => x.scoreTeam1 + x.scoreTeam2 - (y.scoreTeam1 + y.scoreTeam2));
  for (const g of scored) {
    const side = g.scoreTeam1 > h ? "home" : g.scoreTeam2 > a ? "away" : null;
    h = g.scoreTeam1;
    a = g.scoreTeam2;
    const who = typeof g.goalGetterName === "string" ? g.goalGetterName : "";
    events.push({
      id: "oldb" + (whole(g.goalID) ?? h + "-" + a),
      kind: g.isOwnGoal === true ? "og" : g.isPenalty === true ? "pen" : "goal",
      min: whole(g.matchMinute) !== null ? g.matchMinute + "'" : "",
      side,
      team: side === "home" ? ev.hn : side === "away" ? ev.an : "",
      who: [who],
      ids: [who],
    });
  }
  return {
    src: "oldb",
    state: ev.state,
    clock: "",
    detail: ev.detail,
    hs: ev.hs,
    as: ev.as,
    rosters: {},
    events,
    venue: null,
    attendance: null,
    referee: "",
  };
}
async function oldbTable() {
  const now = new Date(),
    season = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // 2026 for 2026-27
  const js = await oldbGet("getbltable/bl1/" + season);
  const rows = (Array.isArray(js) ? js : [])
    .filter(x => x && typeof x.teamName === "string")
    .map((x, i) => ({
      team: x.teamName,
      rank: i + 1,
      p: whole(x.matches),
      w: whole(x.won),
      d: whole(x.draw),
      l: whole(x.lost),
      gd: Number.isInteger(x.goalDiff) ? x.goalDiff : null,
      pts: whole(x.points),
    }));
  if (!rows.length) throw new Error("OpenLigaDB table empty");
  return { rows, src: "oldb", partial: true }; // partial: ESPN is asked again the next time the window opens
}

const etDay = d =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .replace(/-/g, "");
async function pollLive() {
  if (document.hidden || !DATA.length) return;
  const cands = candidates();
  if (!cands.length) {
    if (LIVE.size || LIVE_EXTRA.length) {
      LIVE.clear();
      LIVE_EXTRA = [];
      render();
    }
    return;
  }
  const jobs = new Set();
  for (const r of cands) {
    const d = r.when || new Date(r.date + "T18:00:00Z");
    jobs.add(ESPN[r.code] + "|" + etDay(d));
    jobs.add(ESPN[r.code] + "|" + etDay(new Date()));
  }
  const events = [];
  await Promise.all(
    [...jobs].map(async j => {
      const [slug, day] = j.split("|");
      try {
        events.push(...(await board(slug, day)));
      } catch (err) {}
    }),
  );
  LIVE.clear();
  const used = new Set();
  for (const r of cands) {
    const k = keyOf(r);
    if (r.when && Date.now() > r.when.getTime() + 3 * 3600e3) TRIED.add(k);
    const ev = events.find(e => e.slug === ESPN[r.code] && !used.has(e.id) && sameMatch(r, e));
    if (!ev) continue;
    used.add(ev.id);
    const L = {
      id: ev.id,
      src: ev.src,
      state: ev.state,
      clock: ev.state === "in" ? (ev.detail === "HT" ? "HT" : ev.clock) : ev.clock,
      detail: ev.detail,
      hs: ev.hs,
      as: ev.as,
    };
    if (ev.state === "post") FINAL.set(k, L);
    else LIVE.set(k, L);
  }
  LIVE_EXTRA = events
    .filter(e => e.state === "in" && !used.has(e.id) && e.slug !== "fifa.friendly" && !e.src) // backup: listed matches only
    .filter((e, i, a) => a.findIndex(x => x.id === e.id) === i);
  render();
}
function renderLive() {
  const box = document.getElementById("livebox"),
    list = document.getElementById("livelist");
  const rows = [];
  let alt = false; // a score from the backup source is shown, so the note names it
  for (const r of DATA) {
    const L = liveOf(r);
    if (L && L.state === "in" && on.has(r.code)) {
      if (L.src === "oldb") alt = true;
      rows.push({
        id: L.id || keyOf(r),
        home: teamName(r.home),
        away: teamName(r.away),
        hs: L.hs,
        as: L.as,
        clock: L.clock,
        comp: compName(r.comp),
      });
    }
  }
  const codeOf = { "eng.1": "EPL", "esp.1": "LIGA", "ger.1": "BUN", "bra.1": "BRA" };
  for (const e of LIVE_EXTRA) {
    const code = codeOf[e.slug];
    if (on.has(code))
      rows.push({
        id: e.id,
        home: e.hn,
        away: e.an,
        hs: e.hs,
        as: e.as,
        clock: e.detail === "HT" ? "HT" : e.clock,
        comp: LEAGUES.find(l => l.code === code).name,
      });
  }
  const lc = document.getElementById("livecount");
  if (!rows.length) {
    box.hidden = true;
    if (lc) lc.remove();
    return;
  }
  list.innerHTML = rows
    .map(
      x =>
        '<div class="lv-row" data-id="' +
        esc(x.id) +
        '"><span class="h t">' +
        esc(x.home) +
        "<small>" +
        esc(x.comp) +
        '</small></span><span class="sc" role="img" aria-label="' +
        esc(T.score(x.hs, x.as)) +
        '">' +
        esc(x.hs) +
        "–" +
        esc(x.as) +
        '</span><span class="t">' +
        esc(x.away) +
        '</span><span class="clk">' +
        esc(x.clock || T.pLive) + // OpenLigaDB has no match clock
        "</span></div>",
    )
    .join("");
  document.getElementById("livenote").textContent = alt ? T.liveNoteAlt : T.liveNote;
  box.hidden = false;
  goals(list, ".sc", el => "live|" + el.parentNode.dataset.id); // keyed by ESPN's event id, so two live rows never mix
  const stamp = document.getElementById("stamp");
  if (!lc)
    stamp.insertAdjacentHTML(
      "beforeend",
      '<span class="livecount" id="livecount"><span class="dot-live" aria-hidden="true"></span><span></span></span>',
    );
  document.querySelector("#livecount span:last-child").textContent = T.nLive(rows.length);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pollLive();
});
