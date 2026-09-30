/* ---------- wide screens: filters in a sidebar that can be hidden (laptops), plus a right-hand column and the
   match details beside the list (monitors). The widths are in wideMode, in <head>. ---------- */
const rail = document.getElementById("rail"),
  liveBox = document.getElementById("livebox"),
  legendEl = document.getElementById("legend");
let side = store.get("side", "open") === "closed" ? "closed" : "open"; // remembered between visits
function applyWide() {
  const r = document.documentElement,
    mode = wideMode(parseFloat(getComputedStyle(r).zoom) || 1);
  if (mode) r.dataset.wide = mode;
  else delete r.dataset.wide;
  r.dataset.side = side;
  // on monitors Live now and the key move to the right-hand column; elsewhere they sit above the filters and in the footer
  if (mode === "full" && liveBox.parentNode !== rail) rail.append(liveBox, legendEl);
  else if (mode !== "full" && liveBox.parentNode === rail) {
    sideBar.before(liveBox);
    document.querySelector("footer").prepend(legendEl);
  }
  // an open panel switches between over the list and beside it
  if (mddlg.open && mddlg.matches(":modal") === (mode === "full")) {
    mddlg.close();
    openDialog();
  }
  syncFold();
  setFH();
  fitRail();
}
// taller than the window (many live matches): the right-hand column scrolls with the page, so its end stays reachable
const fitRail = () =>
  rail.classList.toggle(
    "tall",
    rail.offsetHeight > innerHeight / (parseFloat(getComputedStyle(document.documentElement).zoom) || 1) - 32,
  );
if (window.ResizeObserver) new ResizeObserver(fitRail).observe(rail);
// the parts of the page that change place when the filter sidebar or the panel beside the list comes or goes
const pageParts = () => [filtersEl, sideBar, liveBox, listEl, rail];
// hiding: the sidebar slides away to the left first; then the list glides over and the bar above it fades in.
// Showing: the list glides over first; then the sidebar slides in.
function setSide(s) {
  if (s === side || filtersEl.leaving) return;
  const apply = () => {
    side = s;
    store.set("side", s);
    glide(
      pageParts().filter(x => x !== filtersEl),
      applyWide,
    );
    // shown: once the list has mostly made room, the sidebar slides in from the left (the way it left)
    if (s === "open")
      move(
        filtersEl,
        [
          { opacity: 0, transform: "translateX(-24px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: DUR("s"), delay: DUR("s"), fill: "backwards" },
      );
    document.getElementById(s === "open" ? "sidehide" : "sideshow").focus(); // the button pressed disappears: focus goes to its opposite
  };
  if (s === "open") return apply();
  leave(
    filtersEl,
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: "translateX(-24px)" },
    ],
    apply,
  );
}
// phones: the filters fold away behind the same "Show filters" button, so the list comes first. Not remembered: every
// visit starts with the list, and the summary beside the button says what the filters are showing.
let filtersFolded = true;
function syncFold() {
  const open = !document.documentElement.dataset.wide && !filtersFolded,
    btn = document.getElementById("sideshow"),
    label = btn.querySelector("[data-t]");
  btn.setAttribute("aria-expanded", open);
  label.dataset.t = open ? "hideFilters" : "showFilters"; // applyLang translates it from here
  label.textContent = T[label.dataset.t];
}
function foldFilters(fold) {
  const r = document.documentElement;
  if (!fold) {
    stay(filtersEl); // back while it was folding away
    if (!filtersFolded) return;
    filtersFolded = false;
    r.dataset.filters = "open";
    syncFold();
    move(filtersEl, DROP, { duration: DUR("s") });
  } else if (!filtersFolded && !filtersEl.leaving) {
    filtersFolded = true;
    syncFold();
    leave(filtersEl, LIFT, () => delete r.dataset.filters);
  }
}
document.getElementById("sidehide").onclick = () => setSide("closed");
document.getElementById("sideshow").onclick = () =>
  document.documentElement.dataset.wide ? setSide("open") : foldFilters(!filtersFolded);
addEventListener("resize", applyWide);
