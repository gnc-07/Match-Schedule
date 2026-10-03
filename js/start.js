/* ---------- keep a page left open up to date ---------- */
// Phones keep tabs in memory and show them again without reloading, so the page checks for new data itself:
// when the visitor comes back to it, and every 15 minutes while it is open. If the site itself changed
// (the "site" fingerprint in fixtures.json), it reloads when the visitor comes back, never while they read.
let lastCheck = 0;
function getData() {
  lastCheck = Date.now();
  if (window.FX) {
    const first = window.FX;
    window.FX = null;
    return first;
  } // the download started in <head>
  return fetch("fixtures.json", { cache: "no-store" }).then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
}
// A time that is not a real date counts as "no time yet", and a record without its basic fields is left out,
// so one broken entry in fixtures.json can never stop the rest of the list from showing.
const toDate = s => {
  const d = s ? new Date(s) : null;
  return d && !isNaN(d) ? d : null;
};
const usable = r =>
  r &&
  typeof r === "object" &&
  typeof r.code === "string" &&
  /^\d{4}-\d\d-\d\d$/.test(r.date) &&
  typeof r.home === "string" &&
  typeof r.away === "string" &&
  // every other field the list reads with text or list methods: the right type, or absent
  (r.kind !== "f1" || (typeof r.sess === "string" && typeof r.wk === "string")) &&
  ["gp", "round", "venue", "comp", "note", "uid"].every(k => r[k] == null || typeof r[k] === "string") &&
  (r.top == null || Array.isArray(r.top)) &&
  (r.check == null ||
    (typeof r.check === "object" &&
      (r.check.sources == null ||
        (Array.isArray(r.check.sources) &&
          r.check.sources.every(s => s && typeof s === "object" && !Array.isArray(s))))));
function useData(j) {
  META = j;
  DATA = (Array.isArray(j.matches) ? j.matches : []).filter(usable);
  BADGES = new Map(
    j.badges && typeof j.badges === "object" && !Array.isArray(j.badges) ? Object.entries(j.badges) : [],
  );
  DATA.forEach(r => {
    r.when = toDate(r.utc);
    if (!r.when) r.utc = null;
  });
  assignDays();
  renderStamp();
  render();
  if (MD) {
    const r = DATA.find(x => x.uid === MD.r.uid);
    if (r) {
      MD.r = r;
      paintMatch();
    }
  }
  if (WK) {
    const l = DATA.filter(x => x.wk === WK.wk);
    if (l.length) {
      WK.list = l.sort((a, b) => (a.when || 0) - (b.when || 0));
      paintWkTop();
      paintWkSched();
    }
  }
}
function refresh(back) {
  if (!META || Date.now() - lastCheck < (back ? 60000 : 15 * 60000)) return;
  getData()
    .then(j => {
      if (back && j.site && META.site && j.site !== META.site) {
        location.reload();
        return;
      }
      if (j.generated !== META.generated) useData(Object.assign(j, { site: META.site })); // keep the old fingerprint until the reload
    })
    .catch(() => {}); // offline or a failed check: keep showing what we have
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh(true);
});
addEventListener("pageshow", e => {
  if (e.persisted) refresh(true);
}); // page restored from the back/forward cache
setInterval(() => refresh(false), 60000);

/* ---------- start ---------- */
applyLang();
applyWide();
countVisit("/" + LANG); // one visit, and the language the page opened in
setRange(range, false);
settled = true; // from here on, what a visitor changes may move
getData()
  .then(j => {
    useData(j);
    setInterval(render, 60000);
    const uid = matchParam();
    if (uid) showPanel(uid);
    pollLive();
    setInterval(pollLive, 30000);
  })
  .catch(() => {
    document.getElementById("stamp").textContent = "";
    document.getElementById("list").innerHTML = '<p class="status">' + esc(T.loadError) + "</p>";
  });
