// The one command that runs every check, grouped by what it protects. It runs each group in turn, keeps going when one
// fails (so a single run shows everything that needs attention), and ends with a summary table.
//
//   npm test                          every group
//   npm test -- quick                 the fast groups only (a minute or two): format, python, security, design, browsers
//   npm test -- browsers security     only the groups named
//   npm test -- --skip speed          every group except those named after --skip
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
const skipAt = args.indexOf("--skip");
const skip = skipAt >= 0 ? args.slice(skipAt + 1) : [];
const only = (skipAt >= 0 ? args.slice(0, skipAt) : args).flatMap(a => a === "quick" ? QUICK : [a]);
const unknown = [...only, ...skip].filter(n => !GROUPS.some(g => g.name === n));
if (unknown.length) {
  console.log(`Unknown group: ${unknown.join(", ")}. The groups are: ${GROUPS.map(g => g.name).join(", ")} (or quick).`);
  process.exit(2);
}
const chosen = GROUPS.filter(g => (!only.length || only.includes(g.name)) && !skip.includes(g.name));

// Runs one command with its output shown as it comes, and resolves with its exit code
function run(cmd, cmdArgs) {
  return new Promise(resolve => {
    const child = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit" });
    child.on("error", e => { console.log(`Could not start ${cmd}: ${e.message}`); resolve(127); });
    child.on("exit", code => resolve(code ?? 1));
  });
}

const rows = [];
const started = Date.now();
for (const g of chosen) {
  for (const [label, cmd, cmdArgs] of g.steps) {
    console.log(`\n==== ${g.name}: ${label} ====`);
    const t = Date.now();
    const code = await run(cmd, cmdArgs);
    // 3 from browsers.mjs: everything that ran passed, but a browser is not installed
    rows.push([g.name, label, code === 0 ? "PASS" : code === 3 ? "PART" : "FAIL", Math.round((Date.now() - t) / 1000)]);
  }
}

const mins = s => (s >= 60 ? `${Math.floor(s / 60)} min ` : "") + `${s % 60} s`;
console.log("\n==== Summary ====");
for (const [group, label, result, secs] of rows) console.log(`${result}  ${group.padEnd(14)} ${label.padEnd(26)} ${mins(secs)}`);
const failed = rows.filter(r => r[2] === "FAIL"), part = rows.filter(r => r[2] === "PART");
if (part.length) console.log("\nPART: passed in the browsers installed here; the others were skipped (see that group's output).");
console.log(failed.length ? `\n${failed.length} of ${rows.length} failed. Scroll up to the "==== group" heading of each FAIL for the details.`
  : `\nAll ${rows.length} passed${part.length ? ", with some browsers skipped," : ""} in ${mins(Math.round((Date.now() - started) / 1000))}.`);
process.exit(failed.length ? 1 : 0);
