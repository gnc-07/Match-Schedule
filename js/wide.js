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
// the parts of the page that change place when the filter sidebar or the panel beside the list comes or goes: the
// header's parts (the brand, the theme button, the other buttons) each keep their width, so they only glide
const pageParts = () => [
  filtersEl,
  sideBar,
  liveBox,
  listEl,
  rail,
  ...document.querySelectorAll(".topbar>*"),
  document.getElementById("stamp"),
];
// The sidebar, the list and the right-hand column move as one: hiding, the sidebar slides out to the left as it fades,
// and the list and the column slide over by as much, at the same speed (none of them changes width, see styles.css);
// showing, the same backwards. Hiding, the sidebar is kept where it was meanwhile (data-side-out), as the right-hand
// column is by railOut(). Positions are measured on screen, so they are divided by the text-size zoom.
function setSide(s) {
  if (s === side) return;
  const r = document.documentElement,
    z = parseFloat(getComputedStyle(r).zoom) || 1,
    cs = getComputedStyle(filtersEl),
    turn = filtersEl.getAnimations().length > 0 && { opacity: cs.opacity, transform: cs.transform }; // pressed again on its way: it turns back from where it is
  if (filtersEl.leaving) {
    stay(filtersEl);
    r.removeAttribute("data-side-out");
    filtersEl.style.left = filtersEl.style.top = filtersEl.style.width = "";
  }
  filtersEl.getAnimations().forEach(a => a.cancel());
  const was = filtersEl.getBoundingClientRect();
  let dx = 0; // how far the list goes from one layout to the other (glide has stopped it first)
  side = s;
  store.set("side", s);
  glide(
    pageParts().filter(x => x !== filtersEl),
    () => {
      const from = listEl.getBoundingClientRect().left;
      applyWide();
      dx = (listEl.getBoundingClientRect().left - from) / z;
      if (s === "closed") {
        Object.assign(filtersEl.style, {
          left: was.left / z + "px",
          top: was.top / z + "px",
          width: was.width / z + "px",
        });
        r.setAttribute("data-side-out", "");
      }
    },
  );
  const gone = { opacity: 0, transform: "translateX(" + (s === "open" ? -dx : dx) + "px)" },
    here = { opacity: 1, transform: "none" };
  if (s === "open") move(filtersEl, [turn || gone, here], SOFT());
  else
    leave(
      filtersEl,
      [turn || here, gone],
      () => {
        r.removeAttribute("data-side-out");
        filtersEl.style.left = filtersEl.style.top = filtersEl.style.width = "";
      },
      "m",
    );
  document.getElementById(s === "open" ? "sidehide" : "sideshow").focus(); // the button pressed disappears: focus goes to its opposite
}
// phones: the filters fold away behind the same "Show filters" button, so the list comes first. Not remembered: every
// visit starts with the list, and the summary beside the button says what the filters are showing.
// Shown, the filters drop in and the list moves down to make room; folded, the filters lift away while the list fades
// out with them, then the list rises into its place. The list fades in over only the last 48px of the way: the filters
// are 350px tall or more (Portuguese, larger text), too far to glide in one --dur-m without passing the 50px a frame
// the motion checks allow.
let filtersFolded = true,
  listOut = null; // the list fading out while the filters fold away
function slideList(change) {
  const pin = onScreen(listEl), // followed by a match on screen, as in glide()
    was = pin.getBoundingClientRect().top;
  change();
  const dy =
    (was - pin.getBoundingClientRect().top) / (parseFloat(getComputedStyle(document.documentElement).zoom) || 1);
  if (Math.abs(dy) > 1)
    move(listEl, [
      { opacity: 0, transform: "translateY(" + Math.sign(dy) * Math.min(Math.abs(dy), 48) + "px)" },
      { opacity: 1, transform: "none" },
    ]);
}
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
    if (listOut) listOut.cancel();
    listOut = null;
    if (!filtersFolded) return;
    filtersFolded = false;
    syncFold();
    slideList(() => (r.dataset.filters = "open"));
    move(filtersEl, DROP, { duration: DUR("s") });
  } else if (!filtersFolded && !filtersEl.leaving) {
    filtersFolded = true;
    syncFold();
    listOut = move(listEl, FADE.slice().reverse(), { duration: DUR("s"), fill: "forwards", ...SOFT() });
    leave(filtersEl, LIFT, () => {
      slideList(() => delete r.dataset.filters);
      if (listOut) listOut.cancel(); // the list's rise, just started, takes over from here
      listOut = null;
    });
  }
}
document.getElementById("sidehide").onclick = () => setSide("closed");
document.getElementById("sideshow").onclick = () =>
  document.documentElement.dataset.wide ? setSide("open") : foldFilters(!filtersFolded);
addEventListener("resize", applyWide);
