/* ---------- fixtures: shared state ---------- */
const LEAGUES = [
  { code: "EPL", name: "Premier League", abbr: "PL", c: "--epl" },
  { code: "LIGA", name: "La Liga", abbr: "LL", c: "--liga" },
  { code: "BUN", name: "Bundesliga", abbr: "BL", c: "--bun" },
  { code: "BRA", name: "Brasileirão", abbr: "BR", c: "--bra" },
  { code: "LIB", name: "Libertadores", abbr: "LIB", c: "--lib" },
  { code: "INTL", name: "Friendlies", abbr: "INT", c: "--intl" },
  { code: "UNL", name: "UEFA Nations League", abbr: "UNL", c: "--unl" },
  { code: "F1", name: "Formula 1", abbr: "F1", c: "--f1" },
];
const addDays = (key, n) => {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const leagueName = l =>
  l.code === "INTL" ? T.friendlies : l.code === "UNL" ? T.nationsLeague : l.code === "F1" ? T.f1 : l.name;
const colorOf = code => "var(" + (LEAGUES.find(l => l.code === code) || { c: "--line" }).c + ")";
const ORDER = {
  en: ["EPL", "LIGA", "BUN", "BRA", "LIB", "INTL", "UNL", "F1"],
  pt: ["BRA", "LIB", "INTL", "F1", "EPL", "LIGA", "BUN", "UNL"],
};
const ordered = () => ORDER[LANG].map(c => LEAGUES.find(l => l.code === c));
const on = new Set(
  store.get(
    "leagues",
    LEAGUES.map(l => l.code),
  ),
);
{
  // a league added to the site since the visitor last chose their leagues starts switched on
  const seen = store.get("seen", ["EPL", "LIGA", "BUN", "BRA", "INTL"]),
    fresh = LEAGUES.filter(l => !seen.includes(l.code));
  if (fresh.length) {
    fresh.forEach(l => on.add(l.code));
    if (store.get("leagues", null)) store.set("leagues", [...on]);
  }
  store.set(
    "seen",
    LEAGUES.map(l => l.code),
  );
}
const favs = new Set(store.get("favs", []));
const openSrc = new Set(); // which source lists are open, so a refresh keeps them open
let range = store.get("range", "all"),
  limit = 40,
  DATA = [],
  META = null,
  BADGES = new Map(); // fixtures.json "badges": team name -> {flag: "de"} or {crest: ESPN team number, box: where it is drawn}

/* ---------- apply the language to every static string ---------- */
function applyLang() {
  document.documentElement.lang = LANG === "pt" ? "pt-BR" : "en";
  // for search engines, which read the page after its script has run: the title, description and the one canonical
  // address of this language (taken from the hreflang links in <head>, so the site's address is written only there)
  document.title = T.docTitle;
  document.querySelector('meta[name="description"]').content = T.docDesc;
  const alt = document.querySelector('link[rel="alternate"][hreflang="' + (LANG === "pt" ? "pt" : "en") + '"]');
  let canon = document.querySelector('link[rel="canonical"]');
  if (alt && !canon) {
    canon = document.createElement("link");
    canon.rel = "canonical";
    document.head.appendChild(canon);
  }
  if (alt) canon.href = alt.href;
  document.querySelectorAll("[data-t]").forEach(el => {
    const k = el.dataset.t,
      v = T[k];
    if (typeof v !== "string") return;
    if (k.endsWith("html")) el.innerHTML = v;
    else el.textContent = v;
    if (k === "calLangNote") el.hidden = !v;
  });
  document.getElementById("q").placeholder = T.searchPh;
  document.getElementById("leagues").setAttribute("aria-label", T.leagues);
  document.getElementById("range").setAttribute("aria-label", T.dateRange);
  ordered().forEach(l => {
    const b = document.getElementById("chip-" + l.code);
    if (b) {
      b.lastChild.textContent = leagueName(l);
      b.parentNode.appendChild(b);
    }
  });
  document.getElementById("ltchips").setAttribute("aria-label", T.leagues);
  fillZones();
  makeFormatters();
  applyTheme();
  applyContrast();
  applyMotion();
  applySize();
  showRepo();
  checkDates();
  syncControls();
}
langsel.onchange = () => fadePage(switchLang);
function switchLang() {
  LANG = langsel.value;
  T = I18N[LANG];
  store.set("lang", LANG);
  if (!store.get("tz", null)) TZ = defaultTz(); // follow the language until someone picks a zone themselves
  applyLang();
  if (META) {
    assignDays();
    renderStamp();
  }
  render();
  if (MD) {
    paintActions();
    paintMatch();
  }
  if (WK) paintWeekend();
  if (ltdlg.open) {
    paintChips();
    paintTable();
  }
}
tzsel.onchange = () => fadePage(switchZone);
function switchZone() {
  TZ = tzsel.value;
  store.set("tz", TZ);
  makeFormatters();
  if (META) {
    assignDays();
    renderStamp();
  }
  render();
  if (MD) paintMatch();
}

/* ---------- calendar links, built from wherever the site is hosted ---------- */
const icsURL = new URL("soccer.ics", location.href).href;
document.getElementById("calurl").textContent = icsURL;
if (location.protocol === "https:") document.getElementById("sub").href = icsURL.replace(/^https:/, "webcal:");
const toast = document.getElementById("toast");
document.getElementById("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(icsURL);
    toast.textContent = T.copied;
  } catch {
    const r = document.createRange();
    r.selectNodeContents(document.getElementById("calurl"));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    toast.textContent = T.selected;
  }
};
const calmenu = document.getElementById("calmenu"),
  setmenu = document.getElementById("setmenu"),
  MENUS = [setmenu, calmenu];
// on phones the menus open as a sheet over a dimmed page: focus moves into the sheet and Tab stays inside it
const SHEET = matchMedia("(max-width:640px)");
// a menu closing folds back up into its button (on phones the sheet slides down and the dimmed page fades)
function foldMenu(m) {
  const p = m.querySelector(".calpanel");
  if (!m.open || p.leaving) return;
  const sheet = SHEET.matches; // a sheet slid up at the longer speed; a menu dropped down at the shorter one
  if (sheet)
    move(m, [{ opacity: 1 }, { opacity: 0 }], {
      duration: DUR("m"),
      fill: "forwards",
      pseudoElement: "::before",
      id: "undim",
      ...SOFT(),
    });
  leave(
    p,
    sheet ? [{ transform: "none" }, { transform: "translateY(100%)" }] : LIFT,
    () => {
      undim(m); // first: once closed, the dimmed layer and its animation are gone from the menu
      m.open = false;
    },
    sheet ? "m" : "s",
  );
}
const undim = m => m.getAnimations({ subtree: true }).forEach(a => a.id === "undim" && a.cancel());
function closeMenu(m, focus) {
  foldMenu(m);
  if (focus) m.querySelector("summary").focus();
}
const tabbable = m =>
  [
    ...m.querySelectorAll(".calpanel a[href],.calpanel button,.calpanel select,.calpanel input,.calpanel summary"),
  ].filter(
    el =>
      (el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0) &&
      !(el.type === "radio" && !el.checked),
  ); // a radio group is one Tab stop
MENUS.forEach(m => {
  // its own button closes it with the same fold; pressed again while folding, it stays open
  m.querySelector("summary").addEventListener("click", e => {
    if (!m.open) return;
    e.preventDefault();
    const p = m.querySelector(".calpanel");
    if (!p.leaving) return foldMenu(m);
    stay(p);
    undim(m);
  });
  m.addEventListener("toggle", () => {
    if (!m.open) return;
    MENUS.forEach(o => {
      if (o !== m) {
        stay(o.querySelector(".calpanel")); // the other menu is replaced at once, not folded
        undim(o);
        o.open = false;
      }
    });
    if (SHEET.matches) m.querySelector(".calpanel").focus();
  });
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape")
    MENUS.forEach(m => {
      if (m.open) closeMenu(m, true);
    });
  const m = MENUS.find(x => x.open);
  if (e.key !== "Tab" || !m || !SHEET.matches) return;
  const t = tabbable(m);
  if (!t.length) return;
  const first = t[0],
    last = t[t.length - 1],
    at = document.activeElement,
    inside = m.querySelector(".calpanel").contains(at);
  if (e.shiftKey && (!inside || at === first || at === m.querySelector(".calpanel"))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || at === last)) {
    e.preventDefault();
    first.focus();
  }
});
// a tap on the dimmed page (the menu's own ::before layer) closes the menu and returns focus to its button
document.addEventListener("click", e => {
  MENUS.forEach(m => {
    if (!m.open) return;
    if (e.target === m) closeMenu(m, true);
    else if (!m.contains(e.target)) foldMenu(m);
  });
});
document.getElementById("setdone").onclick = () => closeMenu(setmenu, true);
function showRepo() {
  if (!location.hostname.endsWith("github.io")) return;
  const user = location.hostname.split(".")[0],
    repo = location.pathname.split("/").filter(Boolean)[0];
  if (repo) {
    const p = document.getElementById("repo"),
      path = esc(user + "/" + repo);
    p.innerHTML = esc(T.repo) + ' <a href="https://github.com/' + path + '" rel="noopener">github.com/' + path + "</a>";
    p.hidden = false;
  }
}

/* ---------- filters ---------- */
const q = document.getElementById("q"),
  from = document.getElementById("from"),
  to = document.getElementById("to"),
  tbc = document.getElementById("showtbc"),
  favonly = document.getElementById("favonly"),
  f1prac = document.getElementById("f1prac");
q.value = store.get("q", "");
tbc.checked = store.get("tbc", true);
favonly.checked = store.get("favonly", false);
f1prac.checked = store.get("f1prac", true);
const lg = document.getElementById("leagues");
LEAGUES.forEach(l => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.id = "chip-" + l.code;
  b.style.setProperty("--c", "var(" + l.c + ")");
  b.setAttribute("aria-pressed", on.has(l.code));
  b.innerHTML = crestHTML(l) + "<span></span>";
  b.lastChild.textContent = l.name;
  b.onclick = () => {
    on.has(l.code) ? on.delete(l.code) : on.add(l.code);
    b.setAttribute("aria-pressed", on.has(l.code));
    store.set("leagues", [...on]);
    limit = 40;
    render();
  };
  lg.appendChild(b);
});
const daterange = document.getElementById("daterange"),
  dateErr = document.getElementById("date-err"),
  clearq = document.getElementById("clearq"),
  resetBtn = document.getElementById("reset");
from.value = store.get("from", "");
to.value = store.get("to", "");
function setRange(r, focus) {
  range = r;
  store.set("range", r);
  document.querySelectorAll("#range button").forEach(x => x.setAttribute("aria-pressed", x.dataset.r === r));
  reveal(daterange, r === "custom");
  if (r === "custom") {
    if (!from.value) from.value = dayKey.format(new Date());
    if (focus) from.focus();
  }
  checkDates();
  limit = 40;
  render();
}
function checkDates() {
  // "to" can't be before "from": say so, and ignore the end date until it's fixed
  to.min = from.value || "";
  from.max = to.value || "";
  const bad = !!(from.value && to.value && to.value < from.value);
  to.setAttribute("aria-invalid", bad);
  if (bad && !dateErr.textContent && settled) move(dateErr, DROP, { duration: DUR("s") }); // the message unfolds too
  dateErr.textContent = bad ? T.dateErr : "";
  store.set("from", from.value);
  store.set("to", to.value);
  return bad;
}
document.querySelectorAll("#range button").forEach(b => {
  b.onclick = () => setRange(b.dataset.r, true);
});
[from, to].forEach(el =>
  el.addEventListener("input", () => {
    checkDates();
    limit = 40;
    render();
  }),
);
let typing = 0; // while someone types, redraw once they pause (every key press would redraw the whole list)
[q, tbc, favonly, f1prac].forEach(el =>
  el.addEventListener("input", () => {
    store.set("q", q.value);
    store.set("tbc", tbc.checked);
    store.set("favonly", favonly.checked);
    store.set("f1prac", f1prac.checked);
    limit = 40;
    clearTimeout(typing);
    if (el === q) typing = setTimeout(render, 150);
    else render();
  }),
);
clearq.onclick = () => {
  q.value = "";
  store.set("q", "");
  q.focus();
  limit = 40;
  render();
};
resetBtn.onclick = () => {
  LEAGUES.forEach(l => {
    on.add(l.code);
    document.getElementById("chip-" + l.code).setAttribute("aria-pressed", "true");
  });
  store.set("leagues", [...on]);
  q.value = "";
  store.set("q", "");
  favonly.checked = false;
  store.set("favonly", false);
  tbc.checked = true;
  store.set("tbc", true);
  f1prac.checked = true;
  store.set("f1prac", true);
  from.value = "";
  to.value = "";
  setRange("all", false);
  document.querySelector('#range button[data-r="all"]').focus();
};
// small controls that come and go with the filters (the Custom dates, Clear filters...) unfold into place and fold
// away; not while the page loads (settled is set once it has)
let settled = false;
const FADE = [{ opacity: 0 }, { opacity: 1 }];
function reveal(el, show, frames = DROP) {
  if (show) {
    stay(el); // back while it was folding away
    if (!el.hidden) return;
    el.hidden = false;
    if (settled) move(el, frames, { duration: DUR("s") });
  } else if (!el.hidden && !el.leaving) {
    if (settled) leave(el, [...frames].reverse(), () => (el.hidden = true));
    else el.hidden = true;
  }
}
function syncControls() {
  // small bits of UI that depend on the current filters
  reveal(clearq, !!q.value, FADE); // inside the search box: it only fades
  clearq.setAttribute("aria-label", T.clearSearch);
  document.getElementById("favlabel").textContent = T.favCount(favs.size);
  reveal(
    resetBtn,
    !(on.size === LEAGUES.length && range === "all" && !q.value && !favonly.checked && tbc.checked && f1prac.checked),
  );
  reveal(document.getElementById("f1praclabel"), on.has("F1")); // only useful while F1 is shown
  const sum = [
    on.size === LEAGUES.length ? T.sumAll : T.sumSome(on.size, LEAGUES.length),
    range === "all" ? T.sumDates : range === "custom" ? T.sumCustom : T[range],
  ];
  if (q.value.trim()) sum.push("“" + q.value.trim() + "”");
  if (favonly.checked) sum.push(T.sumStarred);
  document.getElementById("sidesum").textContent = T.showing + " " + sum.join(" · "); // in the bar shown while the filter sidebar is hidden
}

// day headers stick just below the filter bar, whatever its height (on wide screens: below the bar shown while the
// sidebar is hidden, or near the top of the window while the filters are in the sidebar)
const filtersEl = document.getElementById("filters"),
  sideBar = document.getElementById("side-bar");
const setFH = () => {
  const r = document.documentElement,
    el = !r.dataset.wide ? filtersEl : r.dataset.side === "closed" ? sideBar : null;
  r.style.setProperty("--filters-h", (el ? el.offsetHeight + 12 : 16) + "px");
};
if (window.ResizeObserver) {
  const ro = new ResizeObserver(setFH);
  ro.observe(filtersEl);
  ro.observe(sideBar);
}
setFH();

function bounds() {
  const today = dayKey.format(new Date());
  if (range === "today") return [today, today];
  if (range === "week") return [today, addDays(today, 6)];
  if (range === "weekend") {
    // Friday to Sunday of this week; on a weekend day, the current one
    const dow = new Date(today + "T12:00:00Z").getUTCDay();
    const fri = dow === 0 ? addDays(today, -2) : dow === 6 ? addDays(today, -1) : addDays(today, 5 - dow);
    return [dow === 0 || dow === 6 || dow === 5 ? today : fri, addDays(fri, 2)];
  }
  if (range === "custom") return [from.value || "0000", to.value && to.value >= (from.value || "") ? to.value : "9999"];
  return ["0000", "9999"];
}
function live() {
  // finished matches stay a day when the final score is known, else two hours; dated days that have passed go
  const now = Date.now(),
    today = dayKey.format(new Date());
  return DATA.filter(r => {
    if (r.kind === "f1") return r.when ? r.when.getTime() + 24 * 3600e3 > now : r.day >= today;
    const L = liveOf(r);
    if (L && L.state === "in") return true;
    if (!r.when) return r.day >= today;
    return r.when.getTime() + (L && L.state === "post" ? 24 : 2) * 3600e3 > now;
  });
}
function filtered() {
  const terms = q.value
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const [a, b] = bounds();
  return live().filter(
    r =>
      on.has(r.code) &&
      (!terms.length ||
        terms.some(t =>
          [
            r.home,
            r.away,
            I18N.pt.teams[r.home] || "",
            I18N.pt.teams[r.away] || "",
            r.gp || "",
            r.gp ? gpName(r.gp) : "",
          ].some(n => n.toLowerCase().includes(t)),
        )) &&
      (r.kind !== "f1" || f1prac.checked || !r.sess.startsWith("FP")) &&
      (!favonly.checked || favs.has(r.home) || favs.has(r.away)) &&
      r.day >= a &&
      r.day <= b &&
      (tbc.checked || r.utc),
  );
}

/* ---------- rendering ---------- */
const compName = c => T.comp[c] || c;
const teamName = n => T.teams[n] || n;
// beside each team name, decorative (the name is always written next to it): a national team's flag (flags/, MIT)
// or a club's crest (ESPN's picture server, at a small size). Only a flag code or a team number comes from
// fixtures.json, checked here; the address is built from it, so the data cannot point the picture anywhere else.
const FLAG_RE = /^[a-z]{2}(-[a-z]{3})?$/,
  CREST_RE = /^\d{1,7}$/;
// ESPN's crests sit on square pictures, each with its own empty margin, so shrinking every picture alike showed some
// crests large and others small or off centre. build_schedule.py (crest_box()) measures where each crest is drawn:
// [left, top, width, height, reach] in thousandths of the picture ("box"; "dark" for ESPN's dark-background version,
// or false). Here the drawing's longest side becomes CREST_SIDE px and its middle is placed on the middle of the 18px
// badge.
const CREST_SIDE = 17;
function crestFit(box) {
  if (!Array.isArray(box) || box.length !== 5 || !box.every(v => Number.isInteger(v) && v >= 0 && v <= 1000))
    return null;
  const [x, y, w, h, r] = box;
  if (!w || !h || !r || x + w > 1000 || y + h > 1000) return null;
  const s = Math.min((CREST_SIDE * 1000) / Math.max(w, h), 40),
    at = v => (9 - (s * v) / 1000).toFixed(2);
  return {
    px: s > 32 ? 100 : s > 16 ? 80 : 40,
    style:
      "width:" +
      s.toFixed(2) +
      "px;height:" +
      s.toFixed(2) +
      "px;left:" +
      at(x + w / 2) +
      "px;top:" +
      at(y + h / 2) +
      "px",
  };
}
function badgeHTML(name) {
  const b = BADGES.get(name);
  if (!b || typeof b !== "object") return "";
  const img = (src, cls, style) =>
    '<img src="' +
    esc(src) +
    '" alt="" width="18" height="18" loading="lazy"' +
    (cls ? ' class="' + cls + '"' : "") +
    (style ? ' style="' + esc(style) + '"' : "") +
    ">";
  if (typeof b.flag === "string" && FLAG_RE.test(b.flag))
    return '<span class="badge" aria-hidden="true">' + img("flags/" + b.flag + ".webp") + "</span>";
  if (typeof b.crest !== "string" || !CREST_RE.test(b.crest)) return "";
  const src = (dir, n) =>
      "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/" + dir + "/" + b.crest + ".png&h=" + n + "&w=" + n,
    fit = crestFit(b.box),
    dark = fit && crestFit(b.dark);
  if (!fit) return '<span class="badge crest" aria-hidden="true">' + img(src("500", 40)) + "</span>";
  // in dark theme ESPN's dark-background crest, where it has one (styles.css shows one of the two; a lazy picture
  // that is not shown is never downloaded)
  return (
    '<span class="badge crest fit" aria-hidden="true">' +
    img(src("500", fit.px), dark ? "lt" : "", fit.style) +
    (dark ? img(src("500-dark", dark.px), "dk", dark.style) : "") +
    "</span>"
  );
}
function teamHTML(name) {
  const f = favs.has(name);
  return (
    '<span class="team' +
    (f ? " fav" : "") +
    '">' +
    badgeHTML(name) +
    '<span class="nm">' +
    esc(teamName(name)) +
    '</span><button type="button" class="star" data-team="' +
    esc(name) +
    '" aria-pressed="' +
    f +
    '" aria-label="' +
    esc((f ? T.unstar : T.star) + " " + teamName(name)) +
    '">' +
    (f ? ICON.star : ICON.starO) +
    "</button></span>"
  );
}
function srcHTML(r) {
  const c = r.check;
  if (!c || !c.sources || !c.sources.length) return "";
  const k = keyOf(r),
    n = c.sources.length;
  let h =
    '<details class="srcs" data-k="' +
    esc(k) +
    '"' +
    (openSrc.has(k) ? " open" : "") +
    "><summary>" +
    esc(c.status === "confirmed" ? T.srcVerified(n) : T.srcList(n)) +
    '</summary><div class="body">';
  if (c.status === "confirmed") {
    const m = /^(\d+) independent/.exec(c.basis || "");
    h += "<span>" + esc(m ? T.basisAgree(+m[1]) : T.basisOfficial) + "</span>";
  }
  const rep = (Array.isArray(c.reported) ? c.reported : []).map(toDate).filter(Boolean);
  if (rep.length)
    h +=
      '<span class="reported">' +
      esc(T.reported) +
      " " +
      rep.map(d => fmtT.format(d) + " " + zoneOf(d)).join(T.or) +
      "</span>";
  if (c.note) h += "<span>" + esc(T.noteDiffer) + "</span>";
  h +=
    "<ul>" +
    c.sources
      .map(s => {
        const url = safeUrl(s.url),
          name = url
            ? '<a href="' + esc(url) + '" rel="noopener">' + esc(s.source) + "</a>"
            : "<span>" + esc(s.source) + "</span>";
        return (
          "<li>" +
          name +
          (s.official ? '<span class="off">' + esc(T.official) + "</span>" : "") +
          (s.comment ? '<span class="note" lang="en">' + esc(s.comment) + "</span>" : "") +
          "</li>"
        );
      })
      .join("") +
    "</ul></div></details>";
  return h;
}
// "Your teams", at the top of the list: the next matches of the starred teams, whatever the filters show. With no
// team starred yet, an invitation to star one, until "Not now" (remembered as follow: "no").
const CHEVRON =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
let followNo = false; // Not now pressed on this visit (also saved, when the browser allows it)
function mineHTML() {
  if (!favs.size) {
    if (followNo || store.get("follow", "") === "no") return "";
    return (
      '<section class="myteams" aria-labelledby="myteams-h"><h2 id="myteams-h">' +
      esc(T.followTitle) +
      "</h2><p>" +
      esc(T.followText) +
      '</p><div class="myteams-act"><button type="button" class="btn primary" id="myteams-find">' +
      esc(T.followFind) +
      '</button><button type="button" class="btn" id="myteams-no">' +
      esc(T.followNo) +
      "</button></div></section>"
    );
  }
  const today = dayKey.format(new Date()),
    soon = Date.now() - 3 * 3600e3, // a match that started less than three hours ago may still be on
    at = r => r.when || new Date(r.day + "T23:59:00Z"), // no time yet: late that day
    upcoming = DATA.filter(
      r =>
        r.kind !== "f1" &&
        r.uid &&
        (favs.has(r.home) || favs.has(r.away)) &&
        (r.when ? r.when > soon : r.day >= today) &&
        !(liveOf(r) && liveOf(r).state === "post"),
    ).sort((a, b) => at(a) - at(b)),
    // each starred team's next match first, so one team's busy week does not hide another; then the soonest others
    firsts = [...favs].map(t => upcoming.find(r => r.home === t || r.away === t)).filter(Boolean),
    next = [...new Set([...firsts.slice(0, 3), ...upcoming])].slice(0, 3).sort((a, b) => at(a) - at(b));
  const when = r => {
    const L = liveOf(r);
    if (L && L.state === "in") return T.pLive + " " + L.clock;
    const d = r.when ? dayKey.format(r.when) : r.day,
      day =
        d === today
          ? T.todayRel
          : d === addDays(today, 1)
            ? T.tomorrow
            : clean(r.when ? fmtDay.format(r.when) : fmtDayU.format(new Date(d + "T12:00:00Z")));
    return day + " · " + (r.when ? fmtT.format(r.when) + " " + zoneOf(r.when) : T.tbcSmall);
  };
  return (
    '<section class="myteams" aria-labelledby="myteams-h"><h2 id="myteams-h">' +
    esc(T.mineTitle) +
    "</h2>" +
    (next.length
      ? "<ul>" +
        next
          .map(
            r =>
              '<li><a class="myteams-row md-open" href="' +
              esc(matchHref(r)) +
              '" data-uid="' +
              esc(r.uid) +
              '"><span><small>' +
              esc(when(r)) +
              "</small><b>" +
              esc(teamName(r.home)) +
              esc(T.vs) +
              esc(teamName(r.away)) +
              "</b></span>" +
              CHEVRON +
              "</a></li>",
          )
          .join("") +
        "</ul>"
      : "<p>" + esc(T.mineNone) + "</p>") +
    "</section>"
  );
}
let lastList = "";
function render() {
  if (!META) return;
  document
    .querySelectorAll("details.srcs")
    .forEach(d => (d.open && !d.hasAttribute("data-folding") ? openSrc.add(d.dataset.k) : openSrc.delete(d.dataset.k))); // one folding away counts as closed
  syncControls();
  const rows = filtered(),
    list = document.getElementById("list");
  renderLive();
  const counts = {};
  rows.forEach(r => (counts[r.code] = (counts[r.code] || 0) + 1));
  // not shown on screen; screen readers hear how many matches the filters leave
  document.getElementById("summary").textContent = T.shown(rows.length);
  const groups = new Map();
  let shown = 0;
  for (const r of rows) {
    if (shown >= limit && !groups.has(r.day)) break;
    if (!groups.has(r.day)) groups.set(r.day, []);
    groups.get(r.day).push(r);
    shown++;
  }
  const today = dayKey.format(new Date()),
    tomorrow = addDays(today, 1);
  let html = "";
  for (const [day, ms] of groups) {
    const dd = new Date(day + "T12:00:00Z");
    const rel = day === today ? T.todayRel : day === tomorrow ? T.tomorrow : "";
    const long = fmtDayLong.format(dd);
    html +=
      '<section class="day"><h2 class="day-h"><span class="sr">' +
      esc(long.charAt(0).toUpperCase() + long.slice(1)) +
      (rel ? ", " + esc(rel) : "") +
      "</span>" +
      '<span class="cal-block" aria-hidden="true"><span class="mon">' +
      esc(clean(fmtMon.format(dd))) +
      '</span><span class="num">' +
      dd.getUTCDate() +
      '</span><span class="wd">' +
      esc(clean(fmtWd.format(dd))) +
      "</span>" +
      (rel ? '<span class="rel">' + esc(rel) + "</span>" : "") +
      "</span></h2>" +
      '<ul class="day-list">';
    ms.sort((a, b) => (a.when ? a.when : Infinity) - (b.when ? b.when : Infinity));
    for (const r of ms) {
      if (r.kind === "f1") {
        html += f1Row(r);
        continue;
      }
      const tags = [],
        c = r.check,
        L = liveOf(r);
      const started = L && L.state !== "pre"; // once a match is on, its score replaces the time labels
      if (L && L.state === "in")
        tags.push(
          '<span class="pill live"><span class="dot-live" aria-hidden="true"></span>' +
            esc(T.pLive) +
            " " +
            esc(L.clock) +
            "</span>",
        );
      else if (L && L.state === "post")
        tags.push('<span class="pill ft">' + esc(L.detail === "FT" || !L.detail ? T.ft : L.detail) + "</span>");
      if (!started) {
        if (!r.utc) {
          if (c && c.status === "conflicting") tags.push('<span class="pill warn">' + esc(T.pConflicting) + "</span>");
          else if (c && c.status === "unconfirmed")
            tags.push('<span class="pill warn">' + esc(T.pUnconfirmed) + "</span>");
          else tags.push('<span class="pill tbc">' + esc(T.pTbc) + "</span>");
        } else if (r.provisional) tags.push('<span class="pill warn">' + esc(T.pProvisional) + "</span>");
        else if (c && c.status === "confirmed")
          tags.push('<span class="pill ok">' + ICON.check + esc(T.pVerified) + "</span>");
        if (r.when && +fmtH.format(r.when) < 7)
          tags.push('<span class="pill early">' + ICON.moon + esc(T.pEarly) + "</span>");
      }
      const timeCell = started
        ? '<span class="score" data-uid="' +
          esc(r.uid) +
          '" role="img" aria-label="' +
          esc(T.score(L.hs, L.as)) +
          '">' +
          esc(L.hs) +
          "–" +
          esc(L.as) +
          "</span><small>" +
          esc(L.state === "in" ? T.liveSmall : T.finalSmall) +
          "</small>"
        : r.when
          ? '<time datetime="' +
            esc(r.utc) +
            '">' +
            fmtT.format(r.when) +
            "</time><small>" +
            zoneOf(r.when) +
            "</small>"
          : '<span aria-hidden="true">– –</span><small>' + esc(T.tbcSmall) + "</small>";
      const meta = ['<span class="comp"><i aria-hidden="true"></i>' + esc(compName(r.comp)) + "</span>"];
      if (r.round) meta.push("<span>" + esc(T.round(r.round)) + "</span>");
      if (r.venue) meta.push("<span>" + esc(r.venue) + "</span>");
      if (r.note) meta.push("<span>" + esc(T.notes[r.note] || r.note) + "</span>");
      html +=
        '<li class="match' +
        (L && L.state === "in" ? " is-live" : "") +
        '" style="--c:' +
        colorOf(r.code) +
        '">' +
        '<div class="m-time">' +
        timeCell +
        "</div>" +
        '<div class="m-main"><h3 class="m-teams">' +
        teamHTML(r.home) +
        '<span class="sr"> v </span>' +
        teamHTML(r.away) +
        "</h3>" +
        '<div class="m-meta">' +
        meta.join("") +
        "</div>" +
        watchHTML(r, L) +
        detailsBtn(r) +
        srcHTML(r) +
        "</div>" +
        '<div class="m-tags">' +
        tags.join("") +
        "</div></li>";
    }
    html += "</ul></section>";
  }
  if (!rows.length)
    html =
      '<p class="empty">' + esc(T.empty) + " " + esc(favonly.checked && !favs.size ? T.emptyFav : T.emptyWide) + "</p>";
  if (rows.length > shown)
    html += '<button type="button" class="more" id="more">' + esc(T.more(rows.length - shown)) + "</button>";
  html = mineHTML() + html;
  if (html === lastList) return; // the minute-by-minute refresh usually changes nothing: leave the page alone
  lastList = html;
  list.innerHTML = html;
  // a new choice of filters rises into place, one day after another; automatic updates do not move
  if (filterAct) riseDays([...list.querySelectorAll(".day")]);
  markCurrent();
  goals(list, ".score[data-uid]", el => el.dataset.uid);
  const m = document.getElementById("more");
  if (m)
    m.onclick = () => {
      const had = list.querySelectorAll(".day").length;
      limit += 80;
      render();
      riseDays([...list.querySelectorAll(".day")].slice(had)); // the days added rise in turn, as after a filter change
    };
}
// the list only moves after a click, change or new date in the filters (the flag is cleared once that event is
// handled). Typing a team name does not move it: the list redraws at each pause, so it would keep jumping while typing.
let filterAct = false;
["click", "change", "input"].forEach(t =>
  document.getElementById("filters").addEventListener(
    t,
    e => {
      if (e.target === q) return;
      filterAct = true;
      setTimeout(() => (filterAct = false));
    },
    true,
  ),
);
// a score that changed since the last update (a goal) bounces with a gold glow; nothing moves on the first load
const SEEN = new Map();
function goals(box, sel, key) {
  box.querySelectorAll(sel).forEach(el => {
    const k = key(el),
      was = SEEN.get(k);
    if (was !== undefined && was !== el.textContent && motionOn()) {
      el.classList.add("goal");
      el.closest(".match,.lv-row").classList.add("goal-row");
    }
    SEEN.set(k, el.textContent);
  });
}
const listEl = document.getElementById("list");
// sources and "How to subscribe" fold away as they unfolded (data-folding turns the arrow back at once)
document.addEventListener("click", e => {
  const sm = e.target.closest(".srcs>summary,.calpanel details>summary"),
    d = sm && sm.parentNode;
  if (!d || !d.open) return;
  e.preventDefault();
  const body = d.querySelector(":scope>.body,:scope>ol");
  if (body.leaving) {
    stay(body); // clicked again while folding: it stays open
    d.removeAttribute("data-folding");
    return;
  }
  d.setAttribute("data-folding", "");
  leave(body, LIFT, () => {
    d.open = false;
    d.removeAttribute("data-folding");
  });
});
// the invitation's buttons: Find my team opens the filters where needed and goes to the team search; Not now folds the
// invitation away for good, and the days below rise into its place
listEl.addEventListener("click", e => {
  const b = e.target.closest("#myteams-find, #myteams-no");
  if (!b) return;
  if (b.id === "myteams-find") {
    if (!filtersEl.checkVisibility()) document.getElementById("sideshow").click();
    q.focus();
    return;
  }
  followNo = true;
  store.set("follow", "no");
  const box = b.closest(".myteams");
  leave(box, LIFT, () => {
    render();
    riseDays([...listEl.querySelectorAll(".day")]);
    listEl.focus();
  });
});
listEl.addEventListener("click", e => {
  const s = e.target.closest(".star");
  if (!s) return;
  const t = s.dataset.team;
  favs.has(t) ? favs.delete(t) : favs.add(t);
  store.set("favs", [...favs]);
  render();
  const again = [...listEl.querySelectorAll(".star")].find(x => x.dataset.team === t);
  if (again) {
    again.focus(); // keep keyboard focus in place
    if (favs.has(t)) again.classList.add("pop");
  }
});
// CazéTV YouTube stream (or, kind "planned", a match on CazéTV's schedule whose stream
// does not exist yet: links to the channel), when build_schedule.py found one; hidden once the match has finished
function watchHTML(r, L) {
  const url = r.watch && safeUrl(r.watch.url);
  if (!url || (L && L.state === "post")) return "";
  const h = teamName(r.home),
    a = teamName(r.away),
    p = r.watch.kind === "planned";
  return (
    '<p class="watch"><a class="btn" href="' +
    esc(url) +
    '" rel="noopener" aria-label="' +
    esc(p ? T.watchPlannedAria(h, a) : T.watchAria(h, a)) +
    '">' +
    ICON.play +
    "<span>" +
    esc(p ? T.watchPlanned : T.watch) +
    "</span></a><small>" +
    esc(p ? T.watchPlannedNote : T.watchNote) +
    "</small></p>"
  );
}
function detailsBtn(r) {
  if (!r.uid) return "";
  return (
    '<p class="m-act"><a class="btn md-open" href="' +
    esc(matchHref(r)) +
    '" data-uid="' +
    esc(r.uid) +
    '" aria-label="' +
    esc(T.mdOpenAria(teamName(r.home), teamName(r.away))) +
    '">' +
    ICON.info +
    "<span>" +
    esc(T.mdOpen) +
    "</span></a></p>"
  );
}
/* ---------- Formula 1 sessions: a compact row each, and a full card for the race ---------- */
const F1_MIN = { FP1: 60, FP2: 60, FP3: 60, SQ: 45, S: 60, Q: 60, R: 120 }; // rough length, for "on now"
const gpName = n => T.gp[n] || n;
function f1Tags(r) {
  const now = Date.now(),
    c = r.check,
    t = [];
  if (r.when && now >= r.when.getTime() && now < r.when.getTime() + F1_MIN[r.sess] * 60e3)
    return '<span class="pill live"><span class="dot-live" aria-hidden="true"></span>' + esc(T.pOn) + "</span>";
  if (r.top) return '<span class="pill ft">' + esc(T.pDone) + "</span>";
  if (r.when && now >= r.when.getTime()) return "";
  if (!r.utc) t.push('<span class="pill tbc">' + esc(T.pTbc) + "</span>");
  else if (c && c.status === "confirmed") t.push('<span class="pill ok">' + ICON.check + esc(T.pVerified) + "</span>");
  else if (c && c.status === "conflicting") t.push('<span class="pill warn">' + esc(T.pConflicting) + "</span>"); // Jolpica-F1 and OpenF1 disagree
  if (r.when && +fmtH.format(r.when) < 7) t.push('<span class="pill early">' + ICON.moon + esc(T.pEarly) + "</span>");
  return t.join("");
}
function f1Row(r) {
  const time =
    '<div class="m-time">' +
    (r.when
      ? '<time datetime="' + esc(r.utc) + '">' + fmtT.format(r.when) + "</time><small>" + zoneOf(r.when) + "</small>"
      : '<span aria-hidden="true">– –</span><small>' + esc(T.tbcSmall) + "</small>") +
    "</div>";
  const tags = '<div class="m-tags">' + f1Tags(r) + "</div>",
    gp = gpName(r.gp),
    S = T.f1Sess;
  if (r.sess !== "R") {
    const res = r.top
      ? '<p class="sess-res">' + esc((r.sess === "Q" ? T.f1Pole : T.f1Winner) + ": " + r.top[0]) + "</p>"
      : "";
    return (
      '<li class="match sess" style="--c:' +
      colorOf("F1") +
      '">' +
      time +
      '<div class="m-main"><h3 class="sess-line"><b>' +
      esc(S[r.sess]) +
      "</b> · " +
      esc(gp) +
      "</h3>" +
      res +
      "</div>" +
      tags +
      "</li>"
    );
  }
  const meta =
    '<div class="m-meta"><span class="comp"><i aria-hidden="true"></i>' +
    esc(T.f1) +
    "</span><span>" +
    esc(T.f1Round(r.round)) +
    "</span>" +
    (r.sprint ? "<span>" + esc(T.f1SprintWk) + "</span>" : "") +
    (r.venue ? "<span>" + esc(r.venue) + "</span>" : "") +
    "</div>";
  const others = DATA.filter(x => x.wk === r.wk && x.sess !== "R").map(x => S[x.sess]);
  const extra = r.top
    ? '<ol class="mini-pod" aria-label="' +
      esc(T.f1Podium) +
      '">' +
      r.top.map((n, i) => "<li><b>" + (i + 1) + "</b> " + esc(n) + "</li>").join("") +
      "</ol>"
    : others.length
      ? '<p class="wk-list">' + esc(T.f1Weekend + " " + others.join(", ")) + "</p>"
      : "";
  return (
    '<li class="match" style="--c:' +
    colorOf("F1") +
    '">' +
    time +
    '<div class="m-main"><h3 class="m-teams"><span class="m-sess">' +
    esc(S.R) +
    '</span><span class="m-gp">' +
    esc(gp) +
    "</span></h3>" +
    meta +
    extra +
    '<p class="m-act"><a class="btn md-open" href="?match=' +
    encodeURIComponent(r.wk) +
    '" data-uid="' +
    esc(r.wk) +
    '" aria-label="' +
    esc(T.f1WkOpenAria(gp)) +
    '">' +
    ICON.info +
    "<span>" +
    esc(T.f1WkOpen) +
    "</span></a></p>" +
    srcHTML(r) +
    "</div>" +
    tags +
    "</li>"
  );
}
function assignDays() {
  DATA.forEach(r => {
    r.day = r.when ? dayKey.format(r.when) : r.date;
  });
}
function renderStamp() {
  const stale = META.f1stale ? '<span class="src">' + esc(T.f1Stale) + "</span>" : ""; // Jolpica-F1 was unreachable at the last rebuild
  // each name once, joined the way the visitor's language joins a list ("Jolpica-F1 and OpenF1" arrives as one name)
  const names = [
    ...new Set(
      Object.entries(META.sources || {})
        .filter(([k, v]) => k !== "INTL" && k !== "UNL" && typeof v === "string") // hand-kept files, not a league feed
        .flatMap(([, v]) => v.split(/ and |, /)),
    ),
  ].filter(Boolean);
  const src = names.length ? new Intl.ListFormat(T.locale || LANG, { type: "conjunction" }).format(names) : "";
  const d = toDate(META.generated);
  document.getElementById("stamp").innerHTML =
    (d ? "<span>" + esc(T.updated) + " <b>" + fmtStamp.format(d) + " " + zoneOf(d) + "</b></span>" : "") +
    (src
      ? '<span class="src"><span class="src-l">' +
        esc(T.leagueData) +
        ': </span><a href="#how-h" id="srclink">' +
        esc(src) +
        ' <span class="sr">' +
        esc(T.srcMore) +
        "</span></a></span>"
      : "") +
    stale;
}
// The source names lead to "How it works" in the footer, which says in plain words where everything comes from. Done
// here, not by the link's own #how-h, which would add a history entry the Match details panel reads as a Back step.
document.getElementById("stamp").addEventListener("click", e => {
  if (!e.target.closest("#srclink")) return;
  e.preventDefault();
  const h = document.getElementById("how-h");
  h.scrollIntoView({ block: "start" });
  h.focus({ preventScroll: true });
});
