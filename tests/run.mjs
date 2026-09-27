// The one command that runs every check, grouped by what it protects. The checks run side by side (up to JOBS at a
// time, default 4), each with its own test web server port, and each one's result is printed in one piece when it
// finishes. Lighthouse (speed) runs last and alone, because it measures how fast the page is and would score lower while
// sharing the computer. A failure does not stop the others, so one run shows everything that needs attention, and a
// summary table ends it.
//
//   npm test                          every group
//   npm test -- quick                 the fast groups only: format, python, security, design, browsers
//   npm test -- browsers security     only the groups named
//   npm test -- --skip speed          every group except those named after --skip
//   npm test -- --verbose             every line each check prints, not only the result of those that pass
//   npm test -- --serial              one check at a time, with the output as it happens (slower; for following a problem)
//   npm test -- --list                show the groups and what each one checks
//
// Each group can still be run on its own (npm run test:browsers and so on), which is quicker while fixing one problem.
import { spawn } from "node:child_process";
import path from "node:path";
import { ROOT } from "./server.mjs";

const node = file => [process.execPath, [path.join("tests", file)]];
const GROUPS = [
  { name: "format", what: "the JavaScript in index.html is laid out the standard way (fix with npm run format)",
    steps: [["layout of the code", process.execPath, [path.join("tests", "format.mjs"), "--check"]]] },
  { name: "python", what: "build_schedule.py, cazetv.py and research.py, including the rule for verified kick-off times",
    steps: [["Python scripts", "python3", ["-m", "unittest", "discover", "-s", "tests"]]] },
  { name: "security", what: "hostile data from the feeds never runs in the page or becomes a link",
    steps: [["hostile data", ...node("security.mjs")]] },
  { name: "accessibility", what: "axe-core WCAG 2.2 AA in 128 combinations of theme, language, width and open window",
    steps: [["axe-core", ...node("axe.mjs")]] },
  { name: "design", what: "nested rounded corners stay parallel; on wide screens nothing covers the footer",
    steps: [["rounded corners", ...node("corners.mjs")], ["footer clear", ...node("layout.mjs")]] },
  { name: "browsers", what: "the site loads and works the same in Chromium, Firefox and WebKit (Safari)",
    steps: [["Chromium, Firefox, WebKit", ...node("browsers.mjs")]] },
  { name: "motion", what: "animations move only opacity and transform, at the shared speeds, and stop when switched off",
    steps: [["animations", ...node("motion-check.mjs")]] },
  { name: "speed", what: "Lighthouse 90+ in every category, on mobile and desktop, in both languages",
    steps: [["Lighthouse", ...node("lighthouse.mjs")]] },
];
const QUICK = ["format", "python", "security", "design", "browsers"];

const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const g of GROUPS) console.log(`${g.name.padEnd(14)} ${g.what}`);
  console.log(`${"quick".padEnd(14)} ${QUICK.join(", ")}`);
  process.exit(0);
}
const serial = args.includes("--serial"), verbose = args.includes("--verbose");
const names = args.filter(a => a !== "--serial" && a !== "--verbose");
const skipAt = names.indexOf("--skip");
const skip = skipAt >= 0 ? names.slice(skipAt + 1) : [];
const only = (skipAt >= 0 ? names.slice(0, skipAt) : names).flatMap(a => a === "quick" ? QUICK : [a]);
const unknown = [...only, ...skip].filter(n => !GROUPS.some(g => g.name === n));
if (unknown.length) {
  console.log(`Unknown group: ${unknown.join(", ")}. The groups are: ${GROUPS.map(g => g.name).join(", ")} (or quick).`);
  process.exit(2);
}
const chosen = GROUPS.filter(g => (!only.length || only.includes(g.name)) && !skip.includes(g.name));
const JOBS = serial ? 1 : Math.max(1, Number(process.env.JOBS) || 4);
const basePort = Number(process.env.PORT || 8123);

// Runs one command and resolves with its exit code and, unless the output is shown live, everything it printed
function run(cmd, cmdArgs, env, live) {
  return new Promise(resolve => {
    let text = "";
    const child = spawn(cmd, cmdArgs, { cwd: ROOT, env: { ...process.env, ...env }, stdio: live ? "inherit" : ["ignore", "pipe", "pipe"] });
    if (!live) for (const s of [child.stdout, child.stderr]) s.on("data", d => { text += d; });
    child.on("error", e => { text += `Could not start ${cmd}: ${e.message}\n`; resolve({ code: 127, text }); });
    child.on("exit", code => resolve({ code: code ?? 1, text }));
  });
}

const mins = s => (s >= 60 ? `${Math.floor(s / 60)} min ` : "") + `${s % 60} s`;
const secsSince = t => Math.round((Date.now() - t) / 1000);
const rows = [];
// Runs one step on its own port and reports it: a passing step in one line (its own last line, such as "128 of 128
// combinations passed"), a failing one in full; --verbose shows everything. The motion group skips its frame timings,
// which never pass or fail.
async function runStep(g, [label, cmd, cmdArgs], port) {
  const t = Date.now();
  if (serial) console.log(`\n==== ${g.name}: ${label} ====`);
  const { code, text } = await run(cmd, cmdArgs, { PORT: String(port), TIMINGS: "0" }, serial);
  const secs = secsSince(t);
  // 3 from browsers.mjs: everything that ran passed, but a browser did not start. On GitHub (CI is set there) every browser
  // is installed, so a browser that did not start is a failure, not a PART
  const result = code === 0 ? "PASS" : code === 3 && !process.env.CI ? "PART" : "FAIL";
  if (!serial) {
    const lines = text.trimEnd().split("\n");
    const shown = verbose || result === "FAIL" ? lines : result === "PART" ? lines.filter(l => /^SKIP|checks passed|Skipped/.test(l)) : lines.slice(-1);
    console.log(`${result}  ${g.name}: ${label} (${mins(secs)})\n${shown.map(l => "      " + l).join("\n")}${result === "FAIL" ? "\n" : ""}`);
  }
  rows.push([g.name, label, result, secs]);
}

const started = Date.now();
// Every step runs side by side (the two design checks too), the slowest first so the whole run ends sooner;
// the summary keeps the order of GROUPS
const SLOWEST = ["accessibility", "design", "motion", "browsers", "security"];
const rank = g => (SLOWEST.indexOf(g.name) + 1 || 99);
const side = chosen.filter(g => g.name !== "speed").sort((a, b) => rank(a) - rank(b)).flatMap(g => g.steps.map(step => [g, step]));
const speed = chosen.find(g => g.name === "speed");
if (!serial) console.log(`Running ${side.length} checks, ${Math.min(JOBS, side.length)} at a time${speed ? ", then Lighthouse on its own" : ""}. Results appear as each one finishes.\n`);
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, side.length) }, async () => {
  while (next < side.length) { const i = next++; await runStep(...side[i], basePort + 1 + i); }
}));
if (speed) for (const step of speed.steps) await runStep(speed, step, basePort);

// the table in the order of GROUPS, whatever order the groups finished in
const order = r => GROUPS.findIndex(g => g.name === r[0]);
rows.sort((a, b) => order(a) - order(b));
console.log("\n==== Summary ====");
for (const [group, label, result, secs] of rows) console.log(`${result}  ${group.padEnd(14)} ${label.padEnd(26)} ${mins(secs)}`);
const failed = rows.filter(r => r[2] === "FAIL"), part = rows.filter(r => r[2] === "PART");
if (part.length) console.log("\nPART: passed in the browsers installed here; the others were skipped (see that group's output).");
console.log(failed.length ? `\n${failed.length} of ${rows.length} failed. The details are above, under each FAIL line.`
  : `\nAll ${rows.length} passed${part.length ? ", with some browsers skipped," : ""} in ${mins(secsSince(started))} in total.`);
process.exit(failed.length ? 1 : 0);
