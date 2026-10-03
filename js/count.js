/* ---------- visit counts (GoatCounter, without cookies) ---------- */
// Only three things are ever counted: that the page was opened (and in which language), that a match's details were
// opened, and that a race weekend was opened. No team, match, star, setting or search is sent, and nothing is saved
// in the browser. GoatCounter never keeps the internet address; its own extras (browser, country and so on) are
// switched off in its settings, as "How it works" promises visitors (MAINTAINING.md, "Visit counts").
// The count is a request for a 1x1 picture (img-src in the security policy), so no script of GoatCounter's ever runs
// on this page.
// STATS is the GoatCounter address, such as "https://name.goatcounter.com", with no "/" at the end; while it is empty,
// nothing is counted and "How it works" does not mention counting. The same address followed by /count must be in
// img-src (tests/test_scripts.py checks the two agree).
const STATS = "https://gnc.goatcounter.com";

// Counted only on the real site (the address in the hreflang links of <head>), so a local preview, the tests or a
// copy of the site published elsewhere add nothing; and never for a browser that asks sites not to track it
// (Global Privacy Control, Do Not Track) or that is driven by a program (navigator.webdriver: robots, tests).
function countable() {
  if (!STATS || navigator.webdriver) return false;
  if (navigator.globalPrivacyControl || navigator.doNotTrack === "1") return false;
  const home = document.querySelector('link[rel="alternate"][hreflang="x-default"]');
  if (!home) return false;
  const u = new URL(home.href);
  return location.origin === u.origin && location.pathname.startsWith(u.pathname);
}
// the address asked for: the event name (p), whether it is an event (e) and a random value (rnd) that stops a
// browser from answering a second visit from its cache. Nothing else.
function countURL(name, event) {
  const q = new URLSearchParams({ p: name });
  if (event) q.set("e", "true");
  q.set("rnd", Math.random().toString(36).slice(2, 7));
  return STATS + "/count?" + q;
}
function countVisit(name, event) {
  if (!countable()) return;
  try {
    new Image().src = countURL(name, event); // the picture is never added to the page; asking for it is the count
  } catch {} // counting must never get in the way of the page
}
document.getElementById("countnote").hidden = !STATS;
