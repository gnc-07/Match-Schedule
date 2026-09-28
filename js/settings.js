/* ---------- small icons ---------- */
const ICON = {
  clock:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="14" r="7"/><path d="M12 14v-4M10 3h4M18.5 7.5 17 9"/></svg>',
  star: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
  starO:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
  check:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  play: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.2-6.5a1 1 0 0 0 0-1.7L9.5 4.6A1 1 0 0 0 8 5.5z"/></svg>',
  moon: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  // match events: the shapes carry the meaning together with a text label, never on their own
  ball: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle class="bf" cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8"/><path d="m12 7.3 3.7 2.7-1.4 4.3H9.7L8.3 10z" fill="currentColor"/><path d="M12 7.3V2.6M15.7 10l4.4-1.5M14.3 14.3l2.8 3.9M9.7 14.3l-2.8 3.9M8.3 10 3.9 8.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  og: '<svg class="og-i" aria-hidden="true" viewBox="0 0 24 24"><circle class="bf" cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8"/><path d="m12 7.3 3.7 2.7-1.4 4.3H9.7L8.3 10z" fill="currentColor"/><path d="M12 7.3V2.6M15.7 10l4.4-1.5M14.3 14.3l2.8 3.9M9.7 14.3l-2.8 3.9M8.3 10 3.9 8.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  miss: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle class="bf" cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8"/><path d="m12 7.3 3.7 2.7-1.4 4.3H9.7L8.3 10z" fill="currentColor"/><path class="s-off" d="M4 20 20 4" stroke-width="3" stroke-linecap="round"/></svg>',
  yellow:
    '<svg aria-hidden="true" viewBox="0 0 24 24"><rect class="i-yel" x="6.5" y="3" width="11" height="17" rx="2" stroke-width="1.5" transform="rotate(8 12 12)"/></svg>',
  red: '<svg aria-hidden="true" viewBox="0 0 24 24"><rect class="i-red" x="6.5" y="3" width="11" height="17" rx="2" stroke-width="1.5" transform="rotate(8 12 12)"/></svg>',
  second:
    '<svg aria-hidden="true" viewBox="0 0 24 24"><rect class="i-yel" x="3" y="2.5" width="10" height="15" rx="2" stroke-width="1.5" transform="rotate(-8 8 10)"/><rect class="i-red" x="10" y="6" width="10" height="15" rx="2" stroke-width="1.5" transform="rotate(8 15 13.5)"/></svg>',
  subOn:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5M6 11l6-6 6 6"/></svg>',
  subOff:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15M6 13l6 6 6-6"/></svg>',
  sub: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path class="s-on" d="M8 20V5M4 9l4-4 4 4"/><path class="s-off" d="M16 4v15M12 15l4 4 4-4"/></svg>',
  table:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/></svg>',
  info: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>',
  calAdd:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>',
  share:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  pinMap:
    '<svg class="map-pin" aria-hidden="true" viewBox="0 0 24 32"><path d="M12 31s10-11.4 10-19A10 10 0 0 0 2 12c0 7.6 10 19 10 19z"/><circle cx="12" cy="12" r="4"/></svg>',
};

/* ---------- settings kept in this browser (the page works without them) ---------- */
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("mp." + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("mp." + k, JSON.stringify(v));
    } catch {}
  },
};
// Everything from outside this file (fixtures.json, ESPN, Jolpica-F1, Wikidata) goes through esc() before it becomes HTML,
// and every outside link through safeUrl(), which only lets web addresses through (never javascript: or data:).
const esc = s =>
  String(s ?? "").replace(
    /[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const safeUrl = u => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : "";
  } catch {
    return "";
  }
};
// Pictures for the league buttons: flags for the four leagues, a globe for friendlies, a trophy for the Nations League
// and the F1 mark (from Simple Icons, https://simpleicons.org). A league missing here keeps its letter badge (abbr).
const band = (v, x, y, w, h) =>
  '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" style="fill:var(--flag-' + v + ')"/>';
const CREST = {
  EPL: ["flag", band("white", 0, 0, 24, 24) + band("eng", 9.5, 0, 5, 24) + band("eng", 0, 9.5, 24, 5)],
  LIGA: ["flag", band("esp-red", 0, 0, 24, 24) + band("esp-gold", 0, 6, 24, 12)],
  BUN: ["flag", band("black", 0, 0, 24, 8) + band("ger-red", 0, 8, 24, 8) + band("ger-gold", 0, 16, 24, 8)],
  BRA: [
    "flag",
    band("bra-green", 0, 0, 24, 24) +
      '<path d="M12 3.5 22.5 12 12 20.5 1.5 12z" style="fill:var(--flag-bra-yellow)"/><circle cx="12" cy="12" r="5" style="fill:var(--flag-bra-blue)"/><path d="M7.2 11.1c3-.9 6.6-.5 9.6 1.3" style="fill:none;stroke:var(--flag-white)"/>',
  ],
  INTL: [
    "mark",
    '<g style="fill:none;stroke:currentColor;stroke-width:1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-4.5 5-4.5 13 0 18M12 3c4.5 5 4.5 13 0 18"/></g>',
  ],
  UNL: [
    "mark",
    '<g style="fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5v1A3 3 0 0 0 7.4 10M17 6h2.5v1a3 3 0 0 1-2.9 3M12 14v4M8 20h8"/></g>',
  ],
  F1: [
    "mark",
    '<path d="M9.6 11.24h7.91L19.75 9H9.39c-2.85 0-3.62.34-5.17 1.81C2.71 12.3 0 15 0 15h3.38c.77-.75 2.2-2.13 2.85-2.75.92-.87 1.37-1.01 3.37-1.01zM20.39 9l-6 6H18l6-6h-3.61zm-3.25 2.61H9.88c-2.22 0-2.6.12-3.55 1.07C5.44 13.57 4 15 4 15h3.15l.75-.75c.49-.49.75-.55 1.78-.55h5.37l2.09-2.09z"/>',
  ],
};
const crestHTML = l => {
  const c = CREST[l.code];
  return c
    ? '<span class="crest pic ' +
        c[0] +
        '" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">' +
        c[1] +
        "</svg></span>"
    : '<span class="crest" aria-hidden="true">' + l.abbr + "</span>";
};

/* ---------- language: ?lang=pt in the address, then the saved choice, then the browser's language ---------- */
const urlLang = new URLSearchParams(location.search).get("lang");
let LANG =
  urlLang === "pt" || urlLang === "en"
    ? urlLang
    : store.get("lang", (navigator.language || "").toLowerCase().startsWith("pt") ? "pt" : "en");
let T = I18N[LANG];
const langsel = document.getElementById("langsel");
langsel.value = LANG;

/* ---------- time zone: the saved choice, else São Paulo for Portuguese and Edmonton for English ---------- */
const DEVICE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const ZONES = [
  "America/Edmonton",
  "America/Sao_Paulo",
  "America/Toronto",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "UTC",
];
const tzsel = document.getElementById("tzsel");
const defaultTz = () => (LANG === "pt" ? "America/Sao_Paulo" : "America/Edmonton");
let TZ = store.get("tz", null) || defaultTz();
function fillZones() {
  tzsel.innerHTML = "";
  if (!ZONES.includes(DEVICE)) tzsel.add(new Option(T.myTz(DEVICE.replace(/_/g, " ")), DEVICE));
  ZONES.forEach(z => tzsel.add(new Option(T.tzNames[z], z)));
  if (![...tzsel.options].some(o => o.value === TZ)) TZ = defaultTz();
  tzsel.value = TZ;
}
let fmtT, fmtZ, fmtH, fmtStamp, dayKey, fmtMon, fmtWd, fmtDayLong;
function makeFormatters() {
  const L = T.locale;
  fmtT = new Intl.DateTimeFormat(L, { hour: "numeric", minute: "2-digit", timeZone: TZ });
  fmtZ = new Intl.DateTimeFormat(L, { timeZoneName: "short", timeZone: TZ });
  fmtH = new Intl.DateTimeFormat("en-CA", { hour: "numeric", hourCycle: "h23", timeZone: TZ });
  fmtStamp = new Intl.DateTimeFormat(L, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
  dayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });
  fmtMon = new Intl.DateTimeFormat(L, { month: "short", timeZone: "UTC" });
  fmtWd = new Intl.DateTimeFormat(L, { weekday: "short", timeZone: "UTC" });
  fmtDayLong = new Intl.DateTimeFormat(L, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
const zoneOf = d => fmtZ.formatToParts(d).find(p => p.type === "timeZoneName").value;
const clean = s => String(s).replace(/\.$/, ""); // "Mon." -> "Mon"

/* ---------- theme: follows the device until the sun and moon button picks light or dark ---------- */
let theme = store.get("theme", "auto");
function applyTheme() {
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  // the sun and moon button: its picture and name describe what a click does
  const dark = theme === "dark" || (theme === "auto" && DARK.matches);
  document.documentElement.classList.toggle("is-dark", dark);
  themeBtn.setAttribute("aria-label", dark ? T.toLight : T.toDark);
  themeBtn.title = dark ? T.toLight : T.toDark;
}
const DARK = matchMedia("(prefers-color-scheme: dark)"),
  themeBtn = document.getElementById("themebtn");
themeBtn.addEventListener("click", () => {
  theme = document.documentElement.classList.contains("is-dark") ? "light" : "dark";
  store.set("theme", theme);
  switchTheme();
});
// the new sun or moon turns into place (called once the new theme is applied, so it is the icon now shown)
const turnIcon = () =>
  move(
    [...themeBtn.querySelectorAll(".ico")].find(i => getComputedStyle(i).display !== "none"),
    [
      { transform: "rotate(-90deg) scale(.5)", opacity: 0 },
      { transform: "none", opacity: 1 },
    ],
  );
// with animations on, the page cross-fades to the new theme (fadePage)
function switchTheme() {
  fadePage(() => {
    applyTheme();
    turnIcon();
  });
}
let fading = null; // the theme cross-fade under way, ended at once if animations are switched off
DARK.addEventListener("change", applyTheme); // until the button is used, follow the device, even when it switches by itself (for example at sunset)

/* ---------- contrast: normal or high (works with any theme) ---------- */
let contrast = store.get("contrast", "normal");
const hcBox = document.getElementById("hcbox");
function applyContrast() {
  if (contrast === "high") document.documentElement.setAttribute("data-contrast", "high");
  else document.documentElement.removeAttribute("data-contrast");
  hcBox.checked = contrast === "high";
}
hcBox.addEventListener("change", () => {
  contrast = hcBox.checked ? "high" : "normal";
  store.set("contrast", contrast);
  fadePage(applyContrast);
});

/* ---------- animations: on, unless the device asks for less motion, until the Animations box is used ---------- */
const CALM = matchMedia("(prefers-reduced-motion: reduce)"),
  mvBox = document.getElementById("mvbox");
let motion = store.get("motion", "auto");
const motionOn = () => motion === "on" || (motion === "auto" && !CALM.matches);
// a short animation made by script, at the same speeds as the CSS ones (which data-motion="off" stops instead)
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
  DUR = n => parseFloat(cssVar("--dur-" + n)) * 1000;
const MOVING = new Set(); // script animations still running, stopped at once if animations are switched off
function move(el, frames, o) {
  if (!el || !motionOn()) return;
  const a = el.animate(frames, { duration: DUR("m"), easing: cssVar("--ease"), ...o });
  MOVING.add(a);
  a.finished.then(
    () => MOVING.delete(a),
    () => MOVING.delete(a),
  );
  return a;
}
// something closing or going away moves out first, and only then goes (done); with animations off it goes at once.
// It takes as long as it took to arrive (speed: "s" or "m"), on the soft curve, so it starts and ends gently.
// Opened again meanwhile (stay), it stops leaving and stays where it is.
const SOFT = () => ({ easing: cssVar("--ease-soft") });
function leave(el, frames, done, speed = "s") {
  const a = move(el, frames, { duration: DUR(speed), fill: "forwards", ...SOFT() });
  if (!a) return done();
  el.leaving = a;
  const end = () => {
    if (el.leaving !== a) return;
    el.leaving = null;
    done();
    a.cancel();
  };
  a.finished.then(end, end);
}
function stay(el) {
  const a = el.leaving;
  el.leaving = null;
  if (a) a.cancel();
}
const DROP = [
    { opacity: 0, transform: "translateY(-6px)" },
    { opacity: 1, transform: "none" },
  ],
  LIFT = [...DROP].reverse(), // DROP backwards: fades out upwards
  SWAP = [
    { opacity: 0, transform: "translateY(6px)" },
    { opacity: 1, transform: "none" },
  ];
// new content in the same place (another league's table, the teams' championship): a quick fade in
const swapIn = el => move(el, SWAP, { duration: DUR("s") });
// the same for what a switch shows: everything in box but the switch's own row (keep), which stays put
const swapBelow = (box, keep) => box && [...box.children].filter(x => !x.matches(keep)).forEach(swapIn);
// the days of the list rise into place one after another (only the first few, so it stays short)
const riseDays = days =>
  days.slice(0, 6).forEach((d, i) =>
    move(
      d,
      [
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "none" },
      ],
      { delay: i * 45, fill: "backwards" },
    ),
  );
// a layout change (the filter sidebar hidden or shown): what moves glides from its old place to the new one, with
// transform only. Positions are measured on screen, so they are divided by the text-size zoom.
// The list is followed by a match on screen, not by its own edge: when the list gets narrower or wider, the matches
// above the window change height and the browser scrolls to keep what is read in place, so the list's top edge can
// move thousands of pixels while what is on screen barely moves.
// pin: the match to follow, when one matters (the one whose details open or close beside the list)
const onScreen = el =>
  (el === listEl && [...el.querySelectorAll(".match")].find(m => m.getBoundingClientRect().bottom > 0)) || el;
function glide(els, change, pin) {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1,
    pins = els.map(el => (el === listEl && pin && pin.isConnected ? pin : onScreen(el))),
    was = els.map((el, i) => [el.getBoundingClientRect(), pins[i].getBoundingClientRect()]);
  change();
  els.forEach((el, i) => {
    const [a, pa] = was[i],
      b = el.getBoundingClientRect(),
      pb = pins[i].getBoundingClientRect(),
      dx = (pa.left - pb.left) / z,
      dy = (pa.top - pb.top) / z;
    if (!a.width && b.width)
      move(el, [{ opacity: 0 }, { opacity: 1 }]); // just shown: it fades in where it is
    else if (a.width && b.width && (Math.abs(dx) > 1 || Math.abs(dy) > 1))
      move(el, [{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], SOFT()); // a long way: gently
  });
}
// the page cross-fades to a new look (theme, contrast, text size, language, time zone). The buttons' own colour
// changes are paused meanwhile (data-theming): the cross-fade already covers them, and hundreds at once only cost time.
function fadePage(apply) {
  const r = document.documentElement;
  if (!motionOn() || !document.startViewTransition) return apply();
  r.setAttribute("data-theming", "");
  const t = (fading = document.startViewTransition(apply));
  t.finished.finally(() => {
    r.removeAttribute("data-theming");
    if (fading === t) fading = null;
  });
}
function applyMotion() {
  if (motionOn()) document.documentElement.removeAttribute("data-motion");
  else {
    document.documentElement.setAttribute("data-motion", "off");
    MOVING.forEach(a => a.cancel());
    if (fading) fading.skipTransition(); // the new theme stays; only the cross-fade stops
  }
  mvBox.checked = motionOn();
}
mvBox.addEventListener("change", () => {
  motion = mvBox.checked ? "on" : "off";
  store.set("motion", motion);
  applyMotion();
});
CALM.addEventListener("change", applyMotion);

/* ---------- text size: normal, large, extra large (the whole page scales) ---------- */
let size = store.get("size", "normal");
const sizeRadios = [...document.querySelectorAll('input[name="size"]')];
function applySize() {
  if (size === "normal") document.documentElement.removeAttribute("data-size");
  else document.documentElement.setAttribute("data-size", size);
  sizeRadios.forEach(r => (r.checked = r.value === size));
}
sizeRadios.forEach(r =>
  r.addEventListener("change", () => {
    size = r.value;
    store.set("size", size);
    fadePage(() => {
      applySize();
      applyWide();
    });
  }),
);
